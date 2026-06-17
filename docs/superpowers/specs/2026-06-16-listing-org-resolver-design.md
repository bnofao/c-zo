# Channel-Scoped Storefront Grafts (`listing.organizationId` resolver) — Design

**Date:** 2026-06-16
**Module:** `@czo/product`
**Status:** approved, pending spec review
**Branch:** new branch off `main` (`feat/channel-graft-resolver`)

## Goal

Make a public, channel-scoped storefront read resolve each product's **org overlays** (price, media, attribute values, categories, inventory) using the product's **publishing org** — derived from its live listing on the channel — without the client passing `viewerOrg` and without the C1 confidentiality gate. This operationalizes the marketplace decision that a product's storefront price/media is the **vendor (publishing) org's**, and consumes the `product_channel_listings.organizationId` foundation laid in #147.

## The gap today

The graft fields (`Product.{media, attributeValues, categories}`, `ProductVariant.{priceSet, attributeValues, inventoryItems}`) take an explicit `viewerOrg` arg and gate via `graftAuthScopes` (C1: passing `viewerOrg` requires `product:read` in that org). So a public `channelProducts(channel)` read — anonymous, no `viewerOrg` — sees base rows only: **no prices, no vendor media**. The overlays are locked behind C1.

## Key facts

- `uniqueIndex(product_channel_listings)(productId, channelId) WHERE deletedAt IS NULL` → **at most one live listing per (product, channel)** → "the publishing org" is unambiguous.
- `product_channel_listings.organizationId` is the publishing org (set by `publishProduct`). A listing is "live" when `isPublished && reviewState='approved' && deletedAt IS NULL`.
- Graft merge today (`merge.ts`): `mergeWhere(orgId)` = base (`org IS NULL`) ∪ `org = orgId`. `viewerOrgId(args)`, `graftAuthScopes(args)`.
- `ProductVariant.priceSet` is already a custom `t.field` resolve that loads `priceSets` via `pothosDrizzleSelect` and filters by org in JS (`variant.ts:75-90`). The other 5 grafts are `relatedConnection`s.
- `relatedConnection`'s `query` is **synchronous and parent-blind** — it cannot await a listing lookup nor read the parent row. This is why channel→org can't live there.
- `resolveArrayConnection` is re-exported from `@czo/kit/graphql` (relay in-memory connection helper).

## Mechanism (Approach A — explicit `channel` arg)

Every graft field gains `channel: t.arg.int({ required: false })` beside `viewerOrg`. The viewer org is derived per product from the live listing for `channel`.

- **Product-level grafts** (`Product.{media, attributeValues, categories}`): the parent IS the product, so a **single-level** `pothosDrizzleSelect` `with: { channelListings: true }` loads the listings onto the parent — the proven pattern (`priceSet` already does `with: { priceSets: true }`). Derivation is synchronous from pre-loaded data.
- **Variant-level grafts** (`ProductVariant.{priceSet, attributeValues, inventoryItems}`): the listings live one level up on the *product*, so this needs a **nested** `pothosDrizzleSelect` `with: { product: { with: { channelListings: true } } }` — which has no precedent in the codebase. **Spiked first.** If nested `with` isn't supported, the fallback is a tiny per-request dataloader keyed `(productId, channelId) → organizationId` (the variant already carries `productId` via `select: true`, and the field resolve is async-capable). Either way no client-facing change.

Both `resolveArrayConnection` (first use in this repo) and the nested-`with` load are verified in the spike before any field is reworked.

`channel` arrives directly at each field (even `priceSet`, two levels deep under `variants`), so no row-threading is needed — that is the entire reason for the explicit-arg approach over a threaded one.

### Shared helpers (extend `merge.ts`)

```ts
type LiveListing = { channelId: number, organizationId: number | null, isPublished: boolean, reviewState: string, deletedAt: Date | null }

// Derive the viewer org for a graft read. channel wins over viewerOrg.
export function resolveGraftOrg(
  args: { viewerOrg?: { id: string } | null, channel?: number | null },
  listings: ReadonlyArray<LiveListing>,
): number | null {
  if (args.channel != null) {
    const live = listings.find(l =>
      l.channelId === args.channel && l.isPublished && l.reviewState === 'approved' && l.deletedAt == null)
    return live?.organizationId ?? null
  }
  return args.viewerOrg ? Number(args.viewerOrg.id) : null
}

// Auth: channel path is public; viewerOrg path keeps the C1 gate.
export function graftAuthScopes(args: { viewerOrg?: { id: string } | null, channel?: number | null }) {
  if (args.channel != null) return true
  // …existing: viewerOrg == null → true (base read), else { permission: product:read in that org }…
}
```

`mergeWhere(orgId)` is unchanged; the custom resolvers filter the loaded rows to base ∪ orgId (pure-org for `inventoryItems`).

### Auth safety (why `channel` → public is sound)

`channel` set → `authScopes: true`. This is safe **without** C1 because `resolveGraftOrg` derives the org **strictly from the live listing**: a caller picks a *channel*, not an org, and only ever sees the org that **publicly published** on that channel. A bogus/unlisted channel yields no live listing → `org = null` → base-only. So no caller can extract a victim org's private grafts. The `viewerOrg` path (authenticated org/admin tooling) keeps the C1 gate untouched. If both args are passed, `channel` takes precedence (storefront context).

## The 6 fields

| field | today | change |
|---|---|---|
| `ProductVariant.priceSet` | custom resolve, loads `priceSets`, filters by org | additionally `pothosDrizzleSelect` `product.channelListings`; org via `resolveGraftOrg`; `channel` arg + auth |
| `ProductVariant.attributeValues` | `relatedConnection` (base∪org) | → custom resolve: load rows + `product.channelListings`; filter base∪org; `resolveArrayConnection` |
| `ProductVariant.inventoryItems` | `relatedConnection` (pure org) | → custom resolve: load rows + `product.channelListings`; filter `org` only; `resolveArrayConnection` |
| `Product.media` | `relatedConnection` (base∪org, soft-delete) | → custom resolve: load rows + `channelListings`; filter base∪org + non-deleted; `resolveArrayConnection` |
| `Product.attributeValues` | `relatedConnection` (base∪org) | → custom resolve, ordered by position |
| `Product.categories` | `relatedConnection` (base∪org) | → custom resolve |

All keep `subGraphs: ['public','org','admin']` and their existing `viewerOrg` semantics; `channel` is additive.

## Accepted tradeoff — in-memory pagination

Converting the 5 `relatedConnection` grafts to custom resolvers moves pagination from DB-cursor to in-memory (`resolveArrayConnection`) for **both** the `channel` and `viewerOrg` paths. Acceptable: graft cardinality per product is small. A global product adopted by many orgs loads all orgs' graft rows then filters to base ∪ derived-org — accepted, since the org isn't known before the listings load, so the DB select can't pre-filter by it. The existing `product-global`/`product-org` e2e (which read these grafts via `viewerOrg`) must still pass (same rows, same order).

## Edge cases

- **No live listing for `channel`** → `org = null` → base-only (priceSet → null; inventoryItems → none). Not a leak.
- **Global product (`org=null`) published by org A on C** → `org = A` → base media ∪ A's grafts, A's price binding. Correct vendor overlay.
- **Marketplace/platform channel (channel's org null)** → listing.organizationId is the vendor (set by publish) → vendor's overlays.
- **`channel` + `viewerOrg` both set** → `channel` wins.

## Out of scope

- Resolving the channel from a publishable API key (still an explicit `channel` arg).
- Cross-product price/promotion logic (lives in `@czo/price`; we only surface the binding).
- Changing `productByHandle` (single-product) to channel scoping — it stays `viewerOrg`-based; this sprint is the connection/storefront path. (Could be a trivial follow-up.)

## Testing

- **Unit** (`merge.ts`): `resolveGraftOrg` — channel→listing org, channel-no-live→null, viewerOrg fallback, channel-wins precedence; `graftAuthScopes` channel→true.
- **E2E (`['public']`, anonymous, via `channelProducts`)**: seed an org A that adopts/owns a product, grafts price + media + attribute value + category + inventory, and publishes it live on channel C. Then anonymously `channelProducts(channel: C){ edges { node { media(channel: C){…} attributeValues(channel: C){…} categories(channel: C){…} variants { edges { node { priceSet(channel: C){ priceSetId } inventoryItems(channel: C){…} } } } } } }` →
  - the vendor org's price binding, media, attribute values, categories, inventory are visible **anonymously**;
  - a product **not** live on C (or `channel` = a channel it isn't on) → those grafts resolve base-only / null (no leak);
  - C1 unchanged: `media(viewerOrg: B)` from an anon/cross-org caller still denied.
- **Regression**: full `product-global`/`product-org` e2e suite still green (viewerOrg path + in-memory pagination).

## Validation

- `pnpm --filter @czo/product check-types`, `lint --max-warnings 0`, `test`; `pnpm --filter life check-types`.
- No migration.
