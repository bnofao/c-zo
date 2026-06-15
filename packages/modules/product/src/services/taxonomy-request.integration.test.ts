import { Attribute } from '@czo/attribute/services'
import { expect, layer } from '@effect/vitest'
import { Effect } from 'effect'
import { ProductAttributeLayer, truncateProductAttribute as truncateProduct } from '../testing/cross-module-postgres'
import * as Cat from './category'
import * as ProductType from './product-type'
import * as Tax from './taxonomy-request'

layer(ProductAttributeLayer, { timeout: 180_000 })('TaxonomyRequestService', (it) => {
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

  it.effect('findRequests applies enum-equals where + org scope (connection path)', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService

      const a = yield* tax.submitCategoryCreation({ organizationId: 1, name: 'A', slug: 'a-fr' })
      const b = yield* tax.submitCategoryCreation({ organizationId: 1, name: 'B', slug: 'b-fr' })
      const c = yield* tax.submitCategoryCreation({ organizationId: 2, name: 'C', slug: 'c-fr' })
      yield* tax.reject(b.id, 'no')

      // Admin queue: enum-equals `state` filter (mirrors the connection's where).
      const pending = yield* tax.findRequests({ where: { AND: [{ state: 'pending' }] }, orderBy: { createdAt: 'desc' } })
      const pendingIds = pending.map(r => r.id)
      expect(pendingIds).toContain(a.id)
      expect(pendingIds).toContain(c.id)
      expect(pendingIds).not.toContain(b.id)

      // Org connection: org scope AND-ed with an entityType enum-equals filter.
      const org1 = yield* tax.findRequests({ where: { AND: [{ organizationId: 1 }, { entityType: 'category' }] }, orderBy: { createdAt: 'desc' } })
      const org1Ids = org1.map(r => r.id)
      expect(org1Ids).toContain(a.id)
      expect(org1Ids).toContain(b.id)
      expect(org1Ids).not.toContain(c.id)
    }))

  // ─── product-type creation → approve ─────────────────────────────────────────

  it.effect('submitProductTypeCreation → approve creates a global product type', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const types = yield* ProductType.ProductTypeService

      const req = yield* tax.submitProductTypeCreation({ organizationId: 1, name: 'Footwear', slug: 'footwear-create' })
      expect(req.state).toBe('pending')

      const approved = yield* tax.approve(req.id)
      expect(approved.state).toBe('approved')
      expect(approved.resultId).not.toBeNull()

      const created = yield* types.findTypeById(approved.resultId!)
      expect(created.organizationId).toBeNull()
      expect(created.name).toBe('Footwear')
    }))

  // ─── product-type promotion co-promotes org attributes ───────────────────────

  it.effect('submitProductTypePromotion → approve co-promotes the type and its org attributes', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const types = yield* ProductType.ProductTypeService
      const attrs = yield* Attribute.AttributeService

      const type = yield* types.createType({ organizationId: 1, name: 'Tees', slug: 'tees-promote', isShippingRequired: true })
      const attr = yield* attrs.create({ name: 'Sleeve', type: 'DROPDOWN', organizationId: 1 })
      const decl = yield* types.declareAttribute({
        productTypeId: type.id,
        organizationId: 1,
        attributeId: attr.id,
        assignment: 'PRODUCT',
        variantSelection: false,
        position: 0,
      })

      const req = yield* tax.submitProductTypePromotion({ organizationId: 1, productTypeId: type.id })
      expect(req.state).toBe('pending')

      const approved = yield* tax.approve(req.id)
      expect(approved.state).toBe('approved')
      expect(approved.resultId).toBe(type.id)

      const promotedType = yield* types.findTypeById(type.id)
      expect(promotedType.organizationId).toBeNull()

      const promotedAttr = yield* attrs.findById(attr.id)
      expect(promotedAttr.organizationId).toBeNull()

      const decls = yield* types.listTypeAttributes({ productTypeId: type.id, orgId: 1 })
      const promotedDecl = decls.find(d => d.id === decl.id)
      expect(promotedDecl?.organizationId).toBeNull()
    }))

  it.effect('product-type promotion with already-global attributes flips only the type', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const types = yield* ProductType.ProductTypeService
      const attrs = yield* Attribute.AttributeService

      const type = yield* types.createType({ organizationId: 1, name: 'Pants', slug: 'pants-promote', isShippingRequired: true })
      const globalAttr = yield* attrs.create({ name: 'Fit', type: 'DROPDOWN', organizationId: null })
      yield* types.declareAttribute({
        productTypeId: type.id,
        organizationId: 1,
        attributeId: globalAttr.id,
        assignment: 'PRODUCT',
        variantSelection: false,
        position: 0,
      })

      const req = yield* tax.submitProductTypePromotion({ organizationId: 1, productTypeId: type.id })
      const approved = yield* tax.approve(req.id)
      expect(approved.state).toBe('approved')

      const promotedType = yield* types.findTypeById(type.id)
      expect(promotedType.organizationId).toBeNull()

      const stillGlobal = yield* attrs.findById(globalAttr.id)
      expect(stillGlobal.organizationId).toBeNull()
    }))

  // ─── submitProductTypePromotion guards ───────────────────────────────────────

  it.effect('submitProductTypePromotion on a global type → ProductTypeAlreadyGlobal', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const types = yield* ProductType.ProductTypeService

      const globalType = yield* types.createType({ organizationId: null, name: 'Hats', slug: 'hats-glob', isShippingRequired: true })
      const err = yield* tax.submitProductTypePromotion({ organizationId: 1, productTypeId: globalType.id }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeAlreadyGlobal')
    }))

  it.effect('submitProductTypePromotion for another org\'s type → ProductTypeNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const types = yield* ProductType.ProductTypeService

      const org2Type = yield* types.createType({ organizationId: 2, name: 'Org2 Type', slug: 'org2-type', isShippingRequired: true })
      const err = yield* tax.submitProductTypePromotion({ organizationId: 1, productTypeId: org2Type.id }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeNotFound')
    }))

  // ─── approve failure leaves request pending ──────────────────────────────────

  it.effect('approve of a product-type promotion whose slug clashes a global → ProductTypeSlugTaken, request stays pending', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const tax = yield* Tax.TaxonomyRequestService
      const types = yield* ProductType.ProductTypeService

      yield* types.createType({ organizationId: null, name: 'Boots', slug: 'boots-clash', isShippingRequired: true })
      const orgType = yield* types.createType({ organizationId: 1, name: 'Boots', slug: 'boots-clash', isShippingRequired: true })
      const req = yield* tax.submitProductTypePromotion({ organizationId: 1, productTypeId: orgType.id })

      const err = yield* tax.approve(req.id).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeSlugTaken')

      const reloaded = yield* tax.findById(req.id)
      expect(reloaded?.state).toBe('pending')
    }))
})
