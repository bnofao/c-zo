// Attribute module — the polymorphic `AssignedAttribute` GraphQL interface.
//
// An `AssignedAttribute` is an attribute paired with its resolved value(s) for
// some owning object (e.g. a product). It is a thin presentation interface: the
// backing `AttributeAssignment` carries the owning `attribute` row plus exactly
// one populated value slot, fixed by `valueKind`. Consumers (e.g. `@czo/product`)
// build the `AttributeAssignment[]` and reference this type by STRING name
// (`'AssignedAttribute'`); they import only the backing `AttributeAssignment`
// type, never the ref.
//
// Centralized `resolveType` keyed on `valueKind` picks the concrete impl — no
// per-impl `isTypeOf`. Each impl carries its OWN `subGraphs` (NOT inherited from
// the interface); interface fields (`attribute`) ARE inherited, so impls only
// declare their value field(s). The choice impls reuse the existing value nodes
// by string-ref (`['AttributeValue']` etc.).

import type { AttributeGraphQLSchemaBuilder } from '..'
import type {
  attributeReferenceValues,
  attributes,
  attributeSwatchValues,
  attributeValues,
} from '../../database/schema'

// The backing type is a union: one member per kind, each carrying ONLY its own
// value slot, non-optional. Each impl backs onto its specific member, so its
// resolver reads the value directly — no `?? []` / `!`. The concrete GraphQL
// type is picked at runtime by each impl's `isTypeOf`, keyed on the attribute's
// OWN `type` — so the model carries no separate discriminator.
export interface AttributeAssignment { attribute: typeof attributes.$inferSelect }
export interface DropdownAssignment extends AttributeAssignment { selectValues: ReadonlyArray<typeof attributeValues.$inferSelect> }
export interface SwatchAssignment extends AttributeAssignment { swatchValues: ReadonlyArray<typeof attributeSwatchValues.$inferSelect> }
export interface ReferenceAssignment extends AttributeAssignment { referenceValues: ReadonlyArray<typeof attributeReferenceValues.$inferSelect> }
export interface NumericAssignment extends AttributeAssignment { numeric: number }
export interface BooleanAssignment extends AttributeAssignment { boolean: boolean }
export interface DateAssignment extends AttributeAssignment { date: Date }
export interface TextAssignment extends AttributeAssignment { text: { plain: string, rich: unknown | null } }
export interface FileAssignment extends AttributeAssignment { file: { fileUrl: string, mimetype: string } }

// The union of concrete subtypes — what a PRODUCER (e.g. `@czo/product`'s
// `groupAssigned`) returns; each is assignable to the `AttributeAssignment`
// interface backing. (Needed explicitly because `flatMap` can't infer a
// heterogeneous union from its branches.)
export type AnyAssignment
  = DropdownAssignment | SwatchAssignment | ReferenceAssignment | NumericAssignment
    | BooleanAssignment | DateAssignment | TextAssignment | FileAssignment

/** `isTypeOf` factory: this impl matches when the attribute's `type` is one of `types`. */
type AttributeType = (typeof attributes.$inferSelect)['type']
const isType = (...types: AttributeType[]) => (g: unknown) => types.includes((g as AttributeAssignment).attribute.type)

let ref: ReturnType<AttributeGraphQLSchemaBuilder['interfaceRef']> | undefined

export function registerAssignedAttributes(builder: AttributeGraphQLSchemaBuilder): void {
  const Ref = builder.interfaceRef<AttributeAssignment>('AssignedAttribute')
  ref = Ref
  Ref.implement({
    subGraphs: ['public', 'org', 'admin'],
    description: 'An attribute assigned to an object, with its typed value(s) resolved inline.',
    fields: t => ({
      attribute: t.field({ type: 'Attribute', resolve: g => g.attribute, description: 'The attribute.' }),
    }),
  })

  // 8 concrete impls — `attribute` is INHERITED (not redeclared); each declares
  // only its own value field(s). Choice impls reuse the existing value nodes.
  builder.objectRef<DropdownAssignment>('AssignedDropdownAttribute').implement({
    interfaces: [Ref],
    subGraphs: ['public', 'org', 'admin'],
    isTypeOf: isType('DROPDOWN', 'MULTISELECT'),
    fields: t => ({
      values: t.field({ type: ['AttributeValue'], resolve: g => g.selectValues, description: 'Selected dropdown/multiselect values.' }),
    }),
  })

  builder.objectRef<SwatchAssignment>('AssignedSwatchAttribute').implement({
    interfaces: [Ref],
    subGraphs: ['public', 'org', 'admin'],
    isTypeOf: isType('SWATCH'),
    fields: t => ({
      values: t.field({ type: ['AttributeSwatchValue'], resolve: g => g.swatchValues, description: 'Selected swatch values.' }),
    }),
  })

  builder.objectRef<ReferenceAssignment>('AssignedReferenceAttribute').implement({
    interfaces: [Ref],
    subGraphs: ['public', 'org', 'admin'],
    isTypeOf: isType('REFERENCE'),
    fields: t => ({
      values: t.field({ type: ['AttributeReferenceValue'], resolve: g => g.referenceValues, description: 'Selected reference values.' }),
    }),
  })

  builder.objectRef<NumericAssignment>('AssignedNumericAttribute').implement({
    interfaces: [Ref],
    subGraphs: ['public', 'org', 'admin'],
    isTypeOf: isType('NUMERIC'),
    fields: t => ({
      value: t.float({ resolve: g => g.numeric, description: 'The numeric value.' }),
    }),
  })

  builder.objectRef<BooleanAssignment>('AssignedBooleanAttribute').implement({
    interfaces: [Ref],
    subGraphs: ['public', 'org', 'admin'],
    isTypeOf: isType('BOOLEAN'),
    fields: t => ({
      value: t.boolean({ resolve: g => g.boolean, description: 'The boolean value.' }),
    }),
  })

  builder.objectRef<DateAssignment>('AssignedDateAttribute').implement({
    interfaces: [Ref],
    subGraphs: ['public', 'org', 'admin'],
    isTypeOf: isType('DATE', 'DATE_TIME'),
    fields: t => ({
      value: t.field({ type: 'DateTime', resolve: g => g.date, description: 'The date/datetime value.' }),
    }),
  })

  builder.objectRef<TextAssignment>('AssignedTextAttribute').implement({
    interfaces: [Ref],
    subGraphs: ['public', 'org', 'admin'],
    isTypeOf: isType('PLAIN_TEXT', 'RICH_TEXT'),
    fields: t => ({
      plain: t.string({ resolve: g => g.text.plain, description: 'Plain-text value.' }),
      rich: t.field({ type: 'JSONObject', nullable: true, resolve: g => g.text.rich as Record<string, unknown> | null, description: 'Optional rich-text payload.' }),
    }),
  })

  builder.objectRef<FileAssignment>('AssignedFileAttribute').implement({
    interfaces: [Ref],
    subGraphs: ['public', 'org', 'admin'],
    isTypeOf: isType('FILE'),
    fields: t => ({
      url: t.string({ resolve: g => g.file.fileUrl, description: 'File URL.' }),
      mimetype: t.string({ resolve: g => g.file.mimetype, description: 'File MIME type.' }),
    }),
  })
}

/** The `AssignedAttribute` interface ref created by `registerAssignedAttributes`; call only after registration. */
export function assignedAttributeRef(): ReturnType<AttributeGraphQLSchemaBuilder['interfaceRef']> {
  if (!ref)
    throw new Error('registerAssignedAttributes(builder) must run before assignedAttributeRef()')
  return ref
}
