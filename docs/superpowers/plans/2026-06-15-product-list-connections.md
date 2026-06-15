# Product Top-Level Lists → Relay Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Convert `@czo/product`'s seven top-level list queries from plain `['T']` arrays to `drizzleConnection`s with full inventory parity (relay pagination + per-entity `WhereInput` + `OrderByInput` + `search`).

**Architecture:** Mirror the inventory pattern exactly: each list → `t.drizzleConnection`, with a per-entity `WhereInput` (kit shared filter inputs + AND/OR/NOT) and `OrderByInput` (OrderField enum + direction), and a query-accepting `find*(config)` service method. The base∪org merge moves from the service into the resolver's composed `where` (as the graft `relatedConnection`s already do).

**Tech Stack:** Drizzle RQBv2, Pothos `@pothos/plugin-drizzle` `drizzleConnection` + `@pothos/plugin-sub-graph`, Effect-TS, Vitest + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-06-15-product-list-connections-design.md`

**Reference implementations to read first:** `packages/modules/inventory/src/graphql/schema/inventory/queries.ts` (`inventoryItems` `drizzleConnection`), `.../inventory/inputs.ts` (`InventoryItemWhereInput` + `InventoryItemOrderByInput` + Zod guard), `packages/modules/inventory/src/graphql/index.ts` (the `InventoryItemWhereInput` TS interface + builder map entry), `InventoryService.findItems` (the `FindManyConfig`-accepting method). The kit shared filter inputs (`StringFilterInput`/`IntFilterInput`/`BooleanFilterInput`/`IDFilterInput`) are registered + sub-graph-tagged centrally (`packages/kit/src/graphql/builder.ts`).

**Branch:** `feat/product-list-connections` off `main`. Stage only — no commits until user review.

---

## Task 1: `adoptedProducts` relational-`where` spike

**Files:** none (a throwaway probe).

- [ ] **Step 1:** Determine whether Drizzle RQBv2 `where` on `products` supports a relational predicate selecting products adopted by an org. Read `src/database/relations.ts` for the `products ↔ productOrgAdoptions` relation name (e.g. `adoptions`), then write a tiny probe (a `scratchpad/` `.ts` run with `node`, or a temporary `it.effect` against the test layer) doing `db.query.products.findMany({ where: { adoptions: { /* relational filter */ organizationId: <org> } } })`. RQBv2 relational filters use the `RelationsFilter` shape — confirm the exact syntax that returns only adopted products.

- [ ] **Step 2: Record the verdict** in this plan (edit Task 7): **(a)** relational `where` works → `adoptedProducts` converts to `drizzleConnection({ type: 'products', … })` with the adoption predicate as its base clause; **(b)** it doesn't → `adoptedProducts` stays a plain `['Product']` list (documented exclusion), and Task 7 is skipped. Delete the probe.

---

## Task 2: Reference implementation — `productTypes` (merged) end-to-end

This task establishes the full pattern (input types + TS interface + service `find*` + connection + 3-position tag). Later tasks replicate it with deltas.

**Files:** `src/graphql/schema/product/inputs.ts`, `src/graphql/index.ts`, `src/services/product-type.ts`, `src/graphql/schema/product/queries.ts`, test `src/services/product-type.integration.test.ts`.

- [ ] **Step 1: TS interface + builder map** (`src/graphql/index.ts`) — mirror inventory's `InventoryItemWhereInput`:

```ts
export interface ProductTypeWhereInput {
  isShippingRequired?: { equals?: boolean | null } | null   // or the kit BooleanFilterInput shape
  AND?: ProductTypeWhereInput[] | null
  OR?: ProductTypeWhereInput[] | null
  NOT?: ProductTypeWhereInput | null
}
```
Add `ProductTypeWhereInput: ProductTypeWhereInput` to the builder `Inputs`/SchemaTypes map (the same block where inventory adds its entry; find the equivalent in product's `graphql/index.ts`). Use the EXACT field shape of the kit `BooleanFilterInput` TS type (read it) rather than the sketch above.

- [ ] **Step 2: Input types** (`inputs.ts`) — add to `registerProductInputs`:

```ts
  const ProductTypeWhereInputRef = builder.inputRef<ProductTypeWhereInput>('ProductTypeWhereInput').implement({
    subGraphs: ['org', 'admin'],
    description: 'Filter predicate for the `productTypes` connection. Field filters are AND-combined; use AND/OR/NOT to compose.',
    fields: t => ({
      isShippingRequired: t.field({ type: 'BooleanFilterInput', description: 'Filter by shipping-required.' }),
      AND: t.field({ type: [ProductTypeWhereInputRef], description: 'All sub-predicates must match.' }),
      OR: t.field({ type: [ProductTypeWhereInputRef], description: 'At least one sub-predicate must match.' }),
      NOT: t.field({ type: ProductTypeWhereInputRef, description: 'The sub-predicate must not match.' }),
    }),
  })

  const ProductTypeOrderFieldRef = builder.enumType('ProductTypeOrderField', {
    subGraphs: ['org', 'admin'],
    description: 'Sortable fields of a product type.',
    values: { name: { value: 'name' }, createdAt: { value: 'createdAt' } } as const,
  })
  builder.enumType('ProductTypeOrderDirection', {                 // or reuse a shared OrderDirection if one exists — check inventory
    subGraphs: ['org', 'admin'],
    description: 'Sort direction.',
    values: { asc: { value: 'asc' }, desc: { value: 'desc' } } as const,
  })
  builder.inputType('ProductTypeOrderByInput', {
    subGraphs: ['org', 'admin'],
    description: 'One ordering clause for the `productTypes` connection.',
    fields: t => ({
      field: t.field({ type: ProductTypeOrderFieldRef, required: true, description: 'Field to sort by.' }),
      direction: t.field({ type: 'ProductTypeOrderDirection', required: true, description: 'asc or desc.' }),
    }),
  })
```
Follow inventory's exact structure (incl. its Zod enum guard if it has one). Reuse a shared `OrderDirection` enum if inventory does; otherwise per-entity as above.

- [ ] **Step 3: Service `findTypes`** (`product-type.ts`) — mirror `InventoryService.findItems`:

```ts
type FindTypesConfig = Parameters<Database<Relations>['query']['productTypes']['findMany']>[0]
// contract:
  readonly findTypes: (config: FindTypesConfig) => Effect.Effect<ReadonlyArray<ProductType>, ProductTypeDbFailed>
// impl:
  const findTypes: ProductTypeServiceImpl['findTypes'] = config =>
    dbErr(db.query.productTypes.findMany(config)) as Effect.Effect<ReadonlyArray<ProductType>, ProductTypeDbFailed>
```
Keep the existing `listTypes(orgId)` ONLY if another caller still needs it (grep; the `productTypes` query is its caller — once converted, remove `listTypes` if unused). Export `findTypes`.

- [ ] **Step 4: The connection** (`queries.ts`) — replace the `productTypes` `t.field({ type: ['ProductType'], … })` with the `t.drizzleConnection({ … }, { subGraphs }, { subGraphs })` form from the spec (base `mergeWhere(viewerOrgId(args))`, `search` over name+slug via `ilike`, compose `{ AND: [...].filter(Boolean) }`, `orderBy` mapping with `createdAt desc` default, 3-position sub-graph tag `['org','admin']`). Import `mergeWhere`, `viewerOrgId` from `./types/merge` (or wherever they're exported).

- [ ] **Step 5: Service test** — add a `findTypes` test: seed a global + an org-1 type, call `findTypes({ where: mergeWhere(1), orderBy: { createdAt: 'desc' } })`, assert it returns both (base∪org).

- [ ] **Step 6: Verify.** `pnpm --filter @czo/product check-types`; `pnpm --filter @czo/product test src/e2e/subgraph-exposure.e2e.test.ts` (schema builds + `ProductTypeConnection`/`Edge` + the inputs resolve); `lint --max-warnings 0`.

---

## Task 3: `products` + `categories` (merged, replicate Task 2)

**Per-entity deltas** (everything else identical to Task 2):

| | `products` | `categories` |
|---|---|---|
| node / service | Product / ProductService | Category / CategoryService |
| sub-graphs | `['org','admin']` | `['org','admin']` |
| base clause | `mergeWhere(viewerOrg)` | `mergeWhere(viewerOrg)` |
| search (ilike OR) | name, handle | name, slug |
| WhereInput fields | `productTypeId` (IntFilterInput); add `status` only if the column exists | `parentId` (IntFilterInput) |
| OrderField | name, createdAt | name, position, createdAt |
| service method | `findProducts(config)` (replaces/augments the `products`-query service call) | `findCategories(config)` |

- [ ] **Step 1:** For each, add the `*WhereInput` (TS interface + `inputRef` + builder map), `*OrderField`/`*OrderByInput`, the `find*(config)` service method, and the `drizzleConnection` (3-position tag). Remove the superseded `list*`/old resolver service call if unused.
- [ ] **Step 2:** Service tests for `findProducts`/`findCategories` (merge predicate returns base∪org).
- [ ] **Step 3:** check-types + exposure e2e + lint.

---

## Task 4: `collections` (org-scoped) + `adoptedProducts` (per Task 1 spike)

| | `collections` | `adoptedProducts` |
|---|---|---|
| node / service | Collection / CollectionService | Product / AdoptionService (or ProductService) |
| sub-graphs | (preserve current) | `['org','admin']` |
| base clause | `{ organizationId: <viewerOrg> }` | adoption relation predicate (Task 1) |
| search | name, slug | name, handle |
| WhereInput | — (omit `where` arg, or empty) | `productTypeId` (IntFilterInput) |
| OrderField | name, createdAt | name, createdAt |

- [ ] **Step 1: `collections`** — convert to `drizzleConnection` with the org-scope base clause. (If you give it no filterable fields, you may omit the `where` arg + WhereInput and keep just `search` + `orderBy`.)
- [ ] **Step 2: `adoptedProducts`** — **SPIKE VERDICT (Task 1): relational `where` IS supported.** Convert to `drizzleConnection({ type: 'products', … })` with base clause `{ adoptions: { organizationId: <viewerOrg>, deletedAt: { isNull: true } }, deletedAt: { isNull: true } }` (the `many`-relation filter has "exists" semantics → products adopted by the org). The resolver runs `ProductService.findProducts(query({ where, orderBy }))` (reuse the Task 3 `products` connection's `findProducts` + WhereInput/OrderBy, since the node is `Product`). It does NOT need the `AdoptionService.listAdoptedProducts` path anymore (keep that method only if another caller uses it).
- [ ] **Step 3:** service `find*` methods as needed + tests; check-types + exposure e2e + lint.

---

## Task 5: `taxonomyRequests` (admin) + `organizationTaxonomyRequests` (org)

These are the simplest (no merge; enum filters). `TaxonomyRequestService.listForAdmin(state?)` / `listForOrg(orgId)` → `findRequests(config)`.

| | `taxonomyRequests` | `organizationTaxonomyRequests` |
|---|---|---|
| sub-graphs | `['admin']` | `['org']` |
| base clause | — | `{ organizationId }` |
| WhereInput | `kind`, `entityType`, `state` (enum-equals — the enum refs added in S1/S2) | `kind`, `state` (enum-equals) |
| OrderField | createdAt | createdAt |
| search | — | — |

- [ ] **Step 1:** Add `TaxonomyRequestWhereInput` (enum fields take the enum ref directly for equals; AND/OR/NOT) + `TaxonomyRequestOrderByInput`, both tagged `['org','admin']` (referenced by both queries). Add `findRequests(config)` to `TaxonomyRequestService` (replacing `listForAdmin`/`listForOrg`; the `state` arg folds into the WhereInput). Convert both queries to `drizzleConnection` with their respective scope clauses + the 3-position tag (admin / org).
- [ ] **Step 2:** Update the S1 service tests that asserted `listForAdmin`/`listForOrg` to the new `findRequests` shape (or keep thin wrappers). check-types + the taxonomy exposure e2e + lint.

---

## Task 6: Exposure E2E + pagination E2E + full validation

**Files:** `src/e2e/subgraph-exposure.e2e.test.ts` (+ the taxonomy exposure file), and a new or extended e2e for pagination.

- [ ] **Step 1: Exposure** — assert each converted query is still present on its sub-graphs (now as a connection field) and the generated `*Connection`/`*Edge`/`*WhereInput`/`*OrderByInput` types are present on the right audiences and absent from `public`.
- [ ] **Step 2: Pagination/filter E2E** — for at least `productTypes` (merged) and `taxonomyRequests` (filtered): seed > pageSize rows, query `{ <name>(first: 2, …, orderBy, where, search) { edges { node { id } } pageInfo { hasNextPage endCursor } } }`, assert pagination + filter + search + order + (for merged) base∪org + tenant scoping.
- [ ] **Step 3: Full validation.** `pnpm --filter @czo/product test`; `pnpm --filter @czo/product check-types && pnpm --filter life check-types`; `pnpm --filter @czo/product lint --max-warnings 0`. `git add -A` excluding `docs/superpowers/**`; report; stop for user review. Do **not** commit.

---

## Self-review notes

- **Spec coverage:** spike (T1), the full pattern incl. input types + service `find*` + connection + 3-position tag (T2), the merged catalog (T3), org-scoped + adopted (T4), taxonomy (T5), exposure + pagination + validation (T6). All seven queries covered.
- **Reuse:** kit shared filter inputs (`StringFilterInput`/`IntFilterInput`/`BooleanFilterInput`) are central — no per-module filter-input work; each entity only adds its own `WhereInput`/`OrderByInput` composing them.
- **Risk flagged:** `adoptedProducts` relational `where` (T1 spike gates T4 Step 2); the `products.status` field (include only if the column exists). Each `list*(orgId)` removal is gated on a caller audit.
- **3-position sub-graph tag** on every `drizzleConnection` (connection + edge positional args) — the silent-drop guard is the exposure E2E.
- **No migration; no `.graphql` codegen** (Pothos code-first).
