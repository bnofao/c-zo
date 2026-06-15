# Taxonomy Requests — Product Types + Attribute Co-Promotion (Sprint 2) — Design

**Date:** 2026-06-15
**Modules:** `@czo/product`, `@czo/attribute`
**Status:** draft, pending user review

## Context

Sprint 2 of 3. Extends the generic `taxonomy_requests` entity (built in S1, [[taxonomy-requests-categories]]) to **product types**, and adds the **attribute co-promotion cascade**: approving a global product type also promotes the org-private attributes it declares (and their value catalogs) to global, so the global type is fully usable by every org on the marketplace.

- **S1 (merged-pending #141):** categories.
- **S2 (this spec):** product types + attribute (and attribute-value) co-promotion.
- **S3:** marketplace-listing enforcement (a listing requires a global product type + global category placements).

## Locked decisions

- **Co-promotion, full cascade** (user-confirmed with full cost knowledge): `approve product_type promotion` → flips the type, its declarations, every org-private declared attribute, and those attributes' value rows (across 8 value tables) to `organizationId = null`.
- **Approval authority:** GLOBAL `product:create` **and** GLOBAL `attribute:create` (the operation creates both a global type and global attributes).
- **Creation request = bare type** (name/slug/isShippingRequired, no attribute declarations). The "typed" path is promotion.
- The attribute slug namespace is **already platform-global** (`unique(slug)`, not `(org,slug)`), and value slugs are unique per `(attributeId, slug)` — so the attribute/value cascade is a pure `organizationId → null` flip with **no collision possible**. Only product-type slugs are per-`(org,slug)` and need a global-slug check on promotion.

## Product-type requests (mirror categories)

Two org mutations (`['org']`, gate `product:create` in the org):

- `requestProductTypeCreation(organizationId, name, slug, isShippingRequired?)` → inserts a `taxonomy_request` `kind=create, entityType=product_type, payload={name,slug,isShippingRequired?}`.
- `requestProductTypePromotion(organizationId, productTypeId)` → fail-fast (target must be an org-tier type owned by the requester, else `ProductTypeNotFound`; already global → `ProductTypeAlreadyGlobal`); inserts `kind=promote, entityType=product_type, targetId`.

The existing generic `approveTaxonomyRequest` / `rejectTaxonomyRequest` (S1) gain a `product_type` branch in `approve`'s dispatch; `reject` is unchanged.

## `ProductTypeService.promoteToGlobal(typeId)` (`@czo/product`)

- Load type; not found → `ProductTypeNotFound`; already global (`organizationId === null`) → `ProductTypeAlreadyGlobal`.
- Global-slug check: a live global `(null, slug)` already exists → `ProductTypeSlugTaken` (new — `product_types` has no slug error today; promotion needs a clear one).
- Flip the type's own attribute declarations to base: `UPDATE product_type_attributes SET organization_id = NULL WHERE product_type_id = typeId AND organization_id = <type's org>`. (Base declarations, already `null`, are untouched and ride along since they key on `productTypeId`.)
- Flip the type: `organizationId = null`, bump `version`. Return the row.

New errors: `ProductTypeAlreadyGlobal`, `ProductTypeSlugTaken`.

## `AttributeService.promoteToGlobal(attributeId)` — NEW in `@czo/attribute`

- Load attribute (`findById`); not found → `AttributeNotFound` (existing). Already global → no-op return (idempotent).
- Flip the attribute: `organizationId = null` (collision-free — slug is globally unique already).
- Flip its value catalog across all 8 value tables: for each of `attributeValues`, `attributeSwatchValues`, `attributeReferenceValues`, `attributeTextValues`, `attributeNumericValues`, `attributeBooleanValues`, `attributeDateValues`, `attributeFileValues` → `SET organization_id = NULL WHERE attribute_id = attributeId AND organization_id IS NOT NULL`. (Any non-global value of a now-global attribute becomes global; already-global ones are untouched.)

No new attribute errors (the flip cannot collide). Add `promoteToGlobal` to the `AttributeService` contract + impl + barrel export. This is the module's first cross-module-driven write, but the method itself is self-contained (the product module calls it via `Attribute.AttributeService`).

## `approve` orchestration (`@czo/product`, product_type promote)

Inside `TaxonomyRequestService.approve`, the `entityType === 'product_type'` + `kind === 'promote'` branch:

1. Load the org-tier type (`ProductTypeService.findTypeById`).
2. Enumerate its declared attributes: `ProductTypeService.listTypeAttributes` → distinct `attributeId`s.
3. For each attribute: read its tier via `Attribute.AttributeService.findById`; if `organizationId !== null`, call `Attribute.AttributeService.promoteToGlobal(attributeId)`.
4. `ProductTypeService.promoteToGlobal(typeId)` (flips declarations + type).
5. `finalize(state: 'approved', resultId: typeId)`.

The `kind === 'create'` branch calls `ProductTypeService.createType({ organizationId: null, ... })` (bare type) and sets `resultId`. All steps run in one Effect generator — any failure aborts before `finalize`, so the request stays `pending` (no partial cascade is committed if a later step fails; each individual flip is its own statement, but a mid-cascade failure leaves earlier flips applied — see Risks).

`TaxonomyRequestService` gains a dependency on `ProductTypeService` and `Attribute.AttributeService` (added to its `make` + the layer wiring; `ProductTypeService` is in `ProductCoreLive`, `Attribute.AttributeService` is provided by the app like the existing `ChannelListingService`'s `Channel.ChannelService` dep).

## Authz — dynamic on entityType

`approveTaxonomyRequest` is generic. A category approval needs only GLOBAL `product:create`; a product-type approval needs GLOBAL `product:create` **and** `attribute:create`. The authScope therefore loads the request and branches (same load-the-row pattern as channel/product tier authz):

```ts
authScopes: async (_p, args, ctx) => {
  const entityType = await ctx.runEffect(/* read taxonomy_request.entityType by id */)
  const product = { permission: { resource: 'product', actions: ['create'] } }
  const attribute = { permission: { resource: 'attribute', actions: ['create'] } }
  return entityType === 'product_type' ? { $all: [product, attribute] } : product
}
```

**Verification point:** `$all` is a native `@pothos/plugin-scope-auth` combinator but is unused elsewhere in this repo. The plan must confirm it resolves; fallback is a single dynamic scope function that checks both permissions via the access layer. A missing/soft-deleted request resolves to the `product`-only scope (the resolver then returns `TaxonomyRequestNotFound`, not a leak).

## Errors

New (`@czo/product`): `ProductTypeAlreadyGlobal`, `ProductTypeSlugTaken`. Tag: `ProductTypeAlreadyGlobal` `['org','admin']` (org submit + admin approve), `ProductTypeSlugTaken` `['admin']` (approve only). `approveTaxonomyRequest` errors gain `ProductTypeNotFound` (existing), `ProductTypeAlreadyGlobal`, `ProductTypeSlugTaken`, and `AttributeNotFound` (from the cascade). `requestProductTypePromotion` errors: `[ProductTypeNotFound, ProductTypeAlreadyGlobal]`.

No new `@czo/attribute` errors.

## GraphQL

Two new org mutations (`requestProductTypeCreation`, `requestProductTypePromotion`) in the existing `mutations/taxonomyRequest.ts`, tagged `['org']`. The `TaxonomyRequest` node, the 3 enums, and `approveTaxonomyRequest`/`rejectTaxonomyRequest` already exist; `approve` gains the dynamic authScope + the new error types. No new node/queries (the S1 queries `taxonomyRequests`/`organizationTaxonomyRequests` already list all entity types; `proposedName`/`proposedSlug` already surface the create payload).

## Risks

- **Non-atomic cascade.** The cascade is several `UPDATE` statements; a failure partway (e.g. step 4 after some attributes flipped in step 3) leaves those attributes global while the type stays org-tier and the request stays `pending`. Re-approving is idempotent (already-global attributes are skipped, `promoteToGlobal` no-ops), so a retry converges — but a permanently-failing type-flip would leave attributes globalized. Acceptable for S2 (admin-driven, low frequency, retry-convergent); a single wrapping DB transaction is a possible hardening but the Effect/`@effect/sql-pg` transaction boundary across two modules' services is out of scope here. Documented, not solved.

## Out of scope

- Categories (S1, done).
- Marketplace-listing global-taxonomy enforcement (S3).
- A separate attribute-request / attribute-curation flow (co-promotion is the deliberate substitute).
- Transactional atomicity of the cross-module cascade (see Risks).

## Testing

`@czo/attribute` integration: `promoteToGlobal` flips an org attribute + its values (seed a SELECT attribute with org values across ≥2 value tables) to null; idempotent on an already-global attribute.

`@czo/product` integration (`TaxonomyRequestService`): product-type creation → approve → a bare global type exists; product-type promotion with org-private declared attributes → approve → the type, its declarations, the attributes, and their values are all global (assert via the attribute + product-type services); promotion of a type whose attributes are already global → approve flips only the type; `requestProductTypePromotion` for a global / another-org type → `ProductTypeAlreadyGlobal` / `ProductTypeNotFound`; approve with a global-slug clash → `ProductTypeSlugTaken`, request stays `pending`.

E2E exposure: `requestProductTypeCreation`/`requestProductTypePromotion` present on `/graphql/org`, absent from `/graphql/admin` and `/graphql/public`.

Authz E2E (if feasible in the harness): a product-admin lacking `attribute:create` is denied approving a product-type request; granted both, allowed.

## Validation

- `pnpm --filter @czo/attribute test` + `check-types` + `lint`; migration: none (no schema change in attribute — only a service method).
- `pnpm --filter @czo/product test` + `check-types` + `lint`.
- `pnpm --filter life check-types`.
