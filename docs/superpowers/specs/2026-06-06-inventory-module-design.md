# `@czo/inventory` — inventory module (design)

**Date:** 2026-06-06
**Branch:** `feat/inventory-module`
**Goal:** A new Effect-native module `@czo/inventory` — org-scoped inventory items, per-stock-location stock levels (with atomic quantity ops), and reservations — mirroring the `@czo/stock-location` / `@czo/channel` module conventions, with the new element of **atomic, concurrency-safe quantity arithmetic**.

## Context

Inventory (Medusa-style) tracks *how much of a trackable unit is where*:
- An **inventory item** is a trackable SKU (org-scoped). No product link (no product module yet).
- An **inventory level** is the quantity of one item at one stock location: `stocked`, `reserved`, `incoming`. `available = stocked − reserved`.
- A **reservation** is a hold on a level for an external order line (`lineItemId`). Creating/releasing a reservation moves `reserved` on the level.

The module follows the established Effect-native template (`defineModule`, Drizzle schema+relations into the global `SchemaRegistryShape`, one colocated `InventoryService`, code-first Pothos GraphQL, `permission` authz + node-guards, access domain in `onStart`, Testcontainers E2E). Like `@czo/channel`, it has a **cross-module dependency on `@czo/stock-location`** (`StockLocationService`) to validate that a level/reservation's stock location is in the item's org. The new aspect vs channel is **atomic numeric quantity updates** (no naive read-modify-write under concurrency).

## Data model (3 tables)

`organizationId` is denormalized onto all three tables — copied from the item at creation, never mutated (items don't change org). This is required for the per-row `permission` authz + node-guards (`select:true` loads it), consistent with attribute/stock-location/channel.

### `inventory_items` (org-scoped CRUD)

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer identity PK | |
| `organization_id` | integer NOT NULL | cross-module ref to auth `organizations.id` (no DB FK) |
| `sku` | text NOT NULL | unique code |
| `title` | text NULL | human-readable name (sku is the code; title is the label) |
| `description` | text NULL | longer detail |
| `requires_shipping` | boolean NOT NULL default true | |
| `metadata` | jsonb NULL | |
| `deleted_at` | timestamp NULL | soft-delete |
| `version` | integer NOT NULL default 1 | optimistic lock |
| `created_at` / `updated_at` | timestamp NOT NULL defaultNow | |

Indexes: `index(organization_id)`, `unique(organization_id, sku)`.

### `inventory_levels` (per item × stock-location)

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer identity PK | |
| `organization_id` | integer NOT NULL | denormalized from the item |
| `inventory_item_id` | integer NOT NULL | FK → `inventory_items.id` `onDelete: cascade` |
| `stock_location_id` | integer NOT NULL | cross-module ref to `stock_locations.id` (no DB FK) |
| `stocked_quantity` | integer NOT NULL default 0 | |
| `reserved_quantity` | integer NOT NULL default 0 | denormalized; maintained transactionally by reservation ops |
| `incoming_quantity` | integer NOT NULL default 0 | |
| `version` | integer NOT NULL default 1 | optimistic lock (for `setLevel`) |
| `deleted_at` | timestamp NULL | soft-delete |
| `created_at` / `updated_at` | timestamp NOT NULL defaultNow | |

Constraints: **partial** `unique(inventory_item_id, stock_location_id) WHERE deleted_at IS NULL` (so a soft-deleted level doesn't block re-creating one for the same item×location — re-stocking a removed location is common), `index(inventory_item_id)`, `index(stock_location_id)`. CHECK constraints (DB-enforced invariants): `stocked_quantity >= 0`, `reserved_quantity >= 0`, `incoming_quantity >= 0`, `reserved_quantity <= stocked_quantity`. `available_quantity = stocked − reserved` is **computed** at the GraphQL layer (not stored).

### `reservations` (holds against a level)

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer identity PK | |
| `organization_id` | integer NOT NULL | denormalized from the item |
| `inventory_item_id` | integer NOT NULL | FK → `inventory_items.id` `onDelete: cascade` |
| `stock_location_id` | integer NOT NULL | cross-module ref |
| `quantity` | integer NOT NULL | CHECK `quantity > 0` |
| `line_item_id` | text NULL | external order-line reference |
| `description` | text NULL | |
| `created_by` | integer NULL | userId of the actor (audit; nullable) |
| `metadata` | jsonb NULL | |
| `deleted_at` | timestamp NULL | soft-delete (release) |
| `created_at` / `updated_at` | timestamp NOT NULL defaultNow | |

`index(inventory_item_id)`, `index(stock_location_id)`, `index(line_item_id)`. Reservations are **soft-deleted** on release (consistent with the codebase's never-hard-delete rule and auditable: who held what for which `lineItemId`, when released); the level's `reserved_quantity` is decremented in the same transaction. Reads filter `deleted_at IS NULL`. (A future purge job — like sessions' `purgeExpired` — can hard-delete old released reservations if volume demands; out of MVP scope.)

### Relations (`relations.ts`)

`defineRelationsPart` over `{ inventoryItems, inventoryLevels, reservations, stockLocations, organizations }` (side-effect imports of `@czo/auth/schema` + `@czo/stock-location/schema` for the augmentation, as in channel):
- `inventoryItems.organization → organizations`; `inventoryItems.levels = many.inventoryLevels`; `inventoryItems.reservations = many.reservations`.
- `inventoryLevels.inventoryItem → inventoryItems`; `inventoryLevels.stockLocation → stockLocations` (cross-module); `inventoryLevels.reservations` — see note. (Reservations relate to the item+location, not directly to a level row id; expose the level→reservations connection by matching `inventory_item_id` + `stock_location_id`. If a relation across two columns isn't expressible, expose `reservations` on the **item** only and filter by location in the resolver — pin in plan.)
- `reservations.inventoryItem → inventoryItems`; `reservations.stockLocation → stockLocations`.

## `InventoryService` (`services/inventory.ts`) — atomic quantity arithmetic

Tagged errors (double as GraphQL errors): `InventoryItemNotFound`, `SkuTaken`, `InventoryLevelNotFound`, `LevelAlreadyExists`, `InsufficientInventory` (reserve exceeds available), `InsufficientStock` (adjust would push stocked below reserved/0), `CrossOrgStockLocation`, `ReservationNotFound`, `LevelHasReservations`, `OptimisticLockError` (kit), `InventoryDbFailed`.

### Items
`findFirst`/`findMany` (soft-delete-filtered), `createItem` (sku pre-check → `SkuTaken`), `updateItem` (optimistic lock), `softDeleteItem`.

### Levels — `StockLocationService` cross-org guard on creation
- `createLevel(itemId, stockLocationId, { stocked?, incoming? })` — load the item (org + existence → `InventoryItemNotFound`); validate the stock location is in the item's org via `StockLocationService.findFirst` (else `CrossOrgStockLocation`); insert with `organizationId = item.organizationId`; `unique` conflict → `LevelAlreadyExists`.
- `setLevel(levelId, expectedVersion, { stocked?, incoming? })` — absolute set via `optimisticUpdate`. Rejects if it would make `stocked < reserved` (DB CHECK → mapped to `InsufficientStock`).
- `adjustStocked(levelId, delta)` — **atomic**: `UPDATE inventory_levels SET stocked_quantity = stocked_quantity + delta, version = version + 1 WHERE id = :id AND stocked_quantity + delta >= reserved_quantity AND stocked_quantity + delta >= 0 RETURNING *`. 0 rows → distinguish: re-read by id; not found → `InventoryLevelNotFound`, else → `InsufficientStock`. No read-modify-write (concurrency-safe).
- `deleteLevel(levelId)` — only if `reserved_quantity = 0` (else `LevelHasReservations`); **soft-delete** (set `deleted_at`). Reads filter `deleted_at IS NULL`; the partial unique lets a new level be created for the same item×location afterwards.

### Reservations — atomic reserve/release in a transaction
- `createReservation({ itemId, stockLocationId, quantity, lineItemId?, description?, createdBy?, metadata? })` — one transaction:
  1. Resolve the level for `(itemId, stockLocationId)`; not found → `InventoryLevelNotFound`.
  2. **Atomic guard**: `UPDATE inventory_levels SET reserved_quantity = reserved_quantity + :quantity WHERE id = :levelId AND stocked_quantity - reserved_quantity >= :quantity RETURNING *`. 0 rows → `InsufficientInventory`.
  3. Insert the reservation row (`organizationId = level.organizationId`). Return the reservation.
- `updateReservation(id, { quantity?, lineItemId?, description?, metadata? })` — if `quantity` changes, apply the **delta** to the level's `reserved_quantity` with the same atomic guard (a positive delta must satisfy `stocked - reserved >= delta`; a negative delta is always allowed). Update the row in the same tx.
- `deleteReservation(id)` (release) — one transaction: decrement the level's `reserved_quantity` by the reservation's `quantity`, then **soft-delete** the reservation row (set `deleted_at`). `ReservationNotFound` if absent or already released. All reservation reads filter `deleted_at IS NULL`.

All quantity writes use atomic SQL (`sql\`… + ${delta}\``) with the guard in the `WHERE`, never a JS read-modify-write — this is the module's core correctness property under concurrent fulfillment.

## GraphQL

Code-first Pothos, structure cloned from `@czo/channel`'s `graphql/`:

- **`InventoryItem`** drizzleNode (`select:true`): `sku`, `description?`, `requiresShipping`, `metadata`, `createdAt`/`updatedAt`/`version`, `organization: t.relation('organization')`, and a **`levels` relay connection** (1:N → `inventoryLevels`, gated `inventory:read` in the parent's org).
- **`InventoryLevel`** drizzleNode (`select:true`): `stockedQuantity`, `reservedQuantity`, `incomingQuantity`, **`availableQuantity: t.int({ resolve: l => l.stockedQuantity - l.reservedQuantity })`** (computed), `version`, `stockLocation: t.relation('stockLocation')` (cross-module), `inventoryItem: t.relation('inventoryItem')`, and a **`reservations` relay connection** (gated `inventory:read`).
- **`Reservation`** drizzleNode (`select:true`): `quantity`, `lineItemId?`, `description?`, `createdBy?`, `metadata`, `createdAt`, `inventoryItem`/`stockLocation` relations.
- **Queries**: `inventoryItem(id)` (nullable, org-derived authz), `inventoryItems(organizationId, search over sku, where, orderBy)` (org-scoped connection). Levels/reservations are reached via the parent connections.
- **Mutations**: `createInventoryItem`/`updateInventoryItem`/`deleteInventoryItem`; `createInventoryLevel`/`setInventoryLevel`/`adjustInventoryStock`/`deleteInventoryLevel`; `createReservation`/`updateReservation`/`deleteReservation`. Each returns the affected entity (the level for adjust/set; the reservation for reservation ops; the item for item ops). `adjustInventoryStock` takes `{ levelId: globalID<InventoryLevel>, delta: int }`.

> The level/reservation relay connections resolve on the query/node path (drizzle-loaded parent). As established in channel, selecting a relay connection inside a mutation payload (POJO parent) is unsupported by the Pothos-drizzle relatedConnection and fails closed — mutations return the affected entity's scalar fields; clients re-query connections via `inventoryItem(id:)`.

## Authorization

- **Access domain** registered in `onStart`:
  ```ts
  const INVENTORY_STATEMENTS = { inventory: ['create', 'read', 'update', 'delete'] } as const
  const INVENTORY_HIERARCHY = [
    { name: 'inventory:viewer', permissions: { inventory: ['read'] } },
    { name: 'inventory:manager', permissions: { inventory: ['create', 'update'] } },
    { name: 'inventory:admin', permissions: { inventory: ['delete'] } },
  ]
  ```
- **Reads**: `inventoryItem(id)`/`inventoryItems(org)` and the connections gate on `inventory:read` in the row/arg org (unknown id → `{ auth: true }` → nullable collapses to null).
- **Writes**: item create/update/delete → `inventory:create|update|delete`. Level create/set/adjust/delete and ALL reservation ops → **`inventory:update`** (managing stock/holds is updating inventory) except `deleteInventoryLevel` → `inventory:delete`. Org derived from the affected row (level/reservation/item) via an `authz.ts` `loadOrganizationId` per entity kind.
- **Cross-org guard** (service-level): `createLevel`/`createReservation` reject a stock location not in the item's org (`CrossOrgStockLocation`), via `StockLocationService`.
- **Node-guards** (`graphql/node-guards.ts`): `InventoryItem`/`InventoryLevel`/`Reservation` → `{ permission: { resource: 'inventory', actions: ['read'], organization: row.organizationId } }`. Org-scopes `node(id:)` (deny-as-null).

## Module wiring (`index.ts`) + manifest

`defineModule(() => ({ name: 'inventory', layer: InventoryModuleLive, db: { schema, relations }, graphql: { contribution, nodeGuards }, onStart }))`. `InventoryModuleLive` exposes `InventoryService` (+ event bus) and requires `DrizzleDb` + `StockLocationService`. Manifest (`apps/life/src/modules.ts`): `[auth, attribute, stock-location, channel, inventory]` — inventory after stock-location (its service) and auth.

Events: `InventoryEvents` bus + `services/events/inventory.ts` (item created/updated/deleted, level created/adjusted/deleted, reservation created/updated/deleted), mirroring channel's events.

## File structure (mirrors `@czo/channel`)

```
packages/modules/inventory/
  package.json tsconfig.json build.config.ts vitest.config.ts drizzle.config.ts eslint.config.js
  migrations/<ts>_init/migration.sql
  src/
    index.ts
    database/{schema,relations}.ts
    services/{index,inventory}.ts  services/events/inventory.ts
    graphql/index.ts graphql/schema/index.ts graphql/node-guards.ts
    graphql/schema/inventory/{types,inputs,errors,queries,authz}.ts
    graphql/schema/inventory/mutations/{item,level,reservation}.ts   # split — many mutations
    e2e/harness.ts e2e/inventory.e2e.test.ts
    services/inventory.integration.test.ts
```

`package.json` peer+dev deps include `@czo/auth` AND `@czo/stock-location` (mirror channel). Subpath exports `./schema`, `./relations`, `./services`, `./graphql`. The mutations are **split by entity** (`item`/`level`/`reservation`) to keep files focused (~12 mutations would bloat one file beyond the 400-line guideline).

## Migrations

`drizzle-kit generate` into `migrations/<ts>_init/` (timestamped-directory format — the runtime/test migrator reads this, NOT the flat file). Include the CHECK constraints (verify drizzle emits them; if not, add them to the migration SQL by hand). Verify integer-identity PKs.

## Testing

- **Integration** (`inventory.integration.test.ts`): `InventoryService` over Postgres (channel's `makePostgresTestLayer` pattern; `StockLocationService` stubbed for cross-org cases, real for the table). Cover: item CRUD + `SkuTaken`; `createLevel` (+ `CrossOrgStockLocation`, `LevelAlreadyExists`); `adjustStocked` happy + `InsufficientStock` (would go below reserved/0); `createReservation` happy + `InsufficientInventory` (over-reserve) + `InventoryLevelNotFound`; `updateReservation` delta; `deleteReservation` releases (reserved decremented); `deleteLevel` blocked by `LevelHasReservations`. **Concurrency**: two parallel `createReservation` calls that together exceed available → exactly one succeeds, one fails `InsufficientInventory` (proves the atomic guard).
- **E2E** (`inventory.e2e.test.ts`): `bootTestApp([auth, stock-location, inventory])` — sign-up/org/role, create item, create a stock location (via the booted stock-location mutations) IN the same org, create a level, adjust stock, reserve/release (assert `availableQuantity` reflects it via the query path), node-guard member-ok/non-member-denied, cross-org denials (read + link a foreign-org stock location → `CrossOrgStockLocation`).

## Out of scope (deferred)

- Product/variant links (no product module); kits/bundles; multi-location allocation strategies; backorders.
- Reservation→order lifecycle (we store a free `lineItemId` ref only).
- A standalone `reservations(...)`/`inventoryLevels(...)` top-level query (reached via parent connections in MVP).

## Verification

- `pnpm --filter @czo/inventory check-types | lint | test` (integration + E2E + the concurrency test green).
- `pnpm --filter @czo/stock-location check-types`, `@czo/auth`, `@czo/life` (manifest wiring).
- The E2E proves the combined `[auth, stock-location, inventory]` schema resolves `for: 'StockLocation'`/`'Organization'`/`'InventoryItem'`/`'InventoryLevel'`.
