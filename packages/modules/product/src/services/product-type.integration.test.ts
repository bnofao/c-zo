import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ProductPostgresLayer, truncateProduct } from '../testing/postgres'
import * as ProductType from './product-type'

const TestLayer = ProductType.ProductTypeServiceLive.pipe(Layer.provideMerge(ProductPostgresLayer))

layer(TestLayer, { timeout: 120_000 })('ProductTypeService', (it) => {
  // ─── createType ──────────────────────────────────────────────────────────

  it.effect('creates a global type (organizationId null)', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      expect(t.organizationId).toBe(null)
      expect(t.slug).toBe('shirt')
    }))

  it.effect('creates an org type (organizationId 1)', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: 1, name: 'Shirt', slug: 'shirt', isShippingRequired: false })
      expect(t.organizationId).toBe(1)
      expect(t.isShippingRequired).toBe(false)
    }))

  it.effect('two scopes may reuse a slug (global + org-1)', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const g = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const o = yield* svc.createType({ organizationId: 1, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      expect(g.organizationId).toBe(null)
      expect(o.organizationId).toBe(1)
    }))

  it.effect('same-scope duplicate LIVE slug → ProductTypeDbFailed', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      yield* svc.createType({ organizationId: 1, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const err = yield* svc.createType({ organizationId: 1, name: 'Shirt2', slug: 'shirt', isShippingRequired: true }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeDbFailed')
    }))

  // ─── updateType ──────────────────────────────────────────────────────────

  it.effect('updates name + bumps version', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: 1, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const updated = yield* svc.updateType({ id: t.id, version: t.version, name: 'Tee' })
      expect(updated.name).toBe('Tee')
      expect(updated.version).toBe(t.version + 1)
    }))

  it.effect('stale version → OptimisticLockError', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: 1, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      yield* svc.updateType({ id: t.id, version: t.version, name: 'Tee' })
      const err = yield* svc.updateType({ id: t.id, version: t.version, name: 'X' }).pipe(Effect.flip)
      expect(err.name).toBe('OptimisticLockError')
    }))

  it.effect('updateType on missing → ProductTypeNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const err = yield* svc.updateType({ id: 999999, version: 1, name: 'X' }).pipe(Effect.flip)
      expect((err as { _tag?: string })._tag).toBe('ProductTypeNotFound')
    }))

  it.effect('updateType on soft-deleted → ProductTypeNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: 1, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      yield* svc.softDeleteType(t.id, t.version)
      const err = yield* svc.updateType({ id: t.id, version: t.version + 1, name: 'X' }).pipe(Effect.flip)
      expect((err as { _tag?: string })._tag).toBe('ProductTypeNotFound')
    }))

  // ─── softDeleteType ──────────────────────────────────────────────────────

  it.effect('soft-deleted excluded from findTypeById', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: 1, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      yield* svc.softDeleteType(t.id, t.version)
      const err = yield* svc.findTypeById(t.id).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeNotFound')
    }))

  it.effect('soft-deleted excluded from listTypes; re-create same slug OK', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: 1, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      yield* svc.softDeleteType(t.id, t.version)
      const live = yield* svc.listTypes(1)
      expect(live.map(r => r.id)).not.toContain(t.id)
      // partial unique excludes soft-deleted → re-create succeeds
      const t2 = yield* svc.createType({ organizationId: 1, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      expect(t2.slug).toBe('shirt')
    }))

  // ─── listTypes ───────────────────────────────────────────────────────────

  it.effect('listTypes merges global ∪ org, excludes other orgs', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const g = yield* svc.createType({ organizationId: null, name: 'G', slug: 'g', isShippingRequired: true })
      const o1 = yield* svc.createType({ organizationId: 1, name: 'O1', slug: 'o1', isShippingRequired: true })
      const o2 = yield* svc.createType({ organizationId: 2, name: 'O2', slug: 'o2', isShippingRequired: true })

      const for1 = yield* svc.listTypes(1)
      const ids1 = for1.map(r => r.id)
      expect(ids1).toContain(g.id)
      expect(ids1).toContain(o1.id)
      expect(ids1).not.toContain(o2.id)

      const for2 = yield* svc.listTypes(2)
      const ids2 = for2.map(r => r.id)
      expect(ids2).toContain(g.id)
      expect(ids2).toContain(o2.id)
      expect(ids2).not.toContain(o1.id)
    }))

  // ─── declareAttribute ────────────────────────────────────────────────────

  it.effect('declares a base attribute (org null)', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const a = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: null, attributeId: 10, assignment: 'PRODUCT', variantSelection: false, position: 0 })
      expect(a.organizationId).toBe(null)
      expect(a.attributeId).toBe(10)
    }))

  it.effect('declares an org extension (org 1)', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const a = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: 1, attributeId: 20, assignment: 'PRODUCT', variantSelection: false, position: 0 })
      expect(a.organizationId).toBe(1)
    }))

  it.effect('variantSelection + VARIANT ok', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const a = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: null, attributeId: 30, assignment: 'VARIANT', variantSelection: true, position: 0 })
      expect(a.variantSelection).toBe(true)
      expect(a.assignment).toBe('VARIANT')
    }))

  it.effect('variantSelection + PRODUCT → InvalidAttributeDeclaration', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const err = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: null, attributeId: 40, assignment: 'PRODUCT', variantSelection: true, position: 0 }).pipe(Effect.flip)
      expect(err._tag).toBe('InvalidAttributeDeclaration')
    }))

  it.effect('duplicate (typeId, org, attributeId) → ProductTypeDbFailed', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      yield* svc.declareAttribute({ productTypeId: t.id, organizationId: 1, attributeId: 50, assignment: 'PRODUCT', variantSelection: false, position: 0 })
      const err = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: 1, attributeId: 50, assignment: 'PRODUCT', variantSelection: false, position: 1 }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeDbFailed')
    }))

  it.effect('two orgs each declare same attributeId as their own extension → both succeed', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const a1 = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: 1, attributeId: 60, assignment: 'PRODUCT', variantSelection: false, position: 0 })
      const a2 = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: 2, attributeId: 60, assignment: 'PRODUCT', variantSelection: false, position: 0 })
      expect(a1.organizationId).toBe(1)
      expect(a2.organizationId).toBe(2)
    }))

  // ─── undeclareAttribute ──────────────────────────────────────────────────

  it.effect('undeclareAttribute removes it', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const a = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: null, attributeId: 70, assignment: 'PRODUCT', variantSelection: false, position: 0 })
      yield* svc.undeclareAttribute(a.id)
      const rows = yield* svc.listTypeAttributes({ productTypeId: t.id, orgId: 1 })
      expect(rows.map(r => r.id)).not.toContain(a.id)
    }))

  // ─── listTypeAttributes ──────────────────────────────────────────────────

  it.effect('listTypeAttributes {orgId:1} → base ∪ org-1; {orgId:2} (non-extending) → base only', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const base = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: null, attributeId: 80, assignment: 'PRODUCT', variantSelection: false, position: 0 })
      const ext1 = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: 1, attributeId: 81, assignment: 'PRODUCT', variantSelection: false, position: 1 })

      const for1 = yield* svc.listTypeAttributes({ productTypeId: t.id, orgId: 1 })
      const ids1 = for1.map(r => r.id)
      expect(ids1).toContain(base.id)
      expect(ids1).toContain(ext1.id)

      const for2 = yield* svc.listTypeAttributes({ productTypeId: t.id, orgId: 2 })
      const ids2 = for2.map(r => r.id)
      expect(ids2).toContain(base.id)
      expect(ids2).not.toContain(ext1.id)
    }))

  it.effect('listTypeAttributes on empty type → []', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const rows = yield* svc.listTypeAttributes({ productTypeId: t.id, orgId: 1 })
      expect(rows).toEqual([])
    }))

  // ─── promoteToGlobal ─────────────────────────────────────────────────────

  it.effect('flips an org type to global (organizationId null)', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: 1, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const promoted = yield* svc.promoteToGlobal(t.id)
      expect(promoted.organizationId).toBe(null)
      expect(promoted.version).toBe(t.version + 1)
    }))

  it.effect('promoteToGlobal on already-global → ProductTypeAlreadyGlobal', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const err = yield* svc.promoteToGlobal(t.id).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeAlreadyGlobal')
    }))

  it.effect('promoteToGlobal missing → ProductTypeNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const err = yield* svc.promoteToGlobal(999999).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeNotFound')
    }))

  it.effect('promoteToGlobal with global slug clash → ProductTypeSlugTaken', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      yield* svc.createType({ organizationId: null, name: 'Global X', slug: 'x', isShippingRequired: true })
      const orgType = yield* svc.createType({ organizationId: 1, name: 'Org X', slug: 'x', isShippingRequired: true })
      const err = yield* svc.promoteToGlobal(orgType.id).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeSlugTaken')
    }))

  it.effect('promoteToGlobal flips the type\'s own org-scoped declarations to base', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* ProductType.ProductTypeService
      const t = yield* svc.createType({ organizationId: 1, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const decl = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: 1, attributeId: 90, assignment: 'PRODUCT', variantSelection: false, position: 0 })
      yield* svc.promoteToGlobal(t.id)
      const rows = yield* svc.listTypeAttributes({ productTypeId: t.id, orgId: 1 })
      const flipped = rows.find(r => r.id === decl.id)
      expect(flipped?.organizationId).toBe(null)
    }))
})
