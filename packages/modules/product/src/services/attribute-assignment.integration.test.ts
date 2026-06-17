import { Attribute, AttributeValue, TypedValue } from '@czo/attribute/services'
import { expect, layer } from '@effect/vitest'
import { Effect } from 'effect'
import { ProductAttributeLayer, truncateProductAttribute } from '../testing/cross-module-postgres'
import { AdoptionService } from './adoption'
import { AttributeAssignmentService } from './attribute-assignment'
import { ProductService } from './product'
import { ProductTypeService } from './product-type'
import { VariantService } from './variant'

layer(ProductAttributeLayer, { timeout: 180_000 })('AttributeAssignmentService', (it) => {
  // ─── seed helpers ──────────────────────────────────────────────────────────

  const seedDropdown = (organizationId: number | null, name: string) =>
    Effect.gen(function* () {
      const attrSvc = yield* Attribute.AttributeService
      const valSvc = yield* AttributeValue.AttributeValueService
      const attr = yield* attrSvc.create({ name, type: 'DROPDOWN', organizationId })
      const v1 = yield* valSvc.createValue({ attributeId: attr.id, value: `${name}-a`, organizationId })
      const v2 = yield* valSvc.createValue({ attributeId: attr.id, value: `${name}-b`, organizationId })
      return { attr, v1, v2 }
    })

  const seedMultiselect = (organizationId: number | null, name: string) =>
    Effect.gen(function* () {
      const attrSvc = yield* Attribute.AttributeService
      const valSvc = yield* AttributeValue.AttributeValueService
      const attr = yield* attrSvc.create({ name, type: 'MULTISELECT', organizationId })
      const v1 = yield* valSvc.createValue({ attributeId: attr.id, value: `${name}-x`, organizationId })
      const v2 = yield* valSvc.createValue({ attributeId: attr.id, value: `${name}-y`, organizationId })
      return { attr, v1, v2 }
    })

  const seedNumeric = (organizationId: number | null, name: string) =>
    Effect.gen(function* () {
      const attrSvc = yield* Attribute.AttributeService
      return yield* attrSvc.create({ name, type: 'NUMERIC', organizationId })
    })

  const seedBoolean = (organizationId: number | null, name: string) =>
    Effect.gen(function* () {
      const attrSvc = yield* Attribute.AttributeService
      return yield* attrSvc.create({ name, type: 'BOOLEAN', organizationId })
    })

  const makeType = (orgId: number | null, slug: string) =>
    Effect.gen(function* () {
      const svc = yield* ProductTypeService
      return yield* svc.createType({ organizationId: orgId, name: slug, slug, isShippingRequired: true })
    })

  const declare = (input: {
    productTypeId: number
    organizationId: number | null
    attributeId: number
    assignment: 'PRODUCT' | 'VARIANT'
  }) =>
    Effect.gen(function* () {
      const svc = yield* ProductTypeService
      return yield* svc.declareAttribute({ ...input, variantSelection: false, position: 0 })
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

  // ─── Adoption guard ────────────────────────────────────────────────────────

  it.effect('org graft on GLOBAL product without adoption → ProductNotAdopted; after adopt → succeeds', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr, v1 } = yield* seedDropdown(null, 'color')
      const t = yield* makeType(null, 'base-type')
      yield* declare({ productTypeId: t.id, organizationId: null, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(null, t.id, 'global-prod')
      const assign = yield* AttributeAssignmentService

      const err = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductNotAdopted')

      const adoption = yield* AdoptionService
      yield* adoption.adoptProduct({ productId: p.id, orgId: 1 })
      const rows = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      })
      expect(rows).toHaveLength(1)
      expect(rows[0]!.organizationId).toBe(1)
    }))

  it.effect('graft on an ORG-OWNED product needs no adoption', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr, v1 } = yield* seedDropdown(1, 'org-color')
      const t = yield* makeType(1, 'org-type')
      yield* declare({ productTypeId: t.id, organizationId: 1, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(1, t.id, 'org-prod')
      const assign = yield* AttributeAssignmentService
      const rows = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      })
      expect(rows[0]!.organizationId).toBe(1)
    }))

  it.effect('base write (org null) on GLOBAL product needs no adoption', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr, v1 } = yield* seedDropdown(null, 'gcolor')
      const t = yield* makeType(null, 'gtype')
      yield* declare({ productTypeId: t.id, organizationId: null, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(null, t.id, 'gprod')
      const assign = yield* AttributeAssignmentService
      const rows = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: null,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      })
      expect(rows[0]!.organizationId).toBe(null)
    }))

  // ─── Type-gating ───────────────────────────────────────────────────────────

  it.effect('attribute not declared on type → AttributeNotAssignedToType', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr, v1 } = yield* seedDropdown(1, 'undeclared')
      const t = yield* makeType(1, 'gate-type')
      const p = yield* makeProduct(1, t.id, 'gate-prod')
      const assign = yield* AttributeAssignmentService
      const err = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      }).pipe(Effect.flip)
      expect(err._tag).toBe('AttributeNotAssignedToType')
    }))

  it.effect('attribute declared only as org-1 extension → org-1 allowed, org-2 rejected', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr, v1 } = yield* seedDropdown(null, 'ext-color')
      const t = yield* makeType(null, 'ext-type')
      // org-1-only extension declaration
      yield* declare({ productTypeId: t.id, organizationId: 1, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(null, t.id, 'ext-prod')
      const assign = yield* AttributeAssignmentService
      const adoption = yield* AdoptionService
      yield* adoption.adoptProduct({ productId: p.id, orgId: 1 })
      yield* adoption.adoptProduct({ productId: p.id, orgId: 2 })

      const ok = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      })
      expect(ok).toHaveLength(1)

      const err = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 2,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      }).pipe(Effect.flip)
      expect(err._tag).toBe('AttributeNotAssignedToType')
    }))

  it.effect('PRODUCT-level attr via assignVariantValue → rejected', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr, v1 } = yield* seedDropdown(1, 'plevel')
      const t = yield* makeType(1, 'plevel-type')
      yield* declare({ productTypeId: t.id, organizationId: 1, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(1, t.id, 'plevel-prod')
      const v = yield* makeVariant(p.id)
      const assign = yield* AttributeAssignmentService
      const err = yield* assign.assignVariantValue({
        variantId: v.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      }).pipe(Effect.flip)
      expect(err._tag).toBe('AttributeNotAssignedToType')
    }))

  it.effect('VARIANT-level attr via assignProductValue → rejected', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr, v1 } = yield* seedDropdown(1, 'vlevel')
      const t = yield* makeType(1, 'vlevel-type')
      yield* declare({ productTypeId: t.id, organizationId: 1, attributeId: attr.id, assignment: 'VARIANT' })
      const p = yield* makeProduct(1, t.id, 'vlevel-prod')
      const assign = yield* AttributeAssignmentService
      const err = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      }).pipe(Effect.flip)
      expect(err._tag).toBe('AttributeNotAssignedToType')
    }))

  // ─── Select ────────────────────────────────────────────────────────────────

  it.effect('DROPDOWN → pivot references the catalog value id', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr, v1 } = yield* seedDropdown(1, 'dd')
      const t = yield* makeType(1, 'dd-type')
      yield* declare({ productTypeId: t.id, organizationId: 1, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(1, t.id, 'dd-prod')
      const assign = yield* AttributeAssignmentService
      const rows = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      })
      expect(rows).toHaveLength(1)
      expect(rows[0]!.valueId).toBe(v1.id)
    }))

  it.effect('MULTISELECT with 2 ids → 2 rows; unassign select → pivot gone, catalog row stays', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr, v1, v2 } = yield* seedMultiselect(1, 'ms')
      const t = yield* makeType(1, 'ms-type')
      yield* declare({ productTypeId: t.id, organizationId: 1, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(1, t.id, 'ms-prod')
      const assign = yield* AttributeAssignmentService
      const rows = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [v1.id, v2.id] },
      })
      expect(rows).toHaveLength(2)

      // unassign one — pivot gone, catalog row still present
      yield* assign.unassignProductValue(rows[0]!.id)
      const remaining = yield* assign.listProductValues({ productId: p.id, orgId: 1 })
      expect(remaining).toHaveLength(1)
      const valSvc = yield* AttributeValue.AttributeValueService
      // catalog read still succeeds (reorder is a no-op but proves the row exists)
      yield* valSvc.reorderValues(attr.id, [v1.id, v2.id])
    }))

  // ─── Scalar ──────────────────────────────────────────────────────────────

  it.effect('NUMERIC assign 42 → mints numeric row + pivot NUMERIC; unassign → both gone', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const attr = yield* seedNumeric(1, 'weight')
      const t = yield* makeType(1, 'num-type')
      yield* declare({ productTypeId: t.id, organizationId: 1, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(1, t.id, 'num-prod')
      const assign = yield* AttributeAssignmentService
      const rows = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { numeric: 42 },
      })
      expect(rows).toHaveLength(1)
      const mintedId = rows[0]!.valueId

      // unassign → pivot gone + numeric typed row deleted
      yield* assign.unassignProductValue(rows[0]!.id)
      const remaining = yield* assign.listProductValues({ productId: p.id, orgId: 1 })
      expect(remaining).toHaveLength(0)

      // The orphan numeric row is deleted — deleting it again fails NotFound.
      const tvSvc = yield* TypedValue.TypedValueService
      const delErr = yield* tvSvc.deleteNumeric(mintedId).pipe(Effect.flip)
      expect(delErr._tag).toBe('TypedValueNotFound')
    }))

  it.effect('BOOLEAN assign → pivot BOOLEAN + minted boolean row; unassign cleans both', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const attr = yield* seedBoolean(1, 'flag')
      const t = yield* makeType(1, 'bool-type')
      yield* declare({ productTypeId: t.id, organizationId: 1, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(1, t.id, 'bool-prod')
      const assign = yield* AttributeAssignmentService
      const rows = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { boolean: true },
      })
      yield* assign.unassignProductValue(rows[0]!.id)
      const remaining = yield* assign.listProductValues({ productId: p.id, orgId: 1 })
      expect(remaining).toHaveLength(0)
    }))

  // ─── kind mismatch (value shape vs attribute type) ──────────────────────────

  it.effect('scalar value for a select attr → ValueKindMismatch', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr } = yield* seedDropdown(1, 'mm-select')
      const t = yield* makeType(1, 'mm1-type')
      yield* declare({ productTypeId: t.id, organizationId: 1, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(1, t.id, 'mm1-prod')
      const assign = yield* AttributeAssignmentService
      const err = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { numeric: 1 },
      }).pipe(Effect.flip)
      expect(err._tag).toBe('ValueKindMismatch')
    }))

  it.effect('select value for a scalar attr → ValueKindMismatch', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const attr = yield* seedNumeric(1, 'mm-num')
      const t = yield* makeType(1, 'mm2-type')
      yield* declare({ productTypeId: t.id, organizationId: 1, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(1, t.id, 'mm2-prod')
      const assign = yield* AttributeAssignmentService
      const err = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [999] },
      }).pipe(Effect.flip)
      expect(err._tag).toBe('ValueKindMismatch')
    }))

  it.effect('select id not in catalog → ValueKindMismatch', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr } = yield* seedDropdown(1, 'cat')
      const t = yield* makeType(1, 'cat-type')
      yield* declare({ productTypeId: t.id, organizationId: 1, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(1, t.id, 'cat-prod')
      const assign = yield* AttributeAssignmentService
      const err = yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [424242] },
      }).pipe(Effect.flip)
      expect(err._tag).toBe('ValueKindMismatch')
    }))

  // ─── Overlay reads ─────────────────────────────────────────────────────────

  it.effect('base + org-1 graft coexist; orgId 1 sees both, orgId 2 sees base only', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr, v1 } = yield* seedDropdown(null, 'ov-color')
      const t = yield* makeType(null, 'ov-type')
      yield* declare({ productTypeId: t.id, organizationId: null, attributeId: attr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(null, t.id, 'ov-prod')
      const assign = yield* AttributeAssignmentService
      const adoption = yield* AdoptionService

      // base write (org null)
      yield* assign.assignProductValue({
        productId: p.id,
        organizationId: null,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      })
      // org-1 graft
      yield* adoption.adoptProduct({ productId: p.id, orgId: 1 })
      yield* assign.assignProductValue({
        productId: p.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      })

      const forOrg1 = yield* assign.listProductValues({ productId: p.id, orgId: 1 })
      expect(forOrg1).toHaveLength(2)
      const forOrg2 = yield* assign.listProductValues({ productId: p.id, orgId: 2 })
      expect(forOrg2).toHaveLength(1)
      expect(forOrg2[0]!.organizationId).toBe(null)
    }))

  // ─── Variant equivalents ───────────────────────────────────────────────────

  it.effect('variant assign select + overlay read', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr, v1 } = yield* seedDropdown(null, 'vsel')
      const t = yield* makeType(null, 'vsel-type')
      yield* declare({ productTypeId: t.id, organizationId: null, attributeId: attr.id, assignment: 'VARIANT' })
      const p = yield* makeProduct(null, t.id, 'vsel-prod')
      const variant = yield* makeVariant(p.id)
      const assign = yield* AttributeAssignmentService
      const adoption = yield* AdoptionService

      // base write
      yield* assign.assignVariantValue({
        variantId: variant.id,
        organizationId: null,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      })
      // org-1 graft
      yield* adoption.adoptProduct({ productId: p.id, orgId: 1 })
      yield* assign.assignVariantValue({
        variantId: variant.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { valueIds: [v1.id] },
      })

      const forOrg1 = yield* assign.listVariantValues({ variantId: variant.id, orgId: 1 })
      expect(forOrg1).toHaveLength(2)
      const forOrg2 = yield* assign.listVariantValues({ variantId: variant.id, orgId: 2 })
      expect(forOrg2).toHaveLength(1)
    }))

  it.effect('variant scalar assign + unassign cleans typed row', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const attr = yield* seedNumeric(1, 'vnum')
      const t = yield* makeType(1, 'vnum-type')
      yield* declare({ productTypeId: t.id, organizationId: 1, attributeId: attr.id, assignment: 'VARIANT' })
      const p = yield* makeProduct(1, t.id, 'vnum-prod')
      const variant = yield* makeVariant(p.id)
      const assign = yield* AttributeAssignmentService
      const rows = yield* assign.assignVariantValue({
        variantId: variant.id,
        organizationId: 1,
        attributeId: attr.id,
        value: { numeric: 7 },
      })
      yield* assign.unassignVariantValue(rows[0]!.id)
      const remaining = yield* assign.listVariantValues({ variantId: variant.id, orgId: 1 })
      expect(remaining).toHaveLength(0)
    }))

  // ─── unassign not-found ──────────────────────────────────────────────────

  it.effect('unassign non-existent pivot → AssignmentNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const assign = yield* AttributeAssignmentService
      const err = yield* assign.unassignProductValue(987654).pipe(Effect.flip)
      expect(err._tag).toBe('AssignmentNotFound')
    }))

  // ─── DuplicateVariantMatrix (single-writer: assignVariantValue) ────────────

  it.effect('duplicate persisted selection → DuplicateVariantMatrix; distinct combo → allowed', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      // A variant_selection DROPDOWN attribute + 2 catalog values.
      const { attr, v1: valA, v2: valB } = yield* seedDropdown(1, 'size')
      const t = yield* makeType(1, 'matrix-type')
      const typeSvc = yield* ProductTypeService
      yield* typeSvc.declareAttribute({
        productTypeId: t.id,
        organizationId: 1,
        attributeId: attr.id,
        assignment: 'VARIANT',
        variantSelection: true,
        position: 0,
      })
      const p = yield* makeProduct(1, t.id, 'matrix-prod')
      const variantSvc = yield* VariantService
      const assign = yield* AttributeAssignmentService

      // v1 with valA — createVariant passes the matrix check (no siblings yet),
      // then assignVariantValue PERSISTS the selection (single writer).
      const v1 = yield* variantSvc.createVariant({ productId: p.id, selection: [{ attributeId: attr.id, valueId: valA.id }] })
      yield* assign.assignVariantValue({ variantId: v1.id, organizationId: 1, attributeId: attr.id, value: { valueIds: [valA.id] } })

      // v2 with the same valA → siblings now contain v1's persisted valA.
      const err = yield* variantSvc.createVariant({ productId: p.id, selection: [{ attributeId: attr.id, valueId: valA.id }] }).pipe(Effect.flip)
      expect(err._tag).toBe('DuplicateVariantMatrix')

      // v3 with a distinct combo → succeeds.
      const v3 = yield* variantSvc.createVariant({ productId: p.id, selection: [{ attributeId: attr.id, valueId: valB.id }] })
      expect(v3.productId).toBe(p.id)
    }))

  // ─── unadopt cleanup (Step 4b) ─────────────────────────────────────────────

  it.effect('unadopt deletes org grafts (scalar + select) and orphan scalar rows; base intact', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const { attr: ddAttr, v1 } = yield* seedDropdown(null, 'ua-color')
      const numAttr = yield* seedNumeric(null, 'ua-weight')
      const t = yield* makeType(null, 'ua-type')
      yield* declare({ productTypeId: t.id, organizationId: null, attributeId: ddAttr.id, assignment: 'PRODUCT' })
      yield* declare({ productTypeId: t.id, organizationId: null, attributeId: numAttr.id, assignment: 'PRODUCT' })
      const p = yield* makeProduct(null, t.id, 'ua-prod')
      const assign = yield* AttributeAssignmentService
      const adoption = yield* AdoptionService

      // base writes (org null) — must survive unadopt
      yield* assign.assignProductValue({ productId: p.id, organizationId: null, attributeId: ddAttr.id, value: { valueIds: [v1.id] } })

      // org-1 grafts: a select + a scalar
      yield* adoption.adoptProduct({ productId: p.id, orgId: 1 })
      yield* assign.assignProductValue({ productId: p.id, organizationId: 1, attributeId: ddAttr.id, value: { valueIds: [v1.id] } })
      const scalarRows = yield* assign.assignProductValue({ productId: p.id, organizationId: 1, attributeId: numAttr.id, value: { numeric: 99 } })
      const orphanNumericId = scalarRows[0]!.valueId

      // before unadopt: org-1 sees base + 2 grafts = 3
      const before = yield* assign.listProductValues({ productId: p.id, orgId: 1 })
      expect(before).toHaveLength(3)

      yield* adoption.unadoptProduct({ productId: p.id, orgId: 1 })

      // after unadopt: org-1 grafts gone, base survives → 1
      const after = yield* assign.listProductValues({ productId: p.id, orgId: 1 })
      expect(after).toHaveLength(1)
      expect(after[0]!.organizationId).toBe(null)

      // the orphan scalar typed row was deleted
      const tvSvc = yield* TypedValue.TypedValueService
      const delErr = yield* tvSvc.deleteNumeric(orphanNumericId).pipe(Effect.flip)
      expect(delErr._tag).toBe('TypedValueNotFound')
    }))
})
