# Channel platform tier + GraphQL sub-graph tagging — Design

**Date:** 2026-06-12
**Depends on:** the sub-graph foundation (#130) + auth sub-graph work (#131) — both merged to `main` (the kit enablement + the `org`/`admin` sub-graph names). **Branch off `main`.**

## Goal

Add a **platform-channel tier** to `@czo/channel` — channels with no owning organization (`organizationId = null`), created and managed by a platform operator via a **global** `channel` role — alongside the existing org-owned channels. Then tag the GraphQL surface into audience sub-graphs: org-tier ops → `org`, platform-tier ops → `admin`, and the id-based ops (whose tier is derived from the row) into both. This mirrors the `@czo/attribute` module's platform-vs-org tier model (nullable `organizationId`, global-role-vs-org-permission authz, `tierScope`/`nodeReadScope`).

This is two coupled changes: (A) the platform-tier **feature** (schema + service + authz), and (B) the **sub-graph tagging** of the resulting surface. They ship together because the audience mapping depends on the tier.

## Decisions (settled during brainstorming)

1. **Platform channels via nullable `organizationId`** (mirror `attribute`): `null` = platform (global `channel` role), `X` = org (permission in X). Not a separate table.
2. **Split CREATE and LIST per tier** (api-key-style, meaningful targeted ops): `createChannel`(org, `organizationId` required) + `createPlatformChannel`(admin, no org); `channels`(org, `organizationId` required) + `platformChannels`(admin).
3. **Keep id-based ops multi-tier** (`channel(id)`, `updateChannel`, `deleteChannel`): one op each, tier derived from the row, tagged `['org','admin']`. No cosmetic duplication — the multi-membership "smell" applies to creation discriminators (split), not to row-tier-adaptive reads/by-id ops.
4. **Stock-location link ops stay `org`-only** (`addStockLocationsToChannel`/`removeStockLocationsFromChannel`): they enforce `CrossOrgStockLocation` (the locations must match the channel's org), so a platform channel (no org) cannot link org-scoped stock locations.
5. **No serving change** — `apps/life` already serves `org` + `admin`.

## Architecture

### 1. Schema (`database/schema.ts` + migration)

- `organizationId: integer('organization_id')` → **nullable** (drop `.notNull()`).
- **Uniqueness:** org channels stay unique by `(organization_id, handle)`. Platform channels (org null) need a separate guarantee — SQL `UNIQUE(organization_id, handle)` does NOT constrain rows where `organization_id IS NULL` (NULLs are distinct), so add a **partial unique index** on `handle` `WHERE organization_id IS NULL`. The migration: make the column nullable + add the partial index.

### 2. Service (`services/channel.ts`)

- `create` accepts `organizationId: number | null` (its input type drops the non-null assumption). The platform path inserts `organizationId: null`. `findFirst`/`findMany` already accept arbitrary `where` (no change beyond types). Soft-delete/optimistic-lock unchanged.

### 3. Authz (`graphql/schema/channel/authz.ts`)

- **New helper `channelPermission(action, org: number | null)`** (mirror `attributePermission`): returns `{ permission: { resource: 'channel', actions: [action] } }` when `org == null` (the `permission` scope with no `organization` → checks the **global** `channel:<action>` role), or `{ permission: { resource: 'channel', actions: [action], organization: org } }` when `org` is a number (org role).
- **Tier-aware loader** replacing the current `loadOrganizationId` (which conflates "no row" and "null org"): `loadChannelTier(ctx, id) → { found: false } | { found: true, organizationId: number | null }`. The id-based authScopes use it: `found: false` → `{ auth: true }` (defer to the `ChannelNotFound` 404, not a gate 403); `found: true` → `channelPermission(action, organizationId)`.
- The list/create authScopes: `channels`/`createChannel` keep org permission (org arg required); `platformChannels`/`createPlatformChannel` use `channelPermission(action, null)` (global role).

### 4. GraphQL surface (`graphql/schema/channel/{queries,mutations}.ts`)

- **New `createPlatformChannel`** mutation (`mutations.ts`): input WITHOUT `organizationId` (the other channel fields unchanged); authScope `channelPermission('create', null)` (global); resolver calls `svc.create({ ..., organizationId: null })`. Audience `admin`.
- **New `platformChannels`** query (`queries.ts`): lists platform channels (`where: { organizationId: { isNull: true } }`); authScope `channelPermission('read', null)`; audience `admin`.
- **`channel(id)`/`updateChannel`/`deleteChannel`:** switch their authScopes to the tier-aware `loadChannelTier` + `channelPermission` (so they work for both tiers). Bodies otherwise unchanged. Audience `['org','admin']`.
- **`channels`/`createChannel`/`addStockLocationsToChannel`/`removeStockLocationsFromChannel`:** unchanged authz (org). Audience `org`.

### 5. node-guard (`graphql/node-guards.ts`)

- The `Channel` guard becomes tier-derived: `(row: { organizationId: number | null }) => channelPermission('read', row.organizationId)` — a platform channel (org null) requires the global `channel:read`; an org channel requires `channel:read` in its org. So `node(id:)` is never weaker than `channel(id)`. (`select: true` already loads `organizationId`.) Deny → null.

### 6. Sub-graph tagging

A module-local `sg()` helper (mirror auth/stock-location/price) tags the mutations at the 5 points. Audience mapping:

| Audience | Ops | Types |
| --- | --- | --- |
| `org` | `channels`, `createChannel`, `addStockLocationsToChannel`, `removeStockLocationsFromChannel` | org-specific create input |
| `admin` | `platformChannels`, `createPlatformChannel` | platform create input |
| `['org','admin']` | `channel`, `updateChannel`, `deleteChannel` | `Channel` node; the update input + the errors shared by the id-based ops (`ChannelNotFound`, `OptimisticLockError`*) |

`ChannelHandleTaken` (referenced by both create variants) → `['org','admin']`. `CrossOrgStockLocation` (only org stock-location ops) → `org`. Kit-shared `ValidationError`/`OptimisticLockError`/`StringFilterInput` are tagged centrally — not per-module. (*OptimisticLockError is kit-shared; only module errors get a per-module `subGraphs`.)

## Data flow

```
admin (global channel:create) → POST /graphql/admin  createPlatformChannel(input: { handle, name, … })
  → channelPermission('create', null) → global role ✓
  → svc.create({ …, organizationId: null }) → platform Channel
org member (channel:create in A) → POST /graphql/org  createChannel(organizationId: A, …)
  → channelPermission('create', A) → org role ✓
node(id: <platform Channel>) on /graphql/admin
  → Channel guard → channelPermission('read', null) → global channel:read ✓ ; else null
```

## Error handling / security

- **Tier authz never weaker via node():** the `Channel` guard mirrors `channel(id)`'s tier-derived scope.
- **No existence oracle:** unknown/forbidden id → `null` (node) / `ChannelNotFound` (by-id query) uniformly.
- **Platform isolation:** an org member lacking the global `channel` role cannot create/read platform channels (the global-role scope denies); an admin lacking org permission cannot manage a specific org's channels via the org ops.
- **Uniqueness:** the partial unique index prevents duplicate platform handles (which the org-scoped unique would miss for NULL orgs).
- **Exposure ≠ authz:** the `org`/`admin` tags control which endpoint exposes a field; the tier-derived authScope is the gate.

## Testing

- **Service/migration (integration):** create a platform channel (`organizationId: null`); the partial unique index rejects a duplicate platform handle; an org channel and a platform channel may share a handle.
- **Authz (integration/E2E):** `createPlatformChannel` allowed for a global-`channel:create` holder, denied for a plain org member; `createChannel` allowed for an org `channel:create` holder; `channel(id)`/`update`/`delete` resolve both tiers under the right role.
- **node-authz E2E:** an org member reads their org channel via `node(id:)`; a global-role holder reads a platform channel; a cross-org / no-global caller → `null`.
- **Exposure E2E:** `/graphql/org` Mutation has `createChannel`/`updateChannel`/`deleteChannel`/`addStockLocationsToChannel`/`removeStockLocationsFromChannel` and Query has `channels`/`channel`, but NOT `createPlatformChannel`/`platformChannels`; `/graphql/admin` has `createPlatformChannel`/`platformChannels` + the id-based `channel`/`updateChannel`/`deleteChannel`, but NOT `createChannel`/`channels`/the stock-location ops.

## Out of scope / follow-ups

- Migrating existing channel rows (all currently org-owned; the nullable change is additive — no backfill).
- Platform channels linking stock locations (deferred — `CrossOrgStockLocation` keeps link ops org-only).
- Tagging the remaining org-scoped modules (inventory, translation).
