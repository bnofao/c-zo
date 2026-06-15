# Marketplace Taxonomy Enforcement (Sprint 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A product is publishable on the marketplace channel only if its product type is global and it carries no org-private base category placement — enforced at `publishProduct` (org, fail-fast) and re-checked at `approveListing` (admin).

**Architecture:** A `checkMarketplaceCompliance(productId)` closure in `ChannelListingService` (one nested `db` read; no new service dep). `publish`'s `isMarketplace` branch calls it before creating the `pending` listing. `setReview` is refactored into `loadMarketplaceListing` + `writeReview` so `approveListing` can run the compliance check between the channel check and the write, while `reject`/`suspend` keep their narrow error channels.

**Tech Stack:** Drizzle RQBv2, Effect-TS, Pothos relay + `@pothos/plugin-errors` + sub-graph, Vitest + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-06-15-marketplace-taxonomy-enforcement-design.md`

**Branch:** `feat/marketplace-taxonomy-enforcement` off `main` (S1 #141 + S2 #142 are merged). Stage only — no commits until user review.

---

## Task 1: Service — errors + compliance check + enforcement (`ChannelListingService`)

**Files:** Modify `packages/modules/product/src/services/channel-listing.ts`.

Read the file first. It has: tagged errors (`ChannelListingDbFailed`, `ChannelListingNotFound`, `NotAMarketplaceChannel`) and re-exports `ProductNotFound`/`ProductNotAdopted`/`CrossOrgGraftDenied`; `make` with `db`, `productService`, `adoptionService`, `channelService`, a `dbErr` helper, `guardProductActable`, `guardChannelTarget`, `publish` (with an `isMarketplace` branch), `unpublish`, `listListings`, `setReview`, `approveListing`/`rejectListing`/`suspendListing`.

- [ ] **Step 1: Two tagged errors** (after `NotAMarketplaceChannel`):

```ts
export class ProductTypeNotGlobal extends Data.TaggedError('ProductTypeNotGlobal')<{ readonly productTypeId: number }> {
  readonly code = 'PRODUCT_TYPE_NOT_GLOBAL'
  get message() { return 'A marketplace product must have a global product type' }
}
export class MarketplaceCategoryNotGlobal extends Data.TaggedError('MarketplaceCategoryNotGlobal')<{ readonly categoryId: number }> {
  readonly code = 'MARKETPLACE_CATEGORY_NOT_GLOBAL'
  get message() { return 'A marketplace product cannot be placed in an org-private category' }
}
```

- [ ] **Step 2: `checkMarketplaceCompliance` closure** (in `make`, after `guardChannelTarget`). `ProductNotFound` is already imported/re-exported in this file:

```ts
  /**
   * Marketplace eligibility: the product's type must be global and none of its
   * base (org-null) category placements may reference an org-private category.
   * Org-overlay placements (organizationId set) are store-only and ignored.
   */
  const checkMarketplaceCompliance = (productId: number) =>
    Effect.gen(function* () {
      const product = yield* dbErr(db.query.products.findFirst({
        where: { id: productId, deletedAt: { isNull: true as const } },
        columns: { id: true },
        with: {
          productType: { columns: { id: true, organizationId: true } },
          categories: {
            where: { organizationId: { isNull: true as const } },
            columns: { id: true },
            with: { category: { columns: { id: true, organizationId: true } } },
          },
        },
      }))
      if (!product)
        return yield* Effect.fail(new ProductNotFound())
      if (product.productType.organizationId !== null)
        return yield* Effect.fail(new ProductTypeNotGlobal({ productTypeId: product.productType.id }))
      for (const placement of product.categories) {
        if (placement.category.organizationId !== null)
          return yield* Effect.fail(new MarketplaceCategoryNotGlobal({ categoryId: placement.category.id }))
      }
    })
```

If the nested filtered relation read doesn't type/run in this Drizzle RQB version, split into two reads: (a) `products.findFirst({ where:{id}, with:{ productType:{columns:{id,organizationId}} } })`; (b) `productCategories.findMany({ where:{ productId, organizationId:{isNull:true} }, with:{ category:{columns:{id,organizationId}} } })`. Same behavior.

- [ ] **Step 3: Enforce in `publish`.** In the `isMarketplace` branch, immediately after `const { isMarketplace } = yield* guardChannelTarget(...)`, add:

```ts
      if (isMarketplace)
        yield* checkMarketplaceCompliance(input.productId)
```

- [ ] **Step 4: Widen `publish`'s contract error channel** to add `ProductTypeNotGlobal | MarketplaceCategoryNotGlobal` (it already has `ProductNotFound`). Update the `readonly publish: ...` line in the `Context.Service` shape.

- [ ] **Step 5: Refactor `setReview` → `loadMarketplaceListing` + `writeReview`.** Replace the `setReview` closure with two closures, then redefine the three review methods:

```ts
  /** Load a live listing and require its channel to be a marketplace (platform) channel. */
  const loadMarketplaceListing = (listingId: number) =>
    Effect.gen(function* () {
      const listing = yield* dbErr(db.query.productChannelListings.findFirst({
        where: { id: listingId, deletedAt: { isNull: true as const } },
      }))
      if (!listing)
        return yield* Effect.fail(new ChannelListingNotFound())
      const channel = yield* channelService.findFirst({ where: { id: listing.channelId } }).pipe(
        Effect.mapError(e => e._tag === 'ChannelNotFound' ? new NotAMarketplaceChannel() : new ChannelListingDbFailed({ cause: e })),
      )
      if (channel.organizationId !== null)
        return yield* Effect.fail(new NotAMarketplaceChannel())
      return listing as ProductChannelListing
    })

  const writeReview = (listingId: number, reviewState: 'approved' | 'rejected' | 'suspended', reviewReason: string | null) =>
    Effect.gen(function* () {
      const [row] = yield* dbErr(db
        .update(productChannelListingsTable)
        .set({ reviewState, reviewReason, reviewedAt: sql`NOW()` as any, updatedAt: sql`NOW()` as any })
        .where(sql`${productChannelListingsTable.id} = ${listingId} AND ${productChannelListingsTable.deletedAt} IS NULL`)
        .returning())
      return row! as ProductChannelListing
    })

  const approveListing: ChannelListingServiceImpl['approveListing'] = listingId =>
    Effect.gen(function* () {
      const listing = yield* loadMarketplaceListing(listingId)
      yield* checkMarketplaceCompliance(listing.productId)
      return yield* writeReview(listingId, 'approved', null)
    })

  const rejectListing: ChannelListingServiceImpl['rejectListing'] = (listingId, reason) =>
    Effect.gen(function* () {
      yield* loadMarketplaceListing(listingId)
      return yield* writeReview(listingId, 'rejected', reason)
    })

  const suspendListing: ChannelListingServiceImpl['suspendListing'] = (listingId, reason) =>
    Effect.gen(function* () {
      yield* loadMarketplaceListing(listingId)
      return yield* writeReview(listingId, 'suspended', reason)
    })
```

(Use the file's actual aliases — `productChannelListingsTable`, `ProductChannelListing` — and confirm `channelService.findFirst` + the `ChannelNotFound` mapping match what `setReview` did. Delete the old `setReview`.)

- [ ] **Step 6: Widen `approveListing`'s contract error channel** to add `ProductNotFound | ProductTypeNotGlobal | MarketplaceCategoryNotGlobal`. Leave `rejectListing`/`suspendListing` contracts unchanged (they no longer touch the compliance path). Confirm `check-types` infers cleanly — the three methods now have distinct error channels.

- [ ] **Step 7: Type-check.** `pnpm --filter @czo/product check-types` → PASS.

---

## Task 2: Service integration tests

**Files:** Modify `packages/modules/product/src/services/channel-listing.integration.test.ts`.

- [ ] **Step 1: Add compliance tests** (match the file's `layer`/`truncate*`/`makeType`/`makeProduct`/`makeChannel`/`makePlatformChannel` helpers — `makePlatformChannel` was added in the marketplace sprint; `makeType` takes an org-or-null). Use a dummy category id via the category service if available, else seed `product_categories` directly. Cover:

```ts
  it.effect('publish on marketplace with an org-private product type → ProductTypeNotGlobal', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(ORG, 'enf-orgtype')           // org-tier type
      const product = yield* makeProduct(ORG, type.id, 'enf-p1')
      const market = yield* makePlatformChannel('enf-m1')
      const err = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductTypeNotGlobal')
    }))

  it.effect('publish on marketplace with a global type and no categories → pending', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* ChannelListingService
      const type = yield* makeType(null, 'enf-globtype')          // global type
      const product = yield* makeProduct(ORG, type.id, 'enf-p2')
      const market = yield* makePlatformChannel('enf-m2')
      const row = yield* svc.publish({ productId: product.id, channelId: market.id, organizationId: ORG })
      expect(row.reviewState).toBe('pending')
    }))
```

Add the category cases using the project's `CategoryService` + `placeProduct` (it takes `{ productId, categoryId, organizationId }`):
- a base placement (`organizationId: null`) into an **org-private** category → publish on marketplace → `MarketplaceCategoryNotGlobal`.
- a base placement into a **global** category → publish → `pending`.

And the approve re-check:
- publish a compliant product → `pending`; then make its type org-private (re-type via `ProductTypeService.updateType`, or create the product under an org type and the listing under a global one then... simplest: directly UPDATE the product's `productTypeId` to an org type via the test DB handle, OR use a product whose type is flipped). Then `approveListing(listing.id)` → `Effect.flip`, expect `ProductTypeNotGlobal`; assert the listing is still `pending`.
- a compliant listing → `approveListing` → `approved`. `rejectListing`/`suspendListing` on a compliant or non-compliant listing still work (they don't run the compliance check).
- own-channel publish (non-marketplace) with an org type → still succeeds (compliance is marketplace-only).

Run: `pnpm --filter @czo/product test src/services/channel-listing.integration.test.ts` → PASS.

---

## Task 3: GraphQL — register errors + widen mutation error sets

**Files:** Modify `src/graphql/schema/product/errors.ts`, `src/graphql/schema/product/mutations/channelListing.ts`, `src/graphql/schema/product/mutations/listingReview.ts`.

- [ ] **Step 1: Register the two errors** in `errors.ts` (import from `../../../services` — re-export them from the services barrel `index.ts` first, sourced from `./channel-listing`, mirroring the existing `ChannelListingNotFound`/`NotAMarketplaceChannel` exports):

```ts
  registerError(builder, ProductTypeNotGlobal, { name: 'ProductTypeNotGlobalError', subGraphs: ['org', 'admin'] })
  registerError(builder, MarketplaceCategoryNotGlobal, { name: 'MarketplaceCategoryNotGlobalError', subGraphs: ['org', 'admin'] })
```

- [ ] **Step 2: Add them to `publishProduct`'s `errors.types`** (`mutations/channelListing.ts`). `publishProduct` currently lists `[ProductNotFound, ProductNotAdopted, CrossOrgGraftDenied]` — add `ProductTypeNotGlobal, MarketplaceCategoryNotGlobal`. Import the two classes.

- [ ] **Step 3: Add them to `approveListing`'s `errors.types`** (`mutations/listingReview.ts`). It currently lists `[ChannelListingNotFound, NotAMarketplaceChannel]` — add `ProductNotFound, ProductTypeNotGlobal, MarketplaceCategoryNotGlobal`. Import the classes. (`ProductNotFound` is already registered in `errors.ts`; just reference it.)

- [ ] **Step 4: check-types + schema build + lint.** `pnpm --filter @czo/product check-types`; `pnpm --filter @czo/product test src/e2e/subgraph-exposure.e2e.test.ts` (schema builds across sub-graphs with the new errors); `lint --max-warnings 0` (verify check-types separately after any `--fix`).

---

## Task 4: Full validation

- [ ] `pnpm --filter @czo/product test` → all pass (the existing marketplace + product suites + the new compliance tests).
- [ ] `pnpm --filter @czo/product check-types && pnpm --filter life check-types` → PASS.
- [ ] `pnpm --filter @czo/product lint --max-warnings 0` → PASS.
- [ ] `git add -A` excluding `docs/superpowers/**`; report staged files + results; stop for user review. Do **not** commit.

---

## Self-review notes

- **Spec coverage:** compliance check (T1 S2), publish enforcement (T1 S3–S4), approve re-check via the setReview refactor (T1 S5–S6), errors (T1 S1 + T3), tests (T2), validation (T4).
- **Refactor rationale:** `setReview` is split so the compliance check sits between the marketplace-channel check and the write, and so `reject`/`suspend` keep their narrow error channels (they never throw the compliance errors). This is the one structural change to merged (#140) code — behavior of reject/suspend is unchanged.
- **No new service deps / no migration:** the compliance read uses `db` + existing relations (`products.productType`, `products.categories` → `productCategories.category`).
- **Type consistency:** `checkMarketplaceCompliance`, `loadMarketplaceListing`, `writeReview` are new closures; the three review methods keep their public names/signatures except `approveListing`'s widened error channel.
- **Residual edge (documented, not built):** re-typing/re-categorizing a product org-private after its listing is `approved` — not enforced in `updateProduct`/`placeProduct`.
