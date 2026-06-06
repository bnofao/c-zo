# `@czo/channel` — sales-channel module (design)

**Date:** 2026-06-06
**Branch:** `feat/channel-module`
**Goal:** A new Effect-native module `@czo/channel` — an org-scoped sales-channel entity (CRUD) plus an M:N association to stock locations, mirroring the `@czo/stock-location` module's structure and conventions.

## Context

A *sales channel* (canal de vente) is a point of sale / storefront (e.g. *Web Store*, *Mobile App*, *POS*, *B2B*). This module owns the channel entity and its links to stock locations (which warehouses serve a channel). Product associations and publishable API keys are **out of scope** (no product module exists yet).

The module follows the `@czo/stock-location` template exactly: `defineModule`, Drizzle schema + relations registered into the global `SchemaRegistryShape`, a single colocated `ChannelService`, code-first Pothos GraphQL (drizzleNode + drizzleConnection + relay), declarative `permission` authz reusing auth's scope, a kit node-guard, an access domain registered in `onStart`, and a Testcontainers E2E harness.

## Data model

### `channels` (org-scoped CRUD entity — mirrors `stock_locations`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer identity PK | |
| `organization_id` | integer NOT NULL | cross-module ref to auth's `organizations.id` (no DB FK, like stock-location) |
| `handle` | text NOT NULL | stable slug |
| `name` | text NOT NULL | |
| `description` | text NULL | |
| `is_default` | boolean NOT NULL default false | |
| `is_active` | boolean NOT NULL default true | |
| `metadata` | jsonb NULL | |
| `deleted_at` | timestamp NULL | soft-delete |
| `version` | integer NOT NULL default 1 | optimistic lock |
| `created_at` / `updated_at` | timestamp NOT NULL defaultNow | |

Indexes: `index(organization_id)`, `unique(organization_id, handle)` — same shape as `stock_locations`.

### `channel_stock_locations` (M:N junction)

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer identity PK | |
| `channel_id` | integer NOT NULL | FK → `channels.id` `onDelete: cascade` |
| `stock_location_id` | integer NOT NULL | cross-module ref to `stock_locations.id` (NO inter-module DB FK — same convention as `organization_id`) |
| `created_at` | timestamp NOT NULL defaultNow | |

Constraint: `unique(channel_id, stock_location_id)`. Index on `channel_id`. Both tables are augmented into `SchemaRegistryShape` next to their definitions (the `declare module '@czo/kit/db'` block travels with the schema import).

### Relations (`relations.ts`)

`defineRelationsPart` over the picked tables `{ channels, channelStockLocations, stockLocations }` (the junction's `stockLocation` relation references the stock-location module's table — exactly how `stock-location` relates to `organizations`):
- `channels.stockLocationLinks = r.many.channelStockLocations` (1:N to the junction)
- `channelStockLocations.channel = r.one.channels(from channel_id → channels.id)`
- `channelStockLocations.stockLocation = r.one.stockLocations(from stock_location_id → stockLocations.id)` — cross-module

This makes `db.query.channels.findMany({ with: { stockLocationLinks: { with: { stockLocation: true } } } })` typed and lets the relay connection resolve `StockLocation` nodes through the junction.

## `ChannelService` (`services/channel.ts`)

A single colocated `Context.Service` with tagged errors (doubling as GraphQL errors), input/output types, the `make` factory, and `Layer.effect`. Methods (mirroring `StockLocationService` + the link ops):

- `findFirst(config)` / `findMany(config)` — soft-delete-filtered (`deletedAt: { isNull: true }`), selection-aware (RQBv2 object form).
- `create(input)` → `ChannelAlreadyExists` on `unique(org, handle)` conflict.
- `update(input)` → optimistic lock; `OptimisticLockError` on stale `version`; `ChannelNotFound`.
- `softDelete(input)` → sets `deletedAt`; `ChannelNotFound`.
- `addStockLocations(channelId, stockLocationIds)` / `removeStockLocations(channelId, stockLocationIds)` — insert/delete junction rows. `add` is idempotent via `onConflictDoNothing` on the unique constraint; `remove` deletes the matching rows. Both validate ownership (below).
- Tagged errors: `ChannelNotFound`, `ChannelAlreadyExists`, `OptimisticLockError`, `ChannelDbFailed`, `CrossOrgStockLocation` (a stock location not in the channel's org was passed to a link op).

### Cross-org link validation

`addStockLocations` must reject linking a stock location owned by a different org (or a non-existent one). The service resolves each `stockLocationId`'s org via the **`StockLocationService`** (`@czo/stock-location/services`) and fails `CrossOrgStockLocation` if any does not match the channel's `organizationId`. This is the module's cross-module service dependency (channel → stock-location), analogous to stock-location → auth.

## GraphQL

Code-first Pothos, structure cloned from `graphql/schema/stock-location/`:

- **`types.ts`** — `builder.drizzleNode('channels', { name: 'Channel', select: true, id, fields })`. Fields: `handle`, `name`, `description` (nullable), `isDefault`, `isActive`, `metadata` (JSONObject), `createdAt`, `updatedAt`, `version`, `organization: t.relation('organization')` (cross-module, same as stock-location), and the **`stockLocations` relay connection** (see below). `select: true` guarantees `organizationId` for the node-guard.
- **`queries.ts`** — `channel(id: globalID<Channel>)` (nullable, authz derives org from the row), `channels(organizationId: globalID<Organization>, search, where, orderBy)` (org-scoped connection). Mirror stock-location verbatim (search over `name`/`handle`, tenant-bounded).
- **`mutations.ts`** — `createChannel`, `updateChannel`, `deleteChannel` (success/error unions like stock-location), plus `addStockLocationsToChannel(input: { channelId: globalID<Channel>, stockLocationIds: [globalID<StockLocation>] })` and `removeStockLocationsFromChannel(...)` returning the updated `Channel`.
- **`inputs.ts`**, **`errors.ts`**, **`authz.ts`** — mirror stock-location; `errors.ts` registers the new tagged errors; `authz.ts` has `loadOrganizationId(ctx, id: number)` resolving a channel's org for by-id authz.

### `Channel.stockLocations` connection

A relay connection on `Channel` whose nodes are `StockLocation` (the stock-location module's drizzleNode), resolved through the junction (`channel.stockLocationLinks[].stockLocation`). The exact Pothos mechanism — `t.relatedConnection` over the M:N relation if the Pothos-drizzle plugin supports junction traversal, else a connection resolver that loads the junction rows and maps to `StockLocation` — is **pinned during planning** (both are viable; the relay node type is `StockLocation` either way). Authz: gated by `channel:read` in the channel's org (the association is the channel's own data; the parent's org is loaded via `select: true`). Per the parent-aware-connection convention, the WHERE is parent-scoped (`channelId = parent.id`) and the scope check is on `authScopes`, not the batched query.

> Authz note (decided): the `stockLocations` connection requires `channel:read`, NOT `stock-location:read`. Rationale: it exposes the channel's association list, and the linked locations are same-org (enforced at link time). A stricter variant (also require `stock-location:read`) was considered and rejected for MVP to avoid coupling channel reads to stock-location permissions.

## Authorization

- **Access domain** registered in `onStart` (registry still mutable; auth freezes in its own `onStarted`):
  ```ts
  const CHANNEL_STATEMENTS = { channel: ['create', 'read', 'update', 'delete'] } as const
  const CHANNEL_HIERARCHY = [
    { name: 'channel:viewer', permissions: { channel: ['read'] } },
    { name: 'channel:manager', permissions: { channel: ['create', 'update'] } },
    { name: 'channel:admin', permissions: { channel: ['delete'] } },
  ]
  ```
- **Read authz**: `channel(id)` derives org from the row → `{ permission: { resource: 'channel', actions: ['read'], organization } }` (unknown id → `{ auth: true }` → nullable field collapses to null). `channels(organizationId)` → `channel:read` in the arg org.
- **Write authz**: `createChannel` → `channel:create` in the input org; `updateChannel`/`deleteChannel` → `channel:update`/`channel:delete` in the row's org; `addStockLocationsToChannel`/`removeStockLocationsFromChannel` → `channel:update` in the channel's org, **plus** the service-level `CrossOrgStockLocation` guard.
- **Node-guard** (`graphql/node-guards.ts`): `channelNodeGuards = { Channel: (row) => ({ permission: { resource: 'channel', actions: ['read'], organization: row.organizationId } }) }`, wired via `graphql.nodeGuards` — org-scopes the global `node(id:)` path (deny-as-null), mirroring stock-location's B18 fix.

## Module wiring (`index.ts`)

`defineModule(() => ({ name: 'channel', version: '0.0.1', layer: ChannelModuleLive, db: { schema, relations }, graphql: { contribution, nodeGuards }, onStart }))`.

- `ChannelModuleLive` exposes `ChannelService` + its event bus; requires `DrizzleDb` (provided by `buildApp`) and **`StockLocationService`** (for link validation) — the latter resolved at request time via `ctx.runEffect` against the app runtime (stock-location listed before channel).
- Events: a `ChannelEvents` bus + `services/events/channel.ts` (created/updated/deleted/stock-locations-changed), mirroring stock-location's event service.
- **Manifest order** (`apps/life/src/modules.ts`): `[auth, attribute, stockLocation, channel]` — channel after stock-location (uses its service) and auth (Access/Organization).

## File structure (mirrors stock-location)

```
packages/modules/channel/
  package.json, tsconfig.json, build.config.ts, vitest.config.ts, drizzle.config.ts, eslint.config.*
  migrations/<ts>_init/migration.sql        # drizzle-kit generate (directory format)
  src/
    index.ts                                # defineModule
    database/schema.ts                      # channels + channel_stock_locations + registry augmentation
    database/relations.ts                   # channelRelations (picks channels, junction, stockLocations)
    services/index.ts                       # ChannelModuleLive
    services/channel.ts                     # ChannelService (CRUD + link/unlink + cross-org guard)
    services/events/channel.ts              # ChannelEvents
    graphql/index.ts                        # builder type + '@czo/auth/graphql' + '@czo/stock-location/graphql' imports + node-guards export
    graphql/schema/index.ts                 # registerChannelSchema
    graphql/schema/channel/{types,inputs,queries,mutations,errors,authz}.ts
    graphql/node-guards.ts                  # channelNodeGuards
    e2e/harness.ts                          # bootTestApp([auth, stock-location, channel])
    e2e/channel.e2e.test.ts
    services/channel.integration.test.ts
```

`package.json` deps: `@czo/auth`, `@czo/stock-location`, `@czo/kit`, drizzle/effect (copy stock-location's). Subpath exports (`./schema`, `./relations`, `./services`, `./graphql`) mirror stock-location.

## Migrations

Generate via `drizzle-kit generate` into `migrations/<ts>_init/` (timestamped-directory format — the runtime/test migrator reads this, NOT the flat drizzle-kit file; this was the B15 stock-location bug). Verify the generated SQL has `integer` identity PKs matching the schema before relying on it.

## Testing

- **Integration** (`channel.integration.test.ts`): `ChannelService` over `AuthPostgresLayer`-style Postgres — CRUD, soft-delete filtering, optimistic lock, `add`/`remove` junction ops, `CrossOrgStockLocation` rejection. (Channel's link validation needs a `StockLocationService`, so the test layer composes both modules' services or stubs the stock-location org lookup — pin in plan.)
- **E2E** (`channel.e2e.test.ts`): `bootTestApp([auth, stockLocation, channel])` driving the real fetch handler — sign-up/org/role grant, then `createChannel` → read back, `channels` list (member ok / non-member denied), cross-org read denied, `node(id:)` member-ok/non-member-denied (node-guard), `addStockLocationsToChannel` (same-org ok; cross-org → error), `removeStockLocationsFromChannel`, and the `Channel.stockLocations` connection reflecting the links. Harness mirrors `stock-location/src/e2e/harness.ts` (with the X-Forwarded-For per-signup IP for rate-limit).

## Out of scope

- Product associations, publishable API keys (no product module).
- Reverse exposure `StockLocation.channels` (would modify the stock-location module — decided against).
- `setChannelStockLocations` set-replace mutation (incremental add/remove chosen).

## Verification

- `pnpm --filter @czo/channel check-types | lint | test` (integration + E2E green).
- `pnpm --filter @czo/stock-location check-types`, `pnpm --filter @czo/auth check-types`, `pnpm --filter @czo/life check-types` (manifest wiring).
- Confirm the combined schema builds (`bootTestApp` E2E proves `for: 'StockLocation'` / `'Organization'` resolve in the `[auth, stock-location, channel]` schema).
