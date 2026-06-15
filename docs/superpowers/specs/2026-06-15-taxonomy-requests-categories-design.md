# Taxonomy Requests — Categories (Sprint 1) — Design

**Date:** 2026-06-15
**Module:** `@czo/product`
**Status:** draft, pending user review

## Context

The marketplace runs on **global (admin-owned, `organizationId = null`) taxonomy only**; an org's private taxonomy is for its own store, never the marketplace. So an org needs a way to get the global taxonomy it requires:

- **Creation request** — propose a brand-new global taxonomy that doesn't exist.
- **Promotion request** — promote an existing org-tier taxonomy to global; on approval `organizationId → null`.

This is a 3-sprint effort:

- **Sprint 1 (this spec):** the `taxonomy_requests` entity + the **category** create/promote flow + admin review.
- **Sprint 2:** product types + the attribute cascade (a promoted/created global type requires its attributes to be global).
- **Sprint 3:** marketplace-listing enforcement (a listing requires a global product type + global category placements).

The request → review → result lifecycle reuses the moderation skeleton from the just-merged marketplace listing review (#140): `pending | approved | rejected` + reason; here "approve" **produces or flips a global taxonomy row**.

## Locked decisions

- One generic `taxonomy_requests` entity, `entityType` discriminator (only `category` emitted in S1, column ready for S2).
- Creation = **pure proposal** (the proposed fields live in the request; no real category row exists until approval).
- Promotion = **in-place flip** `organizationId → null`. The org **loses edit control** (global = admin-managed) — "contribute to the commons" is the accepted semantics.
- Collections excluded (not taxonomy; no global tier).

## Data model

### New table `taxonomy_requests` (+ migration)

| Column | Type | Notes |
|---|---|---|
| `id` | identity PK | |
| `kind` | enum `taxonomy_request_kind` (`create \| promote`) NOT NULL | |
| `entityType` | enum `taxonomy_entity_type` (`category \| product_type`) NOT NULL | S1 only writes `category` |
| `organizationId` | int NOT NULL | the requesting org |
| `payload` | jsonb, nullable | **create**: proposed fields `{ name, slug, description?, parentId? }` |
| `targetId` | int, nullable | **promote**: id of the org-tier row to flip |
| `state` | enum `taxonomy_request_state` (`pending \| approved \| rejected`) NOT NULL default `pending` | |
| `reviewReason` | text, nullable | rejection reason (admin) |
| `reviewedAt` | timestamp, nullable | |
| `resultId` | int, nullable | id of the produced global row (create → new, promote → flipped) |
| `version` | int NOT NULL default 1 | |
| `createdAt` / `updatedAt` | timestamp | |

Polymorphic: `targetId` / `resultId` carry no FK (validated at approval), consistent with the module's existing cross-reference style. Index on `(state)` (admin queue) and `(organizationId)` (org list).

Three new pg enums: `taxonomy_request_kind`, `taxonomy_entity_type`, `taxonomy_request_state`.

## Services

### New `TaxonomyRequestService` (`src/services/taxonomy-request.ts`)

Owns the request entity + orchestration; depends on `CategoryService`.

- `submitCategoryCreation(input: { organizationId, name, slug, description?, parentId? })` → insert `kind=create, entityType=category, payload`. No heavy validation at submit (the proposal is validated at approval); returns the `pending` row.
- `submitCategoryPromotion(input: { organizationId, categoryId })` → validate the target **at submit** (fail fast): exists, is org-tier, owned by `organizationId` → else `CategoryNotFound`; already global → `CategoryAlreadyGlobal`. Insert `kind=promote, entityType=category, targetId`.
- `approve(requestId)` → load request; not found → `TaxonomyRequestNotFound`; `state != pending` → `TaxonomyRequestNotPending`. Dispatch by `kind`:
  - **create**: `categoryService.createCategory({ organizationId: null, ...payload })` — this already enforces global-slug uniqueness (`CategorySlugTaken`) and parent-must-be-global (`CategoryNotFound`). Set `resultId = newCategory.id`.
  - **promote**: `categoryService.promoteToGlobal(targetId)` (new). Set `resultId = targetId`.
  - On success: `state=approved`, `reviewedAt=now`, `resultId`.
- `reject(requestId, reason)` → load + pending guard, then `state=rejected`, `reviewReason=reason`, `reviewedAt=now`.
- `listForAdmin(state?)` → all requests, optionally filtered by state (the moderation queue).
- `listForOrg(organizationId)` → the org's own requests.

### New `CategoryService.promoteToGlobal(categoryId)` (`src/services/category.ts`)

- Load category; not found → `CategoryNotFound`; already global (`organizationId === null`) → `CategoryAlreadyGlobal`.
- Slug collision: a live global `(null, slug)` already exists → `CategorySlugTaken`.
- Parent gate: if `parentId` set, the parent must already be global (`organizationId === null`) → else `CategoryParentNotGlobal` (can't promote a child before its parent).
- Flip: `organizationId = null`, bump `version`, `updatedAt = now`. Return the row.

## Errors

New tagged errors:

- `TaxonomyRequestNotFound`, `TaxonomyRequestNotPending` — registered `['admin']` (admin review only).
- `CategoryAlreadyGlobal` — referenced by org submit (promotion) **and** admin approve → `['org','admin']`.
- `CategoryParentNotGlobal` — admin approve (promote path) → `['admin']`.

Reused (existing, already tagged `['org','admin']`): `CategoryNotFound`, `CategorySlugTaken`.

## GraphQL

### Node

`TaxonomyRequest` drizzleNode, `subGraphs: ['org','admin']`. Add its name to `BuilderSchemaObjects` (the module convention for string-referenceable nodes, as `ProductChannelListing` required). Exposed fields: `kind`, `entityType`, `organizationId` (Int), `state`, `reviewReason`, `reviewedAt`, `targetId` (the promote source, Int nullable), `resultId` (the produced global row, Int nullable), plus the proposed `name`/`slug` surfaced from `payload` via field resolvers (nullable — populated for `create`, null for `promote`). No raw-JSON field is exposed. Three GraphQL enums mirror the DB enums: `TaxonomyRequestKind`, `TaxonomyEntityType`, `TaxonomyRequestState`.

### Mutations (relay)

**Org `['org']`** — gated `product:create` in `organizationId`:

- `requestCategoryCreation(organizationId, name, slug, description?, parentId?)` → payload `TaxonomyRequest`. Errors: none at submit.
- `requestCategoryPromotion(organizationId, categoryId)` → payload `TaxonomyRequest`. Errors: `[CategoryNotFound, CategoryAlreadyGlobal]`.

**Admin `['admin']`** — gated GLOBAL `product:create` (approval produces a global category, same authority as the platform `createCategory`):

- `approveTaxonomyRequest(requestId)` → payload `TaxonomyRequest`. Errors: `[TaxonomyRequestNotFound, TaxonomyRequestNotPending, CategorySlugTaken, CategoryNotFound, CategoryAlreadyGlobal, CategoryParentNotGlobal]`.
- `rejectTaxonomyRequest(requestId, reason)` → payload `TaxonomyRequest`. Errors: `[TaxonomyRequestNotFound, TaxonomyRequestNotPending]`.

### Queries

- `taxonomyRequests(state: TaxonomyRequestState?)` → `[TaxonomyRequest]`, `['admin']`, gated GLOBAL `product:read` — the moderation queue.
- `organizationTaxonomyRequests(organizationId)` → `[TaxonomyRequest]`, `['org']`, gated `product:read` in that org — the org's own requests + rejection reasons.

(Lists, not relay connections — the volume is low and bounded; matches the spec's minimalism. Revisit if needed.)

## Authz summary

| Action | Actor | Scope |
|---|---|---|
| submit creation / promotion request | org member | `product:create` in the org |
| approve / reject request | platform admin | GLOBAL `product:create` |
| admin queue read | platform admin | GLOBAL `product:read` |
| org own-requests read | org member | `product:read` in the org |

No node-guard work: `TaxonomyRequest` reads flow through the query authScopes above; there is no anonymous/public path to a request.

## Out of scope (S1)

- Product types + attribute cascade → **Sprint 2**.
- Marketplace-listing global-taxonomy enforcement → **Sprint 3**.
- `withdraw`/cancel a pending request, edit a request, request history beyond `state` — deferred (YAGNI).
- Auto-deriving slug from name — the create payload carries an explicit `slug` (matches `CreateCategoryInput`).

## Testing

Integration (Testcontainers, `TaxonomyRequestService` + `CategoryService.promoteToGlobal`):

- creation request → approve → a global category exists with the proposed fields; `resultId` set, `state=approved`.
- promotion request → approve → the org category's `organizationId` is now null; `resultId = targetId`.
- approve a creation whose slug collides with an existing global → `CategorySlugTaken`; request stays `pending`.
- approve a creation/promotion whose parent is org-tier → `CategoryNotFound` (create) / `CategoryParentNotGlobal` (promote).
- submit a promotion for another org's category, or a global one → `CategoryNotFound` / `CategoryAlreadyGlobal`.
- approve/reject a missing request → `TaxonomyRequestNotFound`; a non-pending one → `TaxonomyRequestNotPending`.
- reject sets `reviewReason` + `state=rejected`.
- `listForAdmin(state)` filters; `listForOrg` scopes to the org.

E2E sub-graph exposure: org submit mutations + `organizationTaxonomyRequests` present on `/graphql/org`, absent from `/graphql/admin`; admin review mutations + `taxonomyRequests` present on `/graphql/admin`, absent from `/graphql/org`; both absent from `/graphql/public`.

## Validation

- `pnpm --filter @czo/product migrate:generate` (+ confirm the diff) ; `check-types` ; `lint --max-warnings 0` ; `test`.
- `pnpm --filter life check-types`.
