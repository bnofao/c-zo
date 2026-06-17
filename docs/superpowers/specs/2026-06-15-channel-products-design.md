# `channelProducts` Storefront Connection — Design

**Date:** 2026-06-15
**Module:** `@czo/product`
**Status:** draft, pending user review

## Goal

Add a public relay connection `channelProducts(channel: Int!, …)` that lists the products **live on a given sales channel** — the storefront catalog list — and lay the data foundation the storefront price/media resolution needs: an **`organizationId` (publishing org) on `product_channel_listings`**. The single-product counterpart (`productByHandle`, publication-filtered) already landed on this branch; `channelProducts` is its list form. Same branch (`feat/productbyhandle-publication-filter`).

## The query

```ts
channelProducts  // ['public'], relay drizzleConnection over `products`
args: { channel: Int!, search?, where: ProductWhereInput, orderBy: [ProductOrderByInput] }
where (composed):
  {
    AND: [
      { deletedAt: { isNull: true } },
      { channelListings: {                       // live on THIS channel
          channelId: <args.channel>,
          isPublished: true,
          reviewState: 'approved',
          deletedAt: { isNull: true },
      } },
      userWhere,                                  // optional ProductWhereInput
      searchClause,                               // optional name/handle ilike
    ].filter(Boolean)
  }
```

The relational `channelListings: { … }` filter (RQBv2, proven) means "has ≥1 live listing on `channel`". It is the same publication predicate as `productByHandle`, plus `channelId` to scope to the requested channel.

## Sub-graph + authz

- **`['public']`** (3-position tag on the connection + edge), served at `/graphql/public`.
- **No authScopes** — a product live on a channel is public; publication is the gate, not a permission (mirrors `productByHandle`). `channel` is a client-supplied **disambiguator** (which catalog), not a security boundary: every returned product is published, hence public. The returned products carry no other org's private data (the graft fields enforce their own confidentiality; `variants` are un-grafted/public; the true-overlay grafts keep their `viewerOrg` gate).

## Reuse — no new types/services

- **`ProductService.findProducts(config)`** — the query-runner from the connections work.
- **`ProductWhereInput` / `ProductOrderByInput`** — already registered (`['org','admin']`). They must now also be present on `['public']` (the connection references them there). Widen those two input types' `subGraphs` to include `'public'` (and the kit shared filter inputs they compose — `IntFilter` etc. — are already centrally tagged across audiences). The order enums likewise widen to include `'public'`.
- **`search`** — case-insensitive `ilike` over `name` and `handle` (same as the `products`/`organizationProducts` connections).
- **`buildOrderBy`** — the orderBy fold (default `createdAt desc`).

`channel` is a raw `Int!` (the cross-module channel id, as `publishProduct.channelId` and `ProductChannelListing.channelId` are) — there is no `Channel` node in the product module.

## Listing publishing org — foundation (IN scope)

A storefront must eventually show, for each product live on a channel, the **publishing org's** grafts (its price/media). Critically, that org is **NOT** derivable from the product for a **global** product: a global product (`org=null`) is *adopted* by an org, which grafts its price, then *published* — so the publishing org is the adopter, not `product.organizationId` (null). And `product_channel_listings` currently has **no org column**, so a global product published on the org-null marketplace channel records its publisher **nowhere**.

Fix (lay the foundation now; the graft resolution that consumes it is the deferred price sprint):

- Add **`organizationId integer` (nullable)** to `product_channel_listings` — the org that published the listing.
- `ChannelListingService.publish` sets it from the acting org (`input.organizationId`) on insert (and preserves/sets it on the upsert update).
- Expose `organizationId` on the `ProductChannelListing` node, narrowed to `['org','admin']` (the publisher is back-office data, not storefront-public).

With this, the future storefront graft resolution is **uniform**: `viewerOrg = listing.organizationId` regardless of tier — org-owned (the owner), global-adopted (the adopter), marketplace (the vendor). No per-tier derivation, no null-org marketplace gap. Migration: a nullable `ADD COLUMN` (no backfill needed; pre-existing rows are null).

## Out of scope (consistent with `productByHandle`)

- Channel from a **publishable API key** (full B19) — interim takes `channel` as an arg.
- **Per-listing-org overlay resolution** itself — `channelProducts` returns products + un-grafted `variants`; the true-overlay grafts (prices/media) still need `viewerOrg`. The *foundation* (`listing.organizationId`) lands here; the resolver that reads it (`viewerOrg = listing.organizationId` on a channel-scoped public read) is the next sprint.
- Per-channel **handle uniqueness** / ranking / merchandising order — not addressed.

## Testing

- E2E (`['public']`): seed two orgs each publishing a product on a channel `C` (live), plus an unpublished product and a product live on a different channel `C2`. `channelProducts(channel: C, first: N) { edges { node { id handle variants { edges { node { sku } } } } pageInfo { hasNextPage } }` →
  - returns only the products live on `C` (not the unpublished one, not the `C2` one),
  - paginates,
  - `search` filters by name/handle,
  - the returned products' `variants` are visible anonymously (the un-graft).
- Exposure E2E: `channelProducts` present on `/graphql/public`, and (since it's `['public']`-only) absent from `/graphql/org` and `/graphql/admin`.

## Validation

- `pnpm --filter @czo/product migrate:generate` (the `organizationId` column) + confirm the diff.
- `pnpm --filter @czo/product check-types`, `lint --max-warnings 0`, `test`.
- `pnpm --filter life check-types`.
