# Channel-Scoped Storefront Grafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add `channel: Int` to the 6 product/variant graft fields so a public `channelProducts(channel)` read resolves each product's overlays (price/media/attributeValues/categories/inventory) for its **publishing org** (`listing.organizationId` for that channel), gated only by publication — without `viewerOrg`/C1.

**Architecture:** Derive the org per product from its live listing (loaded via `pothosDrizzleSelect`); `channel`-path auth is public (safe — org comes strictly from the listing). The 5 `relatedConnection` grafts become custom `t.connection` resolvers (in-memory `resolveArrayConnection`) since `relatedConnection.query` is sync + parent-blind and can't derive org from `channel`. `priceSet` (already a custom resolve) just gains the channel branch.

**Spec:** `docs/superpowers/specs/2026-06-16-listing-org-resolver-design.md`

**Branch:** new `feat/channel-graft-resolver` off `main`. Stage only — no commits until user review.

**Key facts (verified):**
- 6 grafts: `Product.{media, attributeValues, categories}` + `ProductVariant.{priceSet, attributeValues, inventoryItems}` (`product.ts`, `variant.ts`). `priceSet` is already a custom `t.field`; the other 5 are `relatedConnection`.
- Helpers in `types/merge.ts`: `viewerOrgId`, `graftAuthScopes`, `mergeWhere`. `priceSet` loads `priceSets` via `extensions: { pothosDrizzleSelect: { with: { priceSets: true } } }` and filters in JS.
- `at most one live listing per (productId, channelId)` (unique partial index); live = `isPublished && reviewState='approved' && deletedAt IS NULL`.
- **Unproven in this repo (→ spike T1):** any custom `t.connection`; `resolveArrayConnection` (re-exported from `@czo/kit/graphql`, zero usages); nested `pothosDrizzleSelect` `with: { product: { with: { channelListings: true } } }` (only single-level exists).
- `relatedConnection` tags sub-graphs via 3 positional opts (field, connection, edge); the channel arg is a raw `Int` (matches `channelProducts(channel: Int!)`).

---

## Task 1: Spike — prove the custom-connection graft pattern + nested listing load (GATE)

The whole sprint depends on three unproven primitives. Prove them end-to-end on a **scratch field** before reworking real fields. Do NOT touch the 6 real grafts here.

**Files:** temporarily add a scratch field to `packages/modules/product/src/graphql/schema/product/types/product.ts`; a scratch e2e `packages/modules/product/src/e2e/graft-connection.spike.e2e.test.ts`. Both REMOVED at the end of the task (mirror to `old/` if helpful) — the deliverable is the proven pattern recorded in the task notes.

- [ ] **Step 1 — custom in-memory connection over a drizzleNode type, sub-graph tagged.** Add a scratch field on `Product` that returns a relay connection of `ProductMedia` built from an in-memory array via `resolveArrayConnection`, tagged `['public','org','admin']`:

```ts
import { resolveArrayConnection } from '@czo/kit/graphql'
// …in Product fields:
mediaSpike: t.connection({
  type: 'ProductMedia',                  // the drizzleNode type name (string ref)
  subGraphs: ['public', 'org', 'admin'],
  args: { channel: t.arg.int({ required: false }) },
  extensions: { pothosDrizzleSelect: { with: { media: true, channelListings: true } } },
  resolve: (product, args) => {
    const rows = (product as any).media ?? []
    return resolveArrayConnection({ args }, rows)
  },
}, { subGraphs: ['public', 'org', 'admin'] }, { subGraphs: ['public', 'org', 'admin'] }),
```

Verify it type-checks and the schema builds. **If `t.connection` rejects the 3-position sub-graph opts or the string node-type ref**, discover the correct surface (check `@pothos/plugin-relay` `t.connection` signature + how `relatedConnection` passes its 3 opts) and record the working form. **If `resolveArrayConnection({ args }, rows)` is the wrong call shape**, find the right one (the Pothos relay signature) and record it.

- [ ] **Step 2 — nested `pothosDrizzleSelect` on the variant.** Add a scratch field on `ProductVariant` with `extensions: { pothosDrizzleSelect: { with: { product: { with: { channelListings: true } } } } }` and in `resolve` read `(variant as any).product?.channelListings`. Confirm the listings load (length > 0 for a published variant). **If nested `with` doesn't load**, record it — the fallback is a per-request dataloader keyed `(productId, channelId) → organizationId` (variant carries `productId` via `select: true`; the resolve is async-capable). Decide which the real tasks will use.

- [ ] **Step 3 — e2e the scratch fields.** In the scratch e2e (reuse the `channel-products`/`harness` setup): seed an org product with media + a live listing on channel C, publish it, then query the scratch fields anonymously via `channelProducts`. Assert the `mediaSpike` connection returns the rows with working `pageInfo` (try `first: 1` → 1 edge + `hasNextPage`), and that the variant scratch field sees the loaded listings.

- [ ] **Step 4 — record + clean up.** Write the PROVEN patterns into this task's completion notes (the exact `t.connection` call incl. sub-graph tagging, the `resolveArrayConnection` call shape, and the variant listing-load mechanism: nested-`with` or dataloader). Then DELETE both scratch additions (the field and the spike e2e). Run `pnpm --filter @czo/product check-types` to confirm the deletions leave a clean tree.

- [ ] **Step 5 — gate.** If any primitive can't be made to work: STOP and report. Fallbacks to consider (in order): (a) custom connection via the discovered API; (b) variant org via dataloader instead of nested `with`; (c) if `t.connection` sub-graph tagging is impossible, expose channel grafts as plain `[Node!]` list fields instead of connections (escalate to the user — this changes the spec's API shape).

---

## Task 2: Shared helpers — `resolveGraftOrg` + channel-aware `graftAuthScopes`

**Files:** `packages/modules/product/src/graphql/schema/product/types/merge.ts`; new `merge.test.ts` in the same dir.

- [ ] **Step 1: Write failing unit tests** (`merge.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { graftAuthScopes, resolveGraftOrg } from './merge'

const live = (channelId: number, organizationId: number | null) => ({ channelId, organizationId, isPublished: true, reviewState: 'approved', deletedAt: null })

describe('resolveGraftOrg', () => {
  it('channel → the live listing org for that channel', () => {
    expect(resolveGraftOrg({ channel: 7 }, [live(7, 42), live(9, 99)])).toBe(42)
  })
  it('channel with no live listing → null', () => {
    expect(resolveGraftOrg({ channel: 7 }, [live(9, 99)])).toBeNull()
    expect(resolveGraftOrg({ channel: 7 }, [{ ...live(7, 42), reviewState: 'pending' }])).toBeNull()
  })
  it('no channel → viewerOrg fallback', () => {
    expect(resolveGraftOrg({ viewerOrg: { id: '5' } }, [])).toBe(5)
    expect(resolveGraftOrg({}, [])).toBeNull()
  })
  it('channel wins over viewerOrg', () => {
    expect(resolveGraftOrg({ channel: 7, viewerOrg: { id: '5' } }, [live(7, 42)])).toBe(42)
  })
})

describe('graftAuthScopes', () => {
  it('channel path is public', () => {
    expect(graftAuthScopes({ channel: 7 })).toBe(true)
  })
  it('viewerOrg omitted is public; supplied requires product:read in that org', () => {
    expect(graftAuthScopes({})).toBe(true)
    expect(graftAuthScopes({ viewerOrg: { id: '5' } })).toEqual({ permission: { resource: 'product', actions: ['read'], organization: 5 } })
  })
})
```

- [ ] **Step 2: Run → FAIL.** `pnpm --filter @czo/product test src/graphql/schema/product/types/merge.test.ts`

- [ ] **Step 3: Implement in `merge.ts`.** Add a `GraftArgs` shape and `resolveGraftOrg`; extend `graftAuthScopes` to take `channel`. Keep `viewerOrgId`/`mergeWhere` as-is (still used by the viewerOrg paths internally).

```ts
export interface GraftListing { channelId: number, organizationId: number | null, isPublished: boolean, reviewState: string, deletedAt: Date | null }
export interface GraftArgs { viewerOrg?: { id: string } | null, channel?: number | null }

/** Derive the viewer org for a graft read; channel (via live listing) wins over viewerOrg. */
export function resolveGraftOrg(args: GraftArgs, listings: ReadonlyArray<GraftListing>): number | null {
  if (args.channel != null) {
    const hit = listings.find(l => l.channelId === args.channel && l.isPublished && l.reviewState === 'approved' && l.deletedAt == null)
    return hit?.organizationId ?? null
  }
  return args.viewerOrg ? Number(args.viewerOrg.id) : null
}
```
Update `graftAuthScopes(args: GraftArgs)` to `if (args.channel != null) return true` before the existing `viewerOrg` logic. (Keep the existing return type union; add `true` is already in it.)

- [ ] **Step 4: Run → PASS** + `pnpm --filter @czo/product check-types`. (Existing graft fields still pass `graftAuthScopes(args)` where `args` has no `channel` — `channel` is optional, so no caller breaks yet.)

---

## Task 3: `priceSet(channel)` — the critical, low-cost graft

**Files:** `packages/modules/product/src/graphql/schema/product/types/variant.ts`.

- [ ] **Step 1: Add the `channel` arg + load the product's listings + derive org via `resolveGraftOrg`.** Update the `priceSet` field (currently `variant.ts:75-90`):
  - args: add `channel: t.arg.int({ required: false, description: 'Storefront channel; resolves the price binding of the org that published this product on the channel. Public — publication is the gate.' })`.
  - `authScopes`: `(_p, args) => graftAuthScopes(args)` (now channel-aware).
  - `extensions.pothosDrizzleSelect`: load the product's listings alongside `priceSets`, per the variant listing-load mechanism PROVEN in Task 1 (nested `with: { priceSets: true, product: { with: { channelListings: true } } }`, OR keep `with: { priceSets: true }` and use the dataloader fallback for the org).
  - `resolve`: `const org = resolveGraftOrg(args, <loaded product.channelListings>)`; `if (org == null) return null`; `return (variant.priceSets ?? []).find(r => r.organizationId === org) ?? null`. (If using the dataloader fallback, `resolve` becomes async: `const org = args.channel != null ? await loader.load(...) : viewerOrgId(args)`.)

- [ ] **Step 2: Verify.** `check-types`; `lint --max-warnings 0`; run the existing variant/price e2e/integration (`price-binding.integration.test.ts`, `product-org.e2e.test.ts`) → still green (viewerOrg path unchanged).

---

## Task 4: Variant connection grafts → custom connection (`attributeValues`, `inventoryItems`)

**Files:** `variant.ts`. Apply the **Task 1-proven** `t.connection` + `resolveArrayConnection` pattern, with the variant listing-load mechanism from Task 1.

For EACH of the two fields, convert the `relatedConnection` to a custom `t.connection`:
- `args`: existing `viewerOrg` + new `channel: t.arg.int({ required: false })`.
- `authScopes`: `(_p, args) => graftAuthScopes(args)`.
- `extensions.pothosDrizzleSelect`: load the graft rows + the product's listings (per Task 1).
- `resolve`: `const org = resolveGraftOrg(args, <product.channelListings>)`; filter the loaded rows; `return resolveArrayConnection({ args }, filtered)`.
  - **`attributeValues`** — filter base ∪ org: `rows.filter(r => r.organizationId == null || r.organizationId === org)`, ordered by `position` (sort the array). (Matches old `mergeWhere` + `orderBy position asc`.)
  - **`inventoryItems`** — pure org: `org == null ? [] : rows.filter(r => r.organizationId === org)`. (Matches old `organizationId == null ? {-1} : org`.)
- Keep `subGraphs: ['public','org','admin']` on the field + connection + edge (3-position).

- [ ] **Step 1:** Convert `attributeValues`.
- [ ] **Step 2:** Convert `inventoryItems`.
- [ ] **Step 3: Verify.** `check-types`; `lint --max-warnings 0`; `pnpm --filter @czo/product test src/e2e/product-org.e2e.test.ts src/e2e/product-global.e2e.test.ts` → green (the `viewerOrg` path returns the same rows; pagination is now in-memory — confirm the C1 assertions and the variant graft reads still pass; adjust the e2e query shape ONLY if a field arg/selection changed, never to weaken an assertion).

---

## Task 5: Product connection grafts → custom connection (`media`, `attributeValues`, `categories`)

**Files:** `product.ts`. Same proven pattern; the parent IS the product, so load listings single-level: `extensions: { pothosDrizzleSelect: { with: { <graft>: true, channelListings: true } } }`.

For each field: `args` (+`channel`), `authScopes: graftAuthScopes(args)`, derive `org = resolveGraftOrg(args, product.channelListings)`, filter, `resolveArrayConnection({ args }, filtered)`:
- **`media`** — base ∪ org AND non-deleted: `rows.filter(r => (r.organizationId == null || r.organizationId === org) && r.deletedAt == null)`, ordered by `position`.
- **`attributeValues`** — base ∪ org, ordered by `position`.
- **`categories`** — base ∪ org.

- [ ] **Step 1:** Convert `media`.
- [ ] **Step 2:** Convert `attributeValues`.
- [ ] **Step 3:** Convert `categories`.
- [ ] **Step 4: Verify.** `check-types`; `lint --max-warnings 0`; `pnpm --filter @czo/product test src/e2e/product-global.e2e.test.ts src/e2e/product-org.e2e.test.ts` → green (C1 + graft reads via `viewerOrg`).

---

## Task 6: E2E — storefront grafts resolve the publishing org anonymously

**Files:** create `packages/modules/product/src/e2e/channel-grafts.e2e.test.ts`.

- [ ] **Step 1: Seed** (reuse `harness` + `channel-products.e2e` patterns): org A owns/adopts a product `pg`, grafts onto it — a price binding (`@czo/price` or the product price-binding mutation), product media, a product attribute value, a category placement, and a variant inventory link — then `publishProduct` `pg` live on org A's channel `C`. Capture C's raw id.

- [ ] **Step 2: Assert (anonymous, via `channelProducts(channel: C)`):** for `pg`'s node:
  - `media(channel: C){ edges { node { id } } }` includes A's grafted media (+ base);
  - `attributeValues(channel: C)` / `categories(channel: C)` include A's grafts;
  - `variants{ edges { node { priceSet(channel: C){ priceSetId } inventoryItems(channel: C){ edges { node { id } } } } } }` → A's price binding + inventory, **anonymously**.
- [ ] **Step 3: No-leak assertions:**
  - the SAME grafts queried with `channel: <a channel pg is NOT live on>` → base-only / null (no A grafts);
  - C1 still holds: `media(viewerOrg: <A's gid>)` as an anonymous caller → denied (errors), proving the `viewerOrg` gate is intact.
- [ ] **Step 4: Run → PASS.** `pnpm --filter @czo/product test src/e2e/channel-grafts.e2e.test.ts`.

---

## Task 7: Full validation + stage

- [ ] `pnpm --filter @czo/product test` → all pass (incl. merge unit, the reworked grafts, the new channel-grafts e2e, and the unchanged C1 suites).
- [ ] `pnpm --filter @czo/product check-types && pnpm --filter life check-types` → PASS.
- [ ] `pnpm --filter @czo/product lint --max-warnings 0` → PASS (run `lint`, not `lint:fix`).
- [ ] `git add` the product module changes (exclude `docs/superpowers/**`); confirm the Task 1 scratch field/e2e are gone; report staged files + results; stop for user review. Do **not** commit.

---

## Self-review notes

- **Spec coverage:** channel arg + listing-derived org (T2 helper, T3-T5 fields), public-on-channel auth (T2 `graftAuthScopes`), the 6 fields (T3 price, T4 variant conns, T5 product conns), e2e incl. no-leak + C1-intact (T6), validation (T7). The risky Pothos primitives are gated up front (T1).
- **Why T1 is a real gate:** custom `t.connection`, `resolveArrayConnection`, and nested `pothosDrizzleSelect` have zero precedent here. If any fails, the fallback (dataloader for variant org; or list fields instead of connections — user escalation) is decided before 6 fields are reworked.
- **Security:** `channel` → public is sound because `resolveGraftOrg` reads the org strictly from a *live listing* — a bogus channel yields null → base-only. C1 (`viewerOrg` path) is untouched; T6 asserts both.
- **Behavioral change:** the 5 connection grafts paginate in-memory now (both paths). Low graft cardinality; T4/T5 verify the existing `viewerOrg` e2e still green.
- **No migration; no authz/scope change** beyond the public channel read (which publication already gates).
- **Type consistency:** `resolveGraftOrg(args, listings)` is the single org source for all 6 fields; `GraftArgs`/`GraftListing` exported from `merge.ts`.
