# Marketplace Listing Review — Design

**Date:** 2026-06-15
**Module:** `@czo/product`
**Status:** draft, pending user review

## Goal

Apply the agreed marketplace model to the current code: an org publishes a product onto the **central marketplace channel** (the platform-tier channel of `@czo/channel`, `organizationId = null`), and platform admins **moderate** that listing — approve, reject, or suspend it with a reason — before (and after) it goes live. **Pre-moderation only.**

This is purely additive on top of the existing `product_channel_listings` surface. No new entity, no vendor onboarding.

## Decisions locked during brainstorming

- **No `marketplace_vendors`.** The only new concept is a *review dimension* on the existing listing row.
- **Pre-moderation pure.** A listing on a marketplace channel is born `pending` and goes live only after `approveListing`. There is no per-vendor auto-publish trust lane.
- **"Disapprove after"** is `suspendListing` on an already-approved listing.
- **Reject and suspend carry a free-text reason**, visible to the owning org.
- **Price unchanged.** No per-channel price; the marketplace resolves the org's price set (decided earlier: "prix = prix org").

## Audience model (sub-graph tagging, per the established pattern)

- Org publish/withdraw → `['org']` (existing `publishProduct`/`unpublishProduct`).
- Admin moderation mutations → `['admin']`.
- New listing fields (`reviewState`, `reviewReason`, `reviewedAt`) → `['org','admin']` (narrowed off `public`: the storefront does not see moderation internals).

## Data model

### `product_channel_listings` (+ migration)

Add three columns:

| Column | Type | Notes |
|---|---|---|
| `reviewState` | enum `pending \| approved \| rejected \| suspended`, NOT NULL, default `approved` | The admin gate. Default `approved` so **org-own-channel listings are unaffected** (they are never set to `pending`); only marketplace publishes set `pending`. |
| `reviewedAt` | `timestamp` nullable | When the current `reviewState` was last set by an admin. |
| `reviewReason` | `text` nullable | Set on `reject`/`suspend`; cleared (`NULL`) on `approve`. |

A new Postgres enum `product_listing_review_state` backs `reviewState`.

**Why default `approved`, not `pending`:** the live rule (below) becomes uniform across both channel tiers — own-channel rows are `approved`, so `live = isPublished` for them, exactly today's behavior. Only the marketplace-publish path overrides to `pending`. No read-time branching on channel tier.

### Live semantics

```
live = isPublished AND reviewState == 'approved'
```

`isPublished` stays the **org gate** (the org submitted/published). `reviewState` is the **admin gate**. The two compose. The existing `isPublished` field description is updated from "published and live" to "published by the org (live only once approved on a marketplace channel)".

> Server-side enforcement of `live` for the buyer-facing read (hiding non-live marketplace listings on `productByHandle`) stays in **B19** — see Out of scope. This sprint models and *manages* the state; it does not yet filter the public storefront read.

## Service changes — `ChannelListingService`

### 1. Relax `guardCrossOrg` into a tier-aware target check

Current `guardCrossOrg` denies any channel not owned by the acting org. Replace with a three-way branch on the resolved channel's `organizationId`:

- `=== actingOrg` → **own store channel** (today's path). Listing review defaults to `approved`.
- `=== null` → **marketplace (platform) channel** (the relaxation). Publish is allowed; a newly inserted listing's `reviewState` is `pending` (an existing listing's review state is preserved — see §2).
- otherwise (another org's channel) → `CrossOrgGraftDenied` (unchanged).

`guardAdopted` (global product requires a live adoption) is orthogonal and stays as-is.

### 2. `publish` sets review state only on first listing; the org toggles `isPublished` thereafter

On **insert** of a marketplace-channel listing, `reviewState = 'pending'`. On **update** of an existing listing, `reviewState` is **preserved** (never reset). The org's show/hide control is `isPublished`: once approved, the org can unpublish (`isPublished = false`) and re-publish (`isPublished = true`) freely **without re-triggering moderation** — the approval survives the toggle. Own-channel listings never touch the review columns (they insert with the column default `approved`).

This requires `unpublishProduct` to **stop soft-deleting** and become a pure toggle for **all** listings (both tiers, unified): it sets `isPublished = false` and keeps the row (and its `reviewState`). The listing row becomes persistent — created on first publish, toggled by `isPublished`, and only ever removed by the product cascade. Re-publishing updates the same row in place, so an approved marketplace listing stays `approved` across an unpublish/re-publish cycle.

The `(productId, channelId) WHERE deletedAt IS NULL` partial-unique index and the existing upsert-by-`(productId, channelId)` logic are unaffected (there is now at most one persistent live row per pair; `deletedAt` stays null until a cascade).

### 2b. Cross-org ownership hardening (added during code review)

Relaxing the guard to allow the shared marketplace channel surfaced a pre-existing gap: `unpublish` ran no channel/ownership check, and `guardAdopted` never denied another org's product. On the shared marketplace channel that let an org silence a competitor's listing. Fix:

- `guardAdopted` → **`guardProductActable(productId, organizationId)`**: global product → require adoption; the acting org's own product → allow; **another org's product → `CrossOrgGraftDenied`**.
- Both `publish` and `unpublish` now run `guardProductActable` + `guardChannelTarget`. `unpublish` gains an `organizationId` (already present on the GraphQL input) and now declares the `ProductNotFound | ProductNotAdopted | CrossOrgGraftDenied` errors on the `unpublishProduct` mutation.

### 3. New moderation methods (admin)

```
approveListing(listingId): set reviewState=approved, reviewReason=NULL,   reviewedAt=now
rejectListing(listingId, reason): set reviewState=rejected, reviewReason=reason, reviewedAt=now
suspendListing(listingId, reason): set reviewState=suspended, reviewReason=reason, reviewedAt=now
```

Each first loads the listing by id:
- not found / soft-deleted → `ChannelListingNotFound`
- the listing's channel is **not** a platform channel (its `channelId` resolves to a channel with a non-null `organizationId`) → `NotAMarketplaceChannel` (admins moderate only marketplace listings, never an org's private store listings)

## GraphQL

### Mutations (relay, `@czo/product`)

New admin mutations in a new file `mutations/listingReview.ts`, tagged `sg('admin')`, gated on the **GLOBAL `channel:update`** role (no organization) — the marketplace operator is the platform-channel operator, the same global authority that runs `createPlatformChannel` in `@czo/channel`.

| Mutation | Input | Payload |
|---|---|---|
| `approveListing` | `listingId: ID!` (ProductChannelListing global id) | the updated `ProductChannelListing` |
| `rejectListing` | `listingId: ID!`, `reason: String!` | the updated `ProductChannelListing` |
| `suspendListing` | `listingId: ID!`, `reason: String!` | the updated `ProductChannelListing` |

`publishProduct` / `unpublishProduct` keep their GraphQL signatures; their service behavior changes (publish's guard is relaxed to target a marketplace channel and sets `pending` on first insert; unpublish becomes a non-deleting `isPublished=false` toggle — see Service §2). Both stay `['org']`.

### Node field exposure — `ProductChannelListing` (`types/grafts.ts`)

Add, narrowed to `['org','admin']`:

- `reviewState: ProductListingReviewState!` (new GraphQL enum mirroring the DB enum)
- `reviewReason: String` (nullable)
- `reviewedAt: DateTime` (nullable)

Update `isPublished` description (org gate, not "live").

### Errors (`errors.ts`)

Two new tagged errors, registered and tagged `['admin']` (referenced only by the admin moderation mutations):

- `ChannelListingNotFound`
- `NotAMarketplaceChannel`

The org-side `publishProduct` keeps its existing error set (`ProductNotFound`, `ProductNotAdopted`, `CrossOrgGraftDenied`); the marketplace target does not introduce new org-facing errors (a marketplace publish simply produces a `pending` listing).

## Authz summary

| Action | Actor | Scope |
|---|---|---|
| publish onto marketplace channel | org member | `product:update` in the org (existing) |
| approve / reject / suspend listing | platform admin | GLOBAL `channel:update` (no org) |

No change to node-guards: `ProductChannelListing` node read continues through the existing graft `authScopes`; the new fields are plain field exposures on that already-guarded node.

## Out of scope (explicit)

- **Buyer-facing read filtering** (`productByHandle` hiding non-`live` marketplace listings) → **B19** storefront sprint. This sprint leaves `productByHandle` interim-public exactly as today.
- **Order routing / multi-vendor split / commission / payout** → future `order` + `payment` modules.
- **Admin moderation-queue query** (e.g. `pendingMarketplaceListings`). Not required for the lifecycle; admins can address listings by id. Natural follow-up, deliberately deferred to keep scope minimal.
- **Per-vendor auto-publish / trust lane** — dropped with `marketplace_vendors`.

## Testing

Integration (Testcontainers) on `ChannelListingService`:

- marketplace publish → listing `reviewState = pending`, not live
- own-channel publish → `reviewState = approved` (unchanged behavior), live
- `approveListing` → `approved` + `reviewedAt` set + `reviewReason` null → live
- `rejectListing(reason)` / `suspendListing(reason)` → state + reason persisted, not live
- unpublish (`isPublished=false`) then re-publish of an **approved** marketplace listing keeps `approved` (no re-moderation); not live while `isPublished=false`, live again when re-published
- moderation on an own-channel listing → `NotAMarketplaceChannel`
- moderation on a missing id → `ChannelListingNotFound`
- `unpublishProduct` sets `isPublished=false` and **keeps the row** (no soft-delete) for both tiers; re-publish updates it in place. The existing "unpublish soft-deletes" test is rewritten to assert the toggle + row persistence.
- remaining existing channel-listing tests (own-channel publish, cross-org denial, adoption) stay green

E2E sub-graph exposure: `approveListing`/`rejectListing`/`suspendListing` present on `/graphql/admin`, absent from `/graphql/org` and `/graphql/public`; the new `ProductChannelListing` review fields absent from `/graphql/public`.

## Validation

- `pnpm --filter @czo/product generate:types` (after migration) + `pnpm --filter @czo/product generate` if any `.graphql` touched (these are Pothos code-first — likely none)
- `pnpm --filter @czo/product migrate:create marketplace_listing_review`
- `pnpm --filter @czo/product check-types`, `lint --max-warnings 0`, `test`
- `pnpm --filter life check-types`
