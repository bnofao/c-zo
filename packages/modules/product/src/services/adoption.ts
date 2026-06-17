import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { ProductNotFound } from './product'
import type { AttributeType } from './value-kind'
import {
  attributeBooleanValues as attributeBooleanValuesTable,
  attributeDateValues as attributeDateValuesTable,
  attributeFileValues as attributeFileValuesTable,
  attributeNumericValues as attributeNumericValuesTable,
  attributeTextValues as attributeTextValuesTable,
} from '@czo/attribute/schema'
import { DrizzleDb } from '@czo/kit/db'
import { inArray, sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import {
  productAttributeValues as productAttributeValuesTable,
  productChannelListings as productChannelListingsTable,
  productMedia as productMediaTable,
  productOrgAdoptions as productOrgAdoptionsTable,
  variantAttributeValues as variantAttributeValuesTable,
  variantInventoryItems as variantInventoryItemsTable,
  variantPriceSets as variantPriceSetsTable,
} from '../database/schema'
import { ProductService } from './product'
import { valueKindForType } from './value-kind'

// ─── Re-export for callers that only import from this file ────────────────────

export { ProductNotFound } from './product'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class CannotAdoptOwnedProduct extends Data.TaggedError('CannotAdoptOwnedProduct')<Record<never, never>> {
  readonly code = 'CANNOT_ADOPT_OWNED_PRODUCT'
  get message() { return 'Only global products (organizationId null) can be adopted' }
}

export class AdoptionNotFound extends Data.TaggedError('AdoptionNotFound')<Record<never, never>> {
  readonly code = 'ADOPTION_NOT_FOUND'
  get message() { return 'No live adoption found for the given product and organization' }
}

export class ProductNotAdopted extends Data.TaggedError('ProductNotAdopted')<Record<never, never>> {
  readonly code = 'PRODUCT_NOT_ADOPTED'
  get message() { return 'Product has not been adopted by this organization' }
}

export class AdoptionDbFailed extends Data.TaggedError('AdoptionDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'ADOPTION_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type ProductOrgAdoption = InferSelectModel<typeof productOrgAdoptionsTable>

// ─── Input types ──────────────────────────────────────────────────────────────

export interface AdoptProductInput {
  productId: number
  orgId: number
}

export interface UnadoptProductInput {
  productId: number
  orgId: number
}

// ─── Service contract ─────────────────────────────────────────────────────────

export class AdoptionService extends Context.Service<AdoptionService, {
  readonly adoptProduct: (input: AdoptProductInput) => Effect.Effect<ProductOrgAdoption, ProductNotFound | CannotAdoptOwnedProduct | AdoptionDbFailed>
  readonly unadoptProduct: (input: UnadoptProductInput) => Effect.Effect<ProductOrgAdoption, AdoptionNotFound | AdoptionDbFailed>
  readonly isAdopted: (input: { productId: number, orgId: number }) => Effect.Effect<boolean, AdoptionDbFailed>
  readonly requireAdopted: (input: { productId: number, orgId: number }) => Effect.Effect<void, ProductNotAdopted>
  readonly listAdoptedProducts: (orgId: number) => Effect.Effect<ReadonlyArray<import('./product').Product>, AdoptionDbFailed>
  readonly listAdopters: (productId: number) => Effect.Effect<ReadonlyArray<number>, AdoptionDbFailed>
}>()('@czo/product/AdoptionService') {}

type AdoptionServiceImpl = Context.Service.Shape<typeof AdoptionService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const productService = yield* ProductService

  /** Map any DB-layer error to AdoptionDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new AdoptionDbFailed({ cause })))

  /** Find the adoption row for (productId, orgId), or undefined. */
  const findAdoption = (productId: number, orgId: number) =>
    dbErr(db.query.productOrgAdoptions.findFirst({
      where: { productId, organizationId: orgId },
    }))

  /** Scalar typed-value table for a pivot's valueKind, or null for select kinds. */
  const scalarTableFor = (valueKind: string) => {
    switch (valueKind) {
      case 'TEXT': return attributeTextValuesTable
      case 'NUMERIC': return attributeNumericValuesTable
      case 'BOOLEAN': return attributeBooleanValuesTable
      case 'DATE': return attributeDateValuesTable
      case 'FILE': return attributeFileValuesTable
      default: return null
    }
  }

  /**
   * Delete this org's attribute grafts for a product (and its variants): drop the
   * pivot rows AND the orphan scalar typed-value rows they minted. Select-kind
   * pivots reference shared catalog rows, which are left intact. Done with direct
   * DB deletes (no AttributeAssignmentService import) to avoid a circular dep.
   */
  const purgeOrgAttributeGrafts = (productId: number, orgId: number) =>
    dbErr(Effect.gen(function* () {
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

      // Delete orphan scalar typed-value rows by id, grouped per scalar table.
      const byTable = new Map<ReturnType<typeof scalarTableFor>, number[]>()
      for (const pivot of allPivots) {
        if (!pivot.attribute)
          continue
        const table = scalarTableFor(valueKindForType(pivot.attribute.type as AttributeType))
        if (!table)
          continue
        const ids = byTable.get(table) ?? []
        ids.push(pivot.valueId)
        byTable.set(table, ids)
      }
      for (const [table, ids] of byTable) {
        if (table && ids.length > 0)
          yield* db.delete(table).where(inArray(table.id, ids))
      }

      // Delete the pivot rows themselves.
      yield* db.delete(productAttributeValuesTable).where(
        sql`${productAttributeValuesTable.productId} = ${productId} AND ${productAttributeValuesTable.organizationId} = ${orgId}`,
      )
      if (variantIds.length > 0) {
        yield* db.delete(variantAttributeValuesTable).where(
          sql`${variantAttributeValuesTable.organizationId} = ${orgId} AND ${variantAttributeValuesTable.variantId} IN (${sql.join(variantIds.map(id => sql`${id}`), sql`, `)})`,
        )
      }
    }))

  /**
   * Delete this org's price/inventory grafts for a product's variants. Direct DB
   * deletes (no PriceBinding/InventoryBinding import) to avoid a circular dep.
   * The graft tables key off variantId + organizationId, so we scope by the
   * product's variant ids.
   */
  const purgeOrgPriceInventoryGrafts = (productId: number, orgId: number) =>
    dbErr(Effect.gen(function* () {
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
    }))

  /**
   * Delete this org's media + channel-listing grafts for a product. Org-grafted
   * media key off `organizationId` directly; channel listings key off the
   * org-owned channel they target, so we scope by a subquery on the channels
   * table (cross-module table referenced by name to avoid a circular dep). Base
   * media (organizationId null) and other orgs' listings are left intact.
   */
  const purgeOrgMediaChannelGrafts = (productId: number, orgId: number) =>
    dbErr(Effect.gen(function* () {
      yield* db.delete(productMediaTable).where(
        sql`${productMediaTable.productId} = ${productId} AND ${productMediaTable.organizationId} = ${orgId}`,
      )
      // Channel listings carry no org column, so scope by the org-owned channels
      // they target. The subquery touches the cross-module `channels` table; gate
      // it behind a pre-check so this never runs when the product has no listings
      // (e.g. single-module test layers without the channels table).
      const listings = yield* db.query.productChannelListings.findMany({
        columns: { id: true },
        where: { productId, deletedAt: { isNull: true } },
      })
      if (listings.length === 0)
        return
      yield* db.delete(productChannelListingsTable).where(
        sql`${productChannelListingsTable.productId} = ${productId} AND ${productChannelListingsTable.channelId} IN (SELECT id FROM channels WHERE organization_id = ${orgId})`,
      )
    }))

  const adoptProduct: AdoptionServiceImpl['adoptProduct'] = ({ productId, orgId }) =>
    Effect.gen(function* () {
      // 1. Load product — propagate ProductNotFound
      const product = yield* productService.findProductById(productId).pipe(
        Effect.mapError(e => e._tag === 'ProductNotFound' ? e : new AdoptionDbFailed({ cause: e })),
      )

      // 2. Only global products can be adopted
      if (product.organizationId !== null)
        return yield* Effect.fail(new CannotAdoptOwnedProduct())

      // 3. Idempotent: if an adoption already exists, return it
      const existing = yield* findAdoption(productId, orgId)
      if (existing)
        return existing as ProductOrgAdoption

      // 4. Insert fresh adoption row (the unique index guards against duplicates)
      return yield* dbErr(Effect.gen(function* () {
        const [row] = yield* db.insert(productOrgAdoptionsTable).values({
          productId,
          organizationId: orgId,
        }).returning()
        return row! as ProductOrgAdoption
      }))
    })

  const unadoptProduct: AdoptionServiceImpl['unadoptProduct'] = ({ productId, orgId }) =>
    Effect.gen(function* () {
      // 1. Find the adoption
      const adoption = yield* findAdoption(productId, orgId)
      if (!adoption)
        return yield* Effect.fail(new AdoptionNotFound())

      // 2. Hard-delete it — adoption is a membership link, not soft-deletable content.
      const deleted = yield* dbErr(Effect.gen(function* () {
        const [row] = yield* db
          .delete(productOrgAdoptionsTable)
          .where(sql`${productOrgAdoptionsTable.id} = ${adoption.id}`)
          .returning()
        return row! as ProductOrgAdoption
      }))

      // 3. Remove this org's grafts for the product (attributes, price/inventory, media/channel).
      yield* purgeOrgAttributeGrafts(productId, orgId)
      yield* purgeOrgPriceInventoryGrafts(productId, orgId)
      yield* purgeOrgMediaChannelGrafts(productId, orgId)

      return deleted
    })

  const isAdopted: AdoptionServiceImpl['isAdopted'] = ({ productId, orgId }) =>
    findAdoption(productId, orgId).pipe(
      Effect.map(row => row !== undefined),
    )

  const requireAdopted: AdoptionServiceImpl['requireAdopted'] = ({ productId, orgId }) =>
    Effect.gen(function* () {
      const adopted = yield* isAdopted({ productId, orgId }).pipe(
        Effect.mapError(() => new ProductNotAdopted()),
      )
      if (!adopted)
        yield* Effect.fail(new ProductNotAdopted())
    })

  const listAdoptedProducts: AdoptionServiceImpl['listAdoptedProducts'] = orgId =>
    Effect.gen(function* () {
      const rows = yield* dbErr(db.query.productOrgAdoptions.findMany({
        where: { organizationId: orgId },
        with: { product: true },
      }))
      return rows
        .map(r => (r as typeof r & { product: import('./product').Product }).product)
        .filter((p): p is import('./product').Product => p !== undefined && p.deletedAt === null)
    })

  const listAdopters: AdoptionServiceImpl['listAdopters'] = productId =>
    Effect.gen(function* () {
      const rows = yield* dbErr(db.query.productOrgAdoptions.findMany({
        where: { productId },
      }))
      return rows.map(r => r.organizationId)
    })

  return {
    adoptProduct,
    unadoptProduct,
    isAdopted,
    requireAdopted,
    listAdoptedProducts,
    listAdopters,
  } satisfies AdoptionServiceImpl
})

export const AdoptionServiceLive = Layer.effect(AdoptionService, make)
