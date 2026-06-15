# `@czo/product` Sub-Graph Tagging — Design

**Date:** 2026-06-14
**Module:** `@czo/product`
**Status:** approved, ready for plan

## Goal

Tag the entire `@czo/product` GraphQL surface into audience sub-graphs (`@pothos/plugin-sub-graph`): a **public** storefront catalog read, an **org** management surface, and an **admin** platform/global-management surface. Includes the public storefront now (not deferred to the B19 sprint). Last large module in the sub-graph rollout (foundation #130 → … → translation #137 → product).

## Audience model

| Audience | What it serves |
|---|---|
| `public` | Anonymous storefront catalog read: `productByHandle` + the readable object graph it traverses, base rows only. |
| `org` | Org management: every mutation an org actor performs, plus the org-scoped admin reads. |
| `admin` | Platform/global management: the tier-conditional ops performed at the global (org-null) tier by platform staff, plus the shared reads. |

`apps/life` already serves `['public','account','org','admin']` — no serving change.

## Why sub-graph membership is safe to drive from type-level tags

The graft connections (`variants`, `media`, `attributeValues`, `categories`, `priceSet`, …) carry `authScopes: (_parent, args) => graftAuthScopes(args)` (`types/merge.ts`). `graftAuthScopes` returns `true` (public) when `viewerOrg` is omitted — surfacing base (`organizationId IS NULL`) rows only — and requires `product:read` in the supplied org otherwise (the "C1" cross-org confidentiality gate). **The security boundary is the field authScope, not sub-graph membership.** So tagging a readable type into `public` does not expose any org's private grafts: an anonymous `/graphql/public` caller traverses base rows exactly as it does on the default `/graphql` today.

Type-level `subGraphs` propagate to fields by default (proven by translation's `Locale`: type tagged `['public']`, untagged fields resolved on `/graphql/public`). So we tag each type at its widest audience and only narrow the few fields that would otherwise reference a type absent from that audience.

## Target state

### 1. `sg()` helper

Add `packages/modules/product/src/graphql/schema/product/subgraphs.ts` — the module-local helper identical to every prior module (`sg(...names)` → `{ field, input, payload, errorOpts }`).

### 2. Object types — tag at the type level

`['public','org','admin']` (reachable from the public `productByHandle → Product` graph):

- `Product` (`types/product.ts`)
- `ProductVariant`, `VariantPriceSet` (objectRef) (`types/variant.ts`)
- `ProductType`, `ProductTypeAttribute` (`types/product-type.ts`)
- `ProductMedia` (`types/media.ts`)
- `ProductAttributeValue`, `VariantAttributeValue`, `ProductChannelListing`, `ProductCategory`, `CollectionProduct`, `VariantInventoryItem`, `VariantMedia` (`types/grafts.ts`)

`['org','admin']` (NOT reachable from the public product graph — `Product` exposes `categoryId`/`collectionId` only as Int link rows, never the node; both are returned solely by the org/admin `category`/`categories`/`collection`/`collections` queries):

- `Category` (`types/category.ts`)
- `Collection` (`types/collection.ts`)

`drizzleNode` / `objectRef.implement` take `subGraphs` in their options object.

### 3. Field-level narrowings (override the inherited type audience)

A public type whose field returns a type **not** in `public` must narrow that field, else the public sub-graph build references a missing type. Exactly two:

- `Product.organization` → `subGraphs: ['org','admin']` (returns auth's `Organization`, not public)
- `ProductType.organization` → `subGraphs: ['org','admin']` (same)

Every other field on a public type returns a scalar, a `translatedField` `String`, `DateTime` (kit-shared, present everywhere), or a `public`-tagged product type — all inherit cleanly. `Category.organization` / `Collection.organization` live on `['org','admin']`-only types and need no narrowing (`Organization` is in auth's org+admin sub-graphs).

### 4. relatedConnection / drizzleConnection tagging — **spike first**

The graft fields are `t.relatedConnection`. As with translation's top-level `drizzleConnection`, the auto-generated **connection + edge types may require explicit per-position tagging** beyond field inheritance. The exact requirement is verified by a mechanics spike (Plan Task 1) before fanning out:

- Tag `Product` + its 5 relatedConnections, build `/graphql/public`, run `productByHandle { variants { edges { node { sku } } } media { edges { node { url } } } }` anonymously.
- If the probe resolves with type-level tagging alone, relatedConnection inherits and no per-position args are needed.
- If it errors with a missing `*Connection`/`*Edge` type, the connection needs explicit `subGraphs` (the `t.relatedConnection('rel', { … , subGraphs }, ?, ?)` shape). The spike result is recorded in the plan and applied uniformly to all relatedConnections.

The 13 relatedConnections: `Product.{variants,attributeValues,media,categories,collections,channelListings}` (6), `ProductVariant.{attributeValues,inventoryItems,media}` (3), `Category.{children,products}` (2), `Collection.products` (1), `ProductType.attributes` (1). Connection/edge audience equals the parent type's audience. `Category.children/products` and `Collection.products` are `['org','admin']` (their parent types are); the other 10 are `['public','org','admin']`.

### 5. Queries

- `['public']`: `productByHandle`
- `['org','admin']`: `product`, `products`, `productType`, `productTypes`, `category`, `categories`, `collection`, `collections`, `adoptedProducts`

`t.field` / `t.relation` take `subGraphs` in their options.

### 6a. Per-tier SPLIT of the three top-level entity creates

Mirroring `@czo/attribute` (`createAttribute`/`createOrganizationAttribute`), the three tier-ambiguous top-level entity creates are **split per tier** rather than tagged shared:

- `createProduct` → `createProduct` (PLATFORM: no `organizationId` input, global `product:create`, `['admin']`) + `createOrganizationProduct` (ORG: required `organizationId`, org `product:create`, `['org']`)
- `createProductType` → `createProductType` (admin) + `createOrganizationProductType` (org)
- `createCategory` → `createCategory` (admin) + `createOrganizationCategory` (org)

The platform variant drops the `organizationId` input and hard-codes `organizationId: null`; the org variant makes it required. The org variant of `createProduct` drops the `GlobalProductRequiresGlobalType` error (only thrown for global creates). The remaining tier-conditional ops (which derive org from the existing row or an optional graft input — `update*`/`delete*`/`place*`/`add*`/`assign*`/`declare*`/translations/`createVariant`) are **not** splittable and stay `['org','admin']`. Surface becomes 50 mutations (47 + 3 new org halves).

### 6b. Mutations — tagging

**All 47 mutations already carry an `errors: { types: [...] }` block** (the ones with no domain errors use `errors: { types: [] }` — empty but present). So every mutation gets **uniform 5-point tagging**: `...sg(X).field` (3rd arg, first), `...sg(X).input` (2nd arg, first), `...sg(X).payload` (4th arg, first), and `...sg(X).errorOpts` merged into the existing `errors: { types: […], …sg(X).errorOpts }`. There is **no** 3-point case and **no** error-union regression risk (every payload is already wrapped in a union, empty or not) — the attribute reorder gotcha does not apply here.

**`['org']`** (15 — org-only entities: collections, adoptions, channel publications, inventory/price bindings):

`adoptProduct`, `unadoptProduct` (`adoption.ts`); `publishProduct`, `unpublishProduct` (`channelListing.ts`); `createCollection`, `updateCollection`, `deleteCollection`, `addProductToCollection`, `removeProductFromCollection` (`collection.ts`); `upsertCollectionTranslation`, `removeCollectionTranslation` (`translation.ts`); `linkInventoryItem`, `unlinkInventoryItem` (`inventoryBinding.ts`); `bindPriceSet`, `unbindPriceSet` (`priceBinding.ts`)

**`['org','admin']`** (32 — global-capable entities, tier-conditional ops):

`assignProductValue`, `assignVariantValue`, `unassignProductValue`, `unassignVariantValue` (`assignment.ts`); `createCategory`, `updateCategory`, `deleteCategory`, `setCategoryParent`, `placeProduct`, `removePlacement` (`category.ts`); `addMedia`, `updateMedia`, `removeMedia`, `linkVariantMedia`, `unlinkVariantMedia` (`media.ts`); `createProduct`, `updateProduct`, `deleteProduct` (`product.ts`); `createProductType`, `updateProductType`, `deleteProductType`, `declareAttribute`, `undeclareAttribute` (`productType.ts`); `upsertProductTranslation`, `removeProductTranslation`, `upsertCategoryTranslation`, `removeCategoryTranslation`, `upsertVariantTranslation`, `removeVariantTranslation` (`translation.ts`); `createVariant`, `updateVariant`, `deleteVariant` (`variant.ts`)

### 7. Errors / inputs / enums → `['org','admin']`

All 22 module errors in `errors.ts` get `subGraphs: ['org','admin']` (referenced only by management mutations; `productByHandle` has no error union). Kit-shared `OptimisticLockError` untouched.

All inputs/enums in `inputs.ts` get `subGraphs: ['org','admin']` (referenced only by management-mutation `inputFields`; no public field references them — `ProductMedia.type` is `exposeString`, not the enum): `ProductAttributeAssignment`, `ProductMediaType` (enums); `VariantSelectionPairInput`, `AssignmentTextValueInput`, `AssignmentFileValueInput`, `AssignmentValueInput` (inputs).

### 8. No change

- `node-guards.ts` — the 7 node guards run in the relay resolver independently of sub-graph membership; the org-scoping is unchanged.
- Services, migrations, authz logic, `authz.ts` loaders.

## Exposure E2E

Thread a `subGraphs` option through the product e2e harness (forward `buildOptions: { subGraphs }` to `bootTestApp`). New `subgraph-exposure.e2e.test.ts` asserts:

- **`/graphql/public`**: `productByHandle` present; the 9 admin reads + all 47 mutations absent; `Category` and `Collection` types absent (introspect `__type(name:)` → null); a live anonymous `productByHandle { id handle variants { edges { node { sku } } } media { edges { node { url } } } }` resolves without error (proves the public object graph + connections round-trip).
- **`/graphql/org`**: the 9 admin reads present; all 47 mutations present; `productByHandle` absent.
- **`/graphql/admin`**: the 9 admin reads present; the 32 tier-conditional mutations present; the 15 org-only mutations absent; `productByHandle` absent.

## Out of scope

- The B19 storefront-API-key gating + channel-publication filtering (`productByHandle` stays interim-public; only its *exposure* moves to `/graphql/public`).
- Any new field-level restriction on the public projection beyond the two type-reference narrowings — this pass replicates today's `productByHandle` reach onto `/graphql/public`, it does not curate it.

## Validation

- `pnpm --filter @czo/product check-types`, `pnpm --filter @czo/product lint --max-warnings 0`
- `pnpm --filter @czo/product test` (full suite incl. new exposure E2E; the 209 existing tests hit default `/graphql` and are unaffected)
- `pnpm --filter life check-types`
