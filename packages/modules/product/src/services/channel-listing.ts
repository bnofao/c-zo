import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { ProductNotAdopted } from './adoption'
import type { ProductNotFound } from './product'
import { Channel } from '@czo/channel/services'
import { DrizzleDb } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { productChannelListings as productChannelListingsTable } from '../database/schema'
import { AdoptionService } from './adoption'
import { CrossOrgGraftDenied } from './price-binding'
import { ProductService } from './product'

// ─── Re-export for callers that only import from this file ────────────────────

export { ProductNotAdopted } from './adoption'
export { CrossOrgGraftDenied } from './price-binding'
export { ProductNotFound } from './product'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class ChannelListingDbFailed extends Data.TaggedError('ChannelListingDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'CHANNEL_LISTING_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type ProductChannelListing = InferSelectModel<typeof productChannelListingsTable>

// ─── Input types ──────────────────────────────────────────────────────────────

export interface PublishListingInput {
  productId: number
  channelId: number
  organizationId: number
  isPublished?: boolean
  visibleInListings?: boolean
  availableForPurchaseAt?: Date | null
  publishedAt?: Date | null
}

export interface UnpublishListingInput {
  productId: number
  channelId: number
}

// ─── Service contract ─────────────────────────────────────────────────────────

export class ChannelListingService extends Context.Service<ChannelListingService, {
  readonly publish: (input: PublishListingInput) => Effect.Effect<ProductChannelListing, ProductNotFound | ProductNotAdopted | CrossOrgGraftDenied | ChannelListingDbFailed>
  readonly unpublish: (input: UnpublishListingInput) => Effect.Effect<void, ChannelListingDbFailed>
  readonly listListings: (productId: number) => Effect.Effect<ReadonlyArray<ProductChannelListing>, ChannelListingDbFailed>
}>()('@czo/product/ChannelListingService') {}

type ChannelListingServiceImpl = Context.Service.Shape<typeof ChannelListingService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const productService = yield* ProductService
  const adoptionService = yield* AdoptionService
  const channelService = yield* Channel.ChannelService

  /** Map any DB-layer error to ChannelListingDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new ChannelListingDbFailed({ cause })))

  /**
   * Adoption guard: publishing a global product (org null) on behalf of a
   * grafting org requires a live adoption. Own-org products skip the check.
   */
  const guardAdopted = (productId: number, organizationId: number) =>
    Effect.gen(function* () {
      const product = yield* productService.findProductById(productId).pipe(
        Effect.mapError(e => e._tag === 'ProductNotFound' ? e : new ChannelListingDbFailed({ cause: e })),
      )
      if (product.organizationId === null)
        yield* adoptionService.requireAdopted({ productId: product.id, orgId: organizationId })
    })

  /** Verify the channel belongs to the acting org; hide not-found as denied. */
  const guardCrossOrg = (channelId: number, organizationId: number) =>
    Effect.gen(function* () {
      const channel = yield* channelService.findFirst({ where: { id: channelId } }).pipe(
        Effect.mapError(e => e._tag === 'ChannelNotFound' ? new CrossOrgGraftDenied() : new ChannelListingDbFailed({ cause: e })),
      )
      if (channel.organizationId !== organizationId)
        yield* Effect.fail(new CrossOrgGraftDenied())
    })

  const publish: ChannelListingServiceImpl['publish'] = input =>
    Effect.gen(function* () {
      yield* guardAdopted(input.productId, input.organizationId)
      yield* guardCrossOrg(input.channelId, input.organizationId)

      const isPublished = input.isPublished ?? true
      const visibleInListings = input.visibleInListings ?? true

      // UPSERT on the live (productId, channelId): if a live listing exists,
      // update its flags; otherwise insert a fresh row.
      const existing = yield* dbErr(db.query.productChannelListings.findFirst({
        where: { productId: input.productId, channelId: input.channelId, deletedAt: { isNull: true } },
      }))

      if (existing) {
        const [row] = yield* dbErr(db
          .update(productChannelListingsTable)
          .set({
            isPublished,
            visibleInListings,
            ...(input.availableForPurchaseAt !== undefined ? { availableForPurchaseAt: input.availableForPurchaseAt } : {}),
            ...(input.publishedAt !== undefined
              ? { publishedAt: input.publishedAt }
              : isPublished
                ? { publishedAt: sql`NOW()` as any }
                : {}),
            updatedAt: sql`NOW()` as any,
          })
          .where(sql`${productChannelListingsTable.id} = ${existing.id}`)
          .returning())
        return row! as ProductChannelListing
      }

      const [row] = yield* dbErr(db
        .insert(productChannelListingsTable)
        .values({
          productId: input.productId,
          channelId: input.channelId,
          isPublished,
          visibleInListings,
          ...(input.availableForPurchaseAt !== undefined ? { availableForPurchaseAt: input.availableForPurchaseAt } : {}),
          ...(input.publishedAt !== undefined
            ? { publishedAt: input.publishedAt }
            : isPublished
              ? { publishedAt: sql`NOW()` as any }
              : {}),
        })
        .returning())
      return row! as ProductChannelListing
    })

  const unpublish: ChannelListingServiceImpl['unpublish'] = ({ productId, channelId }) =>
    dbErr(db
      .update(productChannelListingsTable)
      .set({ deletedAt: sql`NOW()` as any, updatedAt: sql`NOW()` as any })
      .where(sql`${productChannelListingsTable.productId} = ${productId} AND ${productChannelListingsTable.channelId} = ${channelId} AND ${productChannelListingsTable.deletedAt} IS NULL`))
      .pipe(Effect.asVoid)

  const listListings: ChannelListingServiceImpl['listListings'] = productId =>
    dbErr(db.query.productChannelListings.findMany({
      where: { productId, deletedAt: { isNull: true } },
    })) as Effect.Effect<ReadonlyArray<ProductChannelListing>, ChannelListingDbFailed>

  return {
    publish,
    unpublish,
    listListings,
  } satisfies ChannelListingServiceImpl
})

export const ChannelListingServiceLive = Layer.effect(ChannelListingService, make)
