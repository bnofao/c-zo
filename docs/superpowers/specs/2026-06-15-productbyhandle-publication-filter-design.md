# `productByHandle` Publication Filter + `variants` Un-graft — Design

**Date:** 2026-06-15
**Module:** `@czo/product`
**Status:** draft, pending user review

## Goal

Two coupled changes to the public storefront read:

1. **Publication filter on `productByHandle`** — a product is returned only if it has a **live** channel listing (`isPublished && reviewState = 'approved'`, not soft-deleted). Closes the current cross-tenant draft leak (anyone can read any org's *unpublished* products by passing a client `viewerOrg`).
2. **Un-graft `Product.variants`** — drop the `viewerOrg` arg + `graftAuthScopes` + `mergeWhere` from the `variants` relatedConnection. Variants are a **mirror** of the parent product's org (`createVariant` inherits `product.organizationId`), so the `productId` relation already scopes them; the org filter is redundant — and, once `productByHandle` is publication-gated, no longer load-bearing.

These are an interim B19 step: the security fix that the storefront needs, plus the cleanest graft simplification it unblocks.

## Why these two together

`productByHandle` is `['public']` with **no authScopes** and a client-controlled `viewerOrg`, and `findProductByHandle` applies **no publication filter** — so `productByHandle(handle, viewerOrg=<victim>)` returns the victim's product even if it is an unpublished draft. The `variants` field's `viewerOrg`/`graftAuthScopes` gate is currently the only thing stopping that path from also leaking the victim's variants. So: gate reachability (publication filter) **first**, then the redundant variant gate can drop safely. Doing one without the other either leaves the leak (filter only — fine) or opens it (un-graft only — bad). We do both.

## Change 1 — `findProductByHandle` publication filter

`ProductService.findProductByHandle` (`src/services/product.ts`), current:

```ts
const row = yield* dbErr(db.query.products.findFirst({
  where: { ...orgWhere, handle, deletedAt: { isNull: true } },
}))
```

becomes (add the relational live-listing predicate — RQBv2 relational `where`, proven on `adoptions`):

```ts
const row = yield* dbErr(db.query.products.findFirst({
  where: {
    ...orgWhere,
    handle,
    deletedAt: { isNull: true },
    channelListings: {                         // ⇐ publication: ≥1 live listing
      isPublished: true,
      reviewState: 'approved',
      deletedAt: { isNull: true },
    },
  },
}))
```

The `products.channelListings` relation already exists. `reviewState` defaults `approved` for own-channel listings, so a product published on an org's own store passes; a draft (no live listing) does not.

The GraphQL `productByHandle` query is otherwise unchanged: it stays **public/anonymous** (no authScopes), and keeps `viewerOrg` (now purely a *disambiguator* — handle is unique per `(org, handle)`, not globally — not a draft-access grant). Update its description to state the publication semantics.

## Change 2 — un-graft `Product.variants`

`src/graphql/schema/product/types/product.ts`, the `variants` relatedConnection, current:

```ts
variants: t.relatedConnection('variants', {
  subGraphs: ['public', 'org', 'admin'],
  description: '…Merges base variants with the viewer org\'s grafted variants…',
  args: { viewerOrg: t.arg.globalID({ for: 'Organization', required: false, … }) },
  authScopes: (_parent, args) => graftAuthScopes(args),
  query: args => ({ where: { deletedAt: { isNull: true }, ...mergeWhere(viewerOrgId(args)) } }),
}, { subGraphs: ['public','org','admin'] }, { subGraphs: ['public','org','admin'] }),
```

becomes:

```ts
variants: t.relatedConnection('variants', {
  subGraphs: ['public', 'org', 'admin'],
  description: 'Purchasable variants of this product (scoped to the product via its relation; excludes soft-deleted rows).',
  query: { where: { deletedAt: { isNull: true } } },
}, { subGraphs: ['public','org','admin'] }, { subGraphs: ['public','org','admin'] }),
```

No arg, no authScopes, no merge. Variant visibility now follows the **parent product's** reachability (gated by `productByHandle`'s publication filter, the `Product` node-guard, and the org/admin read scopes). The `ProductVariant` node-guard (`org != null → product:read`) still gates the `node(id:)` path.

Safety: variants are base (org-null) for global products and `org = owner` for org-owned products (mirror). Reaching the product is the gate; its variants are then its own. No cross-org leak — confirmed against the C1 tests (org A's overlay is on `attributeValues`/`priceSet`, never on `variants`).

## Out of scope (deferred — the harder per-listing-org graft resolution)

- **The true-overlay grafts** — `attributeValues`, `media`, `categories` (on Product), and `priceSet`/`inventoryItems`/`attributeValues`/`media` (on ProductVariant) — **keep** their `viewerOrg`/`graftAuthScopes`/`mergeWhere`. They are genuine multi-org overlays (multiple orgs graft onto the same global product), so the merge does real work. Consequence: a storefront shows an org-owned product's **variants** but not yet its **prices/media** publicly without `viewerOrg`. Resolving overlays per-listing-org (so the storefront shows the publishing org's grafts) is the next B19 piece.
- **Channel-key scoping** — replacing the client `viewerOrg` with the channel derived from a publishable API key, and scoping the live-listing filter to `channelId = <key's channel>`. Full B19. The interim filter is "live on *any* channel".
- **Per-channel handle uniqueness** (marketplace: two vendors, same handle) — a B19 disambiguation concern.

## Authz

`productByHandle` stays anonymous/public — **publication is the gate, not a permission**. No authScopes added. The C1 confidentiality (an org's private *overlay* grafts not leaking publicly) remains enforced on `attributeValues`/`priceSet`/etc. via their unchanged `graftAuthScopes`.

## Testing

- **Publication filter:** an unpublished product → `productByHandle` returns `null`; after a live listing (`publishProduct`, approved) → returned. A draft of org A is not readable via `productByHandle(handle, viewerOrg=A)`.
- **Variants un-graft:** a published product's `variants` (no `viewerOrg` arg now) returns its variants; an anonymous caller sees a published product's base variants without the C1 over-gating; an org-owned published product surfaces its (owner) variants publicly.
- **C1 migration:** the existing C1 tests in `product-global.e2e` (org-B / anonymous passing `viewerOrg=A`) — the `variants(viewerOrg:$a)` sub-selection loses its arg and is no longer gated, so those tests' `variants` assertions are updated (base variants are visible — they were never A's private data). The `attributeValues`/`priceSet` C1 assertions are **unchanged** (still gated). The `global-shirt` product is published (a live listing seeded) so `productByHandle` returns it under the new filter.
- Exposure E2E unaffected (field names/audiences unchanged; `variants` just loses an arg).

## Validation

- `pnpm --filter @czo/product check-types`, `lint --max-warnings 0`, `test`.
- `pnpm --filter life check-types`. No migration (relation + columns exist).
