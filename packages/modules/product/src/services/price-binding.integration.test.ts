import { Price } from '@czo/price/services'
import { expect, layer } from '@effect/vitest'
import { Effect } from 'effect'
import { ProductAttributeLayer, truncateProductAttribute } from '../testing/cross-module-postgres'
import { PriceBindingService } from './price-binding'
import { ProductService } from './product'
import { ProductTypeService } from './product-type'
import { VariantService } from './variant'

const ORG = 1

layer(ProductAttributeLayer, { timeout: 180_000 })('PriceBindingService', (it) => {
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

  const makePriceSet = (organizationId: number) =>
    Effect.gen(function* () {
      const svc = yield* Price.PriceService
      return yield* svc.createPriceSet({ organizationId })
    })

  // ─── own-org product (no adoption required) ─────────────────────────────────

  it.effect('bind creates the (variant, org) row', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* PriceBindingService
      const type = yield* makeType(ORG, 'pb-t1')
      const product = yield* makeProduct(ORG, type.id, 'pb-p1')
      const variant = yield* makeVariant(product.id)
      const priceSet = yield* makePriceSet(ORG)

      const row = yield* svc.bindPriceSet({ variantId: variant.id, organizationId: ORG, priceSetId: priceSet.id })
      expect(row.variantId).toBe(variant.id)
      expect(row.organizationId).toBe(ORG)
      expect(row.priceSetId).toBe(priceSet.id)
    }))

  it.effect('second bind on same (variant, org) replaces the price set', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* PriceBindingService
      const type = yield* makeType(ORG, 'pb-t2')
      const product = yield* makeProduct(ORG, type.id, 'pb-p2')
      const variant = yield* makeVariant(product.id)
      const ps1 = yield* makePriceSet(ORG)
      const ps2 = yield* makePriceSet(ORG)

      yield* svc.bindPriceSet({ variantId: variant.id, organizationId: ORG, priceSetId: ps1.id })
      const updated = yield* svc.bindPriceSet({ variantId: variant.id, organizationId: ORG, priceSetId: ps2.id })
      expect(updated.priceSetId).toBe(ps2.id)

      const rows = yield* svc.listVariantPriceSets({ variantId: variant.id, orgId: ORG })
      expect(rows.length).toBe(1)
      expect(rows[0]!.priceSetId).toBe(ps2.id)
    }))

  it.effect('cross-org price set → CrossOrgGraftDenied', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* PriceBindingService
      const type = yield* makeType(ORG, 'pb-t3')
      const product = yield* makeProduct(ORG, type.id, 'pb-p3')
      const variant = yield* makeVariant(product.id)
      const foreignPriceSet = yield* makePriceSet(2)

      const err = yield* svc.bindPriceSet({ variantId: variant.id, organizationId: ORG, priceSetId: foreignPriceSet.id }).pipe(Effect.flip)
      expect(err._tag).toBe('CrossOrgGraftDenied')
    }))

  it.effect('unknown price set is hidden as CrossOrgGraftDenied', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* PriceBindingService
      const type = yield* makeType(ORG, 'pb-t3b')
      const product = yield* makeProduct(ORG, type.id, 'pb-p3b')
      const variant = yield* makeVariant(product.id)

      const err = yield* svc.bindPriceSet({ variantId: variant.id, organizationId: ORG, priceSetId: 999999 }).pipe(Effect.flip)
      expect(err._tag).toBe('CrossOrgGraftDenied')
    }))

  it.effect('list returns the org binding; unbind removes it', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* PriceBindingService
      const type = yield* makeType(ORG, 'pb-t4')
      const product = yield* makeProduct(ORG, type.id, 'pb-p4')
      const variant = yield* makeVariant(product.id)
      const priceSet = yield* makePriceSet(ORG)

      yield* svc.bindPriceSet({ variantId: variant.id, organizationId: ORG, priceSetId: priceSet.id })
      const before = yield* svc.listVariantPriceSets({ variantId: variant.id, orgId: ORG })
      expect(before.length).toBe(1)

      yield* svc.unbindPriceSet({ variantId: variant.id, organizationId: ORG })
      const after = yield* svc.listVariantPriceSets({ variantId: variant.id, orgId: ORG })
      expect(after.length).toBe(0)

      // unbind is idempotent — a second call is a no-op.
      yield* svc.unbindPriceSet({ variantId: variant.id, organizationId: ORG })
    }))

  // ─── adoption guard (global product) ────────────────────────────────────────

  it.effect('global variant: bind without adoption → ProductNotAdopted; after adopt → OK', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* PriceBindingService
      const adoption = yield* ProductService
      const type = yield* makeType(null, 'pb-gt')
      const product = yield* makeProduct(null, type.id, 'pb-gp')
      const variant = yield* makeVariant(product.id)
      const priceSet = yield* makePriceSet(ORG)

      const err = yield* svc.bindPriceSet({ variantId: variant.id, organizationId: ORG, priceSetId: priceSet.id }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductNotAdopted')

      yield* adoption.adoptProduct({ productId: product.id, orgId: ORG })
      const row = yield* svc.bindPriceSet({ variantId: variant.id, organizationId: ORG, priceSetId: priceSet.id })
      expect(row.priceSetId).toBe(priceSet.id)
    }))
})
