import { DrizzleDb } from '@czo/kit/db'
import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { productChannelListings } from '../database/schema'
import { ProductPostgresLayer, truncateProduct } from '../testing/postgres'
import { layer as ProductEventsLayer } from './events/product'
import * as Prod from './product'
import * as ProductType from './product-type'

const TestLayer = Prod.ProductServiceLive.pipe(
  Layer.provideMerge(ProductType.ProductTypeServiceLive),
  Layer.provideMerge(ProductEventsLayer),
  Layer.provideMerge(ProductPostgresLayer),
)

layer(TestLayer, { timeout: 120_000 })('ProductService', (it) => {
  // ─── helpers ─────────────────────────────────────────────────────────────

  /** Create a product type, returning it. */
  const makeType = (orgId: number | null, slug: string) =>
    Effect.gen(function* () {
      const svc = yield* ProductType.ProductTypeService
      return yield* svc.createType({ organizationId: orgId, name: slug, slug, isShippingRequired: true })
    })

  /** Create a product, returning it. */
  const makeProduct = (input: Prod.CreateProductInput) =>
    Effect.gen(function* () {
      const svc = yield* Prod.ProductService
      return yield* svc.createProduct(input)
    })

  /** Seed a live channel listing so `findProductByHandle`'s publication filter passes. */
  const seedLiveListing = (productId: number) =>
    Effect.gen(function* () {
      const db = yield* DrizzleDb
      yield* db.insert(productChannelListings).values({ productId, channelId: 1, isPublished: true, reviewState: 'approved' }).returning()
    })

  // ─── createProduct ────────────────────────────────────────────────────────

  it.effect('creates org-owned product on org-1 type', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct({ organizationId: 1, productTypeId: t.id, handle: 'my-shirt', name: 'My Shirt' })
      expect(p.organizationId).toBe(1)
      expect(p.handle).toBe('my-shirt')
      expect(p.productTypeId).toBe(t.id)
    }))

  it.effect('creates global product on a global type', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(null, 'shirt')
      const p = yield* makeProduct({ organizationId: null, productTypeId: t.id, handle: 'global-shirt', name: 'Global Shirt' })
      expect(p.organizationId).toBe(null)
      expect(p.handle).toBe('global-shirt')
    }))

  it.effect('global product on an org-owned type → GlobalProductRequiresGlobalType', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const err = yield* makeProduct({ organizationId: null, productTypeId: t.id, handle: 'g', name: 'G' }).pipe(Effect.flip)
      expect(err._tag).toBe('GlobalProductRequiresGlobalType')
    }))

  it.effect('org product referencing a global type → OK', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(null, 'shirt')
      const p = yield* makeProduct({ organizationId: 1, productTypeId: t.id, handle: 'org-shirt', name: 'Org Shirt' })
      expect(p.organizationId).toBe(1)
    }))

  it.effect('org product referencing its own org type → OK', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct({ organizationId: 1, productTypeId: t.id, handle: 'own-shirt', name: 'Own Shirt' })
      expect(p.organizationId).toBe(1)
      expect(p.productTypeId).toBe(t.id)
    }))

  it.effect('org-1 product referencing org-2 type → ProductTypeNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(2, 'shirt')
      const err = yield* makeProduct({ organizationId: 1, productTypeId: t.id, handle: 'x', name: 'X' }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeNotFound')
    }))

  it.effect('missing type → ProductTypeNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const err = yield* makeProduct({ organizationId: 1, productTypeId: 999999, handle: 'x', name: 'X' }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeNotFound')
    }))

  it.effect('duplicate live handle in same scope → HandleTaken', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      yield* makeProduct({ organizationId: 1, productTypeId: t.id, handle: 'dup', name: 'First' })
      const err = yield* makeProduct({ organizationId: 1, productTypeId: t.id, handle: 'dup', name: 'Second' }).pipe(Effect.flip)
      expect(err._tag).toBe('HandleTaken')
    }))

  it.effect('same handle in global scope vs org-1 scope → both OK', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tGlobal = yield* makeType(null, 'shirt')
      const tOrg = yield* makeType(1, 'tee')
      const g = yield* makeProduct({ organizationId: null, productTypeId: tGlobal.id, handle: 'shared', name: 'Global Shared' })
      const o = yield* makeProduct({ organizationId: 1, productTypeId: tOrg.id, handle: 'shared', name: 'Org Shared' })
      expect(g.organizationId).toBe(null)
      expect(o.organizationId).toBe(1)
    }))

  it.effect('same handle in org-1 vs org-2 → both OK', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t1 = yield* makeType(1, 'shirt')
      const t2 = yield* makeType(2, 'shirt')
      const p1 = yield* makeProduct({ organizationId: 1, productTypeId: t1.id, handle: 'shared', name: 'Org1 Shared' })
      const p2 = yield* makeProduct({ organizationId: 2, productTypeId: t2.id, handle: 'shared', name: 'Org2 Shared' })
      expect(p1.organizationId).toBe(1)
      expect(p2.organizationId).toBe(2)
    }))

  // ─── updateProduct ────────────────────────────────────────────────────────

  it.effect('updates name + bumps version', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct({ organizationId: 1, productTypeId: t.id, handle: 'shirt', name: 'Old Name' })
      const updated = yield* (yield* Prod.ProductService).updateProduct({ id: p.id, version: p.version, name: 'New Name' })
      expect(updated.name).toBe('New Name')
      expect(updated.version).toBe(p.version + 1)
    }))

  it.effect('stale version → OptimisticLockError', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct({ organizationId: 1, productTypeId: t.id, handle: 'shirt', name: 'Name' })
      const svc = yield* Prod.ProductService
      yield* svc.updateProduct({ id: p.id, version: p.version, name: 'Updated' })
      const err = yield* svc.updateProduct({ id: p.id, version: p.version, name: 'Stale' }).pipe(Effect.flip)
      expect(err.name).toBe('OptimisticLockError')
    }))

  it.effect('updateProduct on missing → ProductNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Prod.ProductService
      const err = yield* svc.updateProduct({ id: 999999, version: 1, name: 'X' }).pipe(Effect.flip)
      expect((err as { _tag?: string })._tag).toBe('ProductNotFound')
    }))

  // ─── softDeleteProduct ────────────────────────────────────────────────────

  it.effect('soft-deleted excluded from findProductById + listProducts', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct({ organizationId: 1, productTypeId: t.id, handle: 'del-shirt', name: 'To Delete' })
      const svc = yield* Prod.ProductService
      yield* svc.softDeleteProduct(p.id, p.version)

      const errFind = yield* svc.findProductById(p.id).pipe(Effect.flip)
      expect(errFind._tag).toBe('ProductNotFound')

      const list = yield* svc.listProducts(1)
      expect(list.map(r => r.id)).not.toContain(p.id)
    }))

  it.effect('handle re-use after soft-delete → OK', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct({ organizationId: 1, productTypeId: t.id, handle: 'reusable', name: 'First' })
      const svc = yield* Prod.ProductService
      yield* svc.softDeleteProduct(p.id, p.version)
      const p2 = yield* svc.createProduct({ organizationId: 1, productTypeId: t.id, handle: 'reusable', name: 'Second' })
      expect(p2.handle).toBe('reusable')
    }))

  it.effect('softDeleteProduct on missing → ProductNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Prod.ProductService
      const err = yield* svc.softDeleteProduct(999999, 1).pipe(Effect.flip)
      expect((err as { _tag?: string })._tag).toBe('ProductNotFound')
    }))

  // ─── findProductByHandle ──────────────────────────────────────────────────

  it.effect('finds product in global scope', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(null, 'shirt')
      const p = yield* makeProduct({ organizationId: null, productTypeId: t.id, handle: 'global-h', name: 'G' })
      yield* seedLiveListing(p.id)
      const svc = yield* Prod.ProductService
      const found = yield* svc.findProductByHandle({ orgId: null, handle: 'global-h' })
      expect(found.id).toBe(p.id)
    }))

  it.effect('finds product in org scope', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct({ organizationId: 1, productTypeId: t.id, handle: 'org-h', name: 'O' })
      yield* seedLiveListing(p.id)
      const svc = yield* Prod.ProductService
      const found = yield* svc.findProductByHandle({ orgId: 1, handle: 'org-h' })
      expect(found.id).toBe(p.id)
    }))

  it.effect('global-scope handle not found in org scope → ProductNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(null, 'shirt')
      yield* makeProduct({ organizationId: null, productTypeId: t.id, handle: 'global-only', name: 'G' })
      const svc = yield* Prod.ProductService
      const err = yield* svc.findProductByHandle({ orgId: 1, handle: 'global-only' }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductNotFound')
    }))

  it.effect('findProductByHandle: not-found path', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Prod.ProductService
      const err = yield* svc.findProductByHandle({ orgId: 1, handle: 'no-such' }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductNotFound')
    }))

  // ─── listProducts ─────────────────────────────────────────────────────────

  it.effect('listProducts merges global ∪ org, excludes other orgs', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tGlobal = yield* makeType(null, 'base')
      const t1 = yield* makeType(1, 'tee')
      const t2 = yield* makeType(2, 'hoodie')
      const g = yield* makeProduct({ organizationId: null, productTypeId: tGlobal.id, handle: 'g', name: 'G' })
      const o1 = yield* makeProduct({ organizationId: 1, productTypeId: t1.id, handle: 'o1', name: 'O1' })
      const o2 = yield* makeProduct({ organizationId: 2, productTypeId: t2.id, handle: 'o2', name: 'O2' })

      const svc = yield* Prod.ProductService
      const for1 = yield* svc.listProducts(1)
      const ids1 = for1.map(r => r.id)
      expect(ids1).toContain(g.id)
      expect(ids1).toContain(o1.id)
      expect(ids1).not.toContain(o2.id)

      const for2 = yield* svc.listProducts(2)
      const ids2 = for2.map(r => r.id)
      expect(ids2).toContain(g.id)
      expect(ids2).toContain(o2.id)
      expect(ids2).not.toContain(o1.id)
    }))

  it.effect('listProducts excludes soft-deleted', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const t = yield* makeType(1, 'shirt')
      const p = yield* makeProduct({ organizationId: 1, productTypeId: t.id, handle: 'gone', name: 'Gone' })
      const svc = yield* Prod.ProductService
      yield* svc.softDeleteProduct(p.id, p.version)
      const list = yield* svc.listProducts(1)
      expect(list.map(r => r.id)).not.toContain(p.id)
    }))

  // ─── findProducts ────────────────────────────────────────────────────────────

  it.effect('findProducts returns base ∪ org via an explicit where', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tGlobal = yield* makeType(null, 'base')
      const t1 = yield* makeType(1, 'tee')
      const t2 = yield* makeType(2, 'hoodie')
      const g = yield* makeProduct({ organizationId: null, productTypeId: tGlobal.id, handle: 'g', name: 'G' })
      const o1 = yield* makeProduct({ organizationId: 1, productTypeId: t1.id, handle: 'o1', name: 'O1' })
      const o2 = yield* makeProduct({ organizationId: 2, productTypeId: t2.id, handle: 'o2', name: 'O2' })

      const svc = yield* Prod.ProductService
      const rows = yield* svc.findProducts({
        where: { OR: [{ organizationId: { isNull: true } }, { organizationId: 1 }] },
        orderBy: { createdAt: 'desc' },
      })
      const ids = rows.map(r => r.id)
      expect(ids).toContain(g.id)
      expect(ids).toContain(o1.id)
      expect(ids).not.toContain(o2.id)
    }))
})
