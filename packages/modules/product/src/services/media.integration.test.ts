import { Channel } from '@czo/channel/services'
import { expect, layer } from '@effect/vitest'
import { Effect } from 'effect'
import { ProductAttributeLayer, truncateProductAttribute } from '../testing/cross-module-postgres'
import { AdoptionService } from './adoption'
import { ChannelListingService } from './channel-listing'
import { MediaService } from './media'
import { ProductService } from './product'
import { ProductTypeService } from './product-type'
import { VariantService } from './variant'

const ORG = 1
const ORG2 = 2

layer(ProductAttributeLayer, { timeout: 180_000 })('MediaService', (it) => {
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

  const makeVariant = (productId: number) =>
    Effect.gen(function* () {
      const svc = yield* VariantService
      return yield* svc.createVariant({ productId })
    })

  it.effect('addMedia base (org null) on an org-owned product', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* MediaService
      const type = yield* makeType(ORG, 'md-t1')
      const product = yield* makeProduct(ORG, type.id, 'md-p1')

      const m = yield* svc.addMedia({ productId: product.id, organizationId: null, url: 'https://x/img.png', alt: 'a' })
      expect(m.productId).toBe(product.id)
      expect(m.organizationId).toBeNull()
      expect(m.type).toBe('IMAGE')
      expect(m.alt).toBe('a')
    }))

  it.effect('org graft requires adoption on a global product', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* MediaService
      const adoption = yield* AdoptionService
      const type = yield* makeType(null, 'md-gt')
      const product = yield* makeProduct(null, type.id, 'md-gp')

      // base media on a global product needs no adoption
      yield* svc.addMedia({ productId: product.id, organizationId: null, url: 'https://x/base.png' })

      const err = yield* svc.addMedia({ productId: product.id, organizationId: ORG, url: 'https://x/org.png' }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductNotAdopted')

      yield* adoption.adoptProduct({ productId: product.id, orgId: ORG })
      const m = yield* svc.addMedia({ productId: product.id, organizationId: ORG, url: 'https://x/org.png', type: 'VIDEO' })
      expect(m.organizationId).toBe(ORG)
      expect(m.type).toBe('VIDEO')
    }))

  it.effect('updateMedia + removeMedia', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* MediaService
      const type = yield* makeType(ORG, 'md-t2')
      const product = yield* makeProduct(ORG, type.id, 'md-p2')
      const m = yield* svc.addMedia({ productId: product.id, organizationId: null, url: 'https://x/1.png' })

      const updated = yield* svc.updateMedia({ id: m.id, version: m.version, alt: 'new', position: 5 })
      expect(updated.alt).toBe('new')
      expect(updated.position).toBe(5)

      const removed = yield* svc.removeMedia(updated.id, updated.version)
      expect(removed.deletedAt).not.toBeNull()

      const err = yield* svc.findMediaById(m.id).pipe(Effect.flip)
      expect(err._tag).toBe('MediaNotFound')
    }))

  it.effect('removeMedia on a missing row → MediaNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* MediaService
      const err = yield* svc.removeMedia(999999, 1).pipe(Effect.flip)
      expect(err.name).toBe('MediaNotFound')
    }))

  it.effect('listProductMedia merges base ∪ org', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* MediaService
      const adoption = yield* AdoptionService
      const type = yield* makeType(null, 'md-mt')
      const product = yield* makeProduct(null, type.id, 'md-mp')
      yield* adoption.adoptProduct({ productId: product.id, orgId: ORG })

      yield* svc.addMedia({ productId: product.id, organizationId: null, url: 'https://x/base.png' })
      yield* svc.addMedia({ productId: product.id, organizationId: ORG, url: 'https://x/org1.png' })

      // ORG sees base ∪ org1
      const org1View = yield* svc.listProductMedia({ productId: product.id, orgId: ORG })
      expect(org1View.length).toBe(2)

      // ORG2 (no graft) sees base only
      const org2View = yield* svc.listProductMedia({ productId: product.id, orgId: ORG2 })
      expect(org2View.length).toBe(1)
      expect(org2View[0]!.organizationId).toBeNull()
    }))

  it.effect('linkVariantMedia + media-of-different-product → MediaNotFound; unlink; listVariantMedia', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* MediaService
      const type = yield* makeType(ORG, 'md-t3')
      const p1 = yield* makeProduct(ORG, type.id, 'md-p3a')
      const p2 = yield* makeProduct(ORG, type.id, 'md-p3b')
      const v1 = yield* makeVariant(p1.id)
      const mediaP1 = yield* svc.addMedia({ productId: p1.id, organizationId: null, url: 'https://x/p1.png' })
      const mediaP2 = yield* svc.addMedia({ productId: p2.id, organizationId: null, url: 'https://x/p2.png' })

      // wrong product's media
      const err = yield* svc.linkVariantMedia({ variantId: v1.id, mediaId: mediaP2.id }).pipe(Effect.flip)
      expect(err._tag).toBe('MediaNotFound')

      const link = yield* svc.linkVariantMedia({ variantId: v1.id, mediaId: mediaP1.id })
      expect(link.variantId).toBe(v1.id)

      // idempotent
      yield* svc.linkVariantMedia({ variantId: v1.id, mediaId: mediaP1.id })

      const linked = yield* svc.listVariantMedia(v1.id)
      expect(linked.length).toBe(1)
      expect(linked[0]!.id).toBe(mediaP1.id)

      yield* svc.unlinkVariantMedia({ variantId: v1.id, mediaId: mediaP1.id })
      expect((yield* svc.listVariantMedia(v1.id)).length).toBe(0)
    }))

  it.effect('unadopt purges this org channel listings + org media; base media intact', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const media = yield* MediaService
      const listings = yield* ChannelListingService
      const adoption = yield* AdoptionService
      const channels = yield* Channel.ChannelService
      const type = yield* makeType(null, 'md-ut')
      const product = yield* makeProduct(null, type.id, 'md-up')
      yield* adoption.adoptProduct({ productId: product.id, orgId: ORG })

      const base = yield* media.addMedia({ productId: product.id, organizationId: null, url: 'https://x/base.png' })
      yield* media.addMedia({ productId: product.id, organizationId: ORG, url: 'https://x/org.png' })
      const channel = yield* channels.create({ organizationId: ORG, handle: 'md-uc', name: 'md-uc' })
      yield* listings.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })

      expect((yield* listings.listListings(product.id)).length).toBe(1)
      expect((yield* media.listProductMedia({ productId: product.id, orgId: ORG })).length).toBe(2)

      yield* adoption.unadoptProduct({ productId: product.id, orgId: ORG })

      // channel listing gone, org media graft gone, base media intact
      expect((yield* listings.listListings(product.id)).length).toBe(0)
      const remaining = yield* media.listProductMedia({ productId: product.id, orgId: ORG })
      expect(remaining.length).toBe(1)
      expect(remaining[0]!.id).toBe(base.id)
      expect(remaining[0]!.organizationId).toBeNull()
    }))
})
