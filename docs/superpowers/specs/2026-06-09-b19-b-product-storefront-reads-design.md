# B19 — Sub-project (B): Channel-scoped storefront product reads — Design

**Date:** 2026-06-09
**Backlog:** B19 (Storefront access via API keys). Sub-project **(B)**. Depends on **(A)** (API-key request authentication — already implemented on branch `feat/b19-api-key-request-auth`): a key can satisfy the `permission` scope for its org. (B) ships on the same branch (one B19 PR).

## Goal

Give a storefront a channel-scoped, published-only product read surface it accesses with a `channel:read` API key, and close the remaining fully-public product reads. After (B), no product read is fully public; a storefront's server (BFF) holding an org-owned `channel:read` key reads the catalog of products published on its channel, with that org's grafted data (price, media, …).

## Decisions (settled during brainstorming)

1. **A single new query** `channelProducts(channel, handle?, search?, …pagination)` — a relay connection of `Product`. Browse = no `handle`; PDP = with `handle` (the front takes the single edge). No separate by-handle query.
2. **Reuse the existing `Product` node** (not a dedicated `StorefrontProduct`). Its graft fields keep their `viewerOrg` arg; the gate is broadened (below).
3. **Published filter = `isPublished = true` only** (v1). `visibleInListings` and `availableForPurchaseAt` are deferred refinements.
4. **Gate the existing public reads.** `productByHandle` (and any fully-public base read) gains a top-level authz gate — nothing stays fully public.
5. **One small, generic auth addition** — extend the existing `permission` scope to accept `resource: string | string[]` (an array = "any-of": the caller passes if it has the action on **any** listed resource). Auth stays domain-agnostic; **product** expresses the catalog decision as `resource: ['channel', 'product']`. No product-specific named scope leaks into auth. Satisfiable by a session user or an API key (reuses (A)'s principal handling).

## Architecture / components

### 1. `channelProducts` query — `packages/modules/product/src/graphql/schema/product/queries.ts`

```
channelProducts(
  channel: ID!          # relay global id of a @czo/channel Channel
  handle: String        # optional — filter to one product (PDP)
  search: String        # optional — case-insensitive substring over name/handle
  # + relay pagination (first/after/last/before)
): ProductConnection    # connection of Product nodes
```

Resolver:
- **Derive the channel's org**: load the Channel by id via `@czo/channel` `ChannelService.findFirst({ id })` → `organizationId` (product already depends on channel).
- **Top authz gate** (async `authScopes` that loads the org first, mirroring `loadProductOrganizationId`-style gates): if the channel is unknown/soft-deleted → **deny** (the gate returns `false`); otherwise gate on `{ permission: { resource: 'channel', actions: ['read'], organization: <channelOrg> } }` — a `channel:read` key (or a session member with channel:read) in that org passes; everyone else is denied. **No public branch.** Unknown-channel and unauthorized both deny **uniformly** (no channel-existence oracle).
- **Query**: products that have a `productChannelListings` row for `channel` with `isPublished = true` and `deletedAt IS NULL`, the product itself not soft-deleted; optional `handle` equality and `search` (`ilike` over name/handle); relay-paginated. Implemented as a new service method (below). The channel's org is implicit in the channel — `productChannelListings` is keyed by `(productId, channelId)` (the listing carries no `organizationId`; the channel carries the org).

### 2. Service method — `packages/modules/product/src/services/channel-listing.ts` (or `product.ts`)

`listPublishedChannelProducts({ channelId, handle?, search?, query })` → `ReadonlyArray<Product>` (relay-`query`-threaded, like the other connection resolvers). Joins `productChannelListings` (channelId match, isPublished, not deleted) to `products` (not deleted). Trust the channelId/org at the service edge (the resolver gated it).

### 3. Extend the `permission` scope — any-of resources — `packages/modules/auth/src/graphql/scopes.ts` (+ the `BuilderAuthScopes` type in `auth/src/graphql/index.ts`)

Generalize the existing `permission` scope (no new named scope, no product concept in auth): accept `resource: string | string[]`.
- The resolver builds `required = Object.fromEntries(resources.map(r => [r, actions]))` and `connector = resources.length > 1 ? 'OR' : 'AND'`, then passes `required` + `connector` to all three existing checks — `AccessService.authorize(grid, required, connector)` (api-key branch), `OrganizationService.hasPermission({ …, permissions: required, connector })` (session org branch), `UserService.hasPermission({ …, permissions: required, connector })` (session global branch). All three already accept a `connector`.
- A single string `resource` (the existing call shape) → one-entry `required`, connector `'AND'` — **byte-equivalent to today**, fully backward compatible.
- The `BuilderAuthScopes` type changes `permission.resource: string` → `permission.resource: string | string[]` (additive; `string` is assignable, so all existing `{ permission: { resource: 'x' } }` callers keep type-checking).

### 4. Broaden the graft gate — `packages/modules/product/src/graphql/schema/product/types/merge.ts`

`graftAuthScopes(args)`:
- `viewerOrg` omitted (`org == null`) → `true` (base rows only; the surrounding query's own gate suffices).
- `viewerOrg` supplied → `{ permission: { resource: ['channel', 'product'], actions: ['read'], organization: org } }` (was `resource: 'product'`). The resource array makes it "channel:read **OR** product:read in that org" — product owns this domain decision; auth just sees an any-of `permission`.

A storefront key (`channel:read` in its org) passes graft fields for its org; an admin (`product:read`) still passes; an org-B key passing `viewerOrg=A` is denied (no cross-org leak). The storefront client passes `viewerOrg = its own org` (= the key's org, which it knows) on graft fields.

### 5. Gate `productByHandle` — `packages/modules/product/src/graphql/schema/product/queries.ts`

Add a top-level `authScopes` to `productByHandle` so it is no longer fully public: `viewerOrg` supplied → `{ permission: { resource: ['channel', 'product'], actions: ['read'], organization: <viewerOrg> } }`; `viewerOrg` omitted → require the global `product:read` role (`{ permission: { resource: 'product', actions: ['read'] } }`). This makes the global base by-handle read require a principal too. Remove the "Currently public — see the storefront access gate note" wording from its description and from `merge.ts`/`queries.ts` comments; drop the `DEFERRED — storefront access gate` header note in `queries.ts`.

## Data flow

```
storefront BFF (holds org-A channel:read key)
  → channelProducts(channel: X, handle?: H) with `x-api-key`
      → resolver loads channel X → org A
      → top gate: permission(channel, read, A)  ✓ (key has channel:read in A)
      → service: products with productChannelListings(channelId=X, isPublished) [+handle/search]
      → returns Product connection
  → on each Product: price(viewerOrg: A), media(viewerOrg: A), …
      → graftAuthScopes(A) = permission(resource:['channel','product'], read, A) ✓ (key has channel:read in A)
      → merge predicate returns base ∪ A grafts
```

## Error handling

- Channel id unknown / soft-deleted → denied (the top gate returns false), uniform with the unauthorized case so there is no channel-existence oracle.
- Cross-channel / cross-org: a key for org B calling `channelProducts(channel of org A)` → the top gate denies. A key passing `viewerOrg=B` on a graft of an A-channel product → the graft gate denies (and the merge predicate wouldn't surface B's data anyway).
- `productByHandle` with no principal → denied by the new top gate.

## Security considerations

- **Nothing fully public:** `channelProducts` requires `channel:read`; `productByHandle` requires `permission` any-of (`channel`/`product` read) in `viewerOrg`, or global `product:read`. The graft public branch (`viewerOrg` omitted → `true`) only returns base (org-null) rows and is reachable only behind one of those gated queries.
- **Cross-org / cross-channel isolation:** every read is org-scoped to the channel's org (top gate) and the viewer org (graft gate); a key only authorizes its own org.
- **No unpublished leak:** the storefront surface filters to `isPublished = true`; the key has `channel:read`, **not** `product:read`, so it cannot reach the admin `products(viewerOrg)` / `product(id)` queries (those require `product:read`) and never sees unpublished/draft products.
- **Server-side key assumption** (from (A)): the key lives in the front's server env; if catalog reads ever move client-side, revisit.

## Testing

E2E in `@czo/product` (cross-module Testcontainers harness with auth+channel+product) — extends the existing storefront E2E:
1. **Published browse:** org-A `channel:read` key → `channelProducts(channel: A-channel)` returns A's products published on that channel; an unpublished product is **absent**.
2. **PDP by handle:** `channelProducts(channel, handle: H)` returns the single published product H; an unpublished handle → empty.
3. **Grafts:** the returned product's `priceSet(viewerOrg: A)` / `attributeValues(viewerOrg: A)` resolve for the key (graft gate via the `permission` any-of).
4. **Cross-org channel deny:** org-B key → `channelProducts(channel of A)` → denied.
5. **Cross-org graft deny:** org-B key → graft with `viewerOrg=A` → denied.
6. **`productByHandle` now gated:** anonymous (no principal) → denied (was public).
7. **No unpublished via admin path:** a `channel:read` key cannot call `products(viewerOrg=A)` (requires `product:read`) → denied.
8. **(via the above)** `permission` any-of (`resource: ['channel','product']`): a channel:read-only key grants (case 3), a product:read admin grants, neither → deny, cross-org → deny (case 5). The string-resource path is unchanged (covered by existing auth tests).

## Out of scope / follow-ups

- `visibleInListings` (browse-visibility) and `availableForPurchaseAt` (buyability) filters; a richer storefront filter/sort surface.
- A dedicated `StorefrontProduct` node (chosen against — reuse `Product`).
- Per-channel key scoping (a key still authorizes all its org's channels — the `permissions` grid is `resource:action`, not per-instance; from (A)).
- Exposing `permissions` on the `createApiKey` mutation so an admin can mint a `channel:read` storefront key via GraphQL (currently set via the service) — a small api-key-surface follow-up.
