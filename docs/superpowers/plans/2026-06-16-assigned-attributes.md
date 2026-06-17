# Assigned Attributes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace `Product/ProductVariant.attributeValues` (bare-id connections) with a typed `AssignedAttribute` interface read — `assignedAttributes(channel:|viewerOrg:)` + `assignedAttribute(slug:)`. **Types live in `@czo/attribute`** (reusing its value nodes); **the field + tenant scoping live in `@czo/product`**.

**Architecture:** `@czo/attribute` defines the `AssignedAttribute` interface + 8 impls (choice impls reuse `AttributeValue`/`AttributeSwatchValue`/`AttributeReferenceValue`), widens `Attribute` + those value nodes to `public`, and exports the backing `AttributeAssignment`. `@czo/product` loads `productAttributeValues` + value relations + listings, derives the org (#149), groups its rows into `AttributeAssignment[]`, and returns attribute's interface (cross-module ref). One PR.

**Spec:** `docs/superpowers/specs/2026-06-16-assigned-attributes-design.md`

**Branch:** `feat/assigned-attributes` off `main` (already created). Stage only — no commits until user review.

**The risky pattern is already SPIKED & PROVEN** (findings below) — there is no gate task. Build the real thing directly, copying the proven forms.

## Spike findings (proven — use these verbatim)
- **Pothos interface + impls + sub-graph tagging WORKS.** `builder.interfaceRef<T>('Name').implement({ subGraphs, fields, resolveType })`; impls `builder.objectRef<T>('Name').implement({ interfaces: [Ref], subGraphs, fields })`. **Each impl carries its own `subGraphs`** (the impl tag does NOT inherit from the interface); **interface fields ARE inherited** (impls do NOT redeclare them).
- **`resolveType` (centralized, keyed on the discriminator) WORKS** — no per-impl `isTypeOf` needed.
- **Cross-module interface return WORKS with no seam cast.** Register the interface name in `BuilderSchemaObjects` in **BOTH** modules (attribute keyed to its own backing type; product imports that type from `@czo/attribute/graphql`). Export the backing type from `@czo/attribute/graphql`. Product field uses `type: ['AssignedAttribute']` and returns `ReadonlyArray<AttributeAssignment>`; only the established `product as unknown as {…}` shape-cast is needed (same as every graft field).
- **A public interface can only return public concrete types** → `Attribute` + the 3 value nodes MUST be widened to `public` (Task 1). This is required, not optional.
- **The e2e harness resolves cross-package imports against `dist`** → run `pnpm --filter @czo/attribute build` after editing attribute GraphQL, before product e2e.

**Key facts (verified):**
- `@czo/attribute` value nodes: `AttributeValue`(slug,value,position), `AttributeSwatchValue`(slug,value,color,fileUrl), `AttributeReferenceValue`(slug,value,referenceId) — all `subGraphs:['org','admin']`. The `Attribute` node too (fields: name,slug,type,referenceEntity,unit,isRequired,isFilterable,organizationId,metadata,version,timestamps + 3 choice connections).
- #148 product relations on `productAttributeValues`: `attribute,selectValue,swatchValue,referenceValue,numericValue,booleanValue,dateValue`. **TEXT/FILE skipped** → add `textValue`/`fileValue`.
- DB enums: `attributes.type` = `attribute_type` (uses **`NUMERIC`**, not NUMBER); `productAttributeValues.valueKind` = `product_value_kind` = `VALUE|SWATCH|REFERENCE|TEXT|NUMERIC|BOOLEAN|DATE|FILE`. The typed value is on the relation (`numericValue.value`, `selectValue` rows, …), NOT the pivot row.
- #149: `resolveGraftOrg(args, listings)` + channel-aware `graftAuthScopes` in product `types/merge.ts`; listing load via nested `pothosDrizzleSelect`.
- The raw `attributeValues` `t.connection`s (from #149) in product `product.ts`/`variant.ts` are what gets REPLACED.

---

## Task 1: `@czo/attribute` — widen `Attribute` + value nodes to `public`

**File:** `packages/modules/attribute/src/graphql/schema/types.ts`. (Required — a public interface can't return org/admin-only types.)

- [ ] **Step 1:** `Attribute` node `subGraphs: ['org','admin']` → `['public','org','admin']`. Narrow to `['org','admin']`: `organizationId`, `metadata`, and the 3 choice connections `values`/`swatchValues`/`referenceValues` (3-positional narrow). Leave public: name, slug, type, referenceEntity, unit, isRequired, isFilterable, version, createdAt, updatedAt.
- [ ] **Step 2:** `AttributeValue`, `AttributeSwatchValue`, `AttributeReferenceValue` nodes → add `'public'` to each `subGraphs`. (Fields slug/value/position, color/fileUrl, referenceId are storefront-public.)
- [ ] **Step 3: Verify.** `pnpm --filter @czo/attribute check-types && lint --max-warnings 0 && test`. Confirm (introspection or the exposure e2e) `Attribute`/value nodes now on `/graphql/public` with the intended fields.

---

## Task 2: `@czo/attribute` — `AssignedAttribute` interface + 8 impls + exported `AttributeAssignment`

**Files:** new `packages/modules/attribute/src/graphql/schema/assigned.ts`; call its registrar in the attribute schema registrar; export `AttributeAssignment` (+ the interface ref) from `@czo/attribute/graphql`; register `AssignedAttribute` in attribute's `BuilderSchemaObjects`.

- [ ] **Step 1: the exported backing type** (attribute's own table terms):
```ts
import type { attributes, attributeValues, attributeSwatchValues, attributeReferenceValues } from '../../database/schema'
export interface AttributeAssignment {
  valueKind: 'VALUE' | 'SWATCH' | 'REFERENCE' | 'TEXT' | 'NUMERIC' | 'BOOLEAN' | 'DATE' | 'FILE'
  attribute: typeof attributes.$inferSelect
  selectValues?: ReadonlyArray<typeof attributeValues.$inferSelect>
  swatchValues?: ReadonlyArray<typeof attributeSwatchValues.$inferSelect>
  referenceValues?: ReadonlyArray<typeof attributeReferenceValues.$inferSelect>
  numeric?: number; boolean?: boolean; date?: Date
  text?: { plain: string, rich: unknown | null }
  file?: { fileUrl: string, mimetype: string }
}
const KIND_TYPENAME: Record<AttributeAssignment['valueKind'], string> = {
  VALUE: 'AssignedDropdownAttribute', SWATCH: 'AssignedSwatchAttribute', REFERENCE: 'AssignedReferenceAttribute',
  NUMERIC: 'AssignedNumericAttribute', BOOLEAN: 'AssignedBooleanAttribute', DATE: 'AssignedDateAttribute',
  TEXT: 'AssignedTextAttribute', FILE: 'AssignedFileAttribute',
}
```
- [ ] **Step 2: the interface** (proven form):
```ts
export const AssignedAttributeRef = builder.interfaceRef<AttributeAssignment>('AssignedAttribute')
AssignedAttributeRef.implement({
  subGraphs: ['public', 'org', 'admin'],
  description: 'An attribute assigned to an object, with its typed value(s) resolved inline.',
  fields: t => ({ attribute: t.field({ type: 'Attribute', resolve: g => g.attribute, description: 'The attribute.' }) }),
  resolveType: g => KIND_TYPENAME[g.valueKind],
})
```
- [ ] **Step 3: the 8 impls** — `builder.objectRef<AttributeAssignment>('Name').implement({ interfaces: [AssignedAttributeRef], subGraphs: ['public','org','admin'], fields })`. **`attribute` is inherited — do NOT redeclare it**; declare only the value field(s). Choice impls reuse the value nodes by string-ref:
```ts
// VALUE     → fields: t => ({ values: t.field({ type: ['AttributeValue'], resolve: g => g.selectValues ?? [], description: 'Selected dropdown/multiselect values.' }) })
// SWATCH    → values: t.field({ type: ['AttributeSwatchValue'], resolve: g => g.swatchValues ?? [] })
// REFERENCE → values: t.field({ type: ['AttributeReferenceValue'], resolve: g => g.referenceValues ?? [] })
// NUMERIC   → value: t.float({ resolve: g => g.numeric! })
// BOOLEAN   → value: t.boolean({ resolve: g => g.boolean! })
// DATE      → value: t.field({ type: 'DateTime', resolve: g => g.date! })
// TEXT      → plain: t.string({ resolve: g => g.text!.plain }), rich: t.field({ type: 'JSON', nullable: true, resolve: g => g.text!.rich })
// FILE      → url: t.string({ resolve: g => g.file!.fileUrl }), mimetype: t.string({ resolve: g => g.file!.mimetype })
```
- [ ] **Step 4: register + export.** Add `AssignedAttribute: AttributeAssignment` to attribute's `BuilderSchemaObjects` (`graphql/index.ts`). Export `AttributeAssignment` + `AssignedAttributeRef` from `@czo/attribute/graphql`. Call `registerAssignedAttributes(builder)` in the attribute schema registrar (after the value nodes exist, since the impls string-ref them).
- [ ] **Step 5: Verify.** `pnpm --filter @czo/attribute check-types && lint --max-warnings 0`. Schema builds; the 8 types + interface on `/graphql/public`. **Then `pnpm --filter @czo/attribute build`** (product e2e/check resolves attribute against `dist`).

---

## Task 3: `@czo/product` — add `textValue` + `fileValue` relations (complete the 8)

**Files:** `packages/modules/product/src/database/relations.ts` (+ `testing/postgres.ts` if it lists tables — #148 gotcha).

- [ ] **Step 1:** Add `attributeTextValues`, `attributeFileValues` to the `Pick`, destructure, and `defineRelationsPart` arg.
- [ ] **Step 2:** On the `productAttributeValues` relation body:
```ts
        textValue: r.one.attributeTextValues({ from: r.productAttributeValues.valueId, to: r.attributeTextValues.id }),
        fileValue: r.one.attributeFileValues({ from: r.productAttributeValues.valueId, to: r.attributeFileValues.id }),
```
- [ ] **Step 3:** Update `testing/postgres.ts`'s concrete `productRelations({...})` if present. **Verify:** `pnpm --filter @czo/product check-types && lint --max-warnings 0`.

---

## Task 4: `@czo/product` — `groupAssigned` helper (`rows → AttributeAssignment[]`)

**Files:** new `packages/modules/product/src/graphql/schema/product/types/assigned.ts` + `assigned.test.ts`.

- [ ] **Step 1: row type + helper.**
```ts
import type { AttributeAssignment } from '@czo/attribute/graphql'
import type { attributes, productAttributeValues, attributeValues, attributeSwatchValues, attributeReferenceValues, attributeNumericValues, attributeBooleanValues, attributeDateValues, attributeTextValues, attributeFileValues } from '@czo/attribute/schema'

export type PavRow = typeof productAttributeValues.$inferSelect & {
  attribute: typeof attributes.$inferSelect
  selectValue?: typeof attributeValues.$inferSelect | null
  swatchValue?: typeof attributeSwatchValues.$inferSelect | null
  referenceValue?: typeof attributeReferenceValues.$inferSelect | null
  numericValue?: typeof attributeNumericValues.$inferSelect | null
  booleanValue?: typeof attributeBooleanValues.$inferSelect | null
  dateValue?: typeof attributeDateValues.$inferSelect | null
  textValue?: typeof attributeTextValues.$inferSelect | null
  fileValue?: typeof attributeFileValues.$inferSelect | null
}

export function groupAssigned(rows: ReadonlyArray<PavRow>, org: number | null): AttributeAssignment[] {
  const groups = new Map<number, { kind: PavRow['valueKind'], attribute: PavRow['attribute'], rows: PavRow[] }>()
  for (const r of rows) {
    if (!(r.organizationId == null || r.organizationId === org)) continue
    let g = groups.get(r.attributeId)
    if (g == null) { g = { kind: r.valueKind, attribute: r.attribute, rows: [] }; groups.set(r.attributeId, g) }
    g.rows.push(r)
  }
  return [...groups.values()]
    .sort((a, b) => a.attribute.slug.localeCompare(b.attribute.slug))
    .map((g) => {
      const sorted = [...g.rows].sort((a, b) => a.position - b.position)
      const base: AttributeAssignment = { valueKind: g.kind, attribute: g.attribute }
      switch (g.kind) {
        case 'VALUE': return { ...base, selectValues: sorted.map(r => r.selectValue!).filter(Boolean) }
        case 'SWATCH': return { ...base, swatchValues: sorted.map(r => r.swatchValue!).filter(Boolean) }
        case 'REFERENCE': return { ...base, referenceValues: sorted.map(r => r.referenceValue!).filter(Boolean) }
        case 'NUMERIC': return { ...base, numeric: sorted[0]!.numericValue!.value }
        case 'BOOLEAN': return { ...base, boolean: sorted[0]!.booleanValue!.value }
        case 'DATE': return { ...base, date: sorted[0]!.dateValue!.value }
        case 'TEXT': return { ...base, text: { plain: sorted[0]!.textValue!.plain, rich: sorted[0]!.textValue!.rich } }
        case 'FILE': return { ...base, file: { fileUrl: sorted[0]!.fileValue!.fileUrl, mimetype: sorted[0]!.fileValue!.mimetype } }
        default: return base
      }
    })
}
```
(If `valueKind: g.kind` trips check-types because the drizzle enum union isn't structurally identical to `AttributeAssignment['valueKind']`, type the Map's `kind` as `AttributeAssignment['valueKind']` and cast at insertion once, with a comment — avoid `as any`.)
- [ ] **Step 2: unit test** (`assigned.test.ts`, pure) — mixed kinds/orgs: base∪org filter, grouping, value bucketing (VALUE with 2 grafted rows → `selectValues` length 2 position-sorted; NUMERIC → `numeric`). TDD: fail → implement → pass.
- [ ] **Step 3: Verify.** `pnpm --filter @czo/product test src/graphql/schema/product/types/assigned.test.ts && check-types && lint --max-warnings 0`.

---

## Task 5: `@czo/product` — `assignedAttributes`/`assignedAttribute` fields + REPLACE

**Files:** `product.ts`, `variant.ts`; product `graphql/index.ts` (register the cross-module interface).

- [ ] **Step 1: register** `AssignedAttribute: AttributeAssignment` in product `graphql/index.ts` `BuilderSchemaObjects` (`import type { AttributeAssignment } from '@czo/attribute/graphql'`) so product string-refs `'AssignedAttribute'`.
- [ ] **Step 2: Product fields** (replace the removed `attributeValues`). Shared `const ASSIGNED_WITH = { attribute: true, selectValue: true, swatchValue: true, referenceValue: true, numericValue: true, booleanValue: true, dateValue: true, textValue: true, fileValue: true } as const`:
```ts
assignedAttributes: t.field({
  type: ['AssignedAttribute'], subGraphs: ['public', 'org', 'admin'],
  description: 'The product\'s attributes with typed values resolved inline. Pass `channel` for the storefront (the publishing org) or `viewerOrg` for a specific org.',
  args: { channel: t.arg.int({ required: false, description: '…' }), viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: '…' }) },
  authScopes: (_p, args) => graftAuthScopes(args),
  extensions: { pothosDrizzleSelect: { with: { channelListings: true, attributeValues: { with: ASSIGNED_WITH } } } },
  resolve: (product, args) => {
    const p = product as unknown as { channelListings?: GraftListing[], attributeValues?: PavRow[] }
    return groupAssigned(p.attributeValues ?? [], resolveGraftOrg(args, p.channelListings ?? []))
  },
}),
assignedAttribute: t.field({
  type: 'AssignedAttribute', nullable: true, subGraphs: ['public', 'org', 'admin'],
  description: 'A single assigned attribute by slug (PDP accessor).',
  args: { slug: t.arg.string({ required: true, description: '…' }), channel: t.arg.int({ required: false }), viewerOrg: t.arg.globalID({ for: 'Organization', required: false }) },
  authScopes: (_p, args) => graftAuthScopes(args),
  extensions: { pothosDrizzleSelect: { with: { channelListings: true, attributeValues: { with: ASSIGNED_WITH } } } },
  resolve: (product, args) => {
    const p = product as unknown as { channelListings?: GraftListing[], attributeValues?: PavRow[] }
    const org = resolveGraftOrg(args, p.channelListings ?? [])
    return groupAssigned(p.attributeValues ?? [], org).find(g => g.attribute.slug === args.slug) ?? null
  },
}),
```
- [ ] **Step 3: Variant fields** (in `variant.ts`): identical, but `with: { product: { with: { channelListings: true } }, attributeValues: { with: ASSIGNED_WITH } }` and `resolveGraftOrg(args, variant.product?.channelListings ?? [])`. (`PavRow` works for variant rows — same value relations.)
- [ ] **Step 4: REPLACE.** Delete the raw `attributeValues` `t.connection` from `product.ts` + `variant.ts`. KEEP `ProductAttributeValue`/`VariantAttributeValue` node types + their `BuilderSchemaObjects` entries. Remove now-dead imports (`resolveArrayConnection` etc.).
- [ ] **Step 5: Verify.** `check-types`; `lint --max-warnings 0`; `pnpm --filter @czo/product test src/e2e/subgraph-exposure.e2e.test.ts` (`assignedAttributes`/`assignedAttribute` on `/graphql/public`; raw `attributeValues` gone). **Run `pnpm --filter @czo/attribute build` first** if attribute GraphQL changed since the last build.

---

## Task 6: E2E — typed reads + migrate the C1/viewerOrg reads

**Files:** create `src/e2e/assigned-attributes.e2e.test.ts`; modify `product-global.e2e.test.ts`, `product-org.e2e.test.ts`, `channel-grafts.e2e.test.ts`.

- [ ] **Step 0:** `pnpm --filter @czo/attribute build` (the e2e harness imports attribute from `dist`).
- [ ] **Step 1: new typed e2e.** Seed a product (org A) with one value of EACH kind grafted (dropdown, swatch, numeric, boolean, date, text, file, reference — via the mutations/services `attribute-facets`/`channel-grafts` use; note `attributes.type` literal `NUMERIC`), published live on C. Anonymously via `channelProducts(channel: C)`:
  - `assignedAttributes(channel: C){ __typename attribute { name slug type } ... on AssignedDropdownAttribute { values { slug value } } ... on AssignedNumericAttribute { value } ... on AssignedSwatchAttribute { values { color } } ... on AssignedDateAttribute { value } ... on AssignedTextAttribute { plain } ... on AssignedFileAttribute { url } ... on AssignedReferenceAttribute { values { referenceId } } ... on AssignedBooleanAttribute { value } }` → each kind → its concrete type + value; `attribute { name slug }` resolves on `/graphql/public`.
  - `assignedAttribute(slug: "<color>", channel: C){ __typename ... on AssignedSwatchAttribute { values { slug } } }` → the one.
  - **No-leak:** a channel the product isn't live on → base/empty. **C1:** `assignedAttributes(viewerOrg: <A gid>)` anon → denied.
- [ ] **Step 2: migrate** existing reads: rewrite `attributeValues(viewerOrg:|channel:){ edges { node {…} } }` → `assignedAttributes(…){ __typename … }` in `product-global`/`product-org`/`channel-grafts`, preserving the assertions' intent (org value visible / denied / base-only). Do NOT weaken C1 assertions.
- [ ] **Step 3: Verify.** `pnpm --filter @czo/product test src/e2e/assigned-attributes.e2e.test.ts src/e2e/product-global.e2e.test.ts src/e2e/product-org.e2e.test.ts src/e2e/channel-grafts.e2e.test.ts` → all green.

---

## Task 7: Full validation + stage

- [ ] `pnpm --filter @czo/attribute build` (ensure dist fresh) → `pnpm --filter @czo/attribute test && pnpm --filter @czo/product test` → all pass.
- [ ] `pnpm --filter @czo/attribute check-types && pnpm --filter @czo/product check-types && pnpm --filter life check-types` → PASS.
- [ ] `pnpm --filter @czo/attribute lint --max-warnings 0 && pnpm --filter @czo/product lint --max-warnings 0` → PASS.
- [ ] `git add` the `@czo/attribute` + `@czo/product` changes (exclude `docs/superpowers/**`); report staged files + results; stop for user review. Do **not** commit.

---

## Self-review notes

- **No spike task:** the interface + cross-module + sub-graph-tagging pattern was spiked and PROVEN (findings at top); tasks copy the proven forms.
- **Module split:** types + value-node reuse + widening in `@czo/attribute` (T1,T2); field + load + graft-scoping + grouping in `@czo/product` (T3,T4,T5); seam = `AttributeAssignment` (exported by attribute, produced by product) + the cross-module `AssignedAttribute` ref registered in BOTH `BuilderSchemaObjects`.
- **Build step:** attribute GraphQL changes need `pnpm --filter @czo/attribute build` before product e2e/check (dist resolution) — in T2/T5/T6/T7.
- **Security:** identical to #149 — `channel`→public (org from live listing), `viewerOrg`→C1, base∪org filter; T6 asserts no-leak + C1. Widening value nodes to public exposes public values (fine on a PDP); their `node(id:)` guarding is the L1 follow-up.
- **No migration; no write-side change.** +2 relations follow #148.
- **Type consistency:** `AttributeAssignment` (attribute) is the single contract; `groupAssigned` (product) produces it; the 8 impls read it; `KIND_TYPENAME` strings == registered impl names. No `as any` at the cross-module seam (proven).
