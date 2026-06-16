import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { ProductNotAdopted } from './adoption'
import { Channel } from '@czo/channel/services'
import { DrizzleDb } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { productChannelListings as productChannelListingsTable } from '../database/schema'
import { AdoptionService } from './adoption'
import { CrossOrgGraftDenied } from './price-binding'
import { ProductNotFound, ProductService } from './product'

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

export class ProductTypeNotGlobal extends Data.TaggedError('ProductTypeNotGlobal')<{ readonly productTypeId: number }> {
  readonly code = 'PRODUCT_TYPE_NOT_GLOBAL'
  get message() { return 'A marketplace product must have a global product type' }
}

export class MarketplaceCategoryNotGlobal extends Data.TaggedError('MarketplaceCategoryNotGlobal')<{ readonly categoryId: number }> {
  readonly code = 'MARKETPLACE_CATEGORY_NOT_GLOBAL'
  get message() { return 'A marketplace product cannot be placed in an org-private category' }
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
  readonly publish: (input: PublishListingInput) => Effect.Effect<ProductChannelListing, ProductNotFound | ProductNotAdopted | CrossOrgGraftDenied | ChannelListingDbFailed | ProductTypeNotGlobal | MarketplaceCategoryNotGlobal>
  readonly unpublish: (input: UnpublishListingInput) => Effect.Effect<void, ProductNotFound | ProductNotAdopted | CrossOrgGraftDenied | ChannelListingDbFailed>
  readonly listListings: (productId: number) => Effect.Effect<ReadonlyArray<ProductChannelListing>, ChannelListingDbFailed>
  readonly approveListing: (listingId: number) => Effect.Effect<ProductChannelListing, ChannelListingNotFound | NotAMarketplaceChannel | ChannelListingDbFailed | ProductNotFound | ProductTypeNotGlobal | MarketplaceCategoryNotGlobal>
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

  /**
   * Marketplace eligibility: the product's type must be global and none of its
   * base (org-null) category placements may reference an org-private category.
   * Org-overlay placements (organizationId set) are store-only and ignored.
   */
  const checkMarketplaceCompliance = (productId: number) =>
    Effect.gen(function* () {
      const product = yield* dbErr(db.query.products.findFirst({
        where: { id: productId, deletedAt: { isNull: true as const } },
        columns: { id: true },
        with: {
          productType: { columns: { id: true, organizationId: true } },
          categories: {
            where: { organizationId: { isNull: true as const } },
            columns: { id: true },
            with: { category: { columns: { id: true, organizationId: true } } },
          },
        },
      }))
      if (!product || !product.productType)
        return yield* Effect.fail(new ProductNotFound({ id: productId }))
      if (product.productType.organizationId !== null)
        return yield* Effect.fail(new ProductTypeNotGlobal({ productTypeId: product.productType.id }))
      for (const placement of product.categories) {
        if (placement.category && placement.category.organizationId !== null)
          return yield* Effect.fail(new MarketplaceCategoryNotGlobal({ categoryId: placement.category.id }))
      }
    })

  const publish: ChannelListingServiceImpl['publish'] = input =>
    Effect.gen(function* () {
      yield* guardProductActable(input.productId, input.organizationId)
      const { isMarketplace } = yield* guardChannelTarget(input.channelId, input.organizationId)
      if (isMarketplace)
        yield* checkMarketplaceCompliance(input.productId)

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
            organizationId: input.organizationId,
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
          organizationId: input.organizationId,
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

  /** Load a live listing and require its channel to be a marketplace (platform) channel. */
  const loadMarketplaceListing = (listingId: number) =>
    Effect.gen(function* () {
      const listing = yield* dbErr(db.query.productChannelListings.findFirst({
        where: { id: listingId, deletedAt: { isNull: true as const } },
      }))
      if (!listing)
        return yield* Effect.fail(new ChannelListingNotFound())
      const channel = yield* channelService.findFirst({ where: { id: listing.channelId } }).pipe(
        Effect.mapError(e => e._tag === 'ChannelNotFound' ? new NotAMarketplaceChannel() : new ChannelListingDbFailed({ cause: e })),
      )
      if (channel.organizationId !== null)
        return yield* Effect.fail(new NotAMarketplaceChannel())
      return listing as ProductChannelListing
    })

  const writeReview = (listingId: number, reviewState: 'approved' | 'rejected' | 'suspended', reviewReason: string | null) =>
    Effect.gen(function* () {
      const [row] = yield* dbErr(db
        .update(productChannelListingsTable)
        .set({ reviewState, reviewReason, reviewedAt: sql`NOW()` as any, updatedAt: sql`NOW()` as any })
        .where(sql`${productChannelListingsTable.id} = ${listingId} AND ${productChannelListingsTable.deletedAt} IS NULL`)
        .returning())
      return row! as ProductChannelListing
    })

  const approveListing: ChannelListingServiceImpl['approveListing'] = listingId =>
    Effect.gen(function* () {
      const listing = yield* loadMarketplaceListing(listingId)
      yield* checkMarketplaceCompliance(listing.productId)
      return yield* writeReview(listingId, 'approved', null)
    })

  const rejectListing: ChannelListingServiceImpl['rejectListing'] = (listingId, reason) =>
    Effect.gen(function* () {
      yield* loadMarketplaceListing(listingId)
      return yield* writeReview(listingId, 'rejected', reason)
    })

  const suspendListing: ChannelListingServiceImpl['suspendListing'] = (listingId, reason) =>
    Effect.gen(function* () {
      yield* loadMarketplaceListing(listingId)
      return yield* writeReview(listingId, 'suspended', reason)
    })

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
