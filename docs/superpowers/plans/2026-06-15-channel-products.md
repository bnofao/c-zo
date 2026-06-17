# `channelProducts` + Listing Publishing-Org Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (1) Add `organizationId` (the publishing org) to `product_channel_listings`, set by `publishProduct` — the foundation for uniform storefront graft resolution. (2) Add a public relay connection `channelProducts(channel: Int!, …)` listing the products live on a channel.

**Architecture:** A nullable column + service set + node field; plus a new `['public']` `drizzleConnection` reusing `ProductService.findProducts` and the (widened-to-public) `ProductWhereInput`/`ProductOrderByInput`.

**Spec:** `docs/superpowers/specs/2026-06-15-channel-products-design.md`

**Branch:** continue on `feat/productbyhandle-publication-filter` (already has the publication filter + variants un-graft staged). Stage only — no commits until user review.

---

## Task 1: `organizationId` on `product_channel_listings`

**Files:** `src/database/schema.ts`, `src/services/channel-listing.ts`, `src/graphql/schema/product/types/grafts.ts`; migration; test `channel-listing.integration.test.ts`.

- [ ] **Step 1: Schema column** — add to the `productChannelListings` `pgTable` (nullable; the publishing org):

```ts
  organizationId: integer('organization_id'), // the org that published this listing
```

Place it near `productId`/`channelId`. Leave the unique index `(productId, channelId)` and others unchanged.

- [ ] **Step 2: Generate migration** — `pnpm --filter @czo/product migrate:generate`; confirm the diff is only `ALTER TABLE product_channel_listings ADD COLUMN organization_id integer;` (nullable, no backfill). Fix the snapshot's trailing newline via `lint --fix` on the new migration folder if needed.

- [ ] **Step 3: `publish` sets it** (`channel-listing.ts`). The `publish` closure has `input.organizationId` and does an upsert. Add `organizationId: input.organizationId` to BOTH the INSERT `.values({ … })` and the UPDATE `.set({ … })` (so a fresh listing records the publisher and a re-publish keeps it set to the acting org). Do not touch the review-state logic.

- [ ] **Step 4: Expose on the node** (`grafts.ts`, the `ProductChannelListing` drizzleNode). Add, narrowed to `['org','admin']` (publisher is back-office data, not storefront-public):

```ts
      organizationId: t.exposeInt('organizationId', { nullable: true, subGraphs: ['org', 'admin'], description: 'The organization that published this listing (null for legacy rows).' }),
```

- [ ] **Step 5: Test** — in `channel-listing.integration.test.ts`, assert a published listing carries the acting org: `const row = yield* svc.publish({ productId, channelId, organizationId: ORG }); expect(row.organizationId).toBe(ORG)`.

- [ ] **Step 6: Verify** — `pnpm --filter @czo/product check-types`; `pnpm --filter @czo/product test src/services/channel-listing.integration.test.ts`.

---

## Task 2: `channelProducts` connection

**Files:** `src/graphql/schema/product/inputs.ts` (widen input tags), `src/graphql/schema/product/queries.ts` (the connection).

- [ ] **Step 1: Widen the product input types to `public`** (`inputs.ts`). `ProductWhereInput`, `ProductOrderByInput`, `ProductOrderField`, and `ProductOrderDirection` are currently `subGraphs: ['org', 'admin']`. Change each to `subGraphs: ['public', 'org', 'admin']` (the public `channelProducts` `where`/`orderBy` args reference them). The kit shared filter inputs they compose (`IntFilter` etc.) are already centrally tagged across audiences — no change there. (The `graphql/index.ts` TS-interface map entries carry no `subGraphs` — leave them.)

- [ ] **Step 2: The connection** (`queries.ts`) — add (mirrors the `products` connection, but `['public']`, no authScopes, the live-on-channel base clause):

```ts
  // ── channelProducts — PUBLIC storefront catalog of a sales channel ──────────
  builder.queryField('channelProducts', t =>
    t.drizzleConnection({
      type: 'products',
      subGraphs: ['public'],
      description: 'Storefront catalog: paginated (relay) connection over the products live on a @czo/channel sales channel (a published, approved, non-deleted listing), with optional free-text search, filtering, and ordering. Public — publication is the gate.',
      args: {
        channel: t.arg.int({ required: true, description: 'Raw @czo/channel sales-channel id whose published catalog to read.' }),
        search: t.arg.string({ description: 'Free-text search across name and handle (case-insensitive substring).' }),
        where: t.arg({ type: 'ProductWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['ProductOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService
            const live = {
              channelListings: {
                channelId: args.channel,
                isPublished: true,
                reviewState: 'approved',
                deletedAt: { isNull: true },
              },
            }
            const s = args.search?.trim()
            const searchClause = s ? { OR: [{ name: { ilike: `%${s}%` } }, { handle: { ilike: `%${s}%` } }] } : null
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const where = { AND: [{ deletedAt: { isNull: true } }, live, userWhere, searchClause].filter(Boolean) }
            return yield* svc.findProducts(query({ where: where as any, orderBy: buildOrderBy(args.orderBy) }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['public'] }, { subGraphs: ['public'] }))
```

No `authScopes` (public; publication is the gate). 3-position tag `['public']`. `ProductService`, `buildOrderBy` are already imported in this file.

- [ ] **Step 3: Verify** — `pnpm --filter @czo/product check-types`; `pnpm --filter @czo/product test src/e2e/subgraph-exposure.e2e.test.ts` (schema builds; the `where as any` cast and the relational `channelListings` filter type-check — they did for `productByHandle`). `lint --max-warnings 0`.

---

## Task 3: E2E — channelProducts behavior + exposure

**Files:** create `src/e2e/channel-products.e2e.test.ts`; extend `src/e2e/subgraph-exposure.e2e.test.ts`.

- [ ] **Step 1: Behavior e2e.** Reuse the product e2e harness (the helpers `productbyhandle-publication.e2e` / `product-org.e2e` use to create an org + product + channel + `publishProduct`). Seed:
  - org A: product `chp-a1` published (live) on channel `C`, product `chp-a2` published on a different channel `C2`, product `chp-draft` not published.
  - (optionally) org B: product `chp-b1` published on `C`.
  Then query anonymously `channelProducts(channel: C, first: 50){ edges { node { id handle variants { edges { node { id } } } } pageInfo { hasNextPage } }`. Assert:
  - the result handles CONTAIN `chp-a1` (and `chp-b1` if seeded) — products live on `C`;
  - do NOT contain `chp-a2` (other channel) nor `chp-draft` (unpublished);
  - a returned node's `variants` resolves anonymously (the un-graft) without error;
  - `channelProducts(channel: C, search: "<substr of chp-a1's name>")` returns only the match;
  - pagination works (`first: 1` → 1 edge + `pageInfo.hasNextPage` true when >1 live).

- [ ] **Step 2: Exposure.** In `subgraph-exposure.e2e.test.ts`, assert `channelProducts` is present on `/graphql/public` and ABSENT from `/graphql/org` and `/graphql/admin` (it is `['public']`-only). Add it to whatever public-presence / org+admin-absence structure the file uses (it asserts query field presence per audience).

- [ ] **Step 3: Verify** — `pnpm --filter @czo/product test src/e2e/channel-products.e2e.test.ts src/e2e/subgraph-exposure.e2e.test.ts` → PASS.

---

## Task 4: Full validation

- [ ] `pnpm --filter @czo/product test` → all pass.
- [ ] `pnpm --filter @czo/product check-types && pnpm --filter life check-types` → PASS.
- [ ] `pnpm --filter @czo/product lint --max-warnings 0` → PASS (run `lint`, not `lint:fix`).
- [ ] `git add -A` excluding `docs/superpowers/**`; report staged files + results; stop for user review. Do **not** commit.

---

## Self-review notes

- **Spec coverage:** listing.organizationId column+service+node (T1), channelProducts connection + input widening (T2), behavior + exposure e2e (T3), validation (T4).
- **Reuse:** `findProducts` + `ProductWhereInput`/`ProductOrderByInput` (widened to public) + `search` + `buildOrderBy` — no new service/type beyond the column.
- **Security:** `channelProducts` is public with no authScopes — sound because every returned product has a live listing (published = public); `channel` is a disambiguator, not a boundary. Variants are un-grafted/public (this branch); true-overlay grafts keep their `viewerOrg`.
- **Foundation, not consumer:** `listing.organizationId` is written + exposed now; the storefront resolver that reads it (`viewerOrg = listing.organizationId` for prices/media) is the next sprint — flagged in the spec.
- **Migration:** one nullable `ADD COLUMN`, no backfill.
