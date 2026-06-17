import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { ProductNotAdopted } from './adoption'
import type { ProductNotFound } from './product'
import type { ProductTypeNotFound } from './product-type'
import type { AttributeType, ValueKind } from './value-kind'
import type { VariantNotFound } from './variant'
import {
  attributeReferenceValues as attributeReferenceValuesTable,
  attributeSwatchValues as attributeSwatchValuesTable,
  attributeValues as attributeValuesTable,
} from '@czo/attribute/schema'
import { Attribute, TypedValue } from '@czo/attribute/services'
import { DrizzleDb } from '@czo/kit/db'
import { eq } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import {
  productAttributeValues as productAttributeValuesTable,
  variantAttributeValues as variantAttributeValuesTable,
} from '../database/schema'
import { AdoptionService } from './adoption'
import { ProductService } from './product'
import { ProductTypeService } from './product-type'
import { isSelectType, valueKindForType } from './value-kind'
import { VariantService } from './variant'

// ─── Re-export propagated errors for callers that import from this file ───────

export { ProductNotAdopted } from './adoption'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class AttributeNotAssignedToType extends Data.TaggedError('AttributeNotAssignedToType')<Record<never, never>> {
  readonly code = 'ATTRIBUTE_NOT_ASSIGNED_TO_TYPE'
  get message() { return 'The attribute is not declared on this product type at the required level for this org' }
}

export class ValueKindMismatch extends Data.TaggedError('ValueKindMismatch')<Record<never, never>> {
  readonly code = 'VALUE_KIND_MISMATCH'
  get message() { return 'The provided value shape does not match the attribute kind, or a referenced catalog value does not exist' }
}

export class AssignmentNotFound extends Data.TaggedError('AssignmentNotFound')<Record<never, never>> {
  readonly code = 'ASSIGNMENT_NOT_FOUND'
  get message() { return 'Attribute assignment not found' }
}

export class ProductAssignmentDbFailed extends Data.TaggedError('ProductAssignmentDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'PRODUCT_ASSIGNMENT_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type ProductAttributeValue = InferSelectModel<typeof productAttributeValuesTable>
export type VariantAttributeValue = InferSelectModel<typeof variantAttributeValuesTable>

// ─── Input types ──────────────────────────────────────────────────────────────

/** Select-type value: one id for single-select, many for MULTISELECT. */
export interface SelectValue {
  readonly valueIds: ReadonlyArray<number>
}

/** Scalar value: exactly one of the typed shapes, discriminated by presence. */
export type ScalarValue
  = | { readonly text: { readonly plain: string, readonly rich?: unknown | null } }
    | { readonly numeric: number }
    | { readonly boolean: boolean }
    | { readonly date: Date }
    | { readonly file: { readonly fileUrl: string, readonly mimetype: string } }

export type AssignmentValue = SelectValue | ScalarValue

export interface AssignProductValueInput {
  readonly productId: number
  readonly organizationId: number | null
  readonly attributeId: number
  readonly value: AssignmentValue
}

export interface AssignVariantValueInput {
  readonly variantId: number
  readonly organizationId: number | null
  readonly attributeId: number
  readonly value: AssignmentValue
}

// ─── Service contract ─────────────────────────────────────────────────────────

type AssignProductError
  = ProductNotFound
    | ProductNotAdopted
    | ProductTypeNotFound
    | AttributeNotAssignedToType
    | ValueKindMismatch
    | ProductAssignmentDbFailed

type AssignVariantError = AssignProductError | VariantNotFound

export class AttributeAssignmentService extends Context.Service<AttributeAssignmentService, {
  readonly assignProductValue: (input: AssignProductValueInput) => Effect.Effect<ReadonlyArray<ProductAttributeValue>, AssignProductError>
  readonly assignVariantValue: (input: AssignVariantValueInput) => Effect.Effect<ReadonlyArray<VariantAttributeValue>, AssignVariantError>
  readonly unassignProductValue: (pivotId: number) => Effect.Effect<void, AssignmentNotFound | ProductAssignmentDbFailed>
  readonly unassignVariantValue: (pivotId: number) => Effect.Effect<void, AssignmentNotFound | ProductAssignmentDbFailed>
  readonly listProductValues: (input: { productId: number, orgId: number }) => Effect.Effect<ReadonlyArray<ProductAttributeValue>, ProductAssignmentDbFailed>
  readonly listVariantValues: (input: { variantId: number, orgId: number }) => Effect.Effect<ReadonlyArray<VariantAttributeValue>, ProductAssignmentDbFailed>
}>()('@czo/product/AttributeAssignmentService') {}

type AttributeAssignmentServiceImpl = Context.Service.Shape<typeof AttributeAssignmentService>

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Select kinds carry a catalog id; scalar kinds carry a typed-value id. */
function isSelectKind(kind: ValueKind): boolean {
  return kind === 'VALUE' || kind === 'SWATCH' || kind === 'REFERENCE'
}

/** Narrow an `AssignmentValue` to its select form. */
function asSelect(value: AssignmentValue): SelectValue | null {
  return 'valueIds' in value ? value : null
}

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const productService = yield* ProductService
  const variantService = yield* VariantService
  const typeService = yield* ProductTypeService
  const adoptionService = yield* AdoptionService
  const attributeService = yield* Attribute.AttributeService
  const typedValueService = yield* TypedValue.TypedValueService

  /** Map any DB-layer or attribute-module foreign error to ProductAssignmentDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new ProductAssignmentDbFailed({ cause })))

  /** Load the attribute's `type` once, folding attribute-module errors. */
  const resolveAttributeType = (attributeId: number): Effect.Effect<AttributeType, ProductAssignmentDbFailed> =>
    dbErr(attributeService.findById(attributeId)).pipe(Effect.map(attr => attr.type as AttributeType))

  /**
   * Type-gating: the attribute must be declared on the type for this org at the
   * given assignment level. A base write (`organizationId === null`) sees only
   * base declarations (`organizationId IS NULL`); an org write sees both base
   * and its own org extensions.
   */
  const ensureDeclared = (
    productTypeId: number,
    organizationId: number | null,
    attributeId: number,
    assignment: 'PRODUCT' | 'VARIANT',
  ) =>
    Effect.gen(function* () {
      const declarations = yield* dbErr(
        typeService.listTypeAttributes({ productTypeId, orgId: organizationId ?? 0 }),
      )
      const visible = organizationId === null
        ? declarations.filter(d => d.organizationId === null)
        : declarations
      const match = visible.find(d => d.attributeId === attributeId && d.assignment === assignment)
      if (!match)
        return yield* Effect.fail(new AttributeNotAssignedToType())
    })

  /** Validate that a select-catalog row exists for (kind, attributeId, valueId). */
  const ensureCatalogValue = (kind: ValueKind, attributeId: number, valueId: number) =>
    Effect.gen(function* () {
      const table = kind === 'SWATCH'
        ? attributeSwatchValuesTable
        : kind === 'REFERENCE'
          ? attributeReferenceValuesTable
          : attributeValuesTable
      const [row] = yield* dbErr(db
        .select({ id: table.id, attributeId: table.attributeId })
        .from(table)
        .where(eq(table.id, valueId))
        .limit(1))
      if (!row || row.attributeId !== attributeId)
        return yield* Effect.fail(new ValueKindMismatch())
    })

  /**
   * Create the scalar typed-value row matching `kind`, returning its id. A value
   * shape that does not match the kind surfaces as ValueKindMismatch.
   */
  const mintScalar = (kind: ValueKind, attributeId: number, organizationId: number | null, value: AssignmentValue) =>
    Effect.gen(function* () {
      if (kind === 'TEXT') {
        if (!('text' in value))
          return yield* Effect.fail(new ValueKindMismatch())
        const row = yield* dbErr(typedValueService.createText({ attributeId, organizationId, plain: value.text.plain, rich: value.text.rich ?? null }))
        return row.id
      }
      if (kind === 'NUMERIC') {
        if (!('numeric' in value))
          return yield* Effect.fail(new ValueKindMismatch())
        const row = yield* dbErr(typedValueService.createNumeric({ attributeId, organizationId, value: value.numeric }))
        return row.id
      }
      if (kind === 'BOOLEAN') {
        if (!('boolean' in value))
          return yield* Effect.fail(new ValueKindMismatch())
        const row = yield* dbErr(typedValueService.createBoolean({ attributeId, organizationId, value: value.boolean }))
        return row.id
      }
      if (kind === 'DATE') {
        if (!('date' in value))
          return yield* Effect.fail(new ValueKindMismatch())
        const row = yield* dbErr(typedValueService.createDate({ attributeId, organizationId, value: value.date }))
        return row.id
      }
      // FILE
      if (!('file' in value))
        return yield* Effect.fail(new ValueKindMismatch())
      const row = yield* dbErr(typedValueService.createFile({ attributeId, organizationId, fileUrl: value.file.fileUrl, mimetype: value.file.mimetype }))
      return row.id
    })

  /** Delete the scalar typed-value row of `kind` by id (orphan cleanup). */
  const deleteScalar = (kind: ValueKind, valueId: number) =>
    Effect.gen(function* () {
      switch (kind) {
        case 'TEXT':
          yield* dbErr(typedValueService.deleteText(valueId))
          break
        case 'NUMERIC':
          yield* dbErr(typedValueService.deleteNumeric(valueId))
          break
        case 'BOOLEAN':
          yield* dbErr(typedValueService.deleteBoolean(valueId))
          break
        case 'DATE':
          yield* dbErr(typedValueService.deleteDate(valueId))
          break
        case 'FILE':
          yield* dbErr(typedValueService.deleteFile(valueId))
          break
        default:
          break
      }
    })

  // ── assignProductValue ──────────────────────────────────────────────────────

  const assignProductValue: AttributeAssignmentServiceImpl['assignProductValue'] = input =>
    Effect.gen(function* () {
      // 0. Adoption guard: org graft on a GLOBAL product requires adoption.
      const product = yield* productService.findProductById(input.productId).pipe(
        Effect.mapError(e => e._tag === 'ProductNotFound' ? e : new ProductAssignmentDbFailed({ cause: e })),
      )
      if (product.organizationId === null && input.organizationId !== null)
        yield* adoptionService.requireAdopted({ productId: input.productId, orgId: input.organizationId })

      // 1-2. Resolve attribute type + kind.
      const type = yield* resolveAttributeType(input.attributeId)
      const kind = valueKindForType(type)

      // 3. Type-gating at PRODUCT level.
      yield* ensureDeclared(product.productTypeId, input.organizationId, input.attributeId, 'PRODUCT')

      // 4-6. Validate shape + persist pivot rows.
      if (isSelectType(type)) {
        const select = asSelect(input.value)
        if (!select)
          return yield* Effect.fail(new ValueKindMismatch())
        const rows: ProductAttributeValue[] = []
        for (const valueId of select.valueIds) {
          yield* ensureCatalogValue(kind, input.attributeId, valueId)
          const [row] = yield* dbErr(db.insert(productAttributeValuesTable).values({
            productId: input.productId,
            organizationId: input.organizationId,
            attributeId: input.attributeId,
            valueId,
          }).returning())
          rows.push(row! as ProductAttributeValue)
        }
        return rows
      }
      const newValueId = yield* mintScalar(kind, input.attributeId, input.organizationId, input.value)
      const [row] = yield* dbErr(db.insert(productAttributeValuesTable).values({
        productId: input.productId,
        organizationId: input.organizationId,
        attributeId: input.attributeId,
        valueId: newValueId,
      }).returning())
      return [row! as ProductAttributeValue]
    })

  // ── assignVariantValue ──────────────────────────────────────────────────────

  const assignVariantValue: AttributeAssignmentServiceImpl['assignVariantValue'] = input =>
    Effect.gen(function* () {
      // Load variant → product (for adoption + type resolution).
      const variant = yield* variantService.findVariantById(input.variantId).pipe(
        Effect.mapError(e => e._tag === 'VariantNotFound' ? e : new ProductAssignmentDbFailed({ cause: e })),
      )
      const product = yield* productService.findProductById(variant.productId).pipe(
        Effect.mapError(e => e._tag === 'ProductNotFound' ? e : new ProductAssignmentDbFailed({ cause: e })),
      )

      // 0. Adoption guard.
      if (product.organizationId === null && input.organizationId !== null)
        yield* adoptionService.requireAdopted({ productId: product.id, orgId: input.organizationId })

      // 1-2. kind.
      const type = yield* resolveAttributeType(input.attributeId)
      const kind = valueKindForType(type)

      // 3. Type-gating at VARIANT level.
      yield* ensureDeclared(product.productTypeId, input.organizationId, input.attributeId, 'VARIANT')

      // 4-6. Persist.
      if (isSelectType(type)) {
        const select = asSelect(input.value)
        if (!select)
          return yield* Effect.fail(new ValueKindMismatch())
        const rows: VariantAttributeValue[] = []
        for (const valueId of select.valueIds) {
          yield* ensureCatalogValue(kind, input.attributeId, valueId)
          const [row] = yield* dbErr(db.insert(variantAttributeValuesTable).values({
            variantId: input.variantId,
            organizationId: input.organizationId,
            attributeId: input.attributeId,
            valueId,
          }).returning())
          rows.push(row! as VariantAttributeValue)
        }
        return rows
      }
      const newValueId = yield* mintScalar(kind, input.attributeId, input.organizationId, input.value)
      const [row] = yield* dbErr(db.insert(variantAttributeValuesTable).values({
        variantId: input.variantId,
        organizationId: input.organizationId,
        attributeId: input.attributeId,
        valueId: newValueId,
      }).returning())
      return [row! as VariantAttributeValue]
    })

  // ── unassign ────────────────────────────────────────────────────────────────

  const unassignProductValue: AttributeAssignmentServiceImpl['unassignProductValue'] = pivotId =>
    Effect.gen(function* () {
      const pivot = yield* dbErr(db.query.productAttributeValues.findFirst({ where: { id: pivotId } }))
      if (!pivot)
        return yield* Effect.fail(new AssignmentNotFound())
      // The kind isn't stored on the pivot — derive it from the attribute's type.
      const kind = valueKindForType(yield* resolveAttributeType(pivot.attributeId))
      yield* dbErr(db.delete(productAttributeValuesTable).where(eq(productAttributeValuesTable.id, pivotId)))
      if (!isSelectKind(kind))
        yield* deleteScalar(kind, pivot.valueId)
    })

  const unassignVariantValue: AttributeAssignmentServiceImpl['unassignVariantValue'] = pivotId =>
    Effect.gen(function* () {
      const pivot = yield* dbErr(db.query.variantAttributeValues.findFirst({ where: { id: pivotId } }))
      if (!pivot)
        return yield* Effect.fail(new AssignmentNotFound())
      // The kind isn't stored on the pivot — derive it from the attribute's type.
      const kind = valueKindForType(yield* resolveAttributeType(pivot.attributeId))
      yield* dbErr(db.delete(variantAttributeValuesTable).where(eq(variantAttributeValuesTable.id, pivotId)))
      if (!isSelectKind(kind))
        yield* deleteScalar(kind, pivot.valueId)
    })

  // ── overlay reads ─────────────────────────────────────────────────────────

  const listProductValues: AttributeAssignmentServiceImpl['listProductValues'] = ({ productId, orgId }) =>
    dbErr(db.query.productAttributeValues.findMany({
      where: { productId, OR: [{ organizationId: { isNull: true } }, { organizationId: orgId }] },
      orderBy: (fields, { asc }) => asc(fields.position),
    })) as Effect.Effect<ReadonlyArray<ProductAttributeValue>, ProductAssignmentDbFailed>

  const listVariantValues: AttributeAssignmentServiceImpl['listVariantValues'] = ({ variantId, orgId }) =>
    dbErr(db.query.variantAttributeValues.findMany({
      where: { variantId, OR: [{ organizationId: { isNull: true } }, { organizationId: orgId }] },
      orderBy: (fields, { asc }) => asc(fields.position),
    })) as Effect.Effect<ReadonlyArray<VariantAttributeValue>, ProductAssignmentDbFailed>

  return {
    assignProductValue,
    assignVariantValue,
    unassignProductValue,
    unassignVariantValue,
    listProductValues,
    listVariantValues,
  } satisfies AttributeAssignmentServiceImpl
})

export const AttributeAssignmentServiceLive = Layer.effect(AttributeAssignmentService, make)
