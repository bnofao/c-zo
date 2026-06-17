# Assigned Attributes — typed, resolved-inline product attribute reads — Design

**Date:** 2026-06-16
**Modules:** `@czo/attribute` (the types) + `@czo/product` (the field + scoping)
**Status:** approved, pending spec review
**Branch:** new `feat/assigned-attributes` off `main` (one PR, two modules)

## Goal

Replace the storefront's bare-id attribute read with a **typed, resolved-inline** one (Saleor's `AssignedAttribute`, leaner). Today `Product.attributeValues` / `ProductVariant.attributeValues` return `ProductAttributeValue { attributeId, valueId, valueKind }` — raw cross-module ids the client must round-trip to render. This exposes a polymorphic `AssignedAttribute` interface (the attribute + its typed value(s) inline) + a `assignedAttribute(slug:)` PDP accessor, scoped to the publishing/viewer org exactly as the channel grafts (#149).

## Module split (the key decision)

The **types are attribute-domain; the field + tenant scoping are product-domain.** So:

- **`@czo/attribute` owns the GraphQL types** — the `AssignedAttribute` interface + its 8 concrete impls, **reusing its existing value nodes** (`AttributeValue`/`AttributeSwatchValue`/`AttributeReferenceValue`) rather than duplicating them. It widens `Attribute` + those value nodes to `public`, and exports the backing shape (`AttributeAssignment`) the impls read. Reusable for any future attribute-carrying entity (Saleor's `ObjectWithAttributes`).
- **`@czo/product` owns the field + resolution** — `Product/ProductVariant.assignedAttributes(channel:|viewerOrg:)` + `assignedAttribute(slug:)`. It loads `productAttributeValues` + the value relations + listings, derives the org (`resolveGraftOrg`, #149), filters base ∪ org, **groups its rows into `AttributeAssignment[]`**, and returns `@czo/attribute`'s `AssignedAttribute` interface via a cross-module type ref. `@czo/attribute` knows nothing of products/channels/listings; `@czo/product` knows nothing of how a value renders — clean seam.

## Why now / what already exists

- **#148** added cross-module relations on `productAttributeValues` → the `@czo/attribute` value tables (`attribute, selectValue, swatchValue, referenceValue, numericValue, booleanValue, dateValue`). It **skipped TEXT/FILE** (not facetable) → this sprint **adds `textValue` + `fileValue`** (product side).
- **#149** established the graft-arg pattern (`channel`/`viewerOrg` → `resolveGraftOrg(args, listings)`; `channel`→public). `assignedAttributes` reuses it verbatim.

## The types (`@czo/attribute`) — polymorphic interface, reusing value nodes

```graphql
interface AssignedAttribute { attribute: Attribute! }

type AssignedDropdownAttribute  implements AssignedAttribute { attribute: Attribute!, values: [AttributeValue!]! }          # VALUE     reuse node
type AssignedSwatchAttribute    implements AssignedAttribute { attribute: Attribute!, values: [AttributeSwatchValue!]! }    # SWATCH    reuse node
type AssignedReferenceAttribute implements AssignedAttribute { attribute: Attribute!, values: [AttributeReferenceValue!]! } # REFERENCE reuse node
type AssignedNumericAttribute   implements AssignedAttribute { attribute: Attribute!, value: Float! }                       # NUMERIC   scalar
type AssignedBooleanAttribute   implements AssignedAttribute { attribute: Attribute!, value: Boolean! }                     # BOOLEAN
type AssignedDateAttribute      implements AssignedAttribute { attribute: Attribute!, value: DateTime! }                    # DATE  (timestamptz = date+datetime)
type AssignedTextAttribute      implements AssignedAttribute { attribute: Attribute!, plain: String!, rich: JSON }          # TEXT
type AssignedFileAttribute      implements AssignedAttribute { attribute: Attribute!, url: String!, mimetype: String! }     # FILE
```
8 impls — one per `valueKind`. Choice kinds **reuse `@czo/attribute`'s own value nodes**; scalar/text/file kinds expose scalars/small attribute-owned objects. `resolveType` keys on the model's `valueKind`. No duplication, no Single/Multi or per-entity-reference split.

**Backing model** (exported from `@czo/attribute`, in its own table terms — product produces it):
```ts
interface AttributeAssignment {
  valueKind: ValueKind
  attribute: AttributeRow                         // attributes.$inferSelect
  selectValues?: AttributeValueRow[]              // for VALUE
  swatchValues?: AttributeSwatchValueRow[]        // SWATCH
  referenceValues?: AttributeReferenceValueRow[]  // REFERENCE
  numeric?: number; boolean?: boolean; date?: Date
  text?: { plain: string, rich: unknown | null }
  file?: { fileUrl: string, mimetype: string }
}
```

## The field + resolution (`@czo/product`)

```graphql
# on Product AND ProductVariant, tagged ['public','org','admin']:
assignedAttributes(channel: Int, viewerOrg: ID): [AssignedAttribute!]!
assignedAttribute(slug: String!, channel: Int, viewerOrg: ID): AssignedAttribute
```
Args + auth identical to #149 grafts (`channel`→public via the live listing; `viewerOrg`→C1; channel wins; neither→base). One nested `pothosDrizzleSelect` loads the `attributeValues` rows + `attribute` + the 8 value relations + (`product.`)`channelListings`. Then `resolveGraftOrg` → org; **group by `attributeId`** + filter base ∪ org; map each group into `AttributeAssignment` (bucket the loaded value rows by kind); return. `assignedAttribute(slug:)` filters to the group whose `attribute.slug === slug`. The grouping/mapping helper lives in product (it knows the row shape + does the org filter); it imports `AttributeAssignment` from `@czo/attribute`.

## Cross-module widening (`@czo/attribute`)

- `Attribute` node `['org','admin']` → add `'public'`; **narrow** `organizationId`, `metadata`, and the 3 choice connections (`values`/`swatchValues`/`referenceValues`) to `['org','admin']` (the connections reference value nodes and would otherwise force more surface public); leave name/slug/type/referenceEntity/unit/isRequired/isFilterable/version/timestamps public.
- `AttributeValue`/`AttributeSwatchValue`/`AttributeReferenceValue` value nodes `['org','admin']` → add `'public'` (they back the choice impls). Their fields (slug/value/position, swatch color/file, reference id) are storefront-public. (Note: this makes them `node(id:)`-reachable publicly — but the value IS public on a PDP; consistent with the L1 follow-up scope.)

## Replace (not add)

Remove the raw `Product.attributeValues` / `ProductVariant.attributeValues` **connection fields** (product). Keep the `ProductAttributeValue`/`VariantAttributeValue` **node types** (still `node(id:)`-reachable; L1 follow-up). Migrate the e2e/queries that read `attributeValues(viewerOrg:|channel:)` (the `product-global`/`product-org` C1 tests + #149's `channel-grafts` e2e) to `assignedAttributes`.

## Validated by spike (no gate remains)

The risky pattern was **spiked end-to-end and proven** — so this is not a gated approach, just an implementation. Confirmed:
- **Pothos `interface` + impls sub-graph-tag correctly** via the kit plugin: `interfaceRef.implement({ subGraphs, fields, resolveType })` + impls `objectRef.implement({ interfaces:[Ref], subGraphs, fields })`; **each impl carries its own `subGraphs`** (not inherited from the interface), **interface fields ARE inherited** (impls don't redeclare `attribute`), and centralized **`resolveType` works** (no `isTypeOf`).
- **The cross-module interface return is clean** — register `AssignedAttribute` in **both** modules' `BuilderSchemaObjects`, export the backing `AttributeAssignment` from `@czo/attribute/graphql`, product returns `type: ['AssignedAttribute']` with **no seam cast** (only the established `product as unknown as {…}` shape-cast).
- **A public interface can only return public concrete types** → widening `Attribute` + the value nodes to `public` is *required*, not optional.
- Operational gotcha: the e2e harness resolves cross-package imports against `dist`, so `pnpm --filter @czo/attribute build` is needed after attribute GraphQL edits.

## Out of scope

- Translations on choice labels (`@czo/translation`) — follow-up.
- L1 node-guard hardening for the value node types — separate sprint (this widens them to public; the guard is its own concern).
- Single/Multi & per-entity reference split. Write-side (`AssignmentValueInput`) unchanged.

## Testing

- **Spike** e2e (cross-module interface + resolveType) — gating.
- **Unit** (product): the grouping/mapping helper (`rows → AttributeAssignment[]`, base∪org filter, group/sort).
- **E2E (`['public']`, anonymous via `channelProducts(channel:)`):** seed a product with one attribute of each kind grafted by org A, published on C. Assert `assignedAttributes(channel: C)` returns each as its concrete type with the resolved value (inline fragments), `attribute { name slug }` resolves on `/graphql/public`, `assignedAttribute(slug:, channel:)` returns the one, no-leak (bogus channel → base/empty) + C1 (`viewerOrg` anon → denied).
- **Migration:** the C1/`viewerOrg` e2e reads, rewritten to `assignedAttributes`, stay green.

## Validation

- `pnpm --filter @czo/attribute test && @czo/product test`; `check-types` for attribute + product + life; `lint --max-warnings 0` both. No migration.
