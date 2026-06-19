import type { Attribute } from '@czo/attribute/services'
import type { Database } from '@czo/kit/db'
import type { Relations } from '../../database/relations'
import { TypedValue } from '@czo/attribute/services'
import { DrizzleDb } from '@czo/kit/db'
import { defineQueue, makeConsumer, offer } from '@czo/kit/queue'
import { sql } from 'drizzle-orm'
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { PersistedQueue } from 'effect/unstable/persistence'
import {
  productAttributeValues as productAttributeValuesTable,
  variantAttributeValues as variantAttributeValuesTable,
  variantInventoryItems as variantInventoryItemsTable,
  variantPriceSets as variantPriceSetsTable,
} from '../../database/schema'
import { ProductEvents } from '../events/product'

type Db = Database<Relations>

export const UnadoptCleanup = Schema.Struct({ productId: Schema.Number, orgId: Schema.Number })
export const UnadoptCleanupQueue = defineQueue({ name: 'product:unadopt-cleanup', schema: UnadoptCleanup })

/**
 * Stable, per-cycle dedup id for the unadopt-cleanup job.
 *
 * Including `adoptionId` (the hard-deleted adoption row's PK) makes the id
 * unique per adoption cycle even when the same (productId, orgId) pair is
 * unadopted repeatedly — completed rows are NEVER deleted from the queue
 * table, so reusing `unadopt:<productId>:<orgId>` would silently drop the job
 * on the second+ cycle.
 */
export function unadoptJobId(e: { productId: number, orgId: number, adoptionId: number }): string {
  return `unadopt:${e.productId}:${e.orgId}:${e.adoptionId}`
}

/**
 * Heavy, storefront-invisible cleanup (attribute pivots + price/inventory grafts).
 * Idempotent (scoped deletes). Directly callable in tests to verify deferred
 * cleanup without spinning up a queue worker.
 */
export function purgeDeferred(productId: number, orgId: number) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Db
    yield* purgeOrgAttributeGrafts(db, productId, orgId)
    yield* purgeOrgPriceInventoryGrafts(db, productId, orgId)
  })
}

/**
 * Delete this org's attribute grafts for a product (and its variants): drop the
 * pivot rows AND the orphan scalar typed-value rows they minted. Select-kind
 * pivots reference shared catalog rows, which are left intact. The scalar
 * typed-value rows are owned by `@czo/attribute`, so deleting them is delegated
 * to `TypedValueService.purgeValues` instead of reaching into the attribute
 * schema directly.
 */
function purgeOrgAttributeGrafts(db: Db, productId: number, orgId: number) {
  return Effect.gen(function* () {
    const typedValueService = yield* TypedValue.TypedValueService

    // Product-level pivots for this org.
    const productPivots = yield* db.query.productAttributeValues.findMany({
      where: { productId, organizationId: orgId },
      with: { attribute: true },
    })
    // Variant-level pivots for this org (only this product's variants).
    const variants = yield* db.query.productVariants.findMany({
      columns: { id: true },
      where: { productId },
    })
    const variantIds = variants.map(v => v.id)
    const variantPivots = variantIds.length === 0
      ? []
      : yield* db.query.variantAttributeValues.findMany({
        where: { organizationId: orgId, variantId: { in: variantIds } },
        with: { attribute: true },
      })

    const allPivots = [...productPivots, ...variantPivots]

    // Group orphan value ids by the attribute's type and hand them to
    // @czo/attribute, which maps each type → its scalar table (and skips
    // select/catalog types, whose rows are shared and never purged).
    const byType = new Map<Attribute.AttributeType, number[]>()
    for (const pivot of allPivots) {
      if (!pivot.attribute)
        continue
      const type = pivot.attribute.type as Attribute.AttributeType
      const ids = byType.get(type) ?? []
      ids.push(pivot.valueId)
      byType.set(type, ids)
    }
    if (byType.size > 0)
      yield* typedValueService.purgeValues(byType)

    // Delete the pivot rows themselves.
    yield* db.delete(productAttributeValuesTable).where(
      sql`${productAttributeValuesTable.productId} = ${productId} AND ${productAttributeValuesTable.organizationId} = ${orgId}`,
    )
    if (variantIds.length > 0) {
      yield* db.delete(variantAttributeValuesTable).where(
        sql`${variantAttributeValuesTable.organizationId} = ${orgId} AND ${variantAttributeValuesTable.variantId} IN (${sql.join(variantIds.map(id => sql`${id}`), sql`, `)})`,
      )
    }
  })
}

/**
 * Delete this org's price/inventory grafts for a product's variants. Direct DB
 * deletes (no PriceBinding/InventoryBinding import) to avoid a circular dep.
 * The graft tables key off variantId + organizationId, so we scope by the
 * product's variant ids.
 */
function purgeOrgPriceInventoryGrafts(db: Db, productId: number, orgId: number) {
  return Effect.gen(function* () {
    const variants = yield* db.query.productVariants.findMany({
      columns: { id: true },
      where: { productId },
    })
    const variantIds = variants.map(v => v.id)
    if (variantIds.length === 0)
      return
    const variantList = sql.join(variantIds.map(id => sql`${id}`), sql`, `)
    yield* db.delete(variantPriceSetsTable).where(
      sql`${variantPriceSetsTable.organizationId} = ${orgId} AND ${variantPriceSetsTable.variantId} IN (${variantList})`,
    )
    yield* db.delete(variantInventoryItemsTable).where(
      sql`${variantInventoryItemsTable.organizationId} = ${orgId} AND ${variantInventoryItemsTable.variantId} IN (${variantList})`,
    )
  })
}

export const unadoptCleanupConsumer = makeConsumer(
  UnadoptCleanupQueue,
  ({ productId, orgId }) => purgeDeferred(productId, orgId),
)

/**
 * Subscriber layer: `ProductUnadopted` → enqueue the cleanup job.
 *
 * Resolves the queue factory via `serviceOption` so it NO-OPS when no factory
 * is wired (test harnesses, integration tests) and offers when one is (the API
 * process). Mirrors auth's `subscribersLayer` pattern: `Layer.effectDiscard` +
 * `Effect.forkScoped`. Effect 4 beta.70 has no `Layer.scopedDiscard`.
 */
export const unadoptCleanupSubscribersLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const factory = yield* Effect.serviceOption(PersistedQueue.PersistedQueueFactory)
    if (Option.isNone(factory))
      return
    const events = yield* ProductEvents
    yield* Effect.forkScoped(
      Stream.runForEach(
        Stream.filter(events.subscribe, e => e._tag === 'ProductUnadopted'),
        e => offer(UnadoptCleanupQueue, { productId: e.productId, orgId: e.orgId }, { id: unadoptJobId(e) }).pipe(
          Effect.provideService(PersistedQueue.PersistedQueueFactory, factory.value),
          Effect.catchCause(cause => Effect.logError('product unadopt-cleanup offer failed', cause)),
        ),
      ),
    )
  }),
)
