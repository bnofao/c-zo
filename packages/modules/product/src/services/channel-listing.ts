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

export class ChannelListingNotFound extends Data.TaggedError('ChannelListingNotFound')<Record<never, never>> {
  readonly code = 'CHANNEL_LISTING_NOT_FOUND'
  get message() { return 'Channel listing not found' }
}

export class NotAMarketplaceChannel extends Data.TaggedError('NotAMarketplaceChannel')<Record<never, never>> {
  readonly code = 'NOT_A_MARKETPLACE_CHANNEL'
  get message() { return 'Listing is not on a marketplace channel' }
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
  organizationId: number
}

// ─── Service contract ─────────────────────────────────────────────────────────

export class ChannelListingService extends Context.Service<ChannelListingService, {
  readonly publish: (input: PublishListingInput) => Effect.Effect<ProductChannelListing, ProductNotFound | ProductNotAdopted | CrossOrgGraftDenied | ChannelListingDbFailed>
  readonly unpublish: (input: UnpublishListingInput) => Effect.Effect<void, ProductNotFound | ProductNotAdopted | CrossOrgGraftDenied | ChannelListingDbFailed>
  readonly listListings: (productId: number) => Effect.Effect<ReadonlyArray<ProductChannelListing>, ChannelListingDbFailed>
  readonly approveListing: (listingId: number) => Effect.Effect<ProductChannelListing, ChannelListingNotFound | NotAMarketplaceChannel | ChannelListingDbFailed>
  readonly rejectListing: (listingId: number, reason: string) => Effect.Effect<ProductChannelListing, ChannelListingNotFound | NotAMarketplaceChannel | ChannelListingDbFailed>
  readonly suspendListing: (listingId: number, reason: string) => Effect.Effect<ProductChannelListing, ChannelListingNotFound | NotAMarketplaceChannel | ChannelListingDbFailed>
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
   * Product-action guard: the acting org must be entitled to publish/unpublish
   * this product on a channel.
   *   - global product (org null)   → requires a live adoption in the acting org
   *   - the acting org's own product → allowed
   *   - another org's product        → CrossOrgGraftDenied
   * The other-org denial matters most on the shared marketplace channel, where
   * channel ownership alone cannot distinguish vendors.
   */
  const guardProductActable = (productId: number, organizationId: number) =>
    Effect.gen(function* () {
      const product = yield* productService.findProductById(productId).pipe(
        Effect.mapError(e => e._tag === 'ProductNotFound' ? e : new ChannelListingDbFailed({ cause: e })),
      )
      if (product.organizationId === null) {
        yield* adoptionService.requireAdopted({ productId: product.id, orgId: organizationId })
        return
      }
      if (product.organizationId !== organizationId)
        yield* Effect.fail(new CrossOrgGraftDenied())
    })

  /**
   * Resolve the target channel and classify it:
   *   - org-owned by the acting org → own store channel (review default `approved`)
   *   - platform channel (org null)  → the central marketplace (review `pending`)
   *   - owned by another org         → CrossOrgGraftDenied
   * Unknown channel is hidden as CrossOrgGraftDenied.
   */
  const guardChannelTarget = (channelId: number, organizationId: number) =>
    Effect.gen(function* () {
      const channel = yield* channelService.findFirst({ where: { id: channelId } }).pipe(
        Effect.mapError(e => e._tag === 'ChannelNotFound' ? new CrossOrgGraftDenied() : new ChannelListingDbFailed({ cause: e })),
      )
      if (channel.organizationId === null)
        return { isMarketplace: true as const }
      if (channel.organizationId !== organizationId)
        yield* Effect.fail(new CrossOrgGraftDenied())
      return { isMarketplace: false as const }
    })

  const publish: ChannelListingServiceImpl['publish'] = input =>
    Effect.gen(function* () {
      yield* guardProductActable(input.productId, input.organizationId)
      const { isMarketplace } = yield* guardChannelTarget(input.channelId, input.organizationId)

      const isPublished = input.isPublished ?? true
      const visibleInListings = input.visibleInListings ?? true

      // UPSERT on the live (productId, channelId). Update preserves reviewState;
      // a fresh marketplace listing enters `pending` (own-channel uses the
      // column default `approved`).
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
          ...(isMarketplace ? { reviewState: 'pending' as const } : {}),
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

  const unpublish: ChannelListingServiceImpl['unpublish'] = ({ productId, channelId, organizationId }) =>
    Effect.gen(function* () {
      yield* guardProductActable(productId, organizationId)
      yield* guardChannelTarget(channelId, organizationId)
      yield* dbErr(db
        .update(productChannelListingsTable)
        .set({ isPublished: false, updatedAt: sql`NOW()` as any })
        .where(sql`${productChannelListingsTable.productId} = ${productId} AND ${productChannelListingsTable.channelId} = ${channelId} AND ${productChannelListingsTable.deletedAt} IS NULL`))
    }).pipe(Effect.asVoid)

  const listListings: ChannelListingServiceImpl['listListings'] = productId =>
    dbErr(db.query.productChannelListings.findMany({
      where: { productId, deletedAt: { isNull: true } },
    })) as Effect.Effect<ReadonlyArray<ProductChannelListing>, ChannelListingDbFailed>

  /** Load a channel listing by id and set its admin review state (marketplace only). */
  const setReview = (listingId: number, reviewState: 'approved' | 'rejected' | 'suspended', reviewReason: string | null) =>
    Effect.gen(function* () {
      const listing = yield* dbErr(db.query.productChannelListings.findFirst({
        where: { id: listingId, deletedAt: { isNull: true } },
      }))
      if (!listing)
        return yield* Effect.fail(new ChannelListingNotFound())

      const channel = yield* channelService.findFirst({ where: { id: listing.channelId } }).pipe(
        Effect.mapError(e => e._tag === 'ChannelNotFound' ? new NotAMarketplaceChannel() : new ChannelListingDbFailed({ cause: e })),
      )
      if (channel.organizationId !== null)
        return yield* Effect.fail(new NotAMarketplaceChannel())

      const [row] = yield* dbErr(db
        .update(productChannelListingsTable)
        .set({ reviewState, reviewReason, reviewedAt: sql`NOW()` as any, updatedAt: sql`NOW()` as any })
        .where(sql`${productChannelListingsTable.id} = ${listingId} AND ${productChannelListingsTable.deletedAt} IS NULL`)
        .returning())
      return row! as ProductChannelListing
    })

  const approveListing: ChannelListingServiceImpl['approveListing'] = listingId => setReview(listingId, 'approved', null)
  const rejectListing: ChannelListingServiceImpl['rejectListing'] = (listingId, reason) => setReview(listingId, 'rejected', reason)
  const suspendListing: ChannelListingServiceImpl['suspendListing'] = (listingId, reason) => setReview(listingId, 'suspended', reason)

  return {
    publish,
    unpublish,
    listListings,
    approveListing,
    rejectListing,
    suspendListing,
  } satisfies ChannelListingServiceImpl
})

export const ChannelListingServiceLive = Layer.effect(ChannelListingService, make)
