import { Channel } from '@czo/channel/services'
import { expect, layer } from '@effect/vitest'
import { Effect } from 'effect'
import { ProductAttributeLayer, truncateProductAttribute } from '../testing/cross-module-postgres'
import { AdoptionService } from './adoption'
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

  it.effect('unpublish soft-deletes; re-publish after works', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'cl-t5')
      const product = yield* makeProduct(ORG, type.id, 'cl-p5')
      const channel = yield* makeChannel(ORG, 'cl-c5')

      yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })
      expect((yield* svc.listListings(product.id)).length).toBe(1)

      yield* svc.unpublish({ productId: product.id, channelId: channel.id })
      expect((yield* svc.listListings(product.id)).length).toBe(0)

      // idempotent
      yield* svc.unpublish({ productId: product.id, channelId: channel.id })

      const reborn = yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })
      expect(reborn.isPublished).toBe(true)
      expect((yield* svc.listListings(product.id)).length).toBe(1)
    }))
})
