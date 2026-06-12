# Inventory GraphQL sub-graph tagging (org) — Design

**Date:** 2026-06-12
**Depends on:** sub-graph foundation (#130) + auth (#131), merged to `main` (kit enablement + the `org` name). **Branch off `main`.**

## Goal

Tag the entire `@czo/inventory` GraphQL surface into the **`org`** audience sub-graph — it is uniformly org-scoped — so `/graphql/org` exposes the inventory surface and it is absent from `/graphql/public`. The three inventory nodes are already guarded, so there is no node-guard work.

## Decisions (settled during brainstorming)

1. **Everything → `org`.** Every inventory query/mutation/type is gated on `permission: { resource: 'inventory', …, organization }`. `organizationId` is `notNull` (no platform tier), no `{ auth: true }` pre-membership op, no admin/public surface.
2. **No node-guard work** — `InventoryItem`/`InventoryLevel`/`Reservation` are already guarded org-scoped (`inventoryNodeGuards`).
3. **No serving change** — `apps/life` already serves `org`.

## Surface (from inspection)

- **Queries:** `inventoryItem(id)`, `inventoryItems` — `permission: { inventory, read, organization }`.
- **Mutations (10):** `createInventoryItem`/`updateInventoryItem`/`deleteInventoryItem`; `createInventoryLevel`/`setInventoryLevel`/`adjustInventoryStock`/`deleteInventoryLevel`; `createReservation`/`updateReservation`/`deleteReservation` — `permission: { inventory, create|update|delete, organization }`.
- **Types:** `InventoryItem` (drizzleNode `inventoryItems`), `InventoryLevel` (`inventoryLevels`), `Reservation` (`reservations`) — all with `organizationId` (notNull), all already guarded. Inputs (create/update inputs, where-filters, order enums), domain errors.

## Architecture

### 1. Tag the surface into `org`

- **Mutations** (`graphql/schema/inventory/mutations/{item,level,reservation}.ts`): a module-local `sg()` helper (mirroring auth/stock-location/price/channel) tags each of the 10 `relayMutationField`s at the 5 points — field + input + payload + `errors.union`/`errors.result`. (If any mutation has an empty `errors: { types: [] }`, it still gets `...sg().errorOpts` or it is silently dropped.)
- **Queries** (`queries.ts`): `subGraphs: ['org']` on `inventoryItem` and `inventoryItems` (the connection's connection-type + edge-type args too).
- **Types** (`types.ts`): `subGraphs: ['org']` on the `InventoryItem`/`InventoryLevel`/`Reservation` drizzleNodes and any management object refs they expose.
- **Inputs/enums** (`inputs.ts`): `subGraphs: ['org']` on the management inputs + order enums. The shared `StringFilterInput`/etc. are kit-tagged centrally — no per-module tag.
- **Errors** (`errors.ts`): `subGraphs: ['org']` on each module `registerError(...)`. Shared `ValidationError`/`OptimisticLockError` (kit) are tagged centrally — not per-module.

A field tagged into `org` requires every type it references to be in `org`; an under-tagged mutation is **silently dropped** (no error), so the exposure E2E asserts presence.

### 2. node-guards & serving

No change. `inventoryNodeGuards` already guards the three nodes; `apps/life` already serves `org`.

## Error handling / security

- **Under-tagging → silent drop:** mitigated by the `sg()` helper (all 5 points) + the exposure E2E presence assertions.
- **Exposure ≠ authz:** every field keeps its `permission` authScope; the `org` tag only controls which schema the field appears in.
- **node() cross-org:** already closed by the existing `inventoryNodeGuards` (unchanged).

## Testing

- **Exposure E2E** (`src/e2e/…`, mirroring the price/stock-location `subgraph-org` style, with the harness extended to serve sub-graphs): `/graphql/org` Mutation contains the 10 mutations and Query contains `inventoryItem`/`inventoryItems` (silent-drop guard); they are absent from `/graphql/public`.
- **node-authz:** the three inventory nodes are already covered by the module's existing tests — confirm they stay green (no new guard).

## Out of scope / follow-ups

- Tagging the remaining module (translation — which may have a `public` nuance for locales).
- Any storefront/availability read surface (deferred — the storefront reads availability via product/channel, not inventory's own queries).
