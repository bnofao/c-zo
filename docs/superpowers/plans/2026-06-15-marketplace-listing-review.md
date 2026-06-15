# Marketplace Listing Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org publish a product onto the central marketplace channel (platform-tier `@czo/channel`, `organizationId = null`) and let platform admins moderate that listing — approve / reject / suspend with a reason — under pre-moderation, all additively on the existing `product_channel_listings` surface.

**Architecture:** Three review columns on the existing listing row (`reviewState` default `approved`, `reviewedAt`, `reviewReason`). `ChannelListingService.publish` is relaxed to target a marketplace channel (sets `pending` on first insert, preserves state on update); `unpublish` becomes a non-deleting `isPublished=false` toggle for both tiers. Three new `['admin']` mutations drive review, gated on the GLOBAL `channel:update` role. `live = isPublished && reviewState == 'approved'`.

**Tech Stack:** Drizzle RQBv2 (`@effect/sql-pg`), Effect-TS services, Pothos relay mutations + `@pothos/plugin-sub-graph`, Vitest + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-06-15-marketplace-listing-review-design.md`

**Branch:** create `feat/marketplace-listing-review` off `main` before Task 1. Stage only — no commits until explicit user review.

---

## Task 1: Schema — review enum + columns

**Files:**
- Modify: `packages/modules/product/src/database/schema.ts`
- Generate: `packages/modules/product/migrations/<timestamp>_marketplace_listing_review/`

- [ ] **Step 1: Add the pg enum** next to the existing enums (after line 7, `mediaTypeEnum`):

```ts
export const listingReviewStateEnum = pgEnum('product_listing_review_state', ['pending', 'approved', 'rejected', 'suspended'])
```

- [ ] **Step 2: Add three columns to `productChannelListings`** (in the `pgTable('product_channel_listings', {...})` block, after `publishedAt`):

```ts
  reviewState: listingReviewStateEnum('review_state').notNull().default('approved'),
  reviewedAt: timestamp('reviewed_at'),
  reviewReason: text('review_reason'),
```

`text` and `timestamp` are already imported. Leave the unique index and `product_channel_listings_channel_idx` untouched.

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter @czo/product migrate:generate`
Expected: a new `migrations/<timestamp>_*/migration.sql` creating the `product_listing_review_state` enum and adding the three columns (`review_state NOT NULL DEFAULT 'approved'`, nullable `reviewed_at`, nullable `review_reason`). Open it and confirm the diff matches; nothing else changed.

- [ ] **Step 4: Type-check the schema**

Run: `pnpm --filter @czo/product check-types`
Expected: PASS (the new columns are inferred into `InferSelectModel`).

---

## Task 2: Service — domain type, errors, tier-aware guard

**Files:**
- Modify: `packages/modules/product/src/services/channel-listing.ts`

- [ ] **Step 1: Add two tagged errors** after the existing `ChannelListingDbFailed` class:

```ts
export class ChannelListingNotFound extends Data.TaggedError('ChannelListingNotFound')<{}> {
  readonly code = 'CHANNEL_LISTING_NOT_FOUND'
  get message() { return 'Channel listing not found' }
}

export class NotAMarketplaceChannel extends Data.TaggedError('NotAMarketplaceChannel')<{}> {
  readonly code = 'NOT_A_MARKETPLACE_CHANNEL'
  get message() { return 'Listing is not on a marketplace channel' }
}
```

- [ ] **Step 2: Extend the service contract** — add three methods to the `ChannelListingService` `Context.Service` shape (after `listListings`):

```ts
  readonly approveListing: (listingId: number) => Effect.Effect<ProductChannelListing, ChannelListingNotFound | NotAMarketplaceChannel | ChannelListingDbFailed>
  readonly rejectListing: (listingId: number, reason: string) => Effect.Effect<ProductChannelListing, ChannelListingNotFound | NotAMarketplaceChannel | ChannelListingDbFailed>
  readonly suspendListing: (listingId: number, reason: string) => Effect.Effect<ProductChannelListing, ChannelListingNotFound | NotAMarketplaceChannel | ChannelListingDbFailed>
```

- [ ] **Step 3: Replace `guardCrossOrg` with a tier-aware `guardChannelTarget`** that returns whether the target is the marketplace. Replace the whole `guardCrossOrg` const with:

```ts
  /**
   * Resolve the target channel and classify it:
   *   - org-owned by the acting org → own store channel (review default `approved`)
   *   - platform channel (org null)  → the central marketplace (review `pending`)
   *   - owned by another org         → CrossOrgGraftDenied
   * Unknown channel is hidden as CrossOrgGraftDenied.
   */
  const guardChannelTarget = (channelId: number, organizationId: number) =>
    Effect.gen(function* () {
      const channel = yield* channelService.findFirst({ where: { id: channelId } }).pipe(
        Effect.mapError(e => e._tag === 'ChannelNotFound' ? new CrossOrgGraftDenied() : new ChannelListingDbFailed({ cause: e })),
      )
      if (channel.organizationId === null)
        return { isMarketplace: true as const }
      if (channel.organizationId !== organizationId)
        yield* Effect.fail(new CrossOrgGraftDenied())
      return { isMarketplace: false as const }
    })
```

- [ ] **Step 4: Type-check** (the `publish` body still references the old guard — expect a compile break that Task 3 fixes; you may run after Task 3 instead).

Run: `pnpm --filter @czo/product check-types`
Expected: FAIL referencing `guardCrossOrg` / `publish` — resolved in Task 3.

---

## Task 3: Service — publish sets `pending` on insert, unpublish toggles, moderation methods

**Files:**
- Modify: `packages/modules/product/src/services/channel-listing.ts`

- [ ] **Step 1: Rewrite `publish`** to call `guardChannelTarget`, and set `reviewState='pending'` only on **insert** of a marketplace listing (never touch `reviewState` on update). Replace the existing `publish` const with:

```ts
  const publish: ChannelListingServiceImpl['publish'] = input =>
    Effect.gen(function* () {
      yield* guardAdopted(input.productId, input.organizationId)
      const { isMarketplace } = yield* guardChannelTarget(input.channelId, input.organizationId)

      const isPublished = input.isPublished ?? true
      const visibleInListings = input.visibleInListings ?? true

      // UPSERT on the live (productId, channelId). Update preserves reviewState;
      // a fresh marketplace listing enters `pending` (own-channel uses the
      // column default `approved`).
      const existing = yield* dbErr(db.query.productChannelListings.findFirst({
        where: { productId: input.productId, channelId: input.channelId, deletedAt: { isNull: true } },
      }))

      if (existing) {
        const [row] = yield* dbErr(db
          .update(productChannelListingsTable)
          .set({
            isPublished,
            visibleInListings,
            ...(input.availableForPurchaseAt !== undefined ? { availableForPurchaseAt: input.availableForPurchaseAt } : {}),
            ...(input.publishedAt !== undefined
              ? { publishedAt: input.publishedAt }
              : isPublished
                ? { publishedAt: sql`NOW()` as any }
                : {}),
            updatedAt: sql`NOW()` as any,
          })
          .where(sql`${productChannelListingsTable.id} = ${existing.id}`)
          .returning())
        return row! as ProductChannelListing
      }

      const [row] = yield* dbErr(db
        .insert(productChannelListingsTable)
        .values({
          productId: input.productId,
          channelId: input.channelId,
          isPublished,
          visibleInListings,
          ...(isMarketplace ? { reviewState: 'pending' as const } : {}),
          ...(input.availableForPurchaseAt !== undefined ? { availableForPurchaseAt: input.availableForPurchaseAt } : {}),
          ...(input.publishedAt !== undefined
            ? { publishedAt: input.publishedAt }
            : isPublished
              ? { publishedAt: sql`NOW()` as any }
              : {}),
        })
        .returning())
      return row! as ProductChannelListing
    })
```

- [ ] **Step 2: Rewrite `unpublish`** to a non-deleting toggle (both tiers) — set `isPublished=false`, keep the row:

```ts
  const unpublish: ChannelListingServiceImpl['unpublish'] = ({ productId, channelId }) =>
    dbErr(db
      .update(productChannelListingsTable)
      .set({ isPublished: false, updatedAt: sql`NOW()` as any })
      .where(sql`${productChannelListingsTable.productId} = ${productId} AND ${productChannelListingsTable.channelId} = ${channelId} AND ${productChannelListingsTable.deletedAt} IS NULL`))
      .pipe(Effect.asVoid)
```

- [ ] **Step 3: Add the moderation methods** before the `return { ... }` of `make`:

```ts
  /** Load a marketplace listing by id and set its review state. */
  const setReview = (listingId: number, reviewState: 'approved' | 'rejected' | 'suspended', reviewReason: string | null) =>
    Effect.gen(function* () {
      const listing = yield* dbErr(db.query.productChannelListings.findFirst({
        where: { id: listingId, deletedAt: { isNull: true } },
      }))
      if (!listing)
        return yield* Effect.fail(new ChannelListingNotFound())

      const channel = yield* channelService.findFirst({ where: { id: listing.channelId } }).pipe(
        Effect.mapError(e => e._tag === 'ChannelNotFound' ? new NotAMarketplaceChannel() : new ChannelListingDbFailed({ cause: e })),
      )
      if (channel.organizationId !== null)
        return yield* Effect.fail(new NotAMarketplaceChannel())

      const [row] = yield* dbErr(db
        .update(productChannelListingsTable)
        .set({ reviewState, reviewReason, reviewedAt: sql`NOW()` as any, updatedAt: sql`NOW()` as any })
        .where(sql`${productChannelListingsTable.id} = ${listingId}`)
        .returning())
      return row! as ProductChannelListing
    })

  const approveListing: ChannelListingServiceImpl['approveListing'] = listingId => setReview(listingId, 'approved', null)
  const rejectListing: ChannelListingServiceImpl['rejectListing'] = (listingId, reason) => setReview(listingId, 'rejected', reason)
  const suspendListing: ChannelListingServiceImpl['suspendListing'] = (listingId, reason) => setReview(listingId, 'suspended', reason)
```

- [ ] **Step 4: Export the three methods** — extend the `return { ... } satisfies ChannelListingServiceImpl` with `approveListing, rejectListing, suspendListing`.

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @czo/product check-types`
Expected: PASS.

---

## Task 4: Service integration tests

**Files:**
- Modify: `packages/modules/product/src/services/channel-listing.integration.test.ts`

- [ ] **Step 1: Add a platform-channel helper** next to the existing `makeChannel`:

```ts
  const makePlatformChannel = (handle: string) =>
    Effect.gen(function* () {
      const svc = yield* Channel.ChannelService
      return yield* svc.create({ organizationId: null, handle, name: handle })
    })
```

- [ ] **Step 2: Rewrite the existing "unpublish soft-deletes" test** to assert the toggle + row persistence. Replace the `it.effect('unpublish soft-deletes; re-publish after works', ...)` body with:

```ts
  it.effect('unpublish toggles isPublished and keeps the row; re-publish re-enables', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'cl-t5')
      const product = yield* makeProduct(ORG, type.id, 'cl-p5')
      const channel = yield* makeChannel(ORG, 'cl-c5')

      yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })
      yield* svc.unpublish({ productId: product.id, channelId: channel.id })

      const after = yield* svc.listListings(product.id)
      expect(after.length).toBe(1)
      expect(after[0]!.isPublished).toBe(false)

      const reborn = yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })
      expect(reborn.isPublished).toBe(true)
      expect((yield* svc.listListings(product.id)).length).toBe(1)
    }))
```

- [ ] **Step 3: Add marketplace lifecycle tests** at the end of the `layer(...)` block:

```ts
  it.effect('publish on a platform channel creates a pending (not live) listing', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'mk-t1')
      const product = yield* makeProduct(ORG, type.id, 'mk-p1')
      const market = yield* makePlatformChannel('mk-market1')

      const row = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })
      expect(row.isPublished).toBe(true)
      expect(row.reviewState).toBe('pending')
    }))

  it.effect('approveListing → approved + reviewedAt; reason cleared', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'mk-t2')
      const product = yield* makeProduct(ORG, type.id, 'mk-p2')
      const market = yield* makePlatformChannel('mk-market2')
      const listing = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })

      const approved = yield* svc.approveListing(listing.id)
      expect(approved.reviewState).toBe('approved')
      expect(approved.reviewReason).toBeNull()
      expect(approved.reviewedAt).not.toBeNull()
    }))

  it.effect('reject and suspend persist the reason', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'mk-t3')
      const product = yield* makeProduct(ORG, type.id, 'mk-p3')
      const market = yield* makePlatformChannel('mk-market3')
      const listing = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })

      const rejected = yield* svc.rejectListing(listing.id, 'counterfeit')
      expect(rejected.reviewState).toBe('rejected')
      expect(rejected.reviewReason).toBe('counterfeit')

      const suspended = yield* svc.suspendListing(listing.id, 'policy violation')
      expect(suspended.reviewState).toBe('suspended')
      expect(suspended.reviewReason).toBe('policy violation')
    }))

  it.effect('approved marketplace listing survives unpublish/re-publish (no re-moderation)', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'mk-t4')
      const product = yield* makeProduct(ORG, type.id, 'mk-p4')
      const market = yield* makePlatformChannel('mk-market4')
      const listing = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })
      yield* svc.approveListing(listing.id)

      yield* svc.unpublish({ productId: product.id, channelId: market.id })
      const reborn = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })
      expect(reborn.isPublished).toBe(true)
      expect(reborn.reviewState).toBe('approved')
    }))

  it.effect('moderating a missing listing → ChannelListingNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const err = yield* svc.approveListing(999999).pipe(Effect.flip)
      expect(err._tag).toBe('ChannelListingNotFound')
    }))

  it.effect('moderating an own-channel listing → NotAMarketplaceChannel', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'mk-t6')
      const product = yield* makeProduct(ORG, type.id, 'mk-p6')
      const channel = yield* makeChannel(ORG, 'mk-own6')
      const listing = yield* svc.publish({ productId: product.id, channelId: channel.id, organizationId: ORG })

      const err = yield* svc.approveListing(listing.id).pipe(Effect.flip)
      expect(err._tag).toBe('NotAMarketplaceChannel')
    }))
```

- [ ] **Step 4: Run the service tests**

Run: `pnpm --filter @czo/product test src/services/channel-listing.integration.test.ts`
Expected: PASS (rewritten unpublish test + 6 new tests + the untouched publish/cross-org/adoption tests).

---

## Task 5: GraphQL enum + node field exposure

**Files:**
- Modify: `packages/modules/product/src/graphql/schema/product/inputs.ts`
- Modify: `packages/modules/product/src/graphql/schema/product/types/grafts.ts`

- [ ] **Step 1: Add the enum to the refs interface** (`ProductEnumRefs`):

```ts
  ListingReviewState: ReturnType<ProductGraphQLSchemaBuilder['enumType']> & { __type?: 'pending' | 'approved' | 'rejected' | 'suspended' }
```

- [ ] **Step 2: Build the enum in the `refs = { ... }` stash** (after `MediaType`):

```ts
    ListingReviewState: builder.enumType('ProductListingReviewState', {
      subGraphs: ['org', 'admin'],
      description: 'Admin moderation state of a product listing on the marketplace: PENDING (awaiting review), APPROVED (live-eligible), REJECTED, or SUSPENDED.',
      values: { PENDING: { value: 'pending' }, APPROVED: { value: 'approved' }, REJECTED: { value: 'rejected' }, SUSPENDED: { value: 'suspended' } } as const,
    }),
```

- [ ] **Step 3: Expose the review fields on `ProductChannelListing`** (`types/grafts.ts`). Add `import { productEnumRefs } from '../inputs'` (alongside existing imports) and, at the top of the registrar function body, `const enums = productEnumRefs()`. Then update the `isPublished` description and add three fields inside the `ProductChannelListing` `fields: t => ({ ... })`:

```ts
      isPublished: t.exposeBoolean('isPublished', { description: 'Whether the org has published this listing (the org gate). On a marketplace channel the product is live only once also approved.' }),
      reviewState: t.expose('reviewState', {
        type: enums.ListingReviewState,
        subGraphs: ['org', 'admin'],
        description: 'Admin moderation state on the marketplace channel. Always APPROVED for an org\'s own-channel listing.',
      }),
      reviewReason: t.exposeString('reviewReason', {
        nullable: true,
        subGraphs: ['org', 'admin'],
        description: 'Why the listing was rejected or suspended; null otherwise.',
      }),
      reviewedAt: t.expose('reviewedAt', {
        type: 'DateTime',
        nullable: true,
        subGraphs: ['org', 'admin'],
        description: 'When an admin last set the review state, or null if never reviewed.',
      }),
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @czo/product check-types`
Expected: PASS.

---

## Task 6: Errors registration

**Files:**
- Modify: `packages/modules/product/src/graphql/schema/product/errors.ts`

- [ ] **Step 1: Import the two new errors** from the services barrel (extend the existing `from '../../../services'` import or its source). Confirm `ChannelListingNotFound` and `NotAMarketplaceChannel` are re-exported by `src/services/index.ts`; if not, add them there.

- [ ] **Step 2: Register them tagged `['admin']`** (next to the other `registerError` calls):

```ts
  registerError(builder, ChannelListingNotFound, { name: 'ChannelListingNotFoundError', subGraphs: ['admin'] })
  registerError(builder, NotAMarketplaceChannel, { name: 'NotAMarketplaceChannelError', subGraphs: ['admin'] })
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @czo/product check-types`
Expected: PASS.

---

## Task 7: Admin moderation mutations

**Files:**
- Create: `packages/modules/product/src/graphql/schema/product/mutations/listingReview.ts`
- Modify: `packages/modules/product/src/graphql/schema/product/mutations/index.ts`

- [ ] **Step 1: Create `listingReview.ts`** with the three admin mutations:

```ts
// Admin marketplace-moderation mutations.
//
// The marketplace operator (GLOBAL `channel:update`) reviews product listings
// published onto a platform (org-null) channel. Pre-moderation: a listing is
// live only when its org published it AND an admin approved it. Reject/suspend
// carry a reason surfaced to the owning org.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { Effect } from 'effect'
import { ChannelListingService, ChannelListingNotFound, NotAMarketplaceChannel } from '../../../../services'
import { sg } from '../subgraphs'

export function registerListingReviewMutations(builder: ProductGraphQLSchemaBuilder): void {
  const adminScope = () => ({ permission: { resource: 'channel', actions: ['update'] } })

  // ── approveListing ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'approveListing',
    {
      ...sg('admin').input,
      inputFields: t => ({
        listingId: t.globalID({ for: 'ProductChannelListing', required: true, description: 'Global ID of the ProductChannelListing to approve.' }),
      }),
    },
    {
      ...sg('admin').field,
      description: 'Approves a product\'s marketplace listing, making it live-eligible (live once the org keeps it published). Requires the global `channel:update` role.',
      errors: { types: [ChannelListingNotFound, NotAMarketplaceChannel], ...sg('admin').errorOpts },
      authScopes: adminScope,
      resolve: async (_root, args, ctx) => {
        const listing = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelListingService
            return yield* svc.approveListing(Number(args.input.listingId.id))
          }),
        )
        return { listing }
      },
    },
    {
      ...sg('admin').payload,
      outputFields: t => ({
        listing: t.field({ type: 'ProductChannelListing', resolve: p => p.listing, description: 'The approved listing.' }),
      }),
    },
  )

  // ── rejectListing ───────────────────────────────────────────────────────────
  builder.relayMutationField(
    'rejectListing',
    {
      ...sg('admin').input,
      inputFields: t => ({
        listingId: t.globalID({ for: 'ProductChannelListing', required: true, description: 'Global ID of the ProductChannelListing to reject.' }),
        reason: t.string({ required: true, description: 'Why the listing is rejected; surfaced to the owning org.' }),
      }),
    },
    {
      ...sg('admin').field,
      description: 'Rejects a product\'s marketplace listing with a reason. Requires the global `channel:update` role.',
      errors: { types: [ChannelListingNotFound, NotAMarketplaceChannel], ...sg('admin').errorOpts },
      authScopes: adminScope,
      resolve: async (_root, args, ctx) => {
        const listing = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelListingService
            return yield* svc.rejectListing(Number(args.input.listingId.id), args.input.reason)
          }),
        )
        return { listing }
      },
    },
    {
      ...sg('admin').payload,
      outputFields: t => ({
        listing: t.field({ type: 'ProductChannelListing', resolve: p => p.listing, description: 'The rejected listing.' }),
      }),
    },
  )

  // ── suspendListing ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'suspendListing',
    {
      ...sg('admin').input,
      inputFields: t => ({
        listingId: t.globalID({ for: 'ProductChannelListing', required: true, description: 'Global ID of the ProductChannelListing to suspend.' }),
        reason: t.string({ required: true, description: 'Why the listing is suspended; surfaced to the owning org.' }),
      }),
    },
    {
      ...sg('admin').field,
      description: 'Suspends a previously-approved marketplace listing with a reason (takes it off the marketplace). Requires the global `channel:update` role.',
      errors: { types: [ChannelListingNotFound, NotAMarketplaceChannel], ...sg('admin').errorOpts },
      authScopes: adminScope,
      resolve: async (_root, args, ctx) => {
        const listing = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelListingService
            return yield* svc.suspendListing(Number(args.input.listingId.id), args.input.reason)
          }),
        )
        return { listing }
      },
    },
    {
      ...sg('admin').payload,
      outputFields: t => ({
        listing: t.field({ type: 'ProductChannelListing', resolve: p => p.listing, description: 'The suspended listing.' }),
      }),
    },
  )
}
```

- [ ] **Step 2: Register the new registrar** in `mutations/index.ts` — add the import and the call inside `registerProductMutations` (after `registerChannelListingMutations(builder)`):

```ts
import { registerListingReviewMutations } from './listingReview'
// ...
  registerListingReviewMutations(builder)
```

- [ ] **Step 3: Type-check + lint**

Run: `pnpm --filter @czo/product check-types && pnpm --filter @czo/product lint --max-warnings 0`
Expected: PASS. (If lint flags import ordering, let `lint:fix` reorder; re-check that `check-types` still passes — the kit enum-cast caveat does not apply here.)

---

## Task 8: E2E sub-graph exposure

**Files:**
- Modify: `packages/modules/product/src/e2e/subgraph-exposure.e2e.test.ts`

- [ ] **Step 1: Add the three admin mutations to `ADMIN_ONLY_MUTATIONS`**:

```ts
const ADMIN_ONLY_MUTATIONS = [
  'createProduct',
  'createProductType',
  'createCategory',
  'approveListing',
  'rejectListing',
  'suspendListing',
] as const
```

- [ ] **Step 2: Assert the review fields are absent from the public `ProductChannelListing`.** Inside the existing `/graphql/public` test, after the `Category`/`Collection` type assertions, add a field-level check:

```ts
    const listingFields = async (path: string): Promise<string[]> => {
      const res = await h.app.fetch(new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: `{ __type(name: "ProductChannelListing") { fields { name } } }` }),
      }))
      const body = (await res.json()) as IntrospectResult
      return (body.data?.__type?.fields ?? []).map(f => f.name)
    }
    const publicListing = await listingFields('/graphql/public')
    expect(publicListing).toContain('isPublished')
    expect(publicListing).not.toContain('reviewState')
    expect(publicListing).not.toContain('reviewReason')
```

- [ ] **Step 3: Run the exposure test**

Run: `pnpm --filter @czo/product test src/e2e/subgraph-exposure.e2e.test.ts`
Expected: PASS — `approveListing`/`rejectListing`/`suspendListing` present on `/graphql/admin`, absent from `/graphql/org` and `/graphql/public`; review fields absent from the public `ProductChannelListing`.

---

## Task 9: Full validation

- [ ] **Step 1: Apply the migration to a scratch DB if needed and run the full module suite**

Run: `pnpm --filter @czo/product test`
Expected: all suites PASS (213 prior + new service/exposure tests; the rewritten unpublish test green).

- [ ] **Step 2: Type-check the module and the app**

Run: `pnpm --filter @czo/product check-types && pnpm --filter life check-types`
Expected: PASS for both.

- [ ] **Step 3: Lint**

Run: `pnpm --filter @czo/product lint --max-warnings 0`
Expected: PASS.

- [ ] **Step 4: Stage only — do not commit.**

Run: `git add -A` (excluding the untracked `docs/superpowers/**` spec/plan files per project convention).
Report the staged file list and the validation results, then stop for user review.

---

## Self-review notes

- **Spec coverage:** schema (T1), guard relax + publish/unpublish + moderation (T2–T3), tests (T4), enum + node fields narrowed `['org','admin']` (T5), errors `['admin']` (T6), admin mutations `['admin']` gated GLOBAL `channel:update` (T7), exposure (T8). All spec sections map to a task.
- **Type consistency:** service method names (`approveListing`/`rejectListing`/`suspendListing`) and the `setReview` helper are used identically across contract, impl, and mutations. The enum DB values (`pending|approved|rejected|suspended`) match the GraphQL enum `value`s and the `reviewState` literal set on insert.
- **No behavior change to merged code beyond the two agreed points:** `guardCrossOrg`→`guardChannelTarget` (adds the marketplace path; other-org still denied) and `unpublish` (soft-delete → `isPublished=false` toggle, both tiers — the one rewritten test covers it).
