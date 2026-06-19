import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { ProductNotAdopted } from './product'
import type { VariantNotFound } from './variant'
import { DrizzleDb } from '@czo/kit/db'
import { Price } from '@czo/price/services'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { variantPriceSets as variantPriceSetsTable } from '../database/schema'
import { ProductService } from './product'
import { VariantService } from './variant'

// ─── Re-export for callers that only import from this file ────────────────────

export { ProductNotAdopted } from './product'
export { VariantNotFound } from './variant'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class CrossOrgGraftDenied extends Data.TaggedError('CrossOrgGraftDenied')<Record<never, never>> {
  readonly code = 'CROSS_ORG_GRAFT_DENIED'
  get message() { return 'The referenced resource belongs to a different organization' }
}

export class PriceBindingDbFailed extends Data.TaggedError('PriceBindingDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'PRICE_BINDING_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type VariantPriceSet = InferSelectModel<typeof variantPriceSetsTable>

// ─── Input types ──────────────────────────────────────────────────────────────

export interface BindPriceSetInput {
  variantId: number
  organizationId: number
  priceSetId: number
}

export interface UnbindPriceSetInput {
  variantId: number
  organizationId: number
}

// ─── Service contract ─────────────────────────────────────────────────────────

export class PriceBindingService extends Context.Service<PriceBindingService, {
  readonly bindPriceSet: (input: BindPriceSetInput) => Effect.Effect<VariantPriceSet, VariantNotFound | ProductNotAdopted | CrossOrgGraftDenied | PriceBindingDbFailed>
  readonly unbindPriceSet: (input: UnbindPriceSetInput) => Effect.Effect<void, PriceBindingDbFailed>
  readonly listVariantPriceSets: (input: { variantId: number, orgId: number }) => Effect.Effect<ReadonlyArray<VariantPriceSet>, PriceBindingDbFailed>
}>()('@czo/product/PriceBindingService') {}

type PriceBindingServiceImpl = Context.Service.Shape<typeof PriceBindingService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const variantService = yield* VariantService
  const productService = yield* ProductService
  const priceService = yield* Price.PriceService

  /** Map any DB-layer error to PriceBindingDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new PriceBindingDbFailed({ cause })))

  /**
   * Adoption guard: a graft into a global product (org null) by a grafting org
   * requires a live adoption. Own-org products and global grafts (impossible
   * here — org is NOT NULL) skip the check.
   */
  const guardAdopted = (variantId: number, organizationId: number) =>
    Effect.gen(function* () {
      const variant = yield* variantService.findVariantById(variantId).pipe(
        Effect.mapError(e => e._tag === 'VariantNotFound' ? e : new PriceBindingDbFailed({ cause: e })),
      )
      const product = yield* productService.findProductById(variant.productId).pipe(
        Effect.mapError(e => new PriceBindingDbFailed({ cause: e })),
      )
      if (product.organizationId === null)
        yield* productService.requireAdopted({ productId: product.id, orgId: organizationId })
    })

  /** Verify the price set belongs to the grafting org; hide not-found as denied. */
  const guardCrossOrg = (priceSetId: number, organizationId: number) =>
    Effect.gen(function* () {
      const priceSet = yield* priceService.findPriceSetById(priceSetId).pipe(
        Effect.mapError(e => e._tag === 'PriceSetNotFound' ? new CrossOrgGraftDenied() : new PriceBindingDbFailed({ cause: e })),
      )
      if (priceSet.organizationId !== organizationId)
        yield* Effect.fail(new CrossOrgGraftDenied())
    })

  const bindPriceSet: PriceBindingServiceImpl['bindPriceSet'] = ({ variantId, organizationId, priceSetId }) =>
    Effect.gen(function* () {
      yield* guardAdopted(variantId, organizationId)
      yield* guardCrossOrg(priceSetId, organizationId)

      // UPSERT on (variantId, organizationId): one binding per variant per org.
      const [row] = yield* dbErr(db
        .insert(variantPriceSetsTable)
        .values({ variantId, organizationId, priceSetId })
        .onConflictDoUpdate({
          target: [variantPriceSetsTable.variantId, variantPriceSetsTable.organizationId],
          set: { priceSetId },
        })
        .returning())
      return row! as VariantPriceSet
    })

  const unbindPriceSet: PriceBindingServiceImpl['unbindPriceSet'] = ({ variantId, organizationId }) =>
    dbErr(db.delete(variantPriceSetsTable).where(
      sql`${variantPriceSetsTable.variantId} = ${variantId} AND ${variantPriceSetsTable.organizationId} = ${organizationId}`,
    )).pipe(Effect.asVoid)

  const listVariantPriceSets: PriceBindingServiceImpl['listVariantPriceSets'] = ({ variantId, orgId }) =>
    dbErr(db.query.variantPriceSets.findMany({
      where: { variantId, organizationId: orgId },
    })) as Effect.Effect<ReadonlyArray<VariantPriceSet>, PriceBindingDbFailed>

  return {
    bindPriceSet,
    unbindPriceSet,
    listVariantPriceSets,
  } satisfies PriceBindingServiceImpl
})

export const PriceBindingServiceLive = Layer.effect(PriceBindingService, make)
