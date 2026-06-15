# Product Catalog Reads — Per-Tier Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Split `productTypes`/`products`/`categories` (currently `['org','admin']` merged connections with a `viewerOrg` arg) into an **admin global-only** query (unqualified name, `['admin']`) + an **org** query (`organization*`, `['org']`, `organizationId` arg). Reuse the existing service `find*` methods and input types.

**Architecture:** Pure GraphQL-layer change in `queries.ts` (3 queries → 6). No new service methods, no new input/enum types, no migration. The merged `where` composition differs per half: admin = `{ organizationId: { isNull: true } }`; org = `mergeWhere(orgId)`.

**Spec:** `docs/superpowers/specs/2026-06-15-product-read-tier-split-design.md`

**Branch:** `feat/product-read-tier-split` off `main` (#144 merged). Stage only — no commits until user review.

---

## Task 1: Split the three reads in `queries.ts`

**Files:** Modify `src/graphql/schema/product/queries.ts`.

Read the current `productTypes` / `products` / `categories` `t.drizzleConnection`s first (post-#144). They share the shape: `subGraphs: ['org','admin']`, `viewerOrg` required arg, `authScopes` gating `product:read` in `viewerOrg`, base `mergeWhere(viewerOrgId(args))`, `search`/`where`/`orderBy`, `svc.find*(query({ where, orderBy: buildOrderBy(...) }))`, 3-position tag `['org','admin']`.

- [ ] **Step 1: `productTypes` → admin global-only.** Replace the existing `productTypes` query with:

```ts
  // ── productTypes — PLATFORM global-only connection (admin curation) ──────────
  builder.queryField('productTypes', t =>
    t.drizzleConnection({
      type: 'productTypes',
      subGraphs: ['admin'],
      description: 'Paginated (relay) connection over the GLOBAL (platform) product types, for platform curation, with optional free-text search, filtering, and ordering. Requires the global `product:read` role.',
      authScopes: { permission: { resource: 'product', actions: ['read'] } },
      args: {
        search: t.arg.string({ description: 'Free-text search across name and slug (case-insensitive substring).' }),
        where: t.arg({ type: 'ProductTypeWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['ProductTypeOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            const s = args.search?.trim()
            const searchClause = s ? { OR: [{ name: { ilike: `%${s}%` } }, { slug: { ilike: `%${s}%` } }] } : null
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const where = { AND: [{ organizationId: { isNull: true } }, userWhere, searchClause].filter(Boolean) }
            return yield* svc.findTypes(query({ where: where as any, orderBy: buildOrderBy(args.orderBy) }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['admin'] }, { subGraphs: ['admin'] }))
```

- [ ] **Step 2: add `organizationProductTypes` → org merged.** Immediately after, add:

```ts
  // ── organizationProductTypes — org connection (base ∪ org), org-gated ────────
  builder.queryField('organizationProductTypes', t =>
    t.drizzleConnection({
      type: 'productTypes',
      subGraphs: ['org'],
      description: 'Paginated (relay) connection over the product types visible to an org: the org\'s own merged with the global (platform) ones, with optional free-text search, filtering, and ordering. Requires `product:read` in the given org.',
      authScopes: (_parent, args) => ({ permission: { resource: 'product', actions: ['read'], organization: Number(args.organizationId.id) } }),
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose product types to list; global types are always included.' }),
        search: t.arg.string({ description: 'Free-text search across name and slug (case-insensitive substring).' }),
        where: t.arg({ type: 'ProductTypeWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['ProductTypeOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            const base = mergeWhere(Number(args.organizationId.id))
            const s = args.search?.trim()
            const searchClause = s ? { OR: [{ name: { ilike: `%${s}%` } }, { slug: { ilike: `%${s}%` } }] } : null
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const where = { AND: [base, userWhere, searchClause].filter(Boolean) }
            return yield* svc.findTypes(query({ where: where as any, orderBy: buildOrderBy(args.orderBy) }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['org'] }, { subGraphs: ['org'] }))
```

- [ ] **Step 3: `products` split** — same transform. Deltas: node `products`, service `ProductService.findProducts`, search OR-ilike across **`name` and `handle`**, input types `ProductWhereInput`/`ProductOrderByInput`. Admin: `products` (`['admin']`, global, `{ organizationId: { isNull: true } }`); org: `organizationProducts` (`['org']`, `organizationId` arg, `mergeWhere`).

- [ ] **Step 4: `categories` split** — same. Deltas: node `categories`, `CategoryService.findCategories`, search across **`name` and `slug`**, `CategoryWhereInput`/`CategoryOrderByInput`. Admin: `categories`; org: `organizationCategories`.

- [ ] **Step 5: imports.** `mergeWhere` is still needed (org halves); `viewerOrgId` may now be unused in `queries.ts` (the org halves use `Number(args.organizationId.id)` directly) — remove the import if so. Confirm `Effect`, the services, `buildOrderBy` imports are intact.

- [ ] **Step 6: check-types + schema build.** `pnpm --filter @czo/product check-types`; `pnpm --filter @czo/product test src/e2e/subgraph-exposure.e2e.test.ts` will FAIL until Task 3 (expected — the field lists changed). Run just `check-types` here → PASS.

---

## Task 2: Migrate the e2e call-sites

**Files:** Modify `src/e2e/list-connections.e2e.test.ts`.

- [ ] **Step 1:** The `productTypes(viewerOrg:$org, …)` usages (lines ~81/99/126 — an ORG user reading the merged catalog) must move to `organizationProductTypes(organizationId:$org, …)`. Replace `productTypes(viewerOrg:` → `organizationProductTypes(organizationId:` in the three query strings, and update the response path `data.productTypes` → `data.organizationProductTypes` accordingly. The seeding (global types via `createProductType`, org types via `createOrganizationProductType`) and the base∪org-through-paging assertion are unchanged (the org query still returns global ∪ org).

- [ ] **Step 2:** Grep the rest of `src/e2e` + `src/**` for any other org-perspective call of `productTypes(`/`products(`/`categories(` with a `viewerOrg` arg and migrate them to the `organization*` form. (The earlier scope found only `list-connections.e2e`; confirm none elsewhere.)

- [ ] **Step 3:** Run: `pnpm --filter @czo/product test src/e2e/list-connections.e2e.test.ts` → PASS.

---

## Task 3: Restructure the exposure E2E

**Files:** Modify `src/e2e/subgraph-exposure.e2e.test.ts`.

- [ ] **Step 1:** Today `ADMIN_READS` (9 names) is asserted present on BOTH `/graphql/org` and `/graphql/admin`. Restructure into three groups:

```ts
// Present on BOTH org + admin (single-row lookups + org-only-tier lists, unchanged tags).
const SHARED_READS = ['productType', 'product', 'category', 'collection', 'collections', 'adoptedProducts'] as const
// Admin global-only catalog reads (split — platform tier).
const ADMIN_ONLY_READS = ['productTypes', 'products', 'categories'] as const
// Org merged catalog reads (split — org tier).
const ORG_ONLY_READS = ['organizationProductTypes', 'organizationProducts', 'organizationCategories'] as const
```

- [ ] **Step 2:** Update the three assertion blocks:
  - **`/graphql/org`**: `SHARED_READS` ∪ `ORG_ONLY_READS` present; `ADMIN_ONLY_READS` absent.
  - **`/graphql/admin`**: `SHARED_READS` ∪ `ADMIN_ONLY_READS` present; `ORG_ONLY_READS` absent.
  - **`/graphql/public`**: all of `SHARED_READS` ∪ `ADMIN_ONLY_READS` ∪ `ORG_ONLY_READS` absent.

(Verify the current `collections`/`adoptedProducts` query tags are `['org','admin']` so they belong in `SHARED_READS`; if either is `['org']`-only, move it to an org-only group. Read the source to confirm.)

- [ ] **Step 3:** Run: `pnpm --filter @czo/product test src/e2e/subgraph-exposure.e2e.test.ts` → PASS.

---

## Task 4: Authz E2E (new)

**Files:** Create or extend an e2e (e.g. `src/e2e/read-tier-split.e2e.test.ts`, or add to `list-connections.e2e`).

- [ ] **Step 1:** Using the product e2e harness (same helpers `list-connections.e2e` uses to make a global-role user + an org user):
  - Seed a global product type + an org-1 product type.
  - **Admin global read**: a user with GLOBAL `product:read` queries `productTypes(first:50){ edges { node { id name } } }` → returns the global type, NOT the org-1 type.
  - **Org merged read**: an org-1 member queries `organizationProductTypes(organizationId: org1, first:50){ … }` → returns BOTH the global and the org-1 type (base∪org).
  - **Denial**: an org-1 member WITHOUT a global role queries `productTypes` (the admin query) → denied (errors / empty per the scope-auth behavior; assert the authz failure, matching how other admin-gated reads behave in the harness).

- [ ] **Step 2:** Run the new test → PASS.

---

## Task 5: Full validation

- [ ] `pnpm --filter @czo/product test` → all pass.
- [ ] `pnpm --filter @czo/product check-types && pnpm --filter life check-types` → PASS.
- [ ] `pnpm --filter @czo/product lint --max-warnings 0` → PASS (run `lint`, not `lint:fix` — the enum-ref `as any` casts must survive).
- [ ] `git add -A` excluding `docs/superpowers/**`; report staged files + results; stop for user review. Do **not** commit.

---

## Self-review notes

- **Spec coverage:** the 3 splits (T1), call-site migration (T2), exposure restructure (T3), authz e2e (T4), validation (T5).
- **No new types/services:** both halves reuse `find*` + the `*WhereInput`/`*OrderByInput` (already `['org','admin']`, covering both audiences). Confirmed in the spec.
- **Breaking change contained:** `productTypes`/`products`/`categories` lose `viewerOrg` and become admin-global-only; the only in-repo org callers are in `list-connections.e2e` (T2). Real clients must migrate to `organization*` — noted in the PR.
- **3-position sub-graph tag** on all 6 connections (admin halves `['admin']`, org halves `['org']`); the exposure E2E is the guard.
- **`as any`** only on the composed `where` (existing pattern); no new casts.
