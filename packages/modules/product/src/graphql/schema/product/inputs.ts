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

import type { CategoryWhereInput, ProductGraphQLSchemaBuilder, ProductTypeWhereInput, ProductWhereInput, TaxonomyRequestWhereInput } from '@czo/product/graphql'
import { z } from 'zod'

// ─── Zod schemas (filter/order guards) ──────────────────────────────────────
const productTypeOrderFieldSchema = z.enum(['name', 'createdAt'])
const productOrderFieldSchema = z.enum(['name', 'createdAt'])
const categoryOrderFieldSchema = z.enum(['name', 'position', 'createdAt'])
const collectionOrderFieldSchema = z.enum(['name', 'createdAt'])
const taxonomyRequestOrderFieldSchema = z.enum(['createdAt', 'reviewedAt'])
const orderDirectionSchema = z.enum(['asc', 'desc'])

export interface ProductEnumRefs {
  AttributeAssignment: ReturnType<ProductGraphQLSchemaBuilder['enumType']> & { __type?: 'PRODUCT' | 'VARIANT' }
  MediaType: ReturnType<ProductGraphQLSchemaBuilder['enumType']> & { __type?: 'IMAGE' | 'VIDEO' }
  ListingReviewState: ReturnType<ProductGraphQLSchemaBuilder['enumType']> & { __type?: 'pending' | 'approved' | 'rejected' | 'suspended' }
  TaxonomyRequestKind: ReturnType<ProductGraphQLSchemaBuilder['enumType']> & { __type?: 'create' | 'promote' }
  TaxonomyEntityType: ReturnType<ProductGraphQLSchemaBuilder['enumType']> & { __type?: 'category' | 'product_type' }
  TaxonomyRequestState: ReturnType<ProductGraphQLSchemaBuilder['enumType']> & { __type?: 'pending' | 'approved' | 'rejected' }
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
    ListingReviewState: builder.enumType('ProductListingReviewState', {
      subGraphs: ['org', 'admin'],
      description: 'Admin moderation state of a product listing on the marketplace: PENDING (awaiting review), APPROVED (live-eligible), REJECTED, or SUSPENDED.',
      values: { PENDING: { value: 'pending' }, APPROVED: { value: 'approved' }, REJECTED: { value: 'rejected' }, SUSPENDED: { value: 'suspended' } } as const,
    }),
    TaxonomyRequestKind: builder.enumType('TaxonomyRequestKind', {
      subGraphs: ['org', 'admin'],
      description: 'Whether the request asks to CREATE a new global taxonomy or PROMOTE an existing org one.',
      values: { CREATE: { value: 'create' }, PROMOTE: { value: 'promote' } } as const,
    }),
    TaxonomyEntityType: builder.enumType('TaxonomyEntityType', {
      subGraphs: ['org', 'admin'],
      description: 'The taxonomy entity a request concerns.',
      values: { CATEGORY: { value: 'category' }, PRODUCT_TYPE: { value: 'product_type' } } as const,
    }),
    TaxonomyRequestState: builder.enumType('TaxonomyRequestState', {
      subGraphs: ['org', 'admin'],
      description: 'Moderation state of a taxonomy request.',
      values: { PENDING: { value: 'pending' }, APPROVED: { value: 'approved' }, REJECTED: { value: 'rejected' } } as const,
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

  // ── productTypes connection: filter + ordering inputs ───────────────────────
  const ProductTypeWhereInputRef = builder.inputRef<ProductTypeWhereInput>('ProductTypeWhereInput').implement({
    subGraphs: ['org', 'admin'],
    description: 'Filter predicate for the `productTypes` connection. Field filters are AND-combined; use AND/OR/NOT to compose arbitrary boolean trees.',
    fields: t => ({
      isShippingRequired: t.field({ type: 'BooleanFilterInput', description: 'Filter by the isShippingRequired flag.' }),
      AND: t.field({ type: [ProductTypeWhereInputRef], description: 'All sub-predicates must match.' }),
      OR: t.field({ type: [ProductTypeWhereInputRef], description: 'At least one sub-predicate must match.' }),
      NOT: t.field({ type: ProductTypeWhereInputRef, description: 'The sub-predicate must not match.' }),
    }),
  })

  const ProductTypeOrderFieldRef = builder.enumType('ProductTypeOrderField', {
    subGraphs: ['org', 'admin'],
    description: 'A field the `productTypes` connection can be ordered by.',
    values: {
      NAME: { value: 'name' },
      CREATED_AT: { value: 'createdAt' },
    } as const,
  })

  // Own the sort-direction enum locally rather than referencing another module's
  // `OrderDirection` by string name — that would couple the schema build to a
  // foreign module's contribution running first and never type-check across modules.
  const ProductTypeOrderDirectionRef = builder.enumType('ProductTypeOrderDirection', {
    subGraphs: ['org', 'admin'],
    description: 'Sort direction: ascending or descending.',
    values: {
      ASC: { value: 'asc' },
      DESC: { value: 'desc' },
    } as const,
  })

  builder.inputType('ProductTypeOrderByInput', {
    subGraphs: ['org', 'admin'],
    description: 'One ordering clause for the `productTypes` connection (field + direction). Multiple clauses are applied in order.',
    fields: t => ({
      field: t.field({ type: ProductTypeOrderFieldRef, required: true, validate: productTypeOrderFieldSchema, description: 'The product-type field to sort by.' }),
      direction: t.field({ type: ProductTypeOrderDirectionRef, required: true, validate: orderDirectionSchema, description: 'Ascending or descending.' }),
    }),
  })

  // ── products connection: filter + ordering inputs ───────────────────────────
  const ProductAttributeValueWhereInputRef = builder.inputType('ProductAttributeValueWhereInput', {
    subGraphs: ['public', 'org', 'admin'],
    description: 'Typed predicate on an attribute value. Set one selector: `slug`/`name` (select & swatch values), `numeric`, `boolean`, `date`, or `reference`.',
    fields: t => ({
      slug: t.field({ type: 'StringFilterInput', description: 'Match the value slug (select/swatch).' }),
      name: t.field({ type: 'StringFilterInput', description: 'Match the value display label (select/swatch).' }),
      numeric: t.field({ type: 'FloatFilterInput', description: 'Match a numeric value (supports ranges).' }),
      boolean: t.field({ type: 'BooleanFilterInput', description: 'Match a boolean value.' }),
      date: t.field({ type: 'DateTimeFilterInput', description: 'Match a date/datetime value (supports ranges).' }),
      reference: t.field({ type: 'IntFilterInput', description: 'Match a reference value by its referenced entity id.' }),
    }),
  })

  const ProductAttributeWhereInputRef = builder.inputType('ProductAttributeWhereInput', {
    subGraphs: ['public', 'org', 'admin'],
    description: 'One attribute facet. The attribute is identified by `slug`, `name`, or `ids`; `value` narrows by the attribute\'s value. Only filterable attributes match. Multiple facets on `attributes` are AND-ed.',
    fields: t => ({
      slug: t.field({ type: 'StringFilterInput', description: 'Match the attribute slug.' }),
      name: t.field({ type: 'StringFilterInput', description: 'Match the attribute name.' }),
      ids: t.field({ type: 'IDFilterInput', description: 'Match the attribute by relay id(s).' }),
      value: t.field({ type: ProductAttributeValueWhereInputRef, description: 'Predicate on the value the product carries for this attribute.' }),
    }),
  })

  const ProductWhereInputRef = builder.inputRef<ProductWhereInput>('ProductWhereInput').implement({
    subGraphs: ['public', 'org', 'admin'],
    description: 'Filter predicate for the product connections. Field filters are AND-combined; use AND/OR/NOT to compose arbitrary boolean trees.',
    fields: t => ({
      name: t.field({ type: 'StringFilterInput', description: 'Filter by display name (base column; not locale-overlaid).' }),
      handle: t.field({ type: 'StringFilterInput', description: 'Filter by URL handle.' }),
      productType: t.field({ type: 'IDFilterInput', description: 'Filter by the referenced product type (relay id).' }),
      categories: t.field({ type: 'IDFilterInput', description: 'Filter to products assigned to the given categories (relay ids).' }),
      collections: t.field({ type: 'IDFilterInput', description: 'Filter to products in the given collections (relay ids).' }),
      attributes: t.field({ type: [ProductAttributeWhereInputRef], description: 'Facet by attributes and their typed values. Each entry is one facet; entries are AND-ed. Only `isFilterable` attributes match.' }),
      AND: t.field({ type: [ProductWhereInputRef], description: 'All sub-predicates must match.' }),
      OR: t.field({ type: [ProductWhereInputRef], description: 'At least one sub-predicate must match.' }),
      NOT: t.field({ type: ProductWhereInputRef, description: 'The sub-predicate must not match.' }),
    }),
  })

  const ProductOrderFieldRef = builder.enumType('ProductOrderField', {
    subGraphs: ['public', 'org', 'admin'],
    description: 'A field the `products` connection can be ordered by.',
    values: {
      NAME: { value: 'name' },
      CREATED_AT: { value: 'createdAt' },
    } as const,
  })

  // Own the sort-direction enum locally rather than referencing another module's
  // `OrderDirection` by string name — that would couple the schema build to a
  // foreign module's contribution running first and never type-check across modules.
  const ProductOrderDirectionRef = builder.enumType('ProductOrderDirection', {
    subGraphs: ['public', 'org', 'admin'],
    description: 'Sort direction: ascending or descending.',
    values: {
      ASC: { value: 'asc' },
      DESC: { value: 'desc' },
    } as const,
  })

  builder.inputType('ProductOrderByInput', {
    subGraphs: ['public', 'org', 'admin'],
    description: 'One ordering clause for the `products` connection (field + direction). Multiple clauses are applied in order.',
    fields: t => ({
      field: t.field({ type: ProductOrderFieldRef, required: true, validate: productOrderFieldSchema, description: 'The product field to sort by.' }),
      direction: t.field({ type: ProductOrderDirectionRef, required: true, validate: orderDirectionSchema, description: 'Ascending or descending.' }),
    }),
  })

  // ── categories connection: filter + ordering inputs ─────────────────────────
  const CategoryWhereInputRef = builder.inputRef<CategoryWhereInput>('CategoryWhereInput').implement({
    subGraphs: ['org', 'admin'],
    description: 'Filter predicate for the `categories` connection. Field filters are AND-combined; use AND/OR/NOT to compose arbitrary boolean trees.',
    fields: t => ({
      parentId: t.field({ type: 'IntFilterInput', description: 'Filter by the parent category id.' }),
      AND: t.field({ type: [CategoryWhereInputRef], description: 'All sub-predicates must match.' }),
      OR: t.field({ type: [CategoryWhereInputRef], description: 'At least one sub-predicate must match.' }),
      NOT: t.field({ type: CategoryWhereInputRef, description: 'The sub-predicate must not match.' }),
    }),
  })

  const CategoryOrderFieldRef = builder.enumType('CategoryOrderField', {
    subGraphs: ['org', 'admin'],
    description: 'A field the `categories` connection can be ordered by.',
    values: {
      NAME: { value: 'name' },
      POSITION: { value: 'position' },
      CREATED_AT: { value: 'createdAt' },
    } as const,
  })

  // Own the sort-direction enum locally rather than referencing another module's
  // `OrderDirection` by string name — that would couple the schema build to a
  // foreign module's contribution running first and never type-check across modules.
  const CategoryOrderDirectionRef = builder.enumType('CategoryOrderDirection', {
    subGraphs: ['org', 'admin'],
    description: 'Sort direction: ascending or descending.',
    values: {
      ASC: { value: 'asc' },
      DESC: { value: 'desc' },
    } as const,
  })

  builder.inputType('CategoryOrderByInput', {
    subGraphs: ['org', 'admin'],
    description: 'One ordering clause for the `categories` connection (field + direction). Multiple clauses are applied in order.',
    fields: t => ({
      field: t.field({ type: CategoryOrderFieldRef, required: true, validate: categoryOrderFieldSchema, description: 'The category field to sort by.' }),
      direction: t.field({ type: CategoryOrderDirectionRef, required: true, validate: orderDirectionSchema, description: 'Ascending or descending.' }),
    }),
  })

  // ── collections connection: ordering inputs (no filterable WhereInput) ───────
  const CollectionOrderFieldRef = builder.enumType('CollectionOrderField', {
    subGraphs: ['org', 'admin'],
    description: 'A field the `collections` connection can be ordered by.',
    values: {
      NAME: { value: 'name' },
      CREATED_AT: { value: 'createdAt' },
    } as const,
  })

  // Own the sort-direction enum locally rather than referencing another module's
  // `OrderDirection` by string name — that would couple the schema build to a
  // foreign module's contribution running first and never type-check across modules.
  const CollectionOrderDirectionRef = builder.enumType('CollectionOrderDirection', {
    subGraphs: ['org', 'admin'],
    description: 'Sort direction: ascending or descending.',
    values: {
      ASC: { value: 'asc' },
      DESC: { value: 'desc' },
    } as const,
  })

  builder.inputType('CollectionOrderByInput', {
    subGraphs: ['org', 'admin'],
    description: 'One ordering clause for the `collections` connection (field + direction). Multiple clauses are applied in order.',
    fields: t => ({
      field: t.field({ type: CollectionOrderFieldRef, required: true, validate: collectionOrderFieldSchema, description: 'The collection field to sort by.' }),
      direction: t.field({ type: CollectionOrderDirectionRef, required: true, validate: orderDirectionSchema, description: 'Ascending or descending.' }),
    }),
  })

  // ── taxonomyRequests connection: filter + ordering inputs ───────────────────
  // Enum fields filter by equality directly against the enum ref (not a kit
  // FilterInput): `{ state: 'pending' }` maps to a RQBv2 scalar-equals clause.
  const enums = refs
  const TaxonomyRequestWhereInputRef = builder.inputRef<TaxonomyRequestWhereInput>('TaxonomyRequestWhereInput').implement({
    subGraphs: ['org', 'admin'],
    description: 'Filter predicate for taxonomy-request connections. Field filters are AND-combined; use AND/OR/NOT to compose.',
    fields: t => ({
      kind: t.field({ type: enums.TaxonomyRequestKind, description: 'Filter by request kind (equals).' }) as any,
      entityType: t.field({ type: enums.TaxonomyEntityType, description: 'Filter by entity type (equals).' }) as any,
      state: t.field({ type: enums.TaxonomyRequestState, description: 'Filter by review state (equals).' }) as any,
      AND: t.field({ type: [TaxonomyRequestWhereInputRef], description: 'All sub-predicates must match.' }),
      OR: t.field({ type: [TaxonomyRequestWhereInputRef], description: 'At least one sub-predicate must match.' }),
      NOT: t.field({ type: TaxonomyRequestWhereInputRef, description: 'The sub-predicate must not match.' }),
    }),
  })

  const TaxonomyRequestOrderFieldRef = builder.enumType('TaxonomyRequestOrderField', {
    subGraphs: ['org', 'admin'],
    description: 'A field the taxonomy-request connections can be ordered by.',
    values: {
      CREATED_AT: { value: 'createdAt' },
      REVIEWED_AT: { value: 'reviewedAt' },
    } as const,
  })

  // Own the sort-direction enum locally rather than referencing another module's
  // `OrderDirection` by string name — that would couple the schema build to a
  // foreign module's contribution running first and never type-check across modules.
  const TaxonomyRequestOrderDirectionRef = builder.enumType('TaxonomyRequestOrderDirection', {
    subGraphs: ['org', 'admin'],
    description: 'Sort direction: ascending or descending.',
    values: {
      ASC: { value: 'asc' },
      DESC: { value: 'desc' },
    } as const,
  })

  builder.inputType('TaxonomyRequestOrderByInput', {
    subGraphs: ['org', 'admin'],
    description: 'One ordering clause for the taxonomy-request connections (field + direction). Multiple clauses are applied in order.',
    fields: t => ({
      field: t.field({ type: TaxonomyRequestOrderFieldRef, required: true, validate: taxonomyRequestOrderFieldSchema, description: 'The taxonomy-request field to sort by.' }),
      direction: t.field({ type: TaxonomyRequestOrderDirectionRef, required: true, validate: orderDirectionSchema, description: 'Ascending or descending.' }),
    }),
  })
}

/** Enum refs created by `registerProductInputs`; call only after registration. */
export function productEnumRefs(): ProductEnumRefs {
  if (!refs)
    throw new Error('registerProductInputs(builder) must run before productEnumRefs()')
  return refs
}
