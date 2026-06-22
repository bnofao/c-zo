import { Inventory } from '@czo/inventory/services'
import { Price } from '@czo/price/services'
import { expect, layer } from '@effect/vitest'
import { Effect } from 'effect'
import { ProductAttributeLayer, truncateProductAttribute } from '../testing/cross-module-postgres'
import { InventoryBindingService } from './inventory-binding'
import { PriceBindingService } from './price-binding'
import { ProductService } from './product'
import { ProductTypeService } from './product-type'
import { purgeDeferred } from './subscribers/unadopt-queue'
import { VariantService } from './variant'

const ORG = 1
let skuSeq = 0

layer(ProductAttributeLayer, { timeout: 180_000 })('InventoryBindingService', (it) => {
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

  const makeItem = (organizationId: number) =>
    Effect.gen(function* () {
      const svc = yield* Inventory.InventoryService
      skuSeq += 1
      return yield* svc.createItem({ organizationId, sku: `ib-sku-${skuSeq}` })
    })

  // ─── own-org product ────────────────────────────────────────────────────────

  it.effect('link creates a row with requiredQuantity', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* InventoryBindingService
      const type = yield* makeType(ORG, 'ib-t1')
      const product = yield* makeProduct(ORG, type.id, 'ib-p1')
      const variant = yield* makeVariant(product.id)
      const item = yield* makeItem(ORG)

      const row = yield* svc.linkInventoryItem({ variantId: variant.id, organizationId: ORG, inventoryItemId: item.id, requiredQuantity: 3 })
      expect(row.inventoryItemId).toBe(item.id)
      expect(row.requiredQuantity).toBe(3)
    }))

  it.effect('requiredQuantity <= 0 → InvalidRequiredQuantity', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* InventoryBindingService
      const type = yield* makeType(ORG, 'ib-t2')
      const product = yield* makeProduct(ORG, type.id, 'ib-p2')
      const variant = yield* makeVariant(product.id)
      const item = yield* makeItem(ORG)

      const err = yield* svc.linkInventoryItem({ variantId: variant.id, organizationId: ORG, inventoryItemId: item.id, requiredQuantity: 0 }).pipe(Effect.flip)
      expect(err._tag).toBe('InvalidRequiredQuantity')
    }))

  it.effect('duplicate link is idempotent — refreshes requiredQuantity', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* InventoryBindingService
      const type = yield* makeType(ORG, 'ib-t3')
      const product = yield* makeProduct(ORG, type.id, 'ib-p3')
      const variant = yield* makeVariant(product.id)
      const item = yield* makeItem(ORG)

      yield* svc.linkInventoryItem({ variantId: variant.id, organizationId: ORG, inventoryItemId: item.id, requiredQuantity: 1 })
      const second = yield* svc.linkInventoryItem({ variantId: variant.id, organizationId: ORG, inventoryItemId: item.id, requiredQuantity: 5 })
      expect(second.requiredQuantity).toBe(5)

      const rows = yield* svc.listVariantInventoryItems({ variantId: variant.id, orgId: ORG })
      expect(rows.length).toBe(1)
      expect(rows[0]!.requiredQuantity).toBe(5)
    }))

  it.effect('cross-org inventory item → CrossOrgGraftDenied', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* InventoryBindingService
      const type = yield* makeType(ORG, 'ib-t4')
      const product = yield* makeProduct(ORG, type.id, 'ib-p4')
      const variant = yield* makeVariant(product.id)
      const foreignItem = yield* makeItem(2)

      const err = yield* svc.linkInventoryItem({ variantId: variant.id, organizationId: ORG, inventoryItemId: foreignItem.id }).pipe(Effect.flip)
      expect(err._tag).toBe('CrossOrgGraftDenied')
    }))

  it.effect('M:N — two items on the same variant; unlink one leaves the other', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* InventoryBindingService
      const type = yield* makeType(ORG, 'ib-t5')
      const product = yield* makeProduct(ORG, type.id, 'ib-p5')
      const variant = yield* makeVariant(product.id)
      const itemA = yield* makeItem(ORG)
      const itemB = yield* makeItem(ORG)

      yield* svc.linkInventoryItem({ variantId: variant.id, organizationId: ORG, inventoryItemId: itemA.id })
      yield* svc.linkInventoryItem({ variantId: variant.id, organizationId: ORG, inventoryItemId: itemB.id })
      const both = yield* svc.listVariantInventoryItems({ variantId: variant.id, orgId: ORG })
      expect(both.length).toBe(2)

      yield* svc.unlinkInventoryItem({ variantId: variant.id, organizationId: ORG, inventoryItemId: itemA.id })
      const after = yield* svc.listVariantInventoryItems({ variantId: variant.id, orgId: ORG })
      expect(after.length).toBe(1)
      expect(after[0]!.inventoryItemId).toBe(itemB.id)
    }))

  // ─── adoption guard ─────────────────────────────────────────────────────────

  it.effect('global variant: link without adoption → ProductNotAdopted; after adopt → OK', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* InventoryBindingService
      const adoption = yield* ProductService
      const type = yield* makeType(null, 'ib-gt')
      const product = yield* makeProduct(null, type.id, 'ib-gp')
      const variant = yield* makeVariant(product.id)
      const item = yield* makeItem(ORG)

      const err = yield* svc.linkInventoryItem({ variantId: variant.id, organizationId: ORG, inventoryItemId: item.id }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductNotAdopted')

      yield* adoption.adoptProduct({ productId: product.id, orgId: ORG })
      const row = yield* svc.linkInventoryItem({ variantId: variant.id, organizationId: ORG, inventoryItemId: item.id })
      expect(row.inventoryItemId).toBe(item.id)
    }))

  // ─── unadopt purges price + inventory grafts ────────────────────────────────

  it.effect('unadopt removes this org\'s price + inventory grafts; base intact', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const invBind = yield* InventoryBindingService
      const priceBind = yield* PriceBindingService
      const adoption = yield* ProductService
      const priceSvc = yield* Price.PriceService

      const type = yield* makeType(null, 'ib-unadopt-t')
      const product = yield* makeProduct(null, type.id, 'ib-unadopt-p')
      const variant = yield* makeVariant(product.id)

      yield* adoption.adoptProduct({ productId: product.id, orgId: ORG })

      const priceSet = yield* priceSvc.createPriceSet({ organizationId: ORG })
      const item = yield* makeItem(ORG)
      yield* priceBind.bindPriceSet({ variantId: variant.id, organizationId: ORG, priceSetId: priceSet.id })
      yield* invBind.linkInventoryItem({ variantId: variant.id, organizationId: ORG, inventoryItemId: item.id })

      expect((yield* priceBind.listVariantPriceSets({ variantId: variant.id, orgId: ORG })).length).toBe(1)
      expect((yield* invBind.listVariantInventoryItems({ variantId: variant.id, orgId: ORG })).length).toBe(1)

      yield* adoption.unadoptProduct({ productId: product.id, orgId: ORG })
      yield* purgeDeferred(product.id, ORG)

      expect((yield* priceBind.listVariantPriceSets({ variantId: variant.id, orgId: ORG })).length).toBe(0)
      expect((yield* invBind.listVariantInventoryItems({ variantId: variant.id, orgId: ORG })).length).toBe(0)

      // Base intact: the variant + product still exist.
      const variantSvc = yield* VariantService
      const stillThere = yield* variantSvc.findVariantById(variant.id)
      expect(stillThere.id).toBe(variant.id)
    }))
})
