# Product Filter Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn `ProductWhereInput` into a real storefront filter: `name`/`handle` (`StringFilterInput`) and `productType`/`categories`/`collections` (`IDFilterInput`, relay-globalID) — backed by a module-owned `buildProductWhere` translator that decodes globalIDs and maps to Drizzle RQBv2. (Attribute faceting is explicitly **out of scope** — it's cross-module into `@czo/attribute` and gets its own sprint.)

**Architecture:** `IDFilterInput` (kit) is consumed for the first time here; its `t.globalID()` fields decode to `{ typename, id }`, so a passthrough into Drizzle is impossible — a `buildProductWhere(input)` translator decodes + maps + recurses, and replaces the `userWhere as any` line in the three product list connections.

**Spec:** `docs/superpowers/specs/2026-06-16-product-filter-surface-design.md`

**Branch:** continue on `feat/productbyhandle-publication-filter`. Stage only — no commits until user review.

**Key facts (verified):**
- FK columns: `products.productTypeId`; relation `categories` → `productCategories.categoryId`; relation `collections` → `collectionProducts.collectionId`.
- `t.arg.globalID` / `t.globalID()` inputs decode to `{ typename, id }`; resolvers read `Number(x.id)` (`queries.ts:49,58,94`). Confirmed against `@pothos/plugin-relay@4.7.0`: `GlobalIDInputShape<T = string> = { [inputShapeKey]: { typename: string; id: T } }` — the input field's resolver-facing shape is `{ typename, id }`, **not** a string.
- `IDFilter`/`StringFilter`/`IntFilter` interfaces + `IDFilterInput`/`StringFilterInput` types are exported from `@czo/kit/graphql`; `IDFilterInput` is registered for all audiences (kit shared filter inputs). **Bug:** the kit `IDFilter` interface (builder.ts:647–651) declares `eq?: string` / `in?: string[]` / `notIn?: string[]`, but the runtime shape is `{ typename, id }`. `builder.inputRef<IDFilter>(…)` overrides Pothos's inference, so the lie compiles. Product is the first consumer → fix the kit interface (Task 0).
- No existing test filters by `productTypeId` (safe to remove from `ProductWhereInput`).
- `buildOrderBy` lives in `types/merge.ts`; the three list connections are `products`, `organizationProducts`, `channelProducts` in `queries.ts`.

---

## Task 0: Fix the kit `IDFilter` type lie (prerequisite)

`IDFilterInput`'s fields are `t.globalID()`/`t.globalIDList()`, which resolve to `{ typename, id }`, but `IDFilter` types them as `string`/`string[]`. Correct the interface so the first consumer (and all future ones) get honest types — no `as unknown` casts downstream.

**Files:** Modify `packages/kit/src/graphql/builder.ts`.

- [ ] **Step 1:** Add a shared decoded-id type and fix `IDFilter` (replace lines 647–651):

```ts
/** Runtime shape a relay `t.globalID()` input resolves to (decoded), per @pothos/plugin-relay `GlobalIDInputShape`. */
export interface GlobalIDValue {
  typename: string
  id: string
}

export interface IDFilter extends LogicalFilter<IDFilter> {
  eq?: GlobalIDValue | null
  in?: GlobalIDValue[] | null
  notIn?: GlobalIDValue[] | null
}
```

Leave `idFilterInputRef` (the `t.globalID()`/`t.globalIDList()` field builders) unchanged — only the TS interface was wrong.

- [ ] **Step 2: Verify the kit still builds** (the `inputRef<IDFilter>` override now matches reality, so this only tightens types): `pnpm --filter @czo/kit check-types` → PASS. If Pothos's `.implement()` now objects (it shouldn't — the explicit generic isn't cross-checked against field builders), fall back to branding `GlobalIDValue` via the relay `GlobalIDInputShape` import; otherwise no change needed.
- [ ] **Step 3:** Rebuild kit dist if the product e2e harness consumes the built artifact (the cross-package `@czo/kit/graphql` import resolves to `dist`): `pnpm --filter @czo/kit build`. (Established gotcha for E2E that boots modules against kit `dist`.)

No other module declares `IDFilterInput` in its `BuilderSchemaInputs`, so this change is scoped to kit + the product work in this plan.

---

## Task 1: Spike — confirm relational operator filters (gating)

**Files:** Create `packages/modules/product/src/services/product-where.spike.integration.test.ts`.

This gates the `categories`/`collections` design: operator filters (`{ in: [...] }`) **inside** a relational `where` (`{ categories: { categoryId: { in: […] } } }`) must resolve. Same class of bet as the adoptions spike, which proved scalar-equality relational where; this confirms the operator form. Use the existing `ProductPostgresLayer` + raw `db.query` (no GraphQL, no translator yet).

- [ ] **Step 1: Write the spike test.** Mirror the setup helpers in `packages/modules/product/src/services/product.integration.test.ts` (it boots `ProductPostgresLayer`, truncates, and has `DrizzleDb` + a product-type/product creator). Seed a product type `T`, two products `P_in`/`P_out`, and a `productCategories` row linking only `P_in` to `categoryId: 500`.

```ts
import { it } from '@effect/vitest'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { DrizzleDb } from '@czo/kit/testing'           // match product.integration.test.ts's import for the db tag
import { ProductPostgresLayer, truncateProduct } from '../testing/postgres'  // match the helper path used by product.integration.test.ts
import { productCategories, products, productTypes } from '../database/schema'

// NOTE: copy the exact db-tag + layer imports from product.integration.test.ts;
// the symbols above are indicative — align them with that file before running.

it.layer(ProductPostgresLayer)('RQBv2 product where contract', it => {
  it.effect('operator filter inside a relational where resolves', () =>
    Effect.gen(function* () {
      const db = yield* DrizzleDb
      yield* truncateProduct
      const [type] = yield* Effect.promise(() => db.insert(productTypes).values({ name: 'T', slug: 't', organizationId: null }).returning())
      const [pIn] = yield* Effect.promise(() => db.insert(products).values({ productTypeId: type.id, organizationId: null, handle: 'p-in', name: 'In' }).returning())
      yield* Effect.promise(() => db.insert(products).values({ productTypeId: type.id, organizationId: null, handle: 'p-out', name: 'Out' }).returning())
      yield* Effect.promise(() => db.insert(productCategories).values({ productId: pIn.id, categoryId: 500, organizationId: null }))

      const byCategory = yield* Effect.promise(() => db.query.products.findMany({
        where: { categories: { categoryId: { in: [500] } } },
      }))
      expect(byCategory.map(p => p.handle)).toEqual(['p-in'])
    }))
})
```

- [ ] **Step 2: Run it.** `pnpm --filter @czo/product test src/services/product-where.spike.integration.test.ts`
  - **Pass →** proceed; the `categories`/`collections` relational-filter design holds.
  - **Fail →** switch `categories`/`collections` to an `inArray(products.id, db.select({id: productCategories.productId}).from(productCategories).where(inArray(productCategories.categoryId, ids)))` subquery shape (Drizzle core) in Task 3 instead of the RQBv2 relational form.

- [ ] **Step 3:** Keep the test — it documents the guarantee the translator relies on.

---

## Task 2: WhereInput contract — TS interface + GraphQL registration

These two are coupled (Pothos checks `inputRef<ProductWhereInput>` fields against the interface), so they land together.

**Files:** Modify `packages/modules/product/src/graphql/index.ts`, `packages/modules/product/src/graphql/schema/product/inputs.ts`.

- [ ] **Step 1: `index.ts` — import kit filter types.** Change line 1 to add `IDFilter`, `StringFilter` (keep `IntFilter` — still used by `CategoryWhereInput.parentId`):

```ts
import type { BooleanFilter, IDFilter, IntFilter, OrderByInput, SchemaBuilder, StringFilter } from '@czo/kit/graphql'
```

- [ ] **Step 2: `index.ts` — replace the `ProductWhereInput` interface** (drop `productTypeId`; add the new fields):

```ts
export interface ProductWhereInput {
  name?: StringFilter | null
  handle?: StringFilter | null
  productType?: IDFilter | null
  categories?: IDFilter | null
  collections?: IDFilter | null
  AND?: ProductWhereInput[] | null
  OR?: ProductWhereInput[] | null
  NOT?: ProductWhereInput | null
}
```

(No `BuilderSchemaInputs` additions — the four kit filter inputs `StringFilterInput`/`IDFilterInput` are already registered by the kit.)

- [ ] **Step 3: `inputs.ts` — rewrite `ProductWhereInputRef`.** Replace the current `ProductWhereInputRef` block (lines 163–173) with:

```ts
  // ── products connection: filter + ordering inputs ───────────────────────────
  const ProductWhereInputRef = builder.inputRef<ProductWhereInput>('ProductWhereInput').implement({
    subGraphs: ['public', 'org', 'admin'],
    description: 'Filter predicate for the product connections. Field filters are AND-combined; use AND/OR/NOT to compose arbitrary boolean trees.',
    fields: t => ({
      name: t.field({ type: 'StringFilterInput', description: 'Filter by display name (base column; not locale-overlaid).' }),
      handle: t.field({ type: 'StringFilterInput', description: 'Filter by URL handle.' }),
      productType: t.field({ type: 'IDFilterInput', description: 'Filter by the referenced product type (relay id).' }),
      categories: t.field({ type: 'IDFilterInput', description: 'Filter to products assigned to the given categories (relay ids).' }),
      collections: t.field({ type: 'IDFilterInput', description: 'Filter to products in the given collections (relay ids).' }),
      AND: t.field({ type: [ProductWhereInputRef], description: 'All sub-predicates must match.' }),
      OR: t.field({ type: [ProductWhereInputRef], description: 'At least one sub-predicate must match.' }),
      NOT: t.field({ type: ProductWhereInputRef, description: 'The sub-predicate must not match.' }),
    }),
  })
```

(`StringFilterInput`/`IDFilterInput` are string-named kit types — referenced by name, like the existing `IntFilterInput`.)

- [ ] **Step 4: Verify.** `pnpm --filter @czo/product check-types` → PASS. `pnpm --filter @czo/product lint --max-warnings 0` → PASS. (Resolvers still passthrough `args.where as any` — runtime-incorrect for the new fields but exercised by no test until Task 5; Tasks 3–4 fix it.)

---

## Task 3: `buildProductWhere` translator

**Files:** Create `packages/modules/product/src/graphql/schema/product/types/where.ts`; create `packages/modules/product/src/graphql/schema/product/types/where.test.ts`.

- [ ] **Step 1: Write the failing test** (`where.test.ts`). The translator's input is the GraphQL-decoded runtime shape: `IDFilter` `eq`/`in`/`notIn` are `{ typename, id }` objects. Build inputs with `as any` to model that:

```ts
import { describe, expect, it } from 'vitest'
import { buildProductWhere } from './where'

const gid = (id: number) => ({ typename: 'X', id: String(id) })

describe('buildProductWhere', () => {
  it('passes StringFilters through unchanged', () => {
    expect(buildProductWhere({ name: { ilike: '%shirt%' } } as any)).toEqual({ name: { ilike: '%shirt%' } })
  })
  it('decodes productType IDFilter to an int filter on productTypeId', () => {
    expect(buildProductWhere({ productType: { in: [gid(5), gid(6)] } } as any))
      .toEqual({ productTypeId: { in: [5, 6] } })
  })
  it('maps categories/collections to relational exists with decoded ints', () => {
    expect(buildProductWhere({ categories: { eq: gid(9) } } as any))
      .toEqual({ categories: { categoryId: { eq: 9 } } })
    expect(buildProductWhere({ collections: { in: [gid(1)] } } as any))
      .toEqual({ collections: { collectionId: { in: [1] } } })
  })
  it('AND-combines multiple top-level fields', () => {
    expect(buildProductWhere({ name: { eq: 'a' }, productType: { eq: gid(3) } } as any))
      .toEqual({ AND: [{ name: { eq: 'a' } }, { productTypeId: { eq: 3 } }] })
  })
  it('recurses AND/OR/NOT', () => {
    expect(buildProductWhere({ OR: [{ handle: { eq: 'a' } }, { handle: { eq: 'b' } }] } as any))
      .toEqual({ OR: [{ handle: { eq: 'a' } }, { handle: { eq: 'b' } }] })
  })
  it('returns {} for an empty predicate', () => {
    expect(buildProductWhere({} as any)).toEqual({})
  })
})
```

- [ ] **Step 2: Run it → FAIL** (`buildProductWhere` not defined). `pnpm --filter @czo/product test src/graphql/schema/product/types/where.test.ts`

- [ ] **Step 3: Implement `where.ts`:**

```ts
import type { IDFilter } from '@czo/kit/graphql'
import type { ProductWhereInput } from '@czo/product/graphql'

// IDFilter.eq/in/notIn are the honest decoded `{ typename, id }` shape (kit Task 0).
function intFilterFromID(f: IDFilter): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (f.eq != null) out.eq = Number(f.eq.id)
  if (f.in != null) out.in = f.in.map(v => Number(v.id))
  if (f.notIn != null) out.notIn = f.notIn.map(v => Number(v.id))
  return out
}

/**
 * Translate a `ProductWhereInput` (GraphQL) into a Drizzle RQBv2 `where`.
 * StringFilters pass through (their operator names already match RQBv2);
 * IDFilters decode their relay globalIDs to ints and map to the FK column
 * (`productType`) or a relational exists (`categories`/`collections`);
 * AND/OR/NOT recurse. Field filters are AND-combined.
 */
export function buildProductWhere(input: ProductWhereInput): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = []

  if (input.name != null) clauses.push({ name: input.name })
  if (input.handle != null) clauses.push({ handle: input.handle })
  if (input.productType != null) clauses.push({ productTypeId: intFilterFromID(input.productType) })
  if (input.categories != null) clauses.push({ categories: { categoryId: intFilterFromID(input.categories) } })
  if (input.collections != null) clauses.push({ collections: { collectionId: intFilterFromID(input.collections) } })
  if (input.AND != null) clauses.push({ AND: input.AND.map(buildProductWhere) })
  if (input.OR != null) clauses.push({ OR: input.OR.map(buildProductWhere) })
  if (input.NOT != null) clauses.push({ NOT: buildProductWhere(input.NOT) })

  if (clauses.length === 0) return {}
  if (clauses.length === 1) return clauses[0]
  return { AND: clauses }
}
```

(If Task 1 chose the `inArray(subquery)` fallback for facets/relations, implement those branches with Drizzle core helpers instead — keep the same function shape and tests' expected *semantics*, adjusting the expected output objects accordingly.)

- [ ] **Step 4: Run → PASS.** `pnpm --filter @czo/product test src/graphql/schema/product/types/where.test.ts`; `pnpm --filter @czo/product check-types`.

---

## Task 4: Wire the translator into the three connections

**Files:** Modify `packages/modules/product/src/graphql/schema/product/queries.ts`.

- [ ] **Step 1: Import the translator** (top of `queries.ts`, near the `buildOrderBy` import from `./types/merge`):

```ts
import { buildProductWhere } from './types/where'
```

- [ ] **Step 2: Replace the `userWhere` line in each of the three product list connections** — `products` (~179), `organizationProducts` (~206), `channelProducts` (~239). Change:

```ts
const userWhere = (args.where ?? null) as Record<string, unknown> | null
```

to:

```ts
const userWhere = args.where ? buildProductWhere(args.where) : null
```

Leave the surrounding `where = { AND: [ …base/live…, userWhere, searchClause ].filter(Boolean) }` and `where: where as any` exactly as-is. (Do **not** touch the `productTypes`/`organizationProductTypes`/`categories`/`collections`/taxonomy connections — they use other where inputs.)

- [ ] **Step 3: Verify.** `pnpm --filter @czo/product check-types`; `pnpm --filter @czo/product lint --max-warnings 0`; `pnpm --filter @czo/product test src/e2e/subgraph-exposure.e2e.test.ts` (schema still builds; `ProductWhereInput` now carries the new fields on `/graphql/public`).

---

## Task 5: E2E — filter behaviours

**Files:** Create `packages/modules/product/src/e2e/product-filters.e2e.test.ts`.

Reuse the product e2e harness (`packages/modules/product/src/e2e/harness.ts`; see `channel-products.e2e.test.ts` for the create-org + create-product-type + create-product + `publishProduct` flow, and `decodeGlobalID`/`n` for ids). All assertions go through the public `channelProducts(channel:, where:)` connection (publication-gated, anonymous).

- [ ] **Step 1: Seed** on one org + channel `C` (publish each so it's live on `C`):
  - product types `T1`, `T2`;
  - `prod-a`: type `T1`, handle `prod-a`, name `Alpha Shirt`, category `Cat1`, collection `Col1`;
  - `prod-b`: type `T2`, handle `prod-b`, name `Beta Shoe`, category `Cat2`;
  - (categories/collections created via the existing org mutations the other e2e specs use — category-assign/collection-add; mirror their exact mutation names from `channel-products`/`product-org` specs).

- [ ] **Step 2: Assert each filter** (anonymous `channelProducts(channel: C, where: …){ edges { node { handle } } }`), capturing the relay globalIDs of `T1`/`Cat1`/`Col1` from the seed responses:
  - `where: { productType: { eq: <T1 gid> } }` → `[prod-a]`.
  - `where: { categories: { in: [<Cat1 gid>] } }` → `[prod-a]`.
  - `where: { collections: { eq: <Col1 gid> } }` → `[prod-a]`.
  - `where: { handle: { eq: "prod-b" } }` → `[prod-b]`.
  - `where: { name: { ilike: "%shirt%" } }` → `[prod-a]`.
  - **Compound (AND):** `where: { productType: { eq: <T1 gid> }, handle: { eq: "prod-b" } }` → `[]` (no product is both).

- [ ] **Step 3: Run → PASS.** `pnpm --filter @czo/product test src/e2e/product-filters.e2e.test.ts`. (If a seed mutation name is uncertain, grep the other e2e specs — do not invent mutation names.)

---

## Task 6: Full validation

- [ ] `pnpm --filter @czo/product test` → all pass (existing suite + spike + translator + filters e2e).
- [ ] `pnpm --filter @czo/kit check-types && pnpm --filter @czo/product check-types && pnpm --filter life check-types` → PASS.
- [ ] `pnpm --filter @czo/product lint --max-warnings 0` → PASS (run `lint`, not `lint:fix`). Kit changed too: `pnpm --filter @czo/kit lint --max-warnings 0`.
- [ ] `git add` the kit `builder.ts` + the product module changes (exclude `docs/superpowers/**`); report staged files + results; stop for user review. Do **not** commit.

---

## Self-review notes

- **Spec coverage:** kit `IDFilter` fix (T0), translator + `IDFilterInput` WhereInput (T2–T3), the 3-connection rewire (T4), spike gate (T1), validation (T6). `name`/`handle`/`productType`/`categories`/`collections` filters (T2/T3/T5). **Attribute faceting is deliberately out of scope** (cross-module into `@czo/attribute`; own sprint).
- **Kit type fix (T0) is a real bug, not cosmetic:** `IDFilter` claimed `string` while `t.globalID()` resolves to `{typename,id}`; a naive `Number(filter.eq)` would be `NaN`. Fixed at source so T3's translator (and any future consumer) reads `.id` honestly with no casts.
- **First `IDFilterInput` consumer:** the translator is the whole reason it's needed — `t.globalID()` decode ≠ Drizzle FK int. T3 extracts `{typename,id}`→`Number(id)` against the now-honest kit type.
- **Graft nuance (categories):** a public categories filter matches any-org categorisation of an already-public product — accepted in the spec; precise per-publishing-org scoping waits on the `listing.organizationId` resolver sprint.
- **Risk:** the spike (T1). If RQBv2 rejects operator filters inside a relational where, T3's `categories`/`collections` switch to an `inArray(subquery)` shape — same function shape, same test semantics.
- **No migration; no authz change** (filters narrow an already-authorised/published result set).
