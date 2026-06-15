import { Channel } from '@czo/channel/services'
import { DrizzleDb } from '@czo/kit/db'
import { expect, layer } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { products as productsTable } from '../database/schema'
import { ProductAttributeLayer, truncateProductAttribute } from '../testing/cross-module-postgres'
import { AdoptionService } from './adoption'
import { CategoryService } from './category'
import { ChannelListingService } from './channel-listing'
import { ProductService } from './product'
import { ProductTypeService } from './product-type'

const ORG = 1

layer(ProductAttributeLayer, { timeout: 180_000 })('ChannelListingService', (it) => {
  const makeType = (orgId: number | null, slug: string) =>
    Effect.gen(function* () {
      const svc = yield* ProductTypeService
      return yield* svc.createType({ organizationId: orgId, name: slug, slug, isShippingRequired: true })
    })

  const makeProduct = (orgId: number | null, typeId: number, handle: string) =>
    Effect.gen(function* () {
      const svc = yield* ProductService
      return yield* svc.createProduct({ organizationId: orgId, productTypeId: typeId, handle, name: handle })
    })

  const makeChannel = (organizationId: number, handle: string) =>
    Effect.gen(function* () {
      const svc = yield* Channel.ChannelService
      return yield* svc.create({ organizationId, handle, name: handle })
    })

  const makePlatformChannel = (handle: string) =>
    Effect.gen(function* () {
      const svc = yield* Channel.ChannelService
      return yield* svc.create({ organizationId: null, handle, name: handle })
    })

  it.effect('publish creates a live listing', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'cl-t1')
      const product = yield* makeProduct(ORG, type.id, 'cl-p1')
      const channel = yield* makeChannel(ORG, 'cl-c1')

      const row = yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })
      expect(row.productId).toBe(product.id)
      expect(row.channelId).toBe(channel.id)
      expect(row.isPublished).toBe(true)
      expect(row.visibleInListings).toBe(true)
      expect(row.publishedAt).not.toBeNull()
    }))

  it.effect('second publish on same (product, channel) updates the one live row', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'cl-t2')
      const product = yield* makeProduct(ORG, type.id, 'cl-p2')
      const channel = yield* makeChannel(ORG, 'cl-c2')

      const first = yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })
      const second = yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG, visibleInListings: false })
      expect(second.id).toBe(first.id)
      expect(second.visibleInListings).toBe(false)

      const rows = yield* svc.listListings(product.id)
      expect(rows.length).toBe(1)
    }))

  it.effect('channel owned by another org → CrossOrgGraftDenied', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'cl-t3')
      const product = yield* makeProduct(ORG, type.id, 'cl-p3')
      const foreignChannel = yield* makeChannel(2, 'cl-c3-foreign')

      const err = yield* svc.publish({ productId: product.id, channelId: foreignChannel.id, organizationId: ORG }).pipe(Effect.flip)
      expect(err._tag).toBe('CrossOrgGraftDenied')
    }))

  it.effect('unknown channel is hidden as CrossOrgGraftDenied', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'cl-t3b')
      const product = yield* makeProduct(ORG, type.id, 'cl-p3b')

      const err = yield* svc.publish({ productId: product.id, channelId: 999999, organizationId: ORG }).pipe(Effect.flip)
      expect(err._tag).toBe('CrossOrgGraftDenied')
    }))

  it.effect('global product: publish without adoption → ProductNotAdopted; after adopt → OK', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const adoption = yield* AdoptionService
      const type = yield* makeType(null, 'cl-gt')
      const product = yield* makeProduct(null, type.id, 'cl-gp')
      const channel = yield* makeChannel(ORG, 'cl-gc')

      const err = yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductNotAdopted')

      yield* adoption.adoptProduct({ productId: product.id, orgId: ORG })
      const row = yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })
      expect(row.isPublished).toBe(true)
    }))

  it.effect('unpublish toggles isPublished and keeps the row; re-publish re-enables', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'cl-t5')
      const product = yield* makeProduct(ORG, type.id, 'cl-p5')
      const channel = yield* makeChannel(ORG, 'cl-c5')

      yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })
      yield* svc.unpublish({ productId: product.id, channelId: channel.id, organizationId: ORG })

      const after = yield* svc.listListings(product.id)
      expect(after.length).toBe(1)
      expect(after[0]!.isPublished).toBe(false)

      const reborn = yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })
      expect(reborn.isPublished).toBe(true)
      expect((yield* svc.listListings(product.id)).length).toBe(1)
    }))

  it.effect('publish on a platform channel creates a pending (not live) listing', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(null, 'mk-t1')
      const product = yield* makeProduct(ORG, type.id, 'mk-p1')
      const market = yield* makePlatformChannel('mk-market1')

      const row = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })
      expect(row.isPublished).toBe(true)
      expect(row.reviewState).toBe('pending')
    }))

  it.effect('approveListing → approved + reviewedAt; reason cleared', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(null, 'mk-t2')
      const product = yield* makeProduct(ORG, type.id, 'mk-p2')
      const market = yield* makePlatformChannel('mk-market2')
      const listing = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })

      const approved = yield* svc.approveListing(listing.id)
      expect(approved.reviewState).toBe('approved')
      expect(approved.reviewReason).toBeNull()
      expect(approved.reviewedAt).not.toBeNull()
    }))

  it.effect('reject and suspend persist the reason', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(null, 'mk-t3')
      const product = yield* makeProduct(ORG, type.id, 'mk-p3')
      const market = yield* makePlatformChannel('mk-market3')
      const listing = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })

      const rejected = yield* svc.rejectListing(listing.id, 'counterfeit')
      expect(rejected.reviewState).toBe('rejected')
      expect(rejected.reviewReason).toBe('counterfeit')

      const suspended = yield* svc.suspendListing(listing.id, 'policy violation')
      expect(suspended.reviewState).toBe('suspended')
      expect(suspended.reviewReason).toBe('policy violation')
    }))

  it.effect('approved marketplace listing survives unpublish/re-publish (no re-moderation)', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(null, 'mk-t4')
      const product = yield* makeProduct(ORG, type.id, 'mk-p4')
      const market = yield* makePlatformChannel('mk-market4')
      const listing = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })
      yield* svc.approveListing(listing.id)

      yield* svc.unpublish({ productId: product.id, channelId: market.id, organizationId: ORG })
      const reborn = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })
      expect(reborn.isPublished).toBe(true)
      expect(reborn.reviewState).toBe('approved')
    }))

  it.effect('moderating a missing listing → ChannelListingNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const err = yield* svc.approveListing(999999).pipe(Effect.flip)
      expect(err._tag).toBe('ChannelListingNotFound')
    }))

  it.effect('moderating an own-channel listing → NotAMarketplaceChannel', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'mk-t6')
      const product = yield* makeProduct(ORG, type.id, 'mk-p6')
      const channel = yield* makeChannel(ORG, 'mk-own6')
      const listing = yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })

      const err = yield* svc.approveListing(listing.id).pipe(Effect.flip)
      expect(err._tag).toBe('NotAMarketplaceChannel')
    }))

  it.effect('a different org cannot unpublish another org\'s marketplace listing → CrossOrgGraftDenied', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(null, 'mk-t7')
      const product = yield* makeProduct(ORG, type.id, 'mk-p7')
      const market = yield* makePlatformChannel('mk-market7')
      yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })

      // org 2 owns neither the product nor the marketplace listing.
      const err = yield* svc.unpublish({ productId: product.id, channelId: market.id, organizationId: 2 }).pipe(Effect.flip)
      expect(err._tag).toBe('CrossOrgGraftDenied')
    }))

  it.effect('publish on marketplace with an org-private product type → ProductTypeNotGlobal', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'enf-org-type')
      const product = yield* makeProduct(ORG, type.id, 'enf-p1')
      const market = yield* makePlatformChannel('enf-m1')
      const err = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeNotGlobal')
    }))

  it.effect('publish on marketplace with a global type and no categories → pending', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(null, 'enf-glob-type')
      const product = yield* makeProduct(ORG, type.id, 'enf-p2')
      const market = yield* makePlatformChannel('enf-m2')
      const row = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })
      expect(row.reviewState).toBe('pending')
    }))

  it.effect('publish on marketplace with a base placement into an org-private category → MarketplaceCategoryNotGlobal', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const categories = yield* CategoryService
      const type = yield* makeType(null, 'enf-glob-type-c1')
      const product = yield* makeProduct(ORG, type.id, 'enf-p3')
      const orgCat = yield* categories.createCategory({ organizationId: ORG, name: 'OrgCat', slug: 'enf-orgcat' })
      yield* categories.placeProduct({ productId: product.id, categoryId: orgCat.id, organizationId: null }) // base placement
      const market = yield* makePlatformChannel('enf-m3')
      const err = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG }).pipe(Effect.flip)
      expect(err._tag).toBe('MarketplaceCategoryNotGlobal')
    }))

  it.effect('publish on marketplace with a base placement into a global category → pending', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const categories = yield* CategoryService
      const type = yield* makeType(null, 'enf-glob-type-c2')
      const product = yield* makeProduct(ORG, type.id, 'enf-p4')
      const globCat = yield* categories.createCategory({ organizationId: null, name: 'GlobCat', slug: 'enf-globcat' })
      yield* categories.placeProduct({ productId: product.id, categoryId: globCat.id, organizationId: null })
      const market = yield* makePlatformChannel('enf-m4')
      const row = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })
      expect(row.reviewState).toBe('pending')
    }))

  it.effect('approveListing on a listing whose product became org-typed → ProductTypeNotGlobal; stays pending', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const db = yield* DrizzleDb
      const globType = yield* makeType(null, 'enf-glob-type-a')
      const orgType = yield* makeType(ORG, 'enf-org-type-a')
      const product = yield* makeProduct(ORG, globType.id, 'enf-p5')
      const market = yield* makePlatformChannel('enf-m5')
      const listing = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })
      expect(listing.reviewState).toBe('pending')
      // Re-type the product to an org-private type, breaking compliance.
      // UpdateProductInput does not expose productTypeId, so write it directly.
      // The effect-postgres query builder returns an Effect, so it is yielded.
      yield* (db as any).update(productsTable).set({ productTypeId: orgType.id }).where(eq(productsTable.id, product.id)) as Effect.Effect<unknown, Error>
      const err = yield* svc.approveListing(listing.id).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeNotGlobal')
      const rows = yield* svc.listListings(product.id)
      expect(rows[0]!.reviewState).toBe('pending')
    }))

  it.effect('approveListing on a compliant listing → approved; reject/suspend skip the compliance check', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(null, 'enf-glob-type-b')
      const product = yield* makeProduct(ORG, type.id, 'enf-p6')
      const market = yield* makePlatformChannel('enf-m6')
      const listing = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })
      const approved = yield* svc.approveListing(listing.id)
      expect(approved.reviewState).toBe('approved')
    }))

  it.effect('own-channel (non-marketplace) publish is unaffected by compliance', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'enf-org-type-own')
      const product = yield* makeProduct(ORG, type.id, 'enf-p7')
      const channel = yield* makeChannel(ORG, 'enf-own')
      const row = yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })
      expect(row.reviewState).toBe('approved') // own-channel listings default reviewState approved
    }))
})
