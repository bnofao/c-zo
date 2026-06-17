# Attribute Faceting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Facet products by attribute + typed value — `attributes: [ProductAttributeWhereInput!]` on `ProductWhereInput`, resolved through new cross-module RQBv2 relations from `productAttributeValues` into the `@czo/attribute` tables, inside the existing synchronous `buildProductWhere`.

**Architecture (Approach 1):** Add 7 outbound relations on `productAttributeValues` (→ `attributes` + the 6 typed value tables) using product's existing cross-module-relation mechanism (the `organizations` precedent). Each facet → one exists clause on the `attributeValues` relation, with a `valueKind` discriminator. No async, no new attribute services.

**Spec:** `docs/superpowers/specs/2026-06-16-attribute-faceting-design.md`

**Depends on:** the **product-filter-surface** sprint (`ProductWhereInput` + `buildProductWhere` + kit `IDFilter`/`GlobalIDValue`). Land that first; this extends both.

**Branch:** a new branch off the filter-surface work (or off `main` once it merges). Stage only — no commits until user review.

**Key facts (verified):**
- Attribute tables are in the global `SchemaRegistryShape` (`@czo/attribute/schema` augmentation): `attributes`, `attributeValues`, `attributeSwatchValues`, `attributeNumericValues`, `attributeBooleanValues`, `attributeDateValues`, `attributeReferenceValues`.
- Columns: `attributes`(`id`,`slug`,`name`,`isFilterable`,`organizationId`); `attributeValues`/`attributeSwatchValues`(`id`,`attributeId`,`slug`,**`value`**); `attributeNumericValues`/`attributeBooleanValues`/`attributeDateValues`(`id`,`attributeId`,**`value`**); `attributeReferenceValues`(`id`,`attributeId`,`slug`,`value`,`referenceId`). **The value tables have NO `name` column** — the display label is `value`. So GraphQL facet `name` → DB column `value`.
- `product_attribute_values`: `productId`,`organizationId`,`attributeId`,`valueId`,`valueKind`,`position`,`deletedAt`. `valueKind` enum: `VALUE, SWATCH, REFERENCE, TEXT, NUMERIC, BOOLEAN, DATE, FILE`. `valueId` is unique only within a kind's table → every value clause is paired with a `valueKind` equality.
- Cross-module relations precedent: `products.organization → organizations` via `Pick<SchemaRegistryShape,…>` + `import '@czo/auth/schema'` + `defineRelationsPart`. Product defines only outbound relations; target-table bodies stay in their own module's part.
- **Tests for this sprint use `ProductAttributeLayer` + `truncateProductAttribute` from `src/testing/cross-module-postgres.ts`** (boots auth+attribute+price+inventory+channel+product tables with **merged relations** = `productRelations(mergedSchema)`), NOT the product-only `ProductPostgresLayer`.
- `buildProductWhere` + `intFilterFromID` live in `src/graphql/schema/product/types/where.ts` (from the filter-surface sprint). `StringFilter`/`FloatFilter`/`BooleanFilter`/`TimeFilter`/`IntFilter`/`IDFilter` are exported from `@czo/kit/graphql`; their `Input` types are registered across audiences.

---

## Task 1: Cross-module attribute relations on `productAttributeValues`

**Files:** Modify `packages/modules/product/src/database/relations.ts`.

- [ ] **Step 1: Side-effect import** the attribute registry augmentation (next to the existing `import '@czo/auth/schema'`):

```ts
import '@czo/attribute/schema'
```

- [ ] **Step 2: Add the seven keys to the `Pick<SchemaRegistryShape, …>`** (`ProductSchema`):

```ts
  | 'attributes'
  | 'attributeValues'
  | 'attributeSwatchValues'
  | 'attributeNumericValues'
  | 'attributeBooleanValues'
  | 'attributeDateValues'
  | 'attributeReferenceValues'
```

- [ ] **Step 3: Destructure them** in `productRelations` and **add them to the `defineRelationsPart` first argument** (the `{ …tables }` object) — same list, mirroring how `organizations` appears in both places.

- [ ] **Step 4: Add the seven outbound relations** to the existing `productAttributeValues` relation body (currently just `product`):

```ts
      productAttributeValues: {
        product: r.one.products({ from: r.productAttributeValues.productId, to: r.products.id }),
        attribute: r.one.attributes({ from: r.productAttributeValues.attributeId, to: r.attributes.id }),
        selectValue: r.one.attributeValues({ from: r.productAttributeValues.valueId, to: r.attributeValues.id }),
        swatchValue: r.one.attributeSwatchValues({ from: r.productAttributeValues.valueId, to: r.attributeSwatchValues.id }),
        numericValue: r.one.attributeNumericValues({ from: r.productAttributeValues.valueId, to: r.attributeNumericValues.id }),
        booleanValue: r.one.attributeBooleanValues({ from: r.productAttributeValues.valueId, to: r.attributeBooleanValues.id }),
        dateValue: r.one.attributeDateValues({ from: r.productAttributeValues.valueId, to: r.attributeDateValues.id }),
        referenceValue: r.one.attributeReferenceValues({ from: r.productAttributeValues.valueId, to: r.attributeReferenceValues.id }),
      },
```

Do **not** add relation bodies for the attribute tables themselves (they're targets; their relations live in `@czo/attribute`'s part, merged by `defineRelationsPart` — exactly like `organizations`).

- [ ] **Step 5: Verify.** `pnpm --filter @czo/product check-types` → PASS (the `Pick` resolves the new keys via the augmentation; `db.query.productAttributeValues` gains the relations). `pnpm --filter @czo/product lint --max-warnings 0`.

---

## Task 2: Spike — cross-module relational `where` (gating)

**Files:** Create `packages/modules/product/src/services/attribute-facet.spike.integration.test.ts`.

Proves the three RQBv2 behaviours the translator relies on, against a real DB with the Task 1 relations. Uses `ProductAttributeLayer` + `truncateProductAttribute`.

- [ ] **Step 1: Write the spike.** Seed via raw inserts: one product type; one attribute `color` (`isFilterable: true`) with a `VALUE` row `red` and a `SWATCH` row `blue`; one attribute `weight` (`isFilterable: true`) with a `NUMERIC` value `60`; products `P_red_heavy` (color=red VALUE + weight=60 NUMERIC), `P_red_only` (color=red VALUE), `P_blue` (color=blue SWATCH) — each with the matching `product_attribute_values` rows (`valueKind` set correctly, `valueId` = the seeded value row id).

```ts
import { it } from '@effect/vitest'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { DrizzleDb } from '@czo/kit/db'
import {
  attributeNumericValues, attributes, attributeSwatchValues, attributeValues,
} from '@czo/attribute/schema'
import { ProductAttributeLayer, truncateProductAttribute } from '../testing/cross-module-postgres'
import { productAttributeValues, products, productTypes } from '../database/schema'

it.layer(ProductAttributeLayer, { timeout: 120_000 })('attribute facet RQBv2 contract', it => {
  it.effect('cross-module relational where + facet AND + slug OR across VALUE/SWATCH', () =>
    Effect.gen(function* () {
      const db = yield* DrizzleDb
      yield* truncateProductAttribute
      const [type] = yield* Effect.promise(() => db.insert(productTypes).values({ name: 'T', slug: 't', organizationId: null }).returning())
      const [color] = yield* Effect.promise(() => db.insert(attributes).values({ name: 'Color', slug: 'color', type: 'DROPDOWN', isFilterable: true, organizationId: null }).returning())
      const [weight] = yield* Effect.promise(() => db.insert(attributes).values({ name: 'Weight', slug: 'weight', type: 'NUMERIC', isFilterable: true, organizationId: null }).returning())
      const [red] = yield* Effect.promise(() => db.insert(attributeValues).values({ attributeId: color.id, slug: 'red', value: 'Red', organizationId: null }).returning())
      const [blue] = yield* Effect.promise(() => db.insert(attributeSwatchValues).values({ attributeId: color.id, slug: 'blue', value: 'Blue', organizationId: null }).returning())
      const [w60] = yield* Effect.promise(() => db.insert(attributeNumericValues).values({ attributeId: weight.id, value: 60, organizationId: null }).returning())

      const mk = (handle: string) => db.insert(products).values({ productTypeId: type.id, organizationId: null, handle, name: handle }).returning()
      const [pRH] = yield* Effect.promise(() => mk('p-red-heavy'))
      const [pR] = yield* Effect.promise(() => mk('p-red-only'))
      const [pB] = yield* Effect.promise(() => mk('p-blue'))
      yield* Effect.promise(() => db.insert(productAttributeValues).values([
        { productId: pRH.id, organizationId: null, attributeId: color.id, valueId: red.id, valueKind: 'VALUE', position: 0 },
        { productId: pRH.id, organizationId: null, attributeId: weight.id, valueId: w60.id, valueKind: 'NUMERIC', position: 1 },
        { productId: pR.id, organizationId: null, attributeId: color.id, valueId: red.id, valueKind: 'VALUE', position: 0 },
        { productId: pB.id, organizationId: null, attributeId: color.id, valueId: blue.id, valueKind: 'SWATCH', position: 0 },
      ]))

      // (1) nested cross-module relational where (numeric range)
      const heavy = yield* Effect.promise(() => db.query.products.findMany({
        where: { attributeValues: { attribute: { isFilterable: true }, valueKind: 'NUMERIC', numericValue: { value: { gte: 50 } } } },
      }))
      expect(heavy.map(p => p.handle)).toEqual(['p-red-heavy'])

      // (2) facet AND across two exists on the same relation (red AND heavy)
      const redHeavy = yield* Effect.promise(() => db.query.products.findMany({
        where: { AND: [
          { attributeValues: { valueKind: 'VALUE', selectValue: { slug: { eq: 'red' } } } },
          { attributeValues: { valueKind: 'NUMERIC', numericValue: { value: { gte: 50 } } } },
        ] },
      }))
      expect(redHeavy.map(p => p.handle)).toEqual(['p-red-heavy'])

      // (3) slug OR across VALUE + SWATCH (red is VALUE, blue is SWATCH)
      const colored = yield* Effect.promise(() => db.query.products.findMany({
        where: { attributeValues: { OR: [
          { valueKind: 'VALUE', selectValue: { slug: { in: ['red'] } } },
          { valueKind: 'SWATCH', swatchValue: { slug: { in: ['blue'] } } },
        ] } },
      }))
      expect(colored.map(p => p.handle).sort()).toEqual(['p-blue', 'p-red-heavy', 'p-red-only'])
    }))
})
```

(Align the `attributes.type` enum literal — `'DROPDOWN'`/`'NUMERIC'` — and any other NOT-NULL columns with `@czo/attribute/schema`; adjust before running.)

- [ ] **Step 2: Run it.** `pnpm --filter @czo/product test src/services/attribute-facet.spike.integration.test.ts`
  - **Pass →** Approach 1 holds; proceed.
  - **(1) fails** (plugin-drizzle can't traverse the cross-module relation in a `where`) → **STOP, report.** Switch to **Approach 2** (two-phase async): the translator's faceting branch moves into the resolver as an Effect that resolves each facet to `valueId`s via the attribute module, then filters by `attributeValues: { valueId: { in } }`. Input/GraphQL surface unchanged. (Re-plan Tasks 3–4 accordingly.)

- [ ] **Step 3:** Keep the test — it documents the cross-module `where` contract.

---

## Task 3: GraphQL inputs + TS interfaces

**Files:** Modify `packages/modules/product/src/graphql/index.ts`, `packages/modules/product/src/graphql/schema/product/inputs.ts`.

- [ ] **Step 1: `index.ts` — add `FloatFilter`, `TimeFilter` to the kit import** (the others — `StringFilter`, `IDFilter`, `IntFilter` — are already imported from the filter-surface sprint):

```ts
import type { BooleanFilter, FloatFilter, IDFilter, IntFilter, OrderByInput, SchemaBuilder, StringFilter, TimeFilter } from '@czo/kit/graphql'
```

- [ ] **Step 2: `index.ts` — add the two facet interfaces** (above `ProductWhereInput`) and **add the `attributes` field** to `ProductWhereInput`:

```ts
export interface ProductAttributeValueWhere {
  slug?: StringFilter | null
  name?: StringFilter | null     // maps to the value tables' `value` column
  numeric?: FloatFilter | null
  boolean?: BooleanFilter | null
  date?: TimeFilter | null
  reference?: IntFilter | null
}

export interface ProductAttributeWhere {
  slug?: StringFilter | null
  name?: StringFilter | null
  ids?: IDFilter | null
  value?: ProductAttributeValueWhere | null
}
```

In `ProductWhereInput`, add `attributes?: ProductAttributeWhere[] | null`.

- [ ] **Step 3: `index.ts` — register both inputs in `BuilderSchemaInputs`:**

```ts
    ProductAttributeWhereInput: ProductAttributeWhere
    ProductAttributeValueWhereInput: ProductAttributeValueWhere
```

- [ ] **Step 4: `inputs.ts` — register both input types before `ProductWhereInputRef`, and add the `attributes` field to it.** Insert above the `ProductWhereInputRef` block:

```ts
  const ProductAttributeValueWhereInputRef = builder.inputType('ProductAttributeValueWhereInput', {
    subGraphs: ['public', 'org', 'admin'],
    description: 'Typed predicate on an attribute value. Set one selector: `slug`/`name` (select & swatch values), `numeric`, `boolean`, `date`, or `reference`.',
    fields: t => ({
      slug: t.field({ type: 'StringFilterInput', description: 'Match the value slug (select/swatch).' }),
      name: t.field({ type: 'StringFilterInput', description: 'Match the value display label (select/swatch).' }),
      numeric: t.field({ type: 'FloatFilterInput', description: 'Match a numeric value (supports ranges).' }),
      boolean: t.field({ type: 'BooleanFilterInput', description: 'Match a boolean value.' }),
      date: t.field({ type: 'TimeFilterInput', description: 'Match a date/datetime value (supports ranges).' }),
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
```

Then add to the `ProductWhereInputRef` `fields` (alongside `productType`/`categories`/`collections`):

```ts
      attributes: t.field({ type: [ProductAttributeWhereInputRef], description: 'Facet by attributes and their typed values. Each entry is one facet; entries are AND-ed. Only `isFilterable` attributes match.' }),
```

- [ ] **Step 5: Verify.** `pnpm --filter @czo/product check-types` → PASS. `pnpm --filter @czo/product lint --max-warnings 0` → PASS. (`buildProductWhere` doesn't yet read `attributes` — added next; harmless until then.)

---

## Task 4: `buildProductWhere` faceting branch

**Files:** Modify `packages/modules/product/src/graphql/schema/product/types/where.ts`; modify `packages/modules/product/src/graphql/schema/product/types/where.test.ts`.

- [ ] **Step 1: Add failing tests** (`where.test.ts`) — model the decoded runtime shape with `as any` for `ids`:

```ts
  it('builds a numeric-range facet with valueKind + isFilterable injected', () => {
    expect(buildProductWhere({ attributes: [{ slug: { eq: 'weight' }, value: { numeric: { gte: 50 } } }] } as any))
      .toEqual({ attributeValues: { attribute: { isFilterable: true, slug: { eq: 'weight' } }, valueKind: 'NUMERIC', numericValue: { value: { gte: 50 } }, deletedAt: { isNull: true } } })
  })
  it('builds a slug facet as an OR across VALUE and SWATCH', () => {
    expect(buildProductWhere({ attributes: [{ value: { slug: { in: ['red'] } } }] } as any))
      .toEqual({ attributeValues: { attribute: { isFilterable: true }, deletedAt: { isNull: true }, OR: [
        { valueKind: 'VALUE', selectValue: { slug: { in: ['red'] } } },
        { valueKind: 'SWATCH', swatchValue: { slug: { in: ['red'] } } },
      ] } })
  })
  it('maps name to the value column, decodes attribute ids, and ANDs multiple facets', () => {
    const g = (n: number) => ({ typename: 'Attribute', id: String(n) })
    expect(buildProductWhere({ attributes: [
      { ids: { in: [g(7)] }, value: { boolean: { eq: true } } },
      { value: { name: { eq: 'Red' } } },
    ] } as any)).toEqual({ AND: [
      { attributeValues: { attribute: { isFilterable: true, id: { in: [7] } }, valueKind: 'BOOLEAN', booleanValue: { value: { eq: true } }, deletedAt: { isNull: true } } },
      { attributeValues: { attribute: { isFilterable: true }, deletedAt: { isNull: true }, OR: [
        { valueKind: 'VALUE', selectValue: { value: { eq: 'Red' } } },
        { valueKind: 'SWATCH', swatchValue: { value: { eq: 'Red' } } },
      ] } },
    ] })
  })
  it('builds an attribute-only facet (no value)', () => {
    expect(buildProductWhere({ attributes: [{ slug: { eq: 'color' } }] } as any))
      .toEqual({ attributeValues: { attribute: { isFilterable: true, slug: { eq: 'color' } }, deletedAt: { isNull: true } } })
  })
```

- [ ] **Step 2: Run → FAIL.** `pnpm --filter @czo/product test src/graphql/schema/product/types/where.test.ts`

- [ ] **Step 3: Implement.** Add the facet builder to `where.ts` and call it from `buildProductWhere`. Add `ProductAttributeWhere` to the import from `@czo/product/graphql`.

```ts
function attributeFacetClause(facet: ProductAttributeWhere): Record<string, unknown> {
  const attribute: Record<string, unknown> = { isFilterable: true }
  if (facet.slug != null) attribute.slug = facet.slug
  if (facet.name != null) attribute.name = facet.name
  if (facet.ids != null) attribute.id = intFilterFromID(facet.ids)

  const av: Record<string, unknown> = { attribute, deletedAt: { isNull: true } }
  const v = facet.value
  if (v != null) {
    if (v.numeric != null) { av.valueKind = 'NUMERIC'; av.numericValue = { value: v.numeric } }
    else if (v.boolean != null) { av.valueKind = 'BOOLEAN'; av.booleanValue = { value: v.boolean } }
    else if (v.date != null) { av.valueKind = 'DATE'; av.dateValue = { value: v.date } }
    else if (v.reference != null) { av.valueKind = 'REFERENCE'; av.referenceValue = { referenceId: v.reference } }
    else if (v.slug != null || v.name != null) {
      const sel: Record<string, unknown> = {}
      const sw: Record<string, unknown> = {}
      if (v.slug != null) { sel.slug = v.slug; sw.slug = v.slug }
      if (v.name != null) { sel.value = v.name; sw.value = v.name } // value tables: display column is `value`
      av.OR = [
        { valueKind: 'VALUE', selectValue: sel },
        { valueKind: 'SWATCH', swatchValue: sw },
      ]
    }
  }
  return { attributeValues: av }
}
```

In `buildProductWhere`, after the `collections` clause and before `AND`:

```ts
  if (input.attributes != null)
    for (const facet of input.attributes) clauses.push(attributeFacetClause(facet))
```

- [ ] **Step 4: Run → PASS.** `pnpm --filter @czo/product test src/graphql/schema/product/types/where.test.ts`; `pnpm --filter @czo/product check-types`.

(No connection changes — the three list connections already feed `args.where` through `buildProductWhere`; the `attributes` field flows automatically.)

---

## Task 5: E2E — faceting through `channelProducts`

**Files:** Create `packages/modules/product/src/e2e/attribute-facets.e2e.test.ts`.

Reuse the product e2e harness (`harness.ts` boots the attribute + product modules + GraphQL). Seed via the real mutations — grep the existing specs for exact names (do not invent): attribute + value creation (`@czo/attribute` mutations — `createAttribute`/`createOrganizationAttribute`, value/swatch/numeric create), and product attribute assignment (`assignProductAttributeValue` or equivalent — confirm in `attribute-assignment` specs), plus the `channel-products`/`product-org` create-product + `publishProduct` flow.

- [ ] **Step 1: Seed** one org + channel `C` (publish each product live on `C`):
  - filterable attribute `color` with select value `red` and swatch value `blue`; filterable attribute `weight` (numeric);
  - a **non-filterable** attribute `internal` with a value `x`;
  - `prod-rh`: color=red, weight=60, internal=x;
  - `prod-r`: color=red;
  - `prod-b`: color=blue.

- [ ] **Step 2: Assert** (anonymous `channelProducts(channel: C, where: { attributes: [...] }){ edges { node { handle } } }`), capturing attribute relay ids from the seed responses where needed:
  - `attributes: [{ slug: { eq: "color" }, value: { slug: { in: ["red"] } } }]` → `[prod-r, prod-rh]`.
  - `attributes: [{ slug: { eq: "color" }, value: { slug: { in: ["blue"] } } }]` → `[prod-b]` (swatch via the VALUE∪SWATCH OR).
  - **Facet AND:** `attributes: [{ slug:{eq:"color"}, value:{slug:{in:["red"]}} }, { slug:{eq:"weight"}, value:{ numeric:{ gte: 50 } } }]` → `[prod-rh]` only.
  - **Numeric range:** `attributes: [{ slug:{eq:"weight"}, value:{ numeric:{ lt: 50 } } }]` → `[]`.
  - **Attribute-only:** `attributes: [{ slug: { eq: "color" } }]` → `[prod-r, prod-rh, prod-b]`.
  - **`ids`:** `attributes: [{ ids: { eq: "<color attr gid>" } }]` → same as attribute-only color.
  - **isFilterable gate:** `attributes: [{ slug: { eq: "internal" } }]` → `[]` (non-filterable attribute matches nothing).

- [ ] **Step 3: Run → PASS.** `pnpm --filter @czo/product test src/e2e/attribute-facets.e2e.test.ts`.

---

## Task 6: Full validation

- [ ] `pnpm --filter @czo/product test` → all pass (existing + spike + translator + facets e2e).
- [ ] `pnpm --filter @czo/product check-types && pnpm --filter life check-types` → PASS.
- [ ] `pnpm --filter @czo/product lint --max-warnings 0` → PASS (run `lint`, not `lint:fix`).
- [ ] `git add` the product module changes (exclude `docs/superpowers/**`); report staged files + results; stop for user review. Do **not** commit.

---

## Self-review notes

- **Spec coverage:** relations (T1), spike gate + Approach-2 fallback (T2), inputs/interfaces (T3), translator faceting branch incl. valueKind map + slug/name VALUE∪SWATCH OR + isFilterable injection + attribute-only + facet-AND (T4), e2e incl. isFilterable gate (T5), validation (T6).
- **`name` → `value` column:** the value tables have no `name`; the display label is `value`. The translator maps facet `name` → `selectValue.value`/`swatchValue.value` (T1 fact, T4 code, T4 test).
- **`valueKind` discriminator** guards the cross-table `valueId` collision — present in every value clause (T4) and proven in the spike (T2).
- **No new migration** (relations are type-level + RQBv2 config; inputs are GraphQL-only). **No authz change** (facets narrow an already-authorised/published set). `isFilterable` is enforced by injection, not auth.
- **Shared input → faceting on all three connections** for free; e2e exercises `channelProducts`.
- **Risk:** the spike (T2). If plugin-drizzle can't resolve the nested cross-module `where`, fall back to two-phase async (Approach 2) with the same GraphQL surface.
- **Dependency:** requires the filter-surface sprint's `where.ts`/`ProductWhereInput`/kit `IDFilter` fix already in place.
