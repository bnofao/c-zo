import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ProductPostgresLayer, truncateProduct } from '../testing/postgres'
import * as Col from './collection'
import { layer as ProductEventsLayer } from './events/product'
import * as Prod from './product'
import * as ProductType from './product-type'

const TestLayer = Col.CollectionServiceLive.pipe(
  Layer.provideMerge(Prod.ProductServiceLive),
  Layer.provideMerge(ProductType.ProductTypeServiceLive),
  Layer.provideMerge(ProductEventsLayer),
  Layer.provideMerge(ProductPostgresLayer),
)

layer(TestLayer, { timeout: 120_000 })('CollectionService', (it) => {
  // ─── helpers ────────────────────────────────────────────────────────────────

  const makeGlobalType = (slug = 'shirt') =>
    Effect.gen(function* () {
      const svc = yield* ProductType.ProductTypeService
      return yield* svc.createType({ organizationId: null, name: slug, slug, isShippingRequired: true })
    })

  const makeGlobalProduct = (handle = 'global-p') =>
    Effect.gen(function* () {
      const t = yield* makeGlobalType(handle)
      const svc = yield* Prod.ProductService
      return yield* svc.createProduct({ organizationId: null, productTypeId: t.id, handle, name: handle })
    })

  // ─── createCollection ────────────────────────────────────────────────────────

  it.effect('create org collection', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      const col = yield* svc.createCollection({ organizationId: 1, name: 'Summer', slug: 'summer' })
      expect(col.organizationId).toBe(1)
      expect(col.slug).toBe('summer')
    }))

  it.effect('duplicate slug same org → CollectionSlugTaken', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      yield* svc.createCollection({ organizationId: 1, name: 'Summer', slug: 'summer' })
      const err = yield* svc.createCollection({ organizationId: 1, name: 'Summer2', slug: 'summer' }).pipe(Effect.flip)
      expect(err._tag).toBe('CollectionSlugTaken')
    }))

  it.effect('same slug different orgs → OK', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      yield* svc.createCollection({ organizationId: 1, name: 'Summer', slug: 'summer' })
      const col2 = yield* svc.createCollection({ organizationId: 2, name: 'Summer', slug: 'summer' })
      expect(col2.organizationId).toBe(2)
    }))

  // ─── listCollections ──────────────────────────────────────────────────────────

  it.effect('org2 cannot see org1 collections', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      const col1 = yield* svc.createCollection({ organizationId: 1, name: 'Summer', slug: 'summer' })
      const col2 = yield* svc.createCollection({ organizationId: 2, name: 'Winter', slug: 'winter' })

      const list1 = yield* svc.listCollections(1)
      expect(list1.map(c => c.id)).toContain(col1.id)
      expect(list1.map(c => c.id)).not.toContain(col2.id)

      const list2 = yield* svc.listCollections(2)
      expect(list2.map(c => c.id)).toContain(col2.id)
      expect(list2.map(c => c.id)).not.toContain(col1.id)
    }))

  // ─── findCollections (connection-backing read) ───────────────────────────────

  it.effect('findCollections: org-scope returns only that org\'s live collections', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      const col1 = yield* svc.createCollection({ organizationId: 1, name: 'Summer', slug: 'summer' })
      const col2 = yield* svc.createCollection({ organizationId: 2, name: 'Winter', slug: 'winter' })

      const list1 = yield* svc.findCollections({ where: { organizationId: 1 } })
      expect(list1.map(c => c.id)).toContain(col1.id)
      expect(list1.map(c => c.id)).not.toContain(col2.id)
    }))

  it.effect('findCollections: excludes soft-deleted', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      const col = yield* svc.createCollection({ organizationId: 1, name: 'Summer', slug: 'summer' })
      yield* svc.softDeleteCollection(col.id, col.version)
      const list = yield* svc.findCollections({ where: { organizationId: 1 } })
      expect(list.map(c => c.id)).not.toContain(col.id)
    }))

  // ─── addProduct / removeProduct / listCollectionProducts ─────────────────────

  it.effect('addProduct → listed in collection', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      const prod = yield* makeGlobalProduct()
      const col = yield* svc.createCollection({ organizationId: 1, name: 'Summer', slug: 'summer' })
      yield* svc.addProduct({ collectionId: col.id, productId: prod.id })
      const products = yield* svc.listCollectionProducts(col.id)
      expect(products.map(p => p.id)).toContain(prod.id)
    }))

  it.effect('addProduct duplicate → idempotent no-op', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      const prod = yield* makeGlobalProduct()
      const col = yield* svc.createCollection({ organizationId: 1, name: 'Summer', slug: 'summer' })
      yield* svc.addProduct({ collectionId: col.id, productId: prod.id })
      yield* svc.addProduct({ collectionId: col.id, productId: prod.id })
      const products = yield* svc.listCollectionProducts(col.id)
      expect(products.filter(p => p.id === prod.id).length).toBe(1)
    }))

  it.effect('removeProduct', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      const prod = yield* makeGlobalProduct()
      const col = yield* svc.createCollection({ organizationId: 1, name: 'Summer', slug: 'summer' })
      yield* svc.addProduct({ collectionId: col.id, productId: prod.id })
      yield* svc.removeProduct({ collectionId: col.id, productId: prod.id })
      const products = yield* svc.listCollectionProducts(col.id)
      expect(products.map(p => p.id)).not.toContain(prod.id)
    }))

  it.effect('listCollectionProducts excludes soft-deleted products', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      const prodSvc = yield* Prod.ProductService
      const prod = yield* makeGlobalProduct()
      const col = yield* svc.createCollection({ organizationId: 1, name: 'Summer', slug: 'summer' })
      yield* svc.addProduct({ collectionId: col.id, productId: prod.id })
      yield* prodSvc.softDeleteProduct(prod.id, prod.version)
      const products = yield* svc.listCollectionProducts(col.id)
      expect(products.map(p => p.id)).not.toContain(prod.id)
    }))

  // ─── listProductCollections ───────────────────────────────────────────────────

  it.effect('listProductCollections → only for the given orgId', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      const prod = yield* makeGlobalProduct()
      const col1 = yield* svc.createCollection({ organizationId: 1, name: 'Col1', slug: 'col1' })
      const col2 = yield* svc.createCollection({ organizationId: 2, name: 'Col2', slug: 'col2' })
      yield* svc.addProduct({ collectionId: col1.id, productId: prod.id })
      yield* svc.addProduct({ collectionId: col2.id, productId: prod.id })

      const colsOrg1 = yield* svc.listProductCollections({ productId: prod.id, orgId: 1 })
      expect(colsOrg1.map(c => c.id)).toContain(col1.id)
      expect(colsOrg1.map(c => c.id)).not.toContain(col2.id)

      const colsOrg2 = yield* svc.listProductCollections({ productId: prod.id, orgId: 2 })
      expect(colsOrg2.map(c => c.id)).toContain(col2.id)
      expect(colsOrg2.map(c => c.id)).not.toContain(col1.id)
    }))

  // ─── softDeleteCollection ─────────────────────────────────────────────────────

  it.effect('softDelete: excluded from list; slug can be reused', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      const col = yield* svc.createCollection({ organizationId: 1, name: 'Summer', slug: 'summer' })
      yield* svc.softDeleteCollection(col.id, col.version)

      const list = yield* svc.listCollections(1)
      expect(list.map(c => c.id)).not.toContain(col.id)

      // slug can be reused after soft-delete
      const col2 = yield* svc.createCollection({ organizationId: 1, name: 'Summer2', slug: 'summer' })
      expect(col2.slug).toBe('summer')
    }))

  // ─── optimistic locking ───────────────────────────────────────────────────────

  it.effect('update stale version → OptimisticLockError', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      const col = yield* svc.createCollection({ organizationId: 1, name: 'Summer', slug: 'summer' })
      const err = yield* svc.updateCollection({ id: col.id, version: 999, name: 'New' }).pipe(Effect.flip)
      expect(err.name).toBe('OptimisticLockError')
    }))

  it.effect('not-found → CollectionNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Col.CollectionService
      const err = yield* svc.findCollectionById(999999).pipe(Effect.flip)
      expect(err._tag).toBe('CollectionNotFound')
    }))
})
