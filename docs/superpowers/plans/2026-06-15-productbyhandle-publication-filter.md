# `productByHandle` Publication Filter + `variants` Un-graft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (1) `findProductByHandle` returns a product only if it has a live channel listing (publication filter — closes the cross-tenant draft leak). (2) Un-graft `Product.variants` (drop `viewerOrg`/`graftAuthScopes`/`mergeWhere` — variants are a mirror, the filter is redundant and, once (1) lands, no longer load-bearing).

**Architecture:** Two small code changes (service `where` + one graft field) + a focused test migration. No migration; no new types.

**Spec:** `docs/superpowers/specs/2026-06-15-productbyhandle-publication-filter-design.md`

**Branch:** `feat/productbyhandle-publication-filter` off `main`. Stage only — no commits until user review.

---

## Task 1: Publication filter on `findProductByHandle`

**Files:** Modify `src/services/product.ts`.

- [ ] **Step 1:** In `findProductByHandle` (≈ line 109), add the live-listing relational predicate to the `where`:

```ts
  const findProductByHandle: ProductServiceImpl['findProductByHandle'] = ({ orgId, handle }) =>
    Effect.gen(function* () {
      const orgWhere = orgId === null
        ? { organizationId: { isNull: true as const } }
        : { organizationId: orgId }
      const row = yield* dbErr(db.query.products.findFirst({
        where: {
          ...orgWhere,
          handle,
          deletedAt: { isNull: true },
          channelListings: {                         // publication: ≥1 live listing
            isPublished: true,
            reviewState: 'approved',
            deletedAt: { isNull: true },
          },
        },
      }))
      if (!row)
        return yield* Effect.fail(new ProductNotFound({ id: -1 }))
      return row as Product
    })
```

`products.channelListings` is an existing relation; RQBv2 relational `where` is confirmed (the `adoptions` spike). `'approved'` is the literal for `reviewState` (own-channel listings default to it).

- [ ] **Step 2: Update the `productByHandle` GraphQL description** (`src/graphql/schema/product/queries.ts`) to state it returns only **published** products (live on a channel); `viewerOrg` is now a disambiguator, not a draft-access grant. No authScopes change (stays public).

- [ ] **Step 3: Service test** — add to `product.integration.test.ts`: seed a product + a live listing (via the channel-listing service / `publish`), assert `findProductByHandle` returns it; seed a product with NO listing (or an unpublished one), assert it fails `ProductNotFound`. (Reuse the channel-listing test helpers — `makeChannel`/`publish` — as the channel-listing integration test does.)

- [ ] **Step 4: Verify.** `pnpm --filter @czo/product check-types`; `pnpm --filter @czo/product test src/services/product.integration.test.ts`.

---

## Task 2: Un-graft `Product.variants`

**Files:** Modify `src/graphql/schema/product/types/product.ts`.

- [ ] **Step 1:** Replace the `variants` relatedConnection with the un-grafted form:

```ts
      variants: t.relatedConnection('variants', {
        subGraphs: ['public', 'org', 'admin'],
        description: 'Purchasable variants of this product (scoped via the product relation; excludes soft-deleted rows).',
        query: { where: { deletedAt: { isNull: true } } },
      }, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),
```

Removes the `viewerOrg` arg, the `authScopes: graftAuthScopes`, and the `mergeWhere(viewerOrgId(args))`. `query` is now a static object (no `args` closure). Leave every OTHER graft (`attributeValues`, `media`, `categories`, and `ProductVariant`'s `priceSet`/`inventoryItems`/`attributeValues`/`media`) UNCHANGED — they keep their `viewerOrg`/merge (true overlays).

- [ ] **Step 2:** If `viewerOrgId` / `mergeWhere` / `graftAuthScopes` become unused in `product.ts` after this, leave the imports if other grafts in the same file still use them (they do — `attributeValues`/`media`/`categories`). Confirm no dangling import.

- [ ] **Step 3: Verify.** `pnpm --filter @czo/product check-types`; `pnpm --filter @czo/product test src/e2e/subgraph-exposure.e2e.test.ts` (schema builds; `variants` still present on its sub-graphs, just without the arg).

---

## Task 3: Test migration + new e2e

**Files:** Modify `src/e2e/product-global.e2e.test.ts`; add a new e2e (e.g. `src/e2e/productbyhandle-publication.e2e.test.ts`).

### 3a. Migrate the C1 tests (`product-global.e2e.test.ts`, ≈ lines 375–445)

The C1 tests read `global-shirt`'s grafts via the public `productByHandle`. Two effects:

- **Publication filter:** `global-shirt` must now be **published** (a live listing) or `productByHandle` returns `null` and every C1 test breaks. In the test setup where `global-shirt` is created, add a live listing for it (an org adopts it then `publishProduct` with `isPublished:true`; the marketplace review then needs approval, OR publish on an org-owned channel where `reviewState` defaults `approved`). Use whatever the existing harness exposes; the goal is `global-shirt` has one live listing.
- **`variants` un-graft:** the `readAGrafts` query's `variants(viewerOrg:$a){ … }` must drop the arg → `variants{ … }` (the arg no longer exists — leaving it is a GraphQL validation error). Keep the **inner** `priceSet(viewerOrg:$a)` / `inventoryItems(viewerOrg:$a)` args (those grafts are unchanged).

- [ ] **Step 1: Rewrite `readAGrafts`'s query** — `variants(viewerOrg:$a)` → `variants`. Keep `attributeValues(viewerOrg:$a)` and the inner `priceSet(viewerOrg:$a)`/`inventoryItems(viewerOrg:$a)`.

- [ ] **Step 2: Update the C1 assertions.** The protected overlays are now `attributeValues` (on the product) and `priceSet`/`inventoryItems` (on each variant) — NOT `variants` itself (base data, now public):
  - **`c1: org-B …` / `c1: unauthenticated …`** (deny): keep `expect(res.errors).toBeDefined()` and `attributeValues … toBeNull()`. REMOVE the `variants ?? null).toBeNull()` assertion; instead assert the overlay is still denied — e.g. the returned variant nodes' `priceSet` is null (the `priceSet(viewerOrg:A)` graft denied for B/anon). (Variants themselves may now be present as base nodes — that is correct and not a leak.)
  - **`c1: viewerOrg OMITTED → public base read`**: `variants{ edges { node { organizationId } } }` now returns base variants (org null) without the arg — assert it's present and all `organizationId === null` (no A variants exist anyway). attributeValues assertions unchanged.
  - **`c1: org A passing viewerOrg=A → grafts visible`**: still passes (A sees its attributeValues + its variants' priceSet); just the `variants` arg is gone from the query.

- [ ] **Step 3:** Run `pnpm --filter @czo/product test src/e2e/product-global.e2e.test.ts` → PASS (adjust the publication seeding / assertions until green; do NOT weaken the overlay-deny assertions).

### 3b. New publication-filter + variants-visibility e2e

- [ ] **Step 4:** New `productbyhandle-publication.e2e.test.ts` (reuse the product e2e harness):
  - **Draft hidden:** create an org-owned product with handle `pub-draft` (no listing) → `productByHandle(handle:"pub-draft", viewerOrg:<org>)` returns `null`. (Even the owning org's token sees null via this public endpoint — it's the published-catalog read.)
  - **Published shown + variants visible:** create an org-owned product with a variant, `publishProduct` it on the org's channel (live), then anonymously `productByHandle(handle, viewerOrg:<org>){ id variants{ edges { node { id sku } } } }` → product returned, its variant present (proves both the publication filter AND that an org-owned product's variants are now publicly visible — the bug we set out to fix).
  - **No draft leak across tenants:** org A's unpublished product is not returned to anyone via `productByHandle(handle, viewerOrg=A)`.

- [ ] **Step 5:** Run the new test → PASS.

---

## Task 4: Full validation

- [ ] `pnpm --filter @czo/product test` → all pass.
- [ ] `pnpm --filter @czo/product check-types && pnpm --filter life check-types` → PASS.
- [ ] `pnpm --filter @czo/product lint --max-warnings 0` → PASS.
- [ ] `git add -A` excluding `docs/superpowers/**`; report staged files + results; stop for user review. Do **not** commit.

---

## Self-review notes

- **Spec coverage:** publication filter (T1), variants un-graft (T2), C1 migration + new e2e (T3), validation (T4).
- **Contained scope:** only `Product.variants` is un-grafted; every true-overlay graft keeps its `viewerOrg`/merge. The storefront thus shows an org-owned product's variants but not yet its prices/media publicly — documented as the next B19 piece.
- **Security:** `productByHandle` stays anonymous; publication (live listing) is the gate. C1 overlay protection (attributeValues/priceSet/inventoryItems) is unchanged. The variants un-graft is safe because reaching a product now requires it be published (T1) and the `ProductVariant` node-guard still gates `node(id:)`.
- **Risk flagged:** the C1 test rewrite is the fiddly part — the `variants` arg removal + asserting the overlay deny (not the variants deny). Seeding `global-shirt` as published is required for those tests to run at all.
