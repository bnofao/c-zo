// Shared input building blocks for the @czo/product mutations.
//
// Mutation argument shapes are NOT declared here. Each `relayMutationField`
// declares its own `inputFields` directly (mirrors @czo/price/@czo/channel), so
// the relay plugin auto-generates a flat `<Mutation>Input` per mutation —
// callers pass `mutation(input: { ...fields })`, never a doubly-nested
// `input.input`.
//
// What stays registered here, because it is referenced from those per-mutation
// `inputFields`:
//   - the two enums (`ProductAttributeAssignment`, `ProductMediaType`), stashed
//     as refs (Pothos enums are referenced by their ref object, not a string
//     type name) and exposed via `productEnumRefs()`;
//   - the nested value objects that appear as a field's `type` inside another
//     input (`VariantSelectionPairInput`, `AssignmentValueInput` and its two
//     scalar members), referenced by their registered string name.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'

export interface ProductEnumRefs {
  AttributeAssignment: ReturnType<ProductGraphQLSchemaBuilder['enumType']> & { __type?: 'PRODUCT' | 'VARIANT' }
  MediaType: ReturnType<ProductGraphQLSchemaBuilder['enumType']> & { __type?: 'IMAGE' | 'VIDEO' }
}

let refs: ProductEnumRefs | undefined

export function registerProductInputs(builder: ProductGraphQLSchemaBuilder): void {
  // ── Enums (referenced by ref from the per-mutation inputFields) ──────────────
  refs = {
    AttributeAssignment: builder.enumType('ProductAttributeAssignment', {
      subGraphs: ['org', 'admin'],
      description: 'Where an attribute is assigned on a product type: PRODUCT (one value per product) or VARIANT (selectable per variant). Attributes flagged for variant selection drive the variant matrix.',
      values: { PRODUCT: { value: 'PRODUCT' }, VARIANT: { value: 'VARIANT' } } as const,
    }),
    MediaType: builder.enumType('ProductMediaType', {
      subGraphs: ['org', 'admin'],
      description: 'The kind of a product/variant media asset: IMAGE or VIDEO.',
      values: { IMAGE: { value: 'IMAGE' }, VIDEO: { value: 'VIDEO' } } as const,
    }),
  }

  // ── Nested value objects (used as a field `type` inside other inputs) ────────
  // selection pairs for the variant matrix-uniqueness check (attributeId + valueId).
  builder.inputType('VariantSelectionPairInput', {
    subGraphs: ['org', 'admin'],
    description: 'One (attribute, value) pair of a variant\'s option selection. The full set of pairs defines the variant\'s position in the product\'s option matrix and must be unique among siblings.',
    fields: t => ({
      attributeId: t.int({ required: true, description: 'Raw id of a variant-selection attribute declared on the product\'s type.' }),
      valueId: t.int({ required: true, description: 'Raw id of the chosen catalog value for that attribute.' }),
    }),
  })

  // The discriminated value union for attribute assignment: a select carries
  // `valueIds`; a scalar carries exactly one typed member. All members are
  // optional; the resolver narrows by presence and the service rejects a
  // malformed shape as ValueKindMismatch.
  builder.inputType('AssignmentTextValueInput', {
    subGraphs: ['org', 'admin'],
    description: 'A text attribute value: required plain text plus optional rich (structured JSON) content.',
    fields: t => ({
      plain: t.string({ required: true, description: 'Plain-text representation of the value.' }),
      rich: t.field({ type: 'JSON', description: 'Optional structured rich-text payload (e.g. a document AST).' }),
    }),
  })

  builder.inputType('AssignmentFileValueInput', {
    subGraphs: ['org', 'admin'],
    description: 'A file attribute value: the asset URL and its MIME type.',
    fields: t => ({
      fileUrl: t.string({ required: true, description: 'URL of the uploaded file asset.' }),
      mimetype: t.string({ required: true, description: 'MIME type of the file (e.g. `application/pdf`).' }),
    }),
  })

  builder.inputType('AssignmentValueInput', {
    subGraphs: ['org', 'admin'],
    description: 'The value to assign for an attribute. Exactly one member must match the attribute\'s type: `valueIds` for select types, otherwise one of the scalar members. A mismatched shape is rejected as ValueKindMismatch.',
    fields: t => ({
      valueIds: t.field({ type: ['Int'], description: 'For select attributes (DROPDOWN/MULTISELECT/SWATCH/REFERENCE): the chosen catalog value id(s).' }),
      numeric: t.float({ description: 'For NUMBER attributes: the numeric value.' }),
      text: t.field({ type: 'AssignmentTextValueInput', description: 'For TEXT attributes: the text value.' }),
      boolean: t.boolean({ description: 'For BOOLEAN attributes: the boolean value.' }),
      date: t.field({ type: 'DateTime', description: 'For DATE/DATETIME attributes: the date value.' }),
      file: t.field({ type: 'AssignmentFileValueInput', description: 'For FILE attributes: the file value.' }),
    }),
  })
}

/** Enum refs created by `registerProductInputs`; call only after registration. */
export function productEnumRefs(): ProductEnumRefs {
  if (!refs)
    throw new Error('registerProductInputs(builder) must run before productEnumRefs()')
  return refs
}
