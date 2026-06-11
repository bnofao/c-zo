# Stock-location GraphQL sub-graph tagging (org) + StockLocationAddress node-guard — Design

**Date:** 2026-06-11
**Depends on:** `feat/auth-subgraphs` (PR #131) — the kit enablement that makes sub-graph **mutations** + relay **node()** build under opt-in/default-none (the `subGraphs` option on `registerError`, and shared error types + shared filter-inputs + the relay `Node`/`node` query tagged into every served sub-graph), plus the `BuilderSubGraphs` augmentation that defines the `org` sub-graph name. This work branches off `feat/auth-subgraphs` (or off `main` once #131 merges).

## Goal

Tag the entire `@czo/stock-location` GraphQL surface into the **`org`** audience sub-graph (it is uniformly org-scoped), and close the one remaining ungated relay-node read path by adding a `StockLocationAddress` node-guard. After this, `/graphql/org` exposes the stock-location operations and no stock-location row (location or address) is readable cross-org via `node(id:)`.

## Decisions (settled during brainstorming)

1. **Everything → `org`.** Every stock-location query/mutation/type is gated on `permission: { resource: 'stock-location', …, organization }` — there are no `{ auth: true }` pre-membership ops and no global/admin ops. So the whole surface is a single audience: `org`. No `account`, no `admin`.
2. **Close the `StockLocationAddress` node() gap** as the authorization complement of the tagging (the module already guards `StockLocation` but not its address node).
3. **Branch off #131** — the kit enablement + the `org` sub-graph name live there. `org` already type-checks in stock-location's compilation (its existing `permission` authScopes prove auth's `BuilderAuthScopes`/`BuilderSubGraphs` augmentation is visible).
4. **No serving change** — `apps/life` already mounts `/graphql/org` (from the auth work).

## Surface (from inspection)

- **Queries:** `stockLocation(id)` (drizzleField), `stockLocations` (drizzleConnection) — both `permission: { stock-location, read, organization }`.
- **Mutations:** `createStockLocation`, `updateStockLocation`, `deleteStockLocation` (relayMutationField) — `permission: { stock-location, create|update|delete, organization }`.
- **Types:** `StockLocation` (drizzleNode `stockLocations`, has `organizationId`), `StockLocationAddress` (drizzleNode `stockLocationAddresses`, 1:1 child via `stockLocationId` FK — **no `organizationId` column**), inputs (`CreateStockLocationAddressInput`, `UpdateStockLocationAddressInput`, a where-filter input referencing the shared `StringFilterInput`, `StockLocationOrderField`/`StockLocationOrderDirection` enums), domain errors (`errors.ts`).
- **Existing node-guards:** `stockLocationNodeGuards` guards `StockLocation` only.

## Architecture

### 1. Tag the surface into `org`

- **Mutations** (`graphql/schema/stock-location/mutations.ts`): each `relayMutationField` needs the spike's 5 tag points — field + input + payload + `errors.union` + `errors.result`. Add a small **module-local `sg()` helper** (`graphql/schema/subgraphs.ts`, mirroring `@czo/auth`'s) that expands `org` into `{ field, input, payload, errorOpts: { union, result } }`, spread into the three mutations.
- **Queries** (`queries.ts`): `subGraphs: ['org']` on `stockLocation` and `stockLocations` (the connection's connection-type + edge-type args too).
- **Types** (`types.ts`): `subGraphs: ['org']` on the `StockLocation` and `StockLocationAddress` drizzleNodes.
- **Inputs/enums** (`inputs.ts`): `subGraphs: ['org']` on `CreateStockLocationAddressInput`, `UpdateStockLocationAddressInput`, the where-filter input, and the two order enums. (The shared `StringFilterInput` is already tagged into every served sub-graph by the kit enablement — no per-module tag.)
- **Errors** (`errors.ts`): `subGraphs: ['org']` on each `registerError(...)`.

A field tagged into `org` must have its `Input`/`Payload`/error-union/referenced object types in `org` too; an under-tagged mutation is **silently dropped** (no error), so the exposure E2E asserts presence.

### 2. `StockLocationAddress` node-guard (close the gap)

`stockLocationAddresses` has no `organizationId` — only `stockLocationId` (FK, 1:1). Since a `NodeGuard` is synchronous (`(row, ctx) => boolean | scope`) it cannot do an async parent lookup itself; instead the node loads the parent org through its **`select`** (the `stockLocation` relation's `organizationId`), and the guard reads it:

```ts
// graphql/node-guards.ts
StockLocationAddress: (row: { stockLocation: { organizationId: number } }) => ({
  permission: { resource: 'stock-location', actions: ['read'], organization: row.stockLocation.organizationId },
}),
```

This requires the `StockLocationAddress` drizzleNode (`types.ts`) to load the parent relation's org regardless of client selection — extend its `select` to include `{ with: { stockLocation: { columns: { organizationId: true } } } }` (the exact kit drizzle-plugin `select`-with-relation shape is confirmed during implementation; the `stockLocation` relation must be registered in the module's drizzle relations). The guard mirrors `StockLocation`'s (`stock-location:read` on the owning org), so `node()` is never weaker than the by-id query. Deny → null.

### 3. Serving & dependency

No `apps/life` change (`/graphql/org` already mounted). Branch off `feat/auth-subgraphs`; after #131 merges this can rebase onto `main`. Rebuild kit `dist` before the stock-location E2E (it consumes `@czo/kit` from dist).

## Error handling / security

- **Under-tagging → silent drop:** mitigated by the `sg()` helper (all 5 points at once) + the exposure E2E presence assertions.
- **node() cross-org:** the new `StockLocationAddress` guard + the existing `StockLocation` guard make every stock-location node read org-scoped; deny → null (no existence leak), uniform with the queries.
- **Exposure ≠ authz:** every field keeps its `permission` authScope; the `org` tag only controls which schema the field appears in.

## Testing

- **Exposure E2E** (`src/e2e/…`, mirroring auth's `subgraph-audiences` style or the module's existing E2E harness): `/graphql/org` Mutation contains `createStockLocation`/`updateStockLocation`/`deleteStockLocation` and Query contains `stockLocation`/`stockLocations` (silent-drop guard); they are absent from a non-`org` served sub-graph (e.g. `/graphql/account`).
- **node-authz E2E** (extend the module's existing node-authz coverage): a cross-org caller reading a `StockLocationAddress` by global id → `node` is `null`; a member of the owning org → reads the row. (`StockLocation` is already covered.)

## Out of scope / follow-ups

- Tagging other modules (product, channel, inventory, price, translation) into their audiences — incremental, per module.
- Any `admin`/platform stock-location surface (none exists today).
