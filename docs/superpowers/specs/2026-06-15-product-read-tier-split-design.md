# Product Catalog Reads — Per-Tier Split — Design

**Date:** 2026-06-15
**Module:** `@czo/product`
**Status:** draft, pending user review

## Goal

Split the three with-global-tier merged catalog read connections — `productTypes`, `products`, `categories` — into a **platform/admin global-only** query (unqualified name) and an **org** query (`organization*` prefix), mirroring the per-tier *mutation* split (`createProductType` / `createOrganizationProductType`). This gives platform admins a pure global-catalog read (curation) without being forced into one org's perspective, while orgs keep the base∪org overlay read.

Follow-up to the connections refactor ([[product-list-connections]], #144), off `main`.

## Why

Today `productTypes`/`products`/`categories` are `['org','admin']` connections requiring a `viewerOrg` arg, returning `global ∪ that org`. There is **no global-only view** — an admin curating the platform catalog must pass an org and gets its grafts mixed in. The merge machinery (`mergeWhere(null)`) already supports a global-only read; this split exposes it cleanly as a dedicated admin query.

## The split

| Current (merged, `viewerOrg`, `['org','admin']`) | → Admin global-only | → Org |
|---|---|---|
| `productTypes` | **`productTypes`** | **`organizationProductTypes`** |
| `products` | **`products`** | **`organizationProducts`** |
| `categories` | **`categories`** | **`organizationCategories`** |

### Admin global-only query (unqualified name, `['admin']`)

- Drops the `viewerOrg`/org arg entirely.
- `authScopes`: GLOBAL `product:read` — `{ permission: { resource: 'product', actions: ['read'] } }` (no `organization`; satisfied by a global role).
- Base clause: `{ organizationId: { isNull: true } }` (platform rows only).
- Keeps `search` / `where` / `orderBy` and the relay connection (3-position sub-graph tag `['admin']`).
- Resolver composes `where: { AND: [{ organizationId: { isNull: true } }, userWhere, searchClause].filter(Boolean) }`, calls the **existing** `svc.findTypes/findProducts/findCategories(query({ where, orderBy: buildOrderBy(...) }))`.

### Org query (`organization*` prefix, `['org']`)

- This is the current merged read, renamed, with the arg renamed `viewerOrg` → **`organizationId`** (consistency with the rest of the module).
- `authScopes`: `product:read` in `organizationId` (unchanged semantics).
- Base clause: `mergeWhere(Number(args.organizationId.id))` = `global ∪ org` (unchanged).
- Keeps `search` / `where` / `orderBy`; 3-position tag `['org']`.

## Reused — no new types or service methods

- **Service `find*(config)`** methods (`findTypes`/`findProducts`/`findCategories`) are reused by **both** the admin and org query of each entity — they are thin query-runners; only the resolver's composed `where` and the authz/arg differ.
- **Input types** (`ProductTypeWhereInput`/`ProductTypeOrderByInput`, `Product*`, `Category*`) are reused by both queries. They are already tagged `['org','admin']`, which covers both the `['admin']` and `['org']` audiences — no input-type change.

## Unchanged

- Single-row lookups `productType(id)` / `product(id)` / `category(id)` — already by-id and tier-aware; not split.
- `collections` / `adoptedProducts` — org-only (no global tier), like `createCollection` stayed unsplit. Not renamed.
- `taxonomyRequests` / `organizationTaxonomyRequests` — already split. Untouched.
- `productByHandle` — public storefront read. Untouched.

## Call-site migration (breaking)

`productTypes`/`products`/`categories` change audience + drop `viewerOrg` + become global-only. Any **org** caller of `productTypes(viewerOrg: …)` must move to `organizationProductTypes(organizationId: …)`. Affected in-repo: the e2e suites (`list-connections.e2e`, and any `product-org`/`product-global` e2e that reads these as an org). The plan greps and migrates each call-site (and the exposure E2E's expected field lists).

## Sub-graph tagging

- Admin queries: `['admin']` (field + connection + edge 3-position).
- Org queries: `['org']` (3-position).
- The exposure E2E asserts: `productTypes`/`products`/`categories` present on `/graphql/admin`, absent from `/graphql/org`; `organizationProductTypes`/etc. present on `/graphql/org`, absent from `/graphql/admin`; both absent from `/graphql/public`.

## Testing

- E2E: an admin with a GLOBAL `product:read` role reads `productTypes` → returns only global types (no org grafts); an org member reads `organizationProductTypes(organizationId)` → returns global ∪ its own; an org member WITHOUT a global role is denied `productTypes` (admin query); cross-org isolation on the org query holds.
- Exposure E2E updated per the tagging above.
- Existing pagination/filter behavior (from #144) preserved on both halves.

## Validation

- `pnpm --filter @czo/product check-types`, `lint --max-warnings 0`, `test`.
- `pnpm --filter life check-types`. No migration; no service or input-type change.
