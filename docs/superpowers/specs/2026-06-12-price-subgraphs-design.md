# Price GraphQL sub-graph tagging (org management + resolve public+org) — Design

**Date:** 2026-06-12
**Depends on:** the GraphQL sub-graph foundation (#130) + the auth sub-graph work (#131) — both merged to `main`. The kit enablement (sub-graph `registerError` option, shared error/filter-input/relay-node tagging) and the audience names (`public`/`account`/`org`/`admin`) are on `main`. **Branch off `main`** (no stacking).

## Goal

Finish tagging `@czo/price`'s GraphQL surface into audience sub-graphs: tag the org-scoped **management** surface into `org`, and **widen** the already-`public` resolve surface (`resolvePrice`/`resolvePrices` + their output types) to `['public', 'org']` so the org back-office can resolve prices from `/graphql/org` too. After this, `/graphql/org` exposes the full price management + resolve surface, `/graphql/public` keeps only the storefront resolve surface, and management ops are absent from `public`.

## Context (current state)

The foundation starter set already tagged `resolvePrice`/`resolvePrices` + the resolve output types (`BasePrice`, `OverridePrice`, `SalePrice`, the `CalculatedPrice` union, `PriceResolution`) + `PriceContextRuleInput` into `public`. Everything else (the management surface) is untagged → currently in no named sub-graph.

- **Queries:** `resolvePrice`, `resolvePrices` (public, org-scoped internally); `priceSet`, `priceSets`, `priceList`, `priceLists` (management, `permission: { price, read, organization }`).
- **Mutations (8):** `createPrice`/`updatePrice`/`deletePrice`, `createPriceList`/`updatePriceList`/`deletePriceList`, `createPriceSet`/`deletePriceSet` — all `permission: { price, create|update|delete, organization }`.
- **drizzleNodes (3):** `PriceSet`, `Price`, `PriceList` — **all already guarded** by `priceNodeGuards` (org via `row.organizationId`). No node-guard gap (unlike stock-location's address).
- **No admin surface** — every op is org-scoped (`price:*` in an org); `resolvePrice` has a `{ auth: true }` branch for the anonymous storefront.

## Decisions (settled during brainstorming)

1. **Management surface → `org`.** All org-scoped reads/mutations + their management types/inputs/errors.
2. **`resolvePrice`/`resolvePrices` → `public + org`** (widen the existing `public` tag). The org dashboard can resolve/preview prices from its own endpoint; matches the foundation spec's stated intent (`resolvePrice` as a `['public','org']` example). Authz unchanged (`price:read` in the org, or `{ auth: true }` for the anonymous storefront).
3. **No node-guard work** — the three price nodes are already guarded.
4. **No serving change** — `apps/life` already serves `public` + `org`.

## Architecture

### 1. Widen the resolve surface to `public + org`

Change the existing `subGraphs: ['public']` to `subGraphs: ['public', 'org']` on:
- `resolvePrice`, `resolvePrices` query fields (`graphql/schema/price/queries.ts`).
- The resolve **output types** (`graphql/schema/price/types.ts`): `BasePrice`, `OverridePrice`, `SalePrice`, the `CalculatedPrice` union, `PriceResolution`.
- The resolve **arg input** `PriceContextRuleInput` (`graphql/schema/price/inputs.ts`) — referenced by the now-`org` resolve fields' `attributes` arg, so it must be in `org` too.

A field tagged into a sub-graph requires every type it references (output + arg input + error) to be in that sub-graph; the exposure E2E (build + presence) catches any missed widening.

### 2. Tag the management surface into `org`

- **Mutations** (`graphql/schema/price/mutations/{price,priceList,priceSet}.ts`): a module-local `sg()` helper (`graphql/schema/price/subgraphs.ts`, mirroring auth/stock-location) tags each of the 8 `relayMutationField`s at the 5 points (field/input/payload + `errors.union`/`errors.result`).
- **Queries** (`queries.ts`): `subGraphs: ['org']` on `priceSet`, `priceSets`, `priceList`, `priceLists` (any `drizzleConnection` also tags its connection-type + edge-type args).
- **Types** (`types.ts`): `subGraphs: ['org']` on the `PriceSet`, `Price`, `PriceList` drizzleNodes and the management object types/refs they expose (`PriceRule`, `PriceListRule`, and the price-list/price-rule refs reachable from the management fields). `fieldsInheritFromTypes` means tagging the type is enough.
- **Inputs/enums** (`inputs.ts`): `subGraphs: ['org']` on the management inputs (create/update inputs for price/priceList/priceSet, where-filters, order enums). Shared `StringFilterInput`/etc. are kit-tagged centrally — no per-module tag.
- **Errors** (`errors.ts`): `subGraphs: ['org']` on each module `registerError(...)`. Shared `ValidationError`/`OptimisticLockError` (kit) are tagged centrally — not per-module.

> Find the exact set of management types/refs to tag by the build: an under-tagged mutation is **silently dropped** (presence E2E catches it); a referenced-but-untagged type makes the build throw naming it — tag it `['org']`.

### 3. node-guards & serving

No change. `priceNodeGuards` already guards `PriceSet`/`Price`/`PriceList`; `apps/life` already serves `public` + `org`.

## Error handling / security

- **Under-tagging → silent drop:** mitigated by the `sg()` helper (all 5 points) + the exposure E2E presence assertions.
- **Exposure ≠ authz:** every field keeps its `permission` authScope; the `org`/`public` tags only control which schema the field appears in. The resolve widening to `org` does not change who may resolve (still `price:read` in the org / anonymous storefront).
- **node() cross-org:** already closed by the existing `priceNodeGuards` (unchanged).

## Testing

- **Exposure E2E** (`src/e2e/…`, mirroring the stock-location `subgraph-org` style or the price module's existing E2E harness, extended to serve sub-graphs): `/graphql/org` Mutation contains the 8 management mutations and Query contains `priceSet`/`priceSets`/`priceList`/`priceLists` + `resolvePrice`/`resolvePrices` (silent-drop guard); `/graphql/public` Query keeps `resolvePrice`/`resolvePrices` but **omits** a management op (e.g. `priceSets`).
- **node-authz:** the three price nodes are already covered by the module's existing tests — confirm they stay green (no new guard).

## Out of scope / follow-ups

- Tagging the remaining org-scoped modules (channel, inventory, translation) — incremental, per module.
- Any `admin`/platform price surface (none exists today).
