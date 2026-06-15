# B19 (B) — Channel-scoped storefront product reads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **COMMIT POLICY (overrides every per-task "Commit" step):** stage with `git add` only; the work joins the single B19 commit on branch `feat/b19-api-key-request-auth` after user review. Never commit autonomously. Already on that branch — do not branch.

**Goal:** Give a storefront a channel-scoped, published-only product read surface (`channelProducts`) accessed with a `channel:read` API key, and gate the remaining fully-public product reads — so no product read is fully public.

**Architecture:** A new `channelProducts` query in `@czo/product` derives the channel's org (via `@czo/channel` `ChannelService`), gates on `channel:read` in that org (satisfiable by an API key per sub-project A), and returns `Product` nodes that have a `productChannelListings` row with `isPublished = true` on that channel. The generic `permission` auth scope is extended to accept `resource: string | string[]` (array = any-of); product's graft gate then requires `channel:read` OR `product:read` so a storefront key and an admin both read grafts. `productByHandle` gains a top-level gate.

**Tech Stack:** TypeScript, Effect-TS, Pothos GraphQL (relay + drizzle plugins), Drizzle RQBv2, `@czo/auth` (`AccessService`, `OrganizationService`/`UserService`, the generalized `permission` scope), `@czo/channel` `ChannelService`, Testcontainers via the product cross-module E2E harness.

**Spec:** `docs/superpowers/specs/2026-06-09-b19-b-product-storefront-reads-design.md`
**Depends on:** B19 (A) on this branch (api-key request auth + the `permission` api-key branch).

---

## File Structure

- **Modify** `packages/modules/auth/src/graphql/scopes.ts` — generalize the `permission` resolver to accept `resource: string | string[]` (any-of).
- **Modify** `packages/modules/auth/src/graphql/index.ts` — widen `BuilderAuthScopes.permission.resource` to `string | string[]`.
- **Modify** `packages/modules/product/src/graphql/schema/product/types/merge.ts` — `graftAuthScopes` returns `permission` with `resource: ['channel','product']` instead of `resource: 'product'`.
- **Modify** `packages/modules/product/src/services/channel-listing.ts` — add `listPublishedChannelProducts`.
- **Modify** `packages/modules/product/src/graphql/schema/product/queries.ts` — add `channelProducts`; gate `productByHandle`; drop the stale DEFERRED note.
- **Modify** `packages/modules/product/src/graphql/schema/product/authz.ts` — add `loadChannelOrganizationId` helper (derive a channel's org).
- **Create** `packages/modules/product/src/e2e/storefront-channel.e2e.test.ts` — the E2E.

No DB migration. `productChannelListings` is keyed by `(productId, channelId)` (no `organizationId`); the org is the channel's.

---

### Task 1: Extend the `permission` scope to accept `resource: string | string[]` (any-of)

**Files:**
- Modify: `packages/modules/auth/src/graphql/index.ts` (BuilderAuthScopes `permission.resource` type)
- Modify: `packages/modules/auth/src/graphql/scopes.ts` (the `permission` resolver)

- [ ] **Step 1: Widen the type**

In `packages/modules/auth/src/graphql/index.ts`, in `interface BuilderAuthScopes`, change `permission.resource` from `string` to `string | string[]`:

```ts
    permission: {
      resource: string | string[]
      actions: string[]
      organization?: number
    }
```

(Additive — `string` is assignable to `string | string[]`, so every existing `{ permission: { resource: 'x', … } }` call still type-checks.)

- [ ] **Step 2: Generalize the resolver**

In `packages/modules/auth/src/graphql/scopes.ts`, change the `permission` resolver's parameter type and build a `required` map + `connector` from the resource (string ⇒ one entry, `AND`; array ⇒ any-of, `OR`), then thread both through the three existing checks:

```ts
    permission: async (
      { resource, actions, organization }:
      { resource: string | string[], actions: string[], organization?: number },
    ) => {
      const userId = ctx?.auth?.user?.id
      const apiKey = ctx?.auth?.apiKey
      if (!userId && !apiKey)
        return false

      const resources = Array.isArray(resource) ? resource : [resource]
      const required = Object.fromEntries(resources.map(r => [r, actions]))
      const connector: 'AND' | 'OR' = resources.length > 1 ? 'OR' : 'AND'

      return ctx.runEffect(
        Effect.gen(function* () {
          // ── API-key principal (no session user). v1: org-owned, org-scoped. ──
          if (!userId && apiKey) {
            if (organization == null)
              return false
            if (apiKey.organizationId == null || apiKey.organizationId !== organization)
              return false
            const access = yield* AccessService
            return yield* access.authorize(apiKey.permissions, required, connector)
          }

          // ── Session user (unchanged for a single resource). ──────────────
          if (organization != null) {
            const orgSvc = yield* OrganizationService
            const membership = yield* orgSvc.findFirstMember(organization, {
              where: { userId: Number(userId) },
            }).pipe(Effect.catchTag('MemberNotFound', () => Effect.succeed(null)))
            if (!membership?.role)
              return false
            return yield* orgSvc.hasPermission({
              orgId: String(organization),
              role: membership.role,
              permissions: required,
              connector,
            })
          }
          const users = yield* UserService
          return yield* users.hasPermission({
            role: ctx.auth?.user?.role ?? undefined,
            permissions: required,
            connector,
          })
        }),
      )
    },
```

(`AccessService.authorize(granted, required, connector)`, `OrganizationService.hasPermission({ …, connector })`, and `UserService.hasPermission({ …, connector })` all already accept `'AND' | 'OR'`. A single string resource → `connector = 'AND'`, `required = { [resource]: actions }` — byte-equivalent to today.)

- [ ] **Step 3: Type-check + lint + build**

Run: `pnpm --filter @czo/auth check-types && pnpm --filter @czo/auth lint --max-warnings 0 && pnpm --filter @czo/auth build`
Expected: PASS (additive, backward compatible). The array (any-of) behaviour is proven by the product E2E in Task 5.

- [ ] **Step 4: Regression — existing auth suite (single-resource path unchanged)**

Run: `pnpm --filter @czo/auth test`
Expected: all pass — every existing `permission` call uses a string resource → `AND` → identical behaviour.

---

### Task 2: Product graft gate uses the `permission` any-of

**Files:**
- Modify: `packages/modules/product/src/graphql/schema/product/types/merge.ts`

- [ ] **Step 1: Switch the graft gate**

Replace the `graftAuthScopes` function body's return type + the supplied-org branch. The current function:

```ts
export function graftAuthScopes(
  args: { viewerOrg?: { id: string } | null },
): true | { permission: { resource: string, actions: string[], organization: number } } {
  const org = viewerOrgId(args)
  return org == null
    ? true
    : { permission: { resource: 'product', actions: ['read'], organization: org } }
}
```

becomes:

```ts
export function graftAuthScopes(
  args: { viewerOrg?: { id: string } | null },
): true | { permission: { resource: string[], actions: string[], organization: number } } {
  const org = viewerOrgId(args)
  // viewerOrg omitted → public base rows only (the surrounding query's own gate
  // suffices). Supplied → channel:read OR product:read in that org (the resource
  // array = any-of), so a storefront key AND an admin both pass; a foreign org
  // is denied. Product owns this domain choice; auth just sees an any-of permission.
  return org == null
    ? true
    : { permission: { resource: ['channel', 'product'], actions: ['read'], organization: org } }
}
```

Also update the function's doc comment that currently says "require `product:read` in THAT org" → "require `channel:read` OR `product:read` in THAT org (the resource array)".

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @czo/auth build && pnpm --filter @czo/product check-types`
Expected: PASS (the graft fields' `authScopes` use the `permission` scope with a `resource` array, which `BuilderAuthScopes` now allows).

---

### Task 3: `channelProducts` query + service method

**Files:**
- Modify: `packages/modules/product/src/graphql/schema/product/authz.ts` (add `loadChannelOrganizationId`)
- Modify: `packages/modules/product/src/services/channel-listing.ts` (add `listPublishedChannelProducts`)
- Modify: `packages/modules/product/src/graphql/schema/product/queries.ts` (add the query)

- [ ] **Step 1: Add the channel-org loader**

In `packages/modules/product/src/graphql/schema/product/authz.ts`, add (importing `Channel` from `@czo/channel/services` and `Effect` if not present):

```ts
import { Channel } from '@czo/channel/services'

/** Resolve a channel's owning org id (cross-module), or null if unknown/deleted. */
export function loadChannelOrganizationId(ctx: GraphQLContextMap, channelId: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* Channel.ChannelService
      const row = yield* svc.findFirst({ where: { id: channelId } }).pipe(
        Effect.catchTag('ChannelNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}
```

(Match the existing helpers in this file for the exact `ctx.runEffect` / import style; `Channel.ChannelService.findFirst({ where: { id } })` returns the channel row with `organizationId`, mirroring `@czo/channel`'s own `loadOrganizationId`.)

- [ ] **Step 2: Add the service method**

In `packages/modules/product/src/services/channel-listing.ts`, add to the `ChannelListingService` shape and `make` a method that returns products published on a channel. It threads the relay `query` config and filters via the `channelListings` relation (RQBv2 pushes a relation filter to an EXISTS subquery):

```ts
// In the service interface (Context.Service shape):
readonly listPublishedChannelProducts: (
  input: { channelId: number, handle?: string, search?: string },
  query: <T>(config: T) => T,
) => Effect.Effect<ReadonlyArray<Product>, ChannelListingDbFailed>

// In `make` (import `Product` type from './product'):
const listPublishedChannelProducts: ChannelListingServiceImpl['listPublishedChannelProducts'] = (input, query) =>
  dbErr(db.query.products.findMany(query({
    where: {
      deletedAt: { isNull: true },
      ...(input.handle ? { handle: input.handle } : {}),
      ...(input.search
        ? { OR: [{ name: { ilike: `%${input.search}%` } }, { handle: { ilike: `%${input.search}%` } }] }
        : {}),
      // Products having a published, non-deleted listing on this channel.
      channelListings: { channelId: input.channelId, isPublished: true, deletedAt: { isNull: true } },
    },
  }))) as Effect.Effect<ReadonlyArray<Product>, ChannelListingDbFailed>
```

(Use the file's existing `dbErr` wrapper and `Product` type import — `import type { Product } from './product'`. The `channelListings` relation already exists on `products` in `relations.ts` — it backs the Product node's `channelListings` connection.)

- [ ] **Step 2b: Run a quick type-check of the service**

Run: `pnpm --filter @czo/product check-types`
Expected: PASS.

- [ ] **Step 3: Add the `channelProducts` query**

In `packages/modules/product/src/graphql/schema/product/queries.ts`, add a `ChannelListingService` import and register the query (a `drizzleConnection` over `products`):

```ts
  // ── channelProducts(channel, handle?, search?) — STOREFRONT read ──────────
  // Products PUBLISHED on a channel. Gated on `channel:read` in the channel's
  // org (an org-owned channel:read API key passes — see B19 A). No public
  // branch. Unknown channel or insufficient permission → denied (uniform, no
  // existence oracle).
  builder.queryField('channelProducts', t =>
    t.drizzleConnection({
      type: 'products',
      description: 'Storefront read: a relay connection of products PUBLISHED on a sales channel. Requires `channel:read` in the channel\'s organization (a storefront API key). With `handle`, narrows to one product (PDP); `search` matches name/handle.',
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadChannelOrganizationId(ctx, Number(args.channel.id))
        if (organization == null)
          return false
        return { permission: { resource: 'channel', actions: ['read'], organization } }
      },
      args: {
        channel: t.arg.globalID({ for: 'Channel', required: true, description: 'The sales channel to read published products from.' }),
        handle: t.arg.string({ description: 'Optional: narrow to the single product with this handle (PDP).' }),
        search: t.arg.string({ description: 'Optional case-insensitive substring over name and handle.' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelListingService
            return yield* svc.listPublishedChannelProducts(
              {
                channelId: Number(args.channel.id),
                handle: args.handle ?? undefined,
                search: args.search ?? undefined,
              },
              query,
            )
          }),
        ) as Promise<any>,
    }))
```

Add `ChannelListingService` and `loadChannelOrganizationId` to the imports at the top of the file (from `../../../services` and `./authz`).

- [ ] **Step 4: Type-check + lint**

Run: `pnpm --filter @czo/product check-types && pnpm --filter @czo/product lint --max-warnings 0`
Expected: PASS.

---

### Task 4: Gate `productByHandle`

**Files:**
- Modify: `packages/modules/product/src/graphql/schema/product/queries.ts`

- [ ] **Step 1: Add the top-level gate + clean the comment**

The current `productByHandle` has NO `authScopes` (fully public). Add one (after `nullable: true`, before `args`):

```ts
      authScopes: (_parent, args) =>
        args.viewerOrg == null
          ? { permission: { resource: 'product', actions: ['read'] } }
          : { permission: { resource: ['channel', 'product'], actions: ['read'], organization: Number(args.viewerOrg.id) } },
```

So: no `viewerOrg` → require the global `product:read` role; a `viewerOrg` → `channel:read` OR `product:read` (the any-of) in that org. The product is no longer fully public.

Update its `description` to drop "Currently public — see the storefront access gate note." → e.g. "Storefront/admin read: fetch a product by handle. Requires `product:read` (global) or `channel:read`/`product:read` in `viewerOrg`."

- [ ] **Step 2: Remove the stale DEFERRED header note**

Delete the `// DEFERRED — storefront access gate: …` block at the top of `queries.ts` (lines describing the interim public state — it's now resolved). Keep the rest of the file header.

- [ ] **Step 3: Type-check + lint**

Run: `pnpm --filter @czo/product check-types && pnpm --filter @czo/product lint --max-warnings 0`
Expected: PASS.

---

### Task 5: E2E

**Files:**
- Create: `packages/modules/product/src/e2e/storefront-channel.e2e.test.ts`

- [ ] **Step 1: Write the test**

```ts
// B19 (B) E2E: channel-scoped storefront reads.
// An org-A `channel:read` API key reads products PUBLISHED on org A's channel
// via `channelProducts`, with org-A grafts; unpublished products and the admin
// path are invisible; productByHandle is now gated.

import type { ProductHarness } from './harness'
import { Channel as ChannelSvc } from '@czo/channel/services'
import { ApiKeyService } from '@czo/auth/services'
import { decodeGlobalID, encodeGlobalID } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ChannelListingService, ProductService, ProductTypeService } from '../services'
import { bootProductApp } from './harness'

const GRAPHQL_URL = 'http://localhost/graphql'

async function gqlKey(app: ProductHarness['app'], query: string, variables: Record<string, unknown>, apiKey?: string) {
  const res = await app.fetch(new Request(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
    body: JSON.stringify({ query, variables }),
  }))
  return res.json() as Promise<{ data?: any, errors?: any[] }>
}

const CHANNEL_PRODUCTS = `query ($c: ID!, $h: String) {
  channelProducts(channel: $c, handle: $h) { edges { node { id handle } } } }`

describe('storefront channel reads (E2E)', () => {
  let h: ProductHarness
  let aChannelGid: string
  let bChannelGid: string
  let aKey: string          // org-A channel:read key
  let bKey: string          // org-B channel:read key
  let publishedHandle: string
  let unpublishedHandle: string
  let aOrgGid: string
  let aOrgNum: number
  let bOrgGid: string

  beforeAll(async () => {
    h = await bootProductApp()
    const owner = await h.signUp('sf-b-owner@ex.com', 'Owner', 'password1234')
    const a = await h.createOrgWithProductAccess(owner, 'Acme', 'acme')
    aOrgGid = a.orgGlobalId
    aOrgNum = a.orgNumericId
    const bOwner = await h.signUp('sf-b-b@ex.com', 'B', 'password1234')
    const b = await h.createOrgWithProductAccess(bOwner, 'Bravo', 'bravo')
    bOrgGid = b.orgGlobalId

    publishedHandle = 'acme-pub'
    unpublishedHandle = 'acme-unpub'

    // Seed: a channel for A and B; two A products; publish one on A's channel.
    const seeded = await h.app.runEffect(Effect.gen(function* () {
      const chan = yield* ChannelSvc.ChannelService
      const aChan = yield* chan.create({ organizationId: aOrgNum, name: 'A Web', handle: 'a-web' })
      const bChan = yield* chan.create({ organizationId: b.orgNumericId, name: 'B Web', handle: 'b-web' })

      const types = yield* ProductTypeService
      const type = yield* types.createType({ organizationId: aOrgNum, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
      const products = yield* ProductService
      const pub = yield* products.createProduct({ organizationId: aOrgNum, productTypeId: type.id, handle: publishedHandle, name: 'Pub' })
      const unpub = yield* products.createProduct({ organizationId: aOrgNum, productTypeId: type.id, handle: unpublishedHandle, name: 'Unpub' })

      const listings = yield* ChannelListingService
      yield* listings.publishListing({ productId: pub.id, organizationId: aOrgNum, channelId: aChan.id, isPublished: true })

      return { aChanId: aChan.id, bChanId: bChan.id }
    }))
    aChannelGid = encodeGlobalID('Channel', String(seeded.aChanId))
    bChannelGid = encodeGlobalID('Channel', String(seeded.bChanId))

    const mkKey = (orgNum: number) => h.app.runEffect(Effect.gen(function* () {
      const svc = yield* ApiKeyService
      const { plain } = yield* svc.create(
        { name: 'sf', group: 'default', prefix: 'sf', referenceId: orgNum, permissions: { channel: ['read'] }, rateLimitEnabled: false },
        { reference: 'organization' },
      )
      return plain
    }))
    aKey = await mkKey(aOrgNum)
    bKey = await mkKey(b.orgNumericId)
  }, 240_000)

  afterAll(() => h.close())

  it('browse: channel:read key sees published products on its channel, not unpublished', async () => {
    const res = await gqlKey(h.app, CHANNEL_PRODUCTS, { c: aChannelGid }, aKey)
    expect(res.errors).toBeUndefined()
    const handles = res.data.channelProducts.edges.map((e: any) => e.node.handle)
    expect(handles).toContain(publishedHandle)
    expect(handles).not.toContain(unpublishedHandle)
  })

  it('PDP: handle filter returns the single published product; unpublished handle → empty', async () => {
    const pub = await gqlKey(h.app, CHANNEL_PRODUCTS, { c: aChannelGid, h: publishedHandle }, aKey)
    expect(pub.data.channelProducts.edges).toHaveLength(1)
    const un = await gqlKey(h.app, CHANNEL_PRODUCTS, { c: aChannelGid, h: unpublishedHandle }, aKey)
    expect(un.data.channelProducts.edges).toHaveLength(0)
  })

  it('cross-org channel: an org-B key cannot read org A\'s channel', async () => {
    const res = await gqlKey(h.app, CHANNEL_PRODUCTS, { c: aChannelGid }, bKey)
    expect(res.data?.channelProducts ?? null).toBeNull()
  })

  it('no key → denied', async () => {
    const res = await gqlKey(h.app, CHANNEL_PRODUCTS, { c: aChannelGid })
    expect(res.data?.channelProducts ?? null).toBeNull()
  })

  it('grafts: a channel:read key reads org-A grafts (attributeValues) for its org', async () => {
    const Q = `query ($c: ID!, $org: ID!) {
      channelProducts(channel: $c) { edges { node { attributeValues(viewerOrg: $org) { edges { node { id } } } } } } }`
    const res = await gqlKey(h.app, Q, { c: aChannelGid, org: aOrgGid }, aKey)
    expect(res.errors).toBeUndefined()
  })

  it('graft cross-org deny: an org-A key passing viewerOrg=B is denied (permission any-of in B fails)', async () => {
    const Q = `query ($c: ID!, $org: ID!) {
      channelProducts(channel: $c) { edges { node { attributeValues(viewerOrg: $org) { edges { node { id } } } } } } }`
    const res = await gqlKey(h.app, Q, { c: aChannelGid, org: bOrgGid }, aKey)
    expect(res.errors).toBeDefined()
  })

  it('productByHandle is now gated: anonymous is denied', async () => {
    const Q = `query ($h: String!) { productByHandle(handle: $h) { id } }`
    const res = await gqlKey(h.app, Q, { h: publishedHandle })
    expect(res.data?.productByHandle ?? null).toBeNull()
  })

  it('a channel:read key cannot use the admin products(viewerOrg) query', async () => {
    const Q = `query ($org: ID!) { products(viewerOrg: $org) { id } }`
    const res = await gqlKey(h.app, Q, { org: aOrgGid }, aKey)
    expect(res.data?.products ?? null).toBeNull()
  })
})
```

> **Implementer note:** verify the exact seeding service signatures against the repo before running (`ProductTypeService.createType`, `ProductService.createProduct`, `ChannelListingService.publishListing`, `ChannelService.create`, `ApiKeyService.create`) and adjust the seed calls to match — they are seed scaffolding, not the unit under test. The `graft cross-org deny` case must pass a real **org-B Organization** global id as `viewerOrg` (encode org B's numeric id as `Organization`); fix the placeholder there. Keep the 8 assertions.

- [ ] **Step 2: Run it**

Run: `pnpm --filter @czo/product test src/e2e/storefront-channel.e2e.test.ts`
Expected: **8 passed** — published browse, PDP filter, cross-org channel deny, no-key deny, graft read, graft cross-org deny, `productByHandle` gated, admin-path deny.

---

### Task 6: Full validation + stage

- [ ] **Step 1: Targeted gates**

Run: `pnpm --filter @czo/auth check-types && pnpm --filter @czo/auth lint --max-warnings 0`
Run: `pnpm --filter @czo/product check-types && pnpm --filter @czo/product lint --max-warnings 0`
Expected: PASS. (If lint fails on formatting only, `lint:fix` then re-run BOTH check-types and lint — do not blindly trust lint:fix.)

- [ ] **Step 2: Build + full suites**

Run: `pnpm --filter @czo/auth build && pnpm --filter @czo/product build`
Run: `pnpm --filter @czo/product test` (full product suite — the existing storefront E2Es must still pass; some assert `productByHandle` was public, so **update those** to the gated behaviour as part of this task if they fail).
Run: `pnpm --filter @czo/auth test`
Expected: all pass.

- [ ] **Step 3: Downstream**

Run: `pnpm --filter life check-types`
Expected: PASS.

- [ ] **Step 4: Stage (do NOT commit)**

```bash
git add packages/modules/auth/src/graphql/scopes.ts \
        packages/modules/auth/src/graphql/index.ts \
        packages/modules/product/src/graphql/schema/product/types/merge.ts \
        packages/modules/product/src/graphql/schema/product/authz.ts \
        packages/modules/product/src/services/channel-listing.ts \
        packages/modules/product/src/graphql/schema/product/queries.ts \
        packages/modules/product/src/e2e/storefront-channel.e2e.test.ts \
        docs/superpowers/specs/2026-06-09-b19-b-product-storefront-reads-design.md \
        docs/superpowers/plans/2026-06-09-b19-b-product-storefront-reads.md
```

(Plus any existing product E2E test files updated in Step 2.) Report completion; the work joins the single B19 commit after review.

---

## Regression note — existing storefront E2Es

`packages/modules/product/src/e2e/product-global.e2e.test.ts` and `product-org.e2e.test.ts` assert `productByHandle` is readable **without** a principal (it was public). After Task 4 it requires a principal. Update those specific assertions/queries to pass a session token (the owner's) or expect the gated behaviour — this is expected fallout of closing the public read, not a bug. Confirm with `pnpm --filter @czo/product test` in Task 6.

## Out of scope (per spec)

`visibleInListings` / `availableForPurchaseAt` filters; a dedicated `StorefrontProduct` node; per-channel key scoping; exposing `permissions` on the `createApiKey` mutation.
