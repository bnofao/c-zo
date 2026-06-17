# Attribute Faceting — `ProductAttributeWhereInput` (typed, cross-module) — Design

**Date:** 2026-06-16
**Module:** `@czo/product` (+ cross-module relations into `@czo/attribute`)
**Status:** approved, pending spec review
**Depends on:** the **product-filter-surface** sprint (`ProductWhereInput` + `buildProductWhere` + the kit `IDFilter` fix). This sprint adds an `attributes` field to that `ProductWhereInput` and a faceting branch to that translator, so it lands after it.

## Goal

Let a storefront facet products by their **attributes and typed values** — "colour ∈ {red, blue} ∧ weight ≤ 50 ∧ released after 2024". Filtering reaches data that lives in `@czo/attribute` (the attribute's slug/name, and the typed value tables), which `product_attribute_values` only references by `attributeId` + `valueId` + `valueKind`.

## Architecture — cross-module RQBv2 relations + pure translator (Approach 1)

`product_attribute_values` carries `attributeId`, `valueId`, `valueKind` (enum `VALUE, SWATCH, REFERENCE, TEXT, NUMERIC, BOOLEAN, DATE, FILE`) — but no FK/relation into the attribute tables. We add those relations to product's `relations.ts` (same mechanism as the existing `products.organization → organizations` cross-module relation: side-effect `import '@czo/attribute/schema'`, add the keys to the `Pick<SchemaRegistryShape, …>` + destructure + `defineRelationsPart`). All on `productAttributeValues`:

| relation | from → to | powers |
|---|---|---|
| `attribute` | `attributeId → attributes.id` | attribute `slug`/`name`/`id` + `isFilterable` |
| `selectValue` | `valueId → attributeValues.id` | value `slug`/`name` (kind `VALUE`) |
| `swatchValue` | `valueId → attributeSwatchValues.id` | value `slug`/`name` (kind `SWATCH`) |
| `numericValue` | `valueId → attributeNumericValues.id` | value `numeric` (kind `NUMERIC`) |
| `booleanValue` | `valueId → attributeBooleanValues.id` | value `boolean` (kind `BOOLEAN`) |
| `dateValue` | `valueId → attributeDateValues.id` | value `date` (kind `DATE`) |
| `referenceValue` | `valueId → attributeReferenceValues.id` | value `reference` (kind `REFERENCE`) |

`attribute` joins on `attributeId`; the seven value relations join on `valueId`. **`valueId` is unique only within a kind's table**, so every value-relation clause is paired with a `valueKind` equality so a (say) `TEXT` row whose `valueId` collides with a numeric value id is never mis-joined.

Faceting then extends the **same synchronous `buildProductWhere`** — no async, no new attribute services. Each facet → one exists clause on the `attributeValues` relation:

```ts
{ attributeValues: {
    attribute: { isFilterable: true, slug: {…}, id: {…} },   // attribute predicate (isFilterable auto-injected)
    valueKind: 'NUMERIC', numericValue: { value: { gte: 50 } },  // typed value predicate
    deletedAt: { isNull: true },
} }
```

We only define **outbound** relations from product-owned `productAttributeValues`; the attribute tables' own relations stay in the attribute module's part (`defineRelationsPart` merges them). No GraphQL fields are added for these relations — they exist purely for `where` traversal.

## Input types (full filter inputs per kind — "C")

```graphql
input ProductAttributeValueWhereInput {
  slug: StringFilterInput        # attribute_values OR attribute_swatch_values .slug
  name: StringFilterInput        # …                                            .name
  numeric: FloatFilterInput      # attribute_numeric_values.value
  boolean: BooleanFilterInput    # attribute_boolean_values.value
  date: TimeFilterInput          # attribute_date_values.value (timestamptz — covers date + datetime)
  reference: IntFilterInput      # attribute_reference_values.referenceId
}
input ProductAttributeWhereInput {
  slug: StringFilterInput        # attributes.slug
  name: StringFilterInput        # attributes.name
  ids: IDFilterInput             # attribute relay ids → attributeId (decoded by the IDFilter rules)
  value: ProductAttributeValueWhereInput
}
# added to ProductWhereInput:  attributes: [ProductAttributeWhereInput!]
```

All field types are existing kit filter inputs (`StringFilterInput`/`FloatFilterInput`/`BooleanFilterInput`/`TimeFilterInput`/`IntFilterInput`/`IDFilterInput`) — already registered across audiences. No new scalar/filter primitives.

## Translation rules (`buildProductWhere` faceting branch)

- **Each `ProductAttributeWhereInput` entry → one exists clause** on `attributeValues`, ANDed across entries (facet narrowing). The whole `attributes` array → `AND: [ …one clause per entry… ]`.
- **Attribute predicate** → nested `attribute: { isFilterable: true, slug?, name?, id? }`. `isFilterable: true` is **always injected** (only filterable attributes are facetable; a facet on a non-filterable attribute matches nothing). `ids` (IDFilter) decodes to `attribute.id` int filter via the existing `IDFilter` rules; `slug`/`name` pass through (StringFilter).
- **Value predicate** (`value`, optional) — **one value-kind selector** is expected (discriminated, like `AssignmentValueInput`): one of `slug`/`name` (which together address the VALUE∪SWATCH text facet), `numeric`, `boolean`, `date`, or `reference`. (`slug` and `name` may co-occur — same kind group; mixing across kinds, e.g. `numeric` + `boolean`, targets different `valueKind`s and matches nothing.)
  - `numeric` → `valueKind: 'NUMERIC', numericValue: { value: <FloatFilter> }`
  - `boolean` → `valueKind: 'BOOLEAN', booleanValue: { value: <BooleanFilter> }`
  - `date` → `valueKind: 'DATE', dateValue: { value: <TimeFilter> }`
  - `reference` → `valueKind: 'REFERENCE', referenceValue: { referenceId: <IntFilter> }`
  - `slug`/`name` **span two tables** → `OR: [ { valueKind: 'VALUE', selectValue: { slug/name } }, { valueKind: 'SWATCH', swatchValue: { slug/name } } ]` (swatches are prime facets — colour).
- **Attribute-only facet** (entry with no `value`) → just the attribute exists clause: "product has any (filterable) value for this attribute".
- The exists clause always includes `deletedAt: { isNull: true }` on `productAttributeValues`.

## Semantics

- **Across facets:** AND (each entry narrows).
- **Within a facet's value field:** the kit FilterInput's own operators — `slug: { in: [...] }` is within-facet OR; `numeric: { gte: 10, lte: 50 }` is a range; `FilterInput.OR/AND/NOT` available.
- **`isFilterable` enforced** (injected), so the facet surface == the attribute system's own "this is a facet" flag.

## Org-scope nuance (accepted, same as `categories`)

`product_attribute_values` and the attribute value tables are org-scoped (`organizationId`, base ∪ org grafts). A **public** facet matches a published product whose value (base **or** any-org graft) satisfies the predicate. Acceptable — the product is already publication-gated and attribute membership isn't confidential. Precise per-publishing-org value scoping waits on the deferred `listing.organizationId` graft-resolution sprint.

## Connections

`attributes` lives on the shared `ProductWhereInput`, so faceting is available on `channelProducts` (public storefront) **and** `products`/`organizationProducts` (org/admin catalog management) — for free, since the translator is shared.

## Spike (gates the sprint)

A Postgres integration test (raw `db.query.products.findMany`) proving, after the relations are added:

1. **Multiple ANDed exists on the `attributeValues` relation** = true AND (a product with red+M returned by `AND:[{…red…},{…M…}]`; a red-only product excluded).
2. **Nested cross-module relational `where`** resolves: `{ attributeValues: { valueKind: 'NUMERIC', numericValue: { value: { gte: 50 } } } }` returns the right products.
3. **slug/name OR across VALUE+SWATCH** resolves.

If (2) fails (plugin-drizzle/RQBv2 can't traverse the cross-module relation in a `where`), **fall back to Approach 2** — a two-phase async resolution: resolve each facet to a `valueId`/`attributeId` set via the attribute module (new read methods on `AttributeService`/value services), then filter products by `attributeValues: { valueId: { in } }`. The GraphQL input + the `ProductWhereInput.attributes` surface stay identical; only the resolution swaps (the translator's faceting branch would move into the resolver as an Effect).

## Out of scope

- **Facet counts/aggregations** (the "(42)" next to each option) — a separate aggregation feature.
- **TEXT and FILE** value kinds — free text and files aren't faceted (no slug/name/scalar facet semantics).
- Precise per-publishing-org value scoping (deferred `listing.organizationId` sprint).

## Testing

- **Spike** integration test (above) — first, gating.
- **Translator** unit: each value kind → correct `valueKind` + relation clause; `slug`/`name` → the VALUE∪SWATCH OR; `isFilterable` injection; attribute-only facet; multi-facet AND; `ids` decode.
- **E2E (`['public']`, `channelProducts`)**: seed products live on a channel with differing attributes/typed values; assert select-slug, swatch-slug, numeric-range, boolean, date-range, reference, attribute-only, and a multi-facet AND each narrow correctly; assert a non-`isFilterable` attribute facet returns nothing.

## Validation

- `pnpm --filter @czo/product check-types`, `lint --max-warnings 0`, `test`; `pnpm --filter life check-types`.
- No migration (relations + GraphQL inputs only; the `attributes` relation set is type-level + RQBv2 config).
