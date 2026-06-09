import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ProductPostgresLayer, truncateProduct } from '../testing/postgres'
import * as Prod from './product'
import * as ProductType from './product-type'
import * as Var from './variant'

const TestLayer = Var.VariantServiceLive.pipe(
  Layer.provideMerge(Prod.ProductServiceLive),
  Layer.provideMerge(ProductType.ProductTypeServiceLive),
  Layer.provideMerge(ProductPostgresLayer),
)

layer(TestLayer, { timeout: 120_000 })('VariantService', (it) => {
  // ─── helpers ─────────────────────────────────────────────────────────────

  const makeType = (orgId: number | null, slug: string) =>
    Effect.gen(function* () {
      const svc = yield* ProductType.ProductTypeService
      return yield* svc.createType({ organizationId: orgId, name: slug, slug, isShippingRequired: true })
    })

  const makeProduct = (orgId: number | null, typeId: number, handle: string) =>
    Effect.gen(function* () {
      const svc = yield* Prod.ProductService
      return yield* svc.createProduct({ organizationId: orgId, productTypeId: typeId, handle, name: handle })
    })

  const makeVariant = (input: Var.CreateVariantInput) =>
    Effect.gen(function* () {
      const svc = yield* Var.VariantService
      return yield* svc.createVariant(input)
    })

  // ─── createVariant — organizationId inheritance ───────────────────────────

  it.effect('inherits organizationId from global parent → null', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(null, 'base')
      const p = yield* makeProduct(null, t.id, 'global-p')
      const v = yield* makeVariant({ productId: p.id })
      expect(v.organizationId).toBe(null)
      expect(v.productId).toBe(p.id)
    }))

  it.effect('inherits organizationId from org parent → org', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct(1, t.id, 'org-p')
      const v = yield* makeVariant({ productId: p.id })
      expect(v.organizationId).toBe(1)
      expect(v.productId).toBe(p.id)
    }))

  // ─── SKU uniqueness ───────────────────────────────────────────────────────

  it.effect('duplicate live sku in same org → SkuTaken', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct(1, t.id, 'sku-test')
      yield* makeVariant({ productId: p.id, sku: 'DUPE-SKU' })
      const err = yield* makeVariant({ productId: p.id, sku: 'DUPE-SKU' }).pipe(Effect.flip)
      expect(err._tag).toBe('SkuTaken')
    }))

  it.effect('multiple variants with sku: null in the same org → allowed', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct(1, t.id, 'null-sku-test')
      const v1 = yield* makeVariant({ productId: p.id, sku: undefined })
      const v2 = yield* makeVariant({ productId: p.id, sku: undefined })
      expect(v1.sku).toBe(null)
      expect(v2.sku).toBe(null)
    }))

  it.effect('same sku across different orgs → allowed', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t1 = yield* makeType(1, 'shirt')
      const t2 = yield* makeType(2, 'hoodie')
      const p1 = yield* makeProduct(1, t1.id, 'p-org1')
      const p2 = yield* makeProduct(2, t2.id, 'p-org2')
      const v1 = yield* makeVariant({ productId: p1.id, sku: 'CROSS-SKU' })
      const v2 = yield* makeVariant({ productId: p2.id, sku: 'CROSS-SKU' })
      expect(v1.organizationId).toBe(1)
      expect(v2.organizationId).toBe(2)
    }))

  // ─── updateVariant ────────────────────────────────────────────────────────

  it.effect('updateVariant: bumps version', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct(1, t.id, 'update-v')
      const v = yield* makeVariant({ productId: p.id, sku: 'UPD-1', position: 0 })
      const svc = yield* Var.VariantService
      const updated = yield* svc.updateVariant({ id: v.id, version: v.version, position: 5 })
      expect(updated.position).toBe(5)
      expect(updated.version).toBe(v.version + 1)
    }))

  it.effect('updateVariant: stale version → OptimisticLockError', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct(1, t.id, 'stale-v')
      const v = yield* makeVariant({ productId: p.id, sku: 'STALE-1' })
      const svc = yield* Var.VariantService
      yield* svc.updateVariant({ id: v.id, version: v.version, position: 1 })
      const err = yield* svc.updateVariant({ id: v.id, version: v.version, position: 2 }).pipe(Effect.flip)
      expect(err.name).toBe('OptimisticLockError')
    }))

  it.effect('updateVariant: not-found → VariantNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Var.VariantService
      const err = yield* svc.updateVariant({ id: 999999, version: 1, position: 0 }).pipe(Effect.flip)
      expect((err as { _tag?: string })._tag).toBe('VariantNotFound')
    }))

  // ─── softDeleteVariant ────────────────────────────────────────────────────

  it.effect('soft-deleted: excluded from findById + listVariants; sku re-use after delete OK', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct(1, t.id, 'del-v')
      const v = yield* makeVariant({ productId: p.id, sku: 'DEL-SKU' })
      const svc = yield* Var.VariantService
      yield* svc.softDeleteVariant(v.id, v.version)

      // Excluded from findById
      const errFind = yield* svc.findVariantById(v.id).pipe(Effect.flip)
      expect(errFind._tag).toBe('VariantNotFound')

      // Excluded from listVariants
      const list = yield* svc.listVariants(p.id)
      expect(list.map(r => r.id)).not.toContain(v.id)

      // SKU can be reused after soft-delete
      const v2 = yield* svc.createVariant({ productId: p.id, sku: 'DEL-SKU' })
      expect(v2.sku).toBe('DEL-SKU')
    }))

  // ─── listVariants ─────────────────────────────────────────────────────────

  it.effect('listVariants ordered by position', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct(1, t.id, 'ordered-v')
      const svc = yield* Var.VariantService
      yield* svc.createVariant({ productId: p.id, sku: 'V-C', position: 3 })
      yield* svc.createVariant({ productId: p.id, sku: 'V-A', position: 1 })
      yield* svc.createVariant({ productId: p.id, sku: 'V-B', position: 2 })
      const list = yield* svc.listVariants(p.id)
      const skus = list.map(r => r.sku)
      expect(skus).toEqual(['V-A', 'V-B', 'V-C'])
    }))

  // NOTE: the duplicate-matrix guard depends on selection values being
  // persisted via `AttributeAssignmentService.assignVariantValue` (the single
  // writer of `variant_attribute_values`), which needs the cross-module layer.
  // That test therefore lives in `attribute-assignment.integration.test.ts`.
})
