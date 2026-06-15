# Marketplace Taxonomy Enforcement (Sprint 3) — Design

**Date:** 2026-06-15
**Module:** `@czo/product`
**Status:** draft, pending user review

## Context

Sprint 3 of 3 — the **teeth** of "the marketplace runs on global taxonomy only." A product may be published on the marketplace channel (the platform-tier `@czo/channel`, `organizationId = null`) only if it is **typed with a global product type** and **carries no org-private category placement**. This closes the loop: S1 (categories) and S2 (product types) gave orgs the *recourse* to make their taxonomy global; S3 makes that the mandatory on-ramp.

Builds directly on the marketplace listing review ([[marketplace-listing-review]], merged #140) and the taxonomy-request flows ([[taxonomy-requests-categories]] #141, [[taxonomy-requests-product-types]] #142, both merged).

## Locked decisions (brainstormed)

- **Rule.** Marketplace-eligible ⟺ the product's **product type is global** AND **none of its base category placements references an org-private category**. Uncategorized products are eligible.
- **Enforcement points.** Both: `publishProduct` onto a marketplace channel (org, fail-fast) **and** `approveListing` (admin, re-check before going live).
- **Two distinct errors** (`ProductTypeNotGlobal`, `MarketplaceCategoryNotGlobal`) rather than one generic — the org needs to know whether to fix the type or a category.

## Compliance check

A new closure in `ChannelListingService` (it already holds `db`; no new service dependency):

```ts
const checkMarketplaceCompliance = (productId: number) =>
  Effect.gen(function* () {
    const product = yield* dbErr(db.query.products.findFirst({
      where: { id: productId, deletedAt: { isNull: true } },
      columns: { id: true },
      with: {
        productType: { columns: { id: true, organizationId: true } },
        categories: {
          where: { organizationId: { isNull: true } },          // base placements only
          columns: { id: true },
          with: { category: { columns: { id: true, organizationId: true } } },
        },
      },
    }))
    if (!product)
      return yield* Effect.fail(new ProductNotFound())            // existing error
    if (product.productType.organizationId !== null)
      return yield* Effect.fail(new ProductTypeNotGlobal({ productTypeId: product.productType.id }))
    for (const placement of product.categories) {
      if (placement.category.organizationId !== null)
        return yield* Effect.fail(new MarketplaceCategoryNotGlobal({ categoryId: placement.category.id }))
    }
  })
```

The relations used (`products.productType`, `products.categories` → `productCategories.category`) all exist in `relations.ts`. Only **base** placements (`organizationId IS NULL`) are checked — an org's overlay placements (`organizationId` set) are org-store-only and never surface on the marketplace, so they are irrelevant to eligibility.

> If the nested `with` + filtered relation read is awkward in this Drizzle RQB version, the implementation may split it into two reads (product+type, then base placements joined to categories). The behavior is what matters.

## Enforcement

### `publish` (org)

In the existing `isMarketplace` branch of `publish` — after `guardProductActable` + `guardChannelTarget`, **before** the upsert that creates the `pending` listing — call `checkMarketplaceCompliance(input.productId)`. A non-compliant product is rejected before any listing row is written. Compliant (incl. uncategorized) proceeds to `pending` exactly as today.

### `approveListing` (admin)

`approveListing` routes through the shared `setReview(listingId, 'approved', null)`. Add the compliance re-check inside `setReview` **gated on `reviewState === 'approved'`** (so `reject`/`suspend` skip it): after the listing + marketplace-channel checks, before the state write, call `checkMarketplaceCompliance(listing.productId)`. This catches a product re-typed org-private (via `updateProduct`) between publish and approval — the admin cannot approve a since-broken listing.

## Errors

Two new tagged errors in `channel-listing.ts`:

- `ProductTypeNotGlobal` (carries `productTypeId`)
- `MarketplaceCategoryNotGlobal` (carries `categoryId`)

Both are reachable from `publishProduct` (org) and `approveListing` (admin), so register them `['org','admin']` and add them to BOTH mutations' `errors.types`. The compliance check also surfaces the existing `ProductNotFound` (already on `publishProduct`; add it to `approveListing`'s error set, which currently lists `ChannelListingNotFound`/`NotAMarketplaceChannel`).

Service contract changes: `publish`'s and `approveListing`'s error channels widen to include `ProductTypeNotGlobal | MarketplaceCategoryNotGlobal` (and `ProductNotFound` for approve).

## Out of scope (residual edge, noted)

Re-typing a product to an org-private type, or re-placing it in an org-private category, **after** its marketplace listing is already `approved`, leaves a stale-compliant live listing. S3 does **not** enforce in `updateProduct` / `placeProduct` (broader cross-cutting scope) — it gates the publish→review path. A future hardening could re-moderate (auto-`suspend`) a listing whose product drifts out of compliance, or block the org-typing of a marketplace-published product. Documented, not built.

Storefront read-side filtering of non-`live` listings remains the separate B19 sprint (unchanged).

## Testing

Integration (`ChannelListingService`):

- publish a product whose type is org-private onto a marketplace channel → `ProductTypeNotGlobal`; no listing row created.
- publish a product (global type) with a **base** placement into an org-private category → `MarketplaceCategoryNotGlobal`.
- publish a compliant product (global type, base placement into a global category) → `pending` listing created.
- publish a compliant **uncategorized** product (global type, no placements) → `pending`.
- publish a product with an **org-overlay** placement (`organizationId` set) into an org category but a global type and no offending base placement → compliant (overlay ignored).
- own-channel publish is unaffected (compliance check is marketplace-only — the `isMarketplace` branch).
- `approveListing` on a listing whose product is now org-typed → `ProductTypeNotGlobal`; the listing stays `pending`.
- `approveListing` on a compliant listing → `approved`. `reject`/`suspend` never run the compliance check.

## Validation

- `pnpm --filter @czo/product check-types`, `lint --max-warnings 0`, `test`.
- `pnpm --filter life check-types`.
- No migration.
