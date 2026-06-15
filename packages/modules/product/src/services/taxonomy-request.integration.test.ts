import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ProductPostgresLayer, truncateProduct } from '../testing/postgres'
import * as Cat from './category'
import * as Prod from './product'
import * as ProductType from './product-type'
import * as Tax from './taxonomy-request'

const TestLayer = Tax.TaxonomyRequestServiceLive.pipe(
  Layer.provideMerge(Cat.CategoryServiceLive),
  Layer.provideMerge(Prod.ProductServiceLive),
  Layer.provideMerge(ProductType.ProductTypeServiceLive),
  Layer.provideMerge(ProductPostgresLayer),
)

layer(TestLayer, { timeout: 120_000 })('TaxonomyRequestService', (it) => {
  // ─── creation → approve ──────────────────────────────────────────────────────

  it.effect('submitCategoryCreation → approve creates a global category', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const cats = yield* Cat.CategoryService

      const req = yield* tax.submitCategoryCreation({ organizationId: 1, name: 'Apparel', slug: 'apparel-create' })
      expect(req.state).toBe('pending')

      const approved = yield* tax.approve(req.id)
      expect(approved.state).toBe('approved')
      expect(approved.resultId).not.toBeNull()

      const created = yield* cats.findCategoryById(approved.resultId!)
      expect(created.organizationId).toBeNull()
      expect(created.name).toBe('Apparel')
    }))

  // ─── promotion → approve ─────────────────────────────────────────────────────

  it.effect('submitCategoryPromotion → approve flips category to global', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const cats = yield* Cat.CategoryService

      const orgCat = yield* cats.createCategory({ organizationId: 1, name: 'Bags', slug: 'bags-promote' })
      const req = yield* tax.submitCategoryPromotion({ organizationId: 1, categoryId: orgCat.id })
      expect(req.state).toBe('pending')

      const approved = yield* tax.approve(req.id)
      expect(approved.state).toBe('approved')
      expect(approved.resultId).toBe(orgCat.id)

      const promoted = yield* cats.findCategoryById(orgCat.id)
      expect(promoted.organizationId).toBeNull()
    }))

  // ─── approve failure leaves request pending ──────────────────────────────────

  it.effect('approve of a create whose slug clashes a global → CategorySlugTaken, request stays pending', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const cats = yield* Cat.CategoryService

      yield* cats.createCategory({ organizationId: null, name: 'Hats', slug: 'hats-clash' })
      const req = yield* tax.submitCategoryCreation({ organizationId: 1, name: 'Hats', slug: 'hats-clash' })

      const err = yield* tax.approve(req.id).pipe(Effect.flip)
      expect(err._tag).toBe('CategorySlugTaken')

      const reloaded = yield* tax.listForOrg(1)
      const found = reloaded.find(r => r.id === req.id)
      expect(found?.state).toBe('pending')
    }))

  // ─── submitCategoryPromotion guards ──────────────────────────────────────────

  it.effect('submitCategoryPromotion on a global category → CategoryAlreadyGlobal', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const cats = yield* Cat.CategoryService

      const globalCat = yield* cats.createCategory({ organizationId: null, name: 'Shoes', slug: 'shoes-glob' })
      const err = yield* tax.submitCategoryPromotion({ organizationId: 1, categoryId: globalCat.id }).pipe(Effect.flip)
      expect(err._tag).toBe('CategoryAlreadyGlobal')
    }))

  it.effect('submitCategoryPromotion for another org\'s category → CategoryNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const cats = yield* Cat.CategoryService

      const org2Cat = yield* cats.createCategory({ organizationId: 2, name: 'Org2', slug: 'org2-cat' })
      const err = yield* tax.submitCategoryPromotion({ organizationId: 1, categoryId: org2Cat.id }).pipe(Effect.flip)
      expect(err._tag).toBe('CategoryNotFound')
    }))

  // ─── approve / reject of missing or non-pending ──────────────────────────────

  it.effect('approve a missing id → TaxonomyRequestNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const err = yield* tax.approve(999999).pipe(Effect.flip)
      expect(err._tag).toBe('TaxonomyRequestNotFound')
    }))

  it.effect('reject a missing id → TaxonomyRequestNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const err = yield* tax.reject(999999, 'nope').pipe(Effect.flip)
      expect(err._tag).toBe('TaxonomyRequestNotFound')
    }))

  it.effect('approve an already-approved request → TaxonomyRequestNotPending', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService

      const req = yield* tax.submitCategoryCreation({ organizationId: 1, name: 'Once', slug: 'once-x' })
      yield* tax.approve(req.id)
      const err = yield* tax.approve(req.id).pipe(Effect.flip)
      expect(err._tag).toBe('TaxonomyRequestNotPending')
    }))

  // ─── reject ──────────────────────────────────────────────────────────────────

  it.effect('reject(id, reason) sets state rejected and reviewReason', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService

      const req = yield* tax.submitCategoryCreation({ organizationId: 1, name: 'Reject', slug: 'reject-x' })
      const rejected = yield* tax.reject(req.id, 'not suitable')
      expect(rejected.state).toBe('rejected')
      expect(rejected.reviewReason).toBe('not suitable')
    }))

  // ─── listing ─────────────────────────────────────────────────────────────────

  it.effect('listForAdmin(\'pending\') filters by state; listForOrg scopes by org', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService

      const a = yield* tax.submitCategoryCreation({ organizationId: 1, name: 'A', slug: 'a-x' })
      const b = yield* tax.submitCategoryCreation({ organizationId: 1, name: 'B', slug: 'b-x' })
      const c = yield* tax.submitCategoryCreation({ organizationId: 2, name: 'C', slug: 'c-x' })
      yield* tax.reject(b.id, 'no')

      const pending = yield* tax.listForAdmin('pending')
      const pendingIds = pending.map(r => r.id)
      expect(pendingIds).toContain(a.id)
      expect(pendingIds).toContain(c.id)
      expect(pendingIds).not.toContain(b.id)

      const org1 = yield* tax.listForOrg(1)
      const org1Ids = org1.map(r => r.id)
      expect(org1Ids).toContain(a.id)
      expect(org1Ids).toContain(b.id)
      expect(org1Ids).not.toContain(c.id)
    }))
})
