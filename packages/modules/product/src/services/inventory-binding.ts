import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { ProductNotAdopted } from './product'
import type { VariantNotFound } from './variant'
import { Inventory } from '@czo/inventory/services'
import { DrizzleDb } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { variantInventoryItems as variantInventoryItemsTable } from '../database/schema'
// Shared cross-org denial with the price binding service.
import { CrossOrgGraftDenied } from './price-binding'
import { ProductService } from './product'
import { VariantService } from './variant'

// ─── Re-export for callers that only import from this file ────────────────────

export { CrossOrgGraftDenied } from './price-binding'
export { ProductNotAdopted } from './product'
export { VariantNotFound } from './variant'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class InvalidRequiredQuantity extends Data.TaggedError('InvalidRequiredQuantity')<Record<never, never>> {
  readonly code = 'INVALID_REQUIRED_QUANTITY'
  get message() { return 'requiredQuantity must be a positive integer' }
}

export class InventoryBindingDbFailed extends Data.TaggedError('InventoryBindingDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'INVENTORY_BINDING_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type VariantInventoryItem = InferSelectModel<typeof variantInventoryItemsTable>

// ─── Input types ──────────────────────────────────────────────────────────────

export interface LinkInventoryItemInput {
  variantId: number
  organizationId: number
  inventoryItemId: number
  requiredQuantity?: number
}

export interface UnlinkInventoryItemInput {
  variantId: number
  organizationId: number
  inventoryItemId: number
}

// ─── Service contract ─────────────────────────────────────────────────────────

export class InventoryBindingService extends Context.Service<InventoryBindingService, {
  readonly linkInventoryItem: (input: LinkInventoryItemInput) => Effect.Effect<VariantInventoryItem, VariantNotFound | ProductNotAdopted | CrossOrgGraftDenied | InvalidRequiredQuantity | InventoryBindingDbFailed>
  readonly unlinkInventoryItem: (input: UnlinkInventoryItemInput) => Effect.Effect<void, InventoryBindingDbFailed>
  readonly listVariantInventoryItems: (input: { variantId: number, orgId: number }) => Effect.Effect<ReadonlyArray<VariantInventoryItem>, InventoryBindingDbFailed>
}>()('@czo/product/InventoryBindingService') {}

type InventoryBindingServiceImpl = Context.Service.Shape<typeof InventoryBindingService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const variantService = yield* VariantService
  const productService = yield* ProductService
  const inventoryService = yield* Inventory.InventoryService

  /** Map any DB-layer error to InventoryBindingDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new InventoryBindingDbFailed({ cause })))

  /**
   * Adoption guard: a graft into a global product (org null) by a grafting org
   * requires a live adoption.
   */
  const guardAdopted = (variantId: number, organizationId: number) =>
    Effect.gen(function* () {
      const variant = yield* variantService.findVariantById(variantId).pipe(
        Effect.mapError(e => e._tag === 'VariantNotFound' ? e : new InventoryBindingDbFailed({ cause: e })),
      )
      const product = yield* productService.findProductById(variant.productId).pipe(
        Effect.mapError(e => new InventoryBindingDbFailed({ cause: e })),
      )
      if (product.organizationId === null)
        yield* productService.requireAdopted({ productId: product.id, orgId: organizationId })
    })

  /** Verify the inventory item belongs to the grafting org; hide not-found as denied. */
  const guardCrossOrg = (inventoryItemId: number, organizationId: number) =>
    Effect.gen(function* () {
      const item = yield* inventoryService.findItem({ where: { id: inventoryItemId } }).pipe(
        Effect.mapError(e => e._tag === 'InventoryItemNotFound' ? new CrossOrgGraftDenied() : new InventoryBindingDbFailed({ cause: e })),
      )
      if (item.organizationId !== organizationId)
        yield* Effect.fail(new CrossOrgGraftDenied())
    })

  const linkInventoryItem: InventoryBindingServiceImpl['linkInventoryItem'] = ({ variantId, organizationId, inventoryItemId, requiredQuantity }) =>
    Effect.gen(function* () {
      const qty = requiredQuantity ?? 1
      if (!Number.isInteger(qty) || qty <= 0)
        return yield* Effect.fail(new InvalidRequiredQuantity())

      yield* guardAdopted(variantId, organizationId)
      yield* guardCrossOrg(inventoryItemId, organizationId)

      // Idempotent UPSERT on (variantId, organizationId, inventoryItemId): a
      // repeat link refreshes requiredQuantity rather than failing.
      const [row] = yield* dbErr(db
        .insert(variantInventoryItemsTable)
        .values({ variantId, organizationId, inventoryItemId, requiredQuantity: qty })
        .onConflictDoUpdate({
          target: [variantInventoryItemsTable.variantId, variantInventoryItemsTable.organizationId, variantInventoryItemsTable.inventoryItemId],
          set: { requiredQuantity: qty },
        })
        .returning())
      return row! as VariantInventoryItem
    })

  const unlinkInventoryItem: InventoryBindingServiceImpl['unlinkInventoryItem'] = ({ variantId, organizationId, inventoryItemId }) =>
    dbErr(db.delete(variantInventoryItemsTable).where(
      sql`${variantInventoryItemsTable.variantId} = ${variantId} AND ${variantInventoryItemsTable.organizationId} = ${organizationId} AND ${variantInventoryItemsTable.inventoryItemId} = ${inventoryItemId}`,
    )).pipe(Effect.asVoid)

  const listVariantInventoryItems: InventoryBindingServiceImpl['listVariantInventoryItems'] = ({ variantId, orgId }) =>
    dbErr(db.query.variantInventoryItems.findMany({
      where: { variantId, organizationId: orgId },
    })) as Effect.Effect<ReadonlyArray<VariantInventoryItem>, InventoryBindingDbFailed>

  return {
    linkInventoryItem,
    unlinkInventoryItem,
    listVariantInventoryItems,
  } satisfies InventoryBindingServiceImpl
})

export const InventoryBindingServiceLive = Layer.effect(InventoryBindingService, make)
