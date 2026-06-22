import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ProductPostgresLayer, truncateProduct } from '../testing/postgres'
import * as Cat from './category'
import { layer as ProductEventsLayer } from './events/product'
import * as Prod from './product'
import * as ProductType from './product-type'

const TestLayer = Cat.CategoryServiceLive.pipe(
  Layer.provideMerge(Prod.ProductServiceLive),
  Layer.provideMerge(ProductType.ProductTypeServiceLive),
  Layer.provideMerge(ProductEventsLayer),
  Layer.provideMerge(ProductPostgresLayer),
)

layer(TestLayer, { timeout: 120_000 })('CategoryService', (it) => {
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

  // ─── createCategory ──────────────────────────────────────────────────────────

  it.effect('create global category', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const cat = yield* svc.createCategory({ organizationId: null, name: 'Apparel', slug: 'apparel' })
      expect(cat.organizationId).toBeNull()
      expect(cat.slug).toBe('apparel')
    }))

  it.effect('create org category', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const cat = yield* svc.createCategory({ organizationId: 1, name: 'Org Apparel', slug: 'apparel' })
      expect(cat.organizationId).toBe(1)
    }))

  it.effect('same slug cross-scope (global and org1) → OK', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      yield* svc.createCategory({ organizationId: null, name: 'Apparel', slug: 'apparel' })
      // org can reuse same slug as global
      const cat = yield* svc.createCategory({ organizationId: 1, name: 'Apparel', slug: 'apparel' })
      expect(cat.organizationId).toBe(1)
    }))

  it.effect('duplicate slug same scope → CategorySlugTaken', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      yield* svc.createCategory({ organizationId: 1, name: 'Apparel', slug: 'apparel' })
      const err = yield* svc.createCategory({ organizationId: 1, name: 'Apparel2', slug: 'apparel' }).pipe(Effect.flip)
      expect(err._tag).toBe('CategorySlugTaken')
    }))

  it.effect('global duplicate slug → CategorySlugTaken', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      yield* svc.createCategory({ organizationId: null, name: 'Apparel', slug: 'apparel' })
      const err = yield* svc.createCategory({ organizationId: null, name: 'Apparel2', slug: 'apparel' }).pipe(Effect.flip)
      expect(err._tag).toBe('CategorySlugTaken')
    }))

  // ─── setParent / cycle detection ─────────────────────────────────────────────

  it.effect('cycle self → CategoryCycle', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const cat = yield* svc.createCategory({ organizationId: null, name: 'A', slug: 'a' })
      const err = yield* svc.setParent({ id: cat.id, version: cat.version, parentId: cat.id }).pipe(Effect.flip)
      expect((err as { _tag?: string })._tag).toBe('CategoryCycle')
    }))

  it.effect('cycle transitive A→B→C, setParent(A, C) → CategoryCycle', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const a = yield* svc.createCategory({ organizationId: null, name: 'A', slug: 'a' })
      const b = yield* svc.createCategory({ organizationId: null, name: 'B', slug: 'b' })
      const c = yield* svc.createCategory({ organizationId: null, name: 'C', slug: 'c' })
      // Build chain: B→A, C→B (so chain is C→B→A)
      const a2 = yield* svc.setParent({ id: b.id, version: b.version, parentId: a.id })
      yield* svc.setParent({ id: c.id, version: c.version, parentId: a2.id ? b.id : b.id })
      // Now setParent(A, C) would create A→C→B→A
      const err = yield* svc.setParent({ id: a.id, version: a.version, parentId: c.id }).pipe(Effect.flip)
      expect((err as { _tag?: string })._tag).toBe('CategoryCycle')
    }))

  it.effect('valid re-parent OK', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const a = yield* svc.createCategory({ organizationId: null, name: 'A', slug: 'a' })
      const b = yield* svc.createCategory({ organizationId: null, name: 'B', slug: 'b' })
      const c = yield* svc.createCategory({ organizationId: null, name: 'C', slug: 'c' })
      // C→B, then move B under A — no cycle
      yield* svc.setParent({ id: c.id, version: c.version, parentId: b.id })
      const updated = yield* svc.setParent({ id: b.id, version: b.version, parentId: a.id })
      expect(updated.parentId).toBe(a.id)
    }))

  // ─── listCategories merge ─────────────────────────────────────────────────

  it.effect('listCategories: global ∪ org1 for org1, org2 excludes org1', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const global = yield* svc.createCategory({ organizationId: null, name: 'Global', slug: 'global' })
      const org1 = yield* svc.createCategory({ organizationId: 1, name: 'Org1', slug: 'org1' })
      const org2 = yield* svc.createCategory({ organizationId: 2, name: 'Org2', slug: 'org2' })

      const listOrg1 = yield* svc.listCategories(1)
      const ids1 = listOrg1.map(c => c.id)
      expect(ids1).toContain(global.id)
      expect(ids1).toContain(org1.id)
      expect(ids1).not.toContain(org2.id)

      const listOrg2 = yield* svc.listCategories(2)
      const ids2 = listOrg2.map(c => c.id)
      expect(ids2).toContain(global.id)
      expect(ids2).toContain(org2.id)
      expect(ids2).not.toContain(org1.id)
    }))

  // ─── findCategories ──────────────────────────────────────────────────────────

  it.effect('findCategories returns base ∪ org via an explicit where', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const global = yield* svc.createCategory({ organizationId: null, name: 'Global', slug: 'global' })
      const org1 = yield* svc.createCategory({ organizationId: 1, name: 'Org1', slug: 'org1' })
      const org2 = yield* svc.createCategory({ organizationId: 2, name: 'Org2', slug: 'org2' })

      const rows = yield* svc.findCategories({
        where: { OR: [{ organizationId: { isNull: true } }, { organizationId: 1 }] },
        orderBy: { createdAt: 'desc' },
      })
      const ids = rows.map(c => c.id)
      expect(ids).toContain(global.id)
      expect(ids).toContain(org1.id)
      expect(ids).not.toContain(org2.id)
    }))

  // ─── placeProduct / listProductCategories / removePlacement ──────────────────

  it.effect('placeProduct base + org graft; listProductCategories merge', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const prod = yield* makeGlobalProduct()
      const globalCat = yield* svc.createCategory({ organizationId: null, name: 'Global', slug: 'global' })
      const org1Cat = yield* svc.createCategory({ organizationId: 1, name: 'Org1', slug: 'org1' })
      const org2Cat = yield* svc.createCategory({ organizationId: 2, name: 'Org2', slug: 'org2' })

      // Base placement (no org)
      yield* svc.placeProduct({ productId: prod.id, categoryId: globalCat.id, organizationId: null })
      // Org1 graft
      yield* svc.placeProduct({ productId: prod.id, categoryId: org1Cat.id, organizationId: 1 })
      // Org2 graft
      yield* svc.placeProduct({ productId: prod.id, categoryId: org2Cat.id, organizationId: 2 })

      // org1 sees base ∪ org1 graft
      const cats1 = yield* svc.listProductCategories({ productId: prod.id, orgId: 1 })
      const catIds1 = cats1.map(c => c.id)
      expect(catIds1).toContain(globalCat.id)
      expect(catIds1).toContain(org1Cat.id)
      expect(catIds1).not.toContain(org2Cat.id)

      // org2 sees base only (org2 cat added but not in org2 view with this query scope)
      const cats2 = yield* svc.listProductCategories({ productId: prod.id, orgId: 2 })
      const catIds2 = cats2.map(c => c.id)
      expect(catIds2).toContain(globalCat.id)
      expect(catIds2).toContain(org2Cat.id)
      expect(catIds2).not.toContain(org1Cat.id)
    }))

  it.effect('placeProduct idempotent — same placement twice, no error, one row', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const prod = yield* makeGlobalProduct()
      const cat = yield* svc.createCategory({ organizationId: null, name: 'G', slug: 'g' })
      yield* svc.placeProduct({ productId: prod.id, categoryId: cat.id, organizationId: null })
      yield* svc.placeProduct({ productId: prod.id, categoryId: cat.id, organizationId: null })
      const cats = yield* svc.listProductCategories({ productId: prod.id, orgId: 1 })
      const matching = cats.filter(c => c.id === cat.id)
      expect(matching.length).toBe(1)
    }))

  it.effect('removePlacement', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const prod = yield* makeGlobalProduct()
      const cat = yield* svc.createCategory({ organizationId: null, name: 'G', slug: 'g' })
      yield* svc.placeProduct({ productId: prod.id, categoryId: cat.id, organizationId: null })
      yield* svc.removePlacement({ productId: prod.id, categoryId: cat.id, organizationId: null })
      const cats = yield* svc.listProductCategories({ productId: prod.id, orgId: 1 })
      expect(cats.map(c => c.id)).not.toContain(cat.id)
    }))

  it.effect('place in soft-deleted category → CategoryNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const prod = yield* makeGlobalProduct()
      const cat = yield* svc.createCategory({ organizationId: null, name: 'G', slug: 'g' })
      yield* svc.softDeleteCategory(cat.id, cat.version)
      const err = yield* svc.placeProduct({ productId: prod.id, categoryId: cat.id, organizationId: null }).pipe(Effect.flip)
      expect(err._tag).toBe('CategoryNotFound')
    }))

  // ─── softDeleteCategory ──────────────────────────────────────────────────────

  it.effect('softDelete: excluded from list; slug can be reused', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const cat = yield* svc.createCategory({ organizationId: 1, name: 'Old', slug: 'myslug' })
      yield* svc.softDeleteCategory(cat.id, cat.version)

      const list = yield* svc.listCategories(1)
      expect(list.map(c => c.id)).not.toContain(cat.id)

      // slug can be reused after soft-delete
      const cat2 = yield* svc.createCategory({ organizationId: 1, name: 'New', slug: 'myslug' })
      expect(cat2.slug).toBe('myslug')
    }))

  // ─── updateCategory stale version ────────────────────────────────────────────

  it.effect('update stale version → OptimisticLockError', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const cat = yield* svc.createCategory({ organizationId: 1, name: 'Cat', slug: 'cat' })
      const err = yield* svc.updateCategory({ id: cat.id, version: 999, name: 'New' }).pipe(Effect.flip)
      expect(err.name).toBe('OptimisticLockError')
    }))

  it.effect('not-found → CategoryNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const err = yield* svc.findCategoryById(999999).pipe(Effect.flip)
      expect(err._tag).toBe('CategoryNotFound')
    }))

  // ─── promoteToGlobal ─────────────────────────────────────────────────────────

  it.effect('promoteToGlobal flips an org category to global', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const cat = yield* svc.createCategory({ organizationId: 1, name: 'Bags', slug: 'bags-promote' })
      const promoted = yield* svc.promoteToGlobal(cat.id)
      expect(promoted.organizationId).toBeNull()
    }))

  it.effect('promoteToGlobal on an already-global category → CategoryAlreadyGlobal', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const cat = yield* svc.createCategory({ organizationId: null, name: 'Shoes', slug: 'shoes-glob' })
      const err = yield* svc.promoteToGlobal(cat.id).pipe(Effect.flip)
      expect(err._tag).toBe('CategoryAlreadyGlobal')
    }))

  it.effect('promoteToGlobal when a global slug already exists → CategorySlugTaken', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      yield* svc.createCategory({ organizationId: null, name: 'Hats', slug: 'hats-x' })
      const orgCat = yield* svc.createCategory({ organizationId: 1, name: 'Hats', slug: 'hats-x' })
      const err = yield* svc.promoteToGlobal(orgCat.id).pipe(Effect.flip)
      expect(err._tag).toBe('CategorySlugTaken')
    }))

  it.effect('promoteToGlobal with an org parent → CategoryParentNotGlobal', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Cat.CategoryService
      const parent = yield* svc.createCategory({ organizationId: 1, name: 'Apparel', slug: 'apparel-p' })
      const child = yield* svc.createCategory({ organizationId: 1, name: 'Tops', slug: 'tops-c', parentId: parent.id })
      const err = yield* svc.promoteToGlobal(child.id).pipe(Effect.flip)
      expect(err._tag).toBe('CategoryParentNotGlobal')
    }))
})
