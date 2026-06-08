# `@czo/inventory` Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Effect-native module `@czo/inventory` — org-scoped inventory items, per-stock-location levels with **atomic** quantity ops, and reservations — cloned from `@czo/channel`/`@czo/stock-location` with novel concurrency-safe numeric arithmetic.

**Architecture:** Mirror `@czo/channel` (defineModule, Drizzle schema+relations into the global `SchemaRegistryShape`, one colocated `InventoryService`, code-first Pothos GraphQL, `permission` authz + node-guards, access domain in `onStart`, cross-module `StockLocationService` guard, Testcontainers E2E). 3 tables (items/levels/reservations, all soft-delete, `organizationId` denormalized), ~12 mutations split by entity, and atomic SQL quantity updates (no JS read-modify-write).

**Tech Stack:** Effect 4, Drizzle RQBv2 (`@effect/sql-pg`), Pothos (drizzle/relay/errors/scope-auth), Testcontainers.

**Spec:** `docs/superpowers/specs/2026-06-06-inventory-module-design.md`

> **Commit policy (project rule):** Do NOT `git commit` autonomously. Each task **stages** with `git add`. One commit at the end (Task 15) after the user reviews. Branch: `feat/inventory-module` (the controller creates it before Task 1).
>
> **Cloning convention:** "Clone from channel" = copy the named file from `packages/modules/channel/...` to the inventory path, then apply the rename map: `channel`→`inventory`, `Channel`→`Inventory` (and the specific entity renames per task), scoped id `@czo/channel/...`→`@czo/inventory/...`, resource string `'channel'`→`'inventory'`, `channel:*`→`inventory:*`. Adapt per the task's explicit instructions. Channel is the freshest template for the cross-module-to-stock-location pattern (it depends on `@czo/stock-location` exactly as inventory will).

---

## File Structure

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
    graphql/schema/inventory/mutations/{item,level,reservation}.ts   # split by entity
    e2e/harness.ts e2e/inventory.e2e.test.ts
    services/inventory.integration.test.ts
```

---

## Task 1: Scaffold the package

**Files:** Create `packages/modules/inventory/{package.json,tsconfig.json,build.config.ts,vitest.config.ts,drizzle.config.ts,eslint.config.js}`.

- [ ] **Step 1: Copy configs from channel + rename**

```bash
cd /workspace/c-zo
mkdir -p packages/modules/inventory/src
cp packages/modules/channel/eslint.config.js packages/modules/inventory/eslint.config.js
cp packages/modules/channel/drizzle.config.ts packages/modules/inventory/drizzle.config.ts
```

- [ ] **Step 2: `package.json`** — copy `packages/modules/channel/package.json`, then change `"name"` to `"@czo/channel"`→`"@czo/inventory"`, `"description"` to `"Inventory module for c-zo — inventory items, per-location stock levels, and reservations"`, and `"directory"` to `packages/modules/inventory`. Keep the exact same `exports`/`scripts`/`peerDependencies` (`@czo/auth` + `@czo/stock-location`)/`dependencies`/`devDependencies` (incl. `@effect/vitest: "catalog:"`) — only the three string fields change.

- [ ] **Step 3: `tsconfig.json`** — copy channel's, change the path alias `"@czo/channel/*"` → `"@czo/inventory/*"`.

- [ ] **Step 4: `build.config.ts`** — copy channel's verbatim (the entries `src/index`, `src/database/schema`, `src/database/relations`, `src/services/index`, `src/graphql/index` and externals incl. `@czo/auth/schema`, `@czo/stock-location/*` are identical for inventory).

- [ ] **Step 5: `vitest.config.ts`** — copy channel's, then in `resolve.alias` rename the four `@czo/channel/*` aliases to `@czo/inventory/*` (pointing at THIS module's `src/...`). Keep ALL the `@czo/stock-location/*`, `@czo/auth/*`, `@czo/kit/email`, and bare `@czo/stock-location`/`@czo/auth` aliases verbatim (inventory boots auth + stock-location in E2E, same as channel).

- [ ] **Step 6: Install + stage**

```bash
cd /workspace/c-zo && pnpm install
git add packages/modules/inventory/
```
Verify `pnpm install` completes and `@czo/inventory` is linked.

---

## Task 2: Database schema + migration

**Files:** Create `packages/modules/inventory/src/database/schema.ts`. Generate `migrations/<ts>_init/`.

- [ ] **Step 1: Write `schema.ts`**

```ts
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const inventoryItems = pgTable('inventory_items', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  sku: text('sku').notNull(),
  description: text('description'),
  requiresShipping: boolean('requires_shipping').notNull().default(true),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('inventory_items_organization_id_idx').on(t.organizationId),
  unique('inventory_items_org_sku_uniq').on(t.organizationId, t.sku),
])

export const inventoryLevels = pgTable('inventory_levels', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  inventoryItemId: integer('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  stockLocationId: integer('stock_location_id').notNull(),
  stockedQuantity: integer('stocked_quantity').notNull().default(0),
  reservedQuantity: integer('reserved_quantity').notNull().default(0),
  incomingQuantity: integer('incoming_quantity').notNull().default(0),
  version: integer('version').notNull().default(1),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('inventory_levels_item_id_idx').on(t.inventoryItemId),
  index('inventory_levels_stock_location_id_idx').on(t.stockLocationId),
  // Partial unique: a soft-deleted level must not block re-creating one for the
  // same item×location.
  uniqueIndex('inventory_levels_item_loc_uniq').on(t.inventoryItemId, t.stockLocationId).where(sql`${t.deletedAt} IS NULL`),
  check('chk_inv_level_stocked_nonneg', sql`${t.stockedQuantity} >= 0`),
  check('chk_inv_level_reserved_nonneg', sql`${t.reservedQuantity} >= 0`),
  check('chk_inv_level_incoming_nonneg', sql`${t.incomingQuantity} >= 0`),
  check('chk_inv_level_reserved_le_stocked', sql`${t.reservedQuantity} <= ${t.stockedQuantity}`),
])

export const reservations = pgTable('inventory_reservations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  inventoryItemId: integer('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  stockLocationId: integer('stock_location_id').notNull(),
  quantity: integer('quantity').notNull(),
  lineItemId: text('line_item_id'),
  description: text('description'),
  createdBy: integer('created_by'),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('inventory_reservations_item_id_idx').on(t.inventoryItemId),
  index('inventory_reservations_stock_location_id_idx').on(t.stockLocationId),
  index('inventory_reservations_line_item_id_idx').on(t.lineItemId),
  check('chk_inv_reservation_qty_pos', sql`${t.quantity} > 0`),
])

declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    inventoryItems: typeof inventoryItems
    inventoryLevels: typeof inventoryLevels
    reservations: typeof reservations
  }
}
```

- [ ] **Step 2: Generate the migration**

```bash
cd packages/modules/inventory && pnpm migrate:generate
```

- [ ] **Step 3: Verify directory format + CHECK constraints**

```bash
ls -R packages/modules/inventory/migrations/
```
Confirm it's `migrations/<ts>_<name>/migration.sql` + `snapshot.json` (the directory format — mirror `packages/modules/channel/migrations/`; restructure if drizzle emitted a flat `0000_*.sql`). Open `migration.sql` and confirm: integer-identity PKs; the two FKs `ON DELETE CASCADE`; the partial unique index has `WHERE "deleted_at" IS NULL`; and the four CHECK constraints + the reservation `quantity > 0` CHECK are present. If drizzle-kit omitted any CHECK or the partial-`WHERE`, add it to the SQL by hand (the migrator runs the raw SQL).

- [ ] **Step 4: Stage**

```bash
git add packages/modules/inventory/src/database/schema.ts packages/modules/inventory/migrations/
```

---

## Task 3: Relations

**Files:** Create `packages/modules/inventory/src/database/relations.ts`.

- [ ] **Step 1: Write `relations.ts`**

```ts
import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'
// Side-effect imports: bring stock-location + auth registry augmentations into
// scope so `stockLocations`/`organizations` resolve in the Pick AND when their
// own relations.ts files compile as part of this module's graph (inventory
// imports the stock-location service). Mirrors channel.
import '@czo/auth/schema'
import '@czo/stock-location/schema'

type InventorySchema = Pick<
  SchemaRegistryShape,
  'inventoryItems' | 'inventoryLevels' | 'reservations' | 'stockLocations' | 'organizations'
>

export function inventoryRelations(schema: InventorySchema) {
  const { inventoryItems, inventoryLevels, reservations, stockLocations, organizations } = schema

  return defineRelationsPart(
    { inventoryItems, inventoryLevels, reservations, stockLocations, organizations },
    r => ({
      inventoryItems: {
        organization: r.one.organizations({ from: r.inventoryItems.organizationId, to: r.organizations.id }),
        levels: r.many.inventoryLevels({ from: r.inventoryItems.id, to: r.inventoryLevels.inventoryItemId }),
        reservations: r.many.reservations({ from: r.inventoryItems.id, to: r.reservations.inventoryItemId }),
      },
      inventoryLevels: {
        inventoryItem: r.one.inventoryItems({ from: r.inventoryLevels.inventoryItemId, to: r.inventoryItems.id }),
        stockLocation: r.one.stockLocations({ from: r.inventoryLevels.stockLocationId, to: r.stockLocations.id }),
      },
      reservations: {
        inventoryItem: r.one.inventoryItems({ from: r.reservations.inventoryItemId, to: r.inventoryItems.id }),
        stockLocation: r.one.stockLocations({ from: r.reservations.stockLocationId, to: r.stockLocations.id }),
      },
    }),
  )
}

export type Relations = ReturnType<typeof inventoryRelations>
```
> The `InventoryLevel.reservations` connection (a composite item+location match) is added in Task 11 with a verify+fallback — not here, to keep this part on confirmed single-column relations.

- [ ] **Step 2: Stage** — `git add packages/modules/inventory/src/database/relations.ts` (type-check runs once the service exists, Task 4).

---

## Task 4: `InventoryService` — items CRUD + events + module layer

**Files:** Create `services/events/inventory.ts`, `services/inventory.ts`, `services/index.ts`. Test: `services/inventory.integration.test.ts` (items part).

- [ ] **Step 1: `services/events/inventory.ts`** — clone `packages/modules/channel/src/services/events/channel.ts`, rename (`Channel`→`Inventory`, Tag id `'@czo/inventory/InventoryEvents'`, `PubSub.dropping({ capacity: 256 })`). Replace the event union:
```ts
export type InventoryEvent
  = | { readonly _tag: 'InventoryItemCreated', readonly id: number, readonly organizationId: number, readonly sku: string }
  | { readonly _tag: 'InventoryItemUpdated', readonly id: number, readonly organizationId: number, readonly changes: ReadonlyArray<string> }
  | { readonly _tag: 'InventoryItemDeleted', readonly id: number, readonly organizationId: number, readonly sku: string }
  | { readonly _tag: 'InventoryLevelChanged', readonly id: number, readonly organizationId: number, readonly inventoryItemId: number, readonly stockLocationId: number }
  | { readonly _tag: 'ReservationCreated', readonly id: number, readonly organizationId: number, readonly inventoryItemId: number, readonly quantity: number }
  | { readonly _tag: 'ReservationReleased', readonly id: number, readonly organizationId: number, readonly inventoryItemId: number, readonly quantity: number }
```

- [ ] **Step 2: `services/inventory.ts` — items only** — Start the file (cloning the structure of `packages/modules/channel/src/services/channel.ts`): `Database`/`Relations` types, `DrizzleDb`, `OptimisticLockError`/`optimisticUpdate` from `@czo/kit/db`, `and, eq, sql` from `drizzle-orm`, `Context, Data, Effect, Layer`. Define errors `InventoryItemNotFound` (code `INVENTORY_ITEM_NOT_FOUND`), `SkuTaken` (`{ sku }`, code `INVENTORY_SKU_TAKEN`), `InventoryDbFailed`. Input types `CreateItemInput { organizationId, sku, description?, requiresShipping?, metadata? }`, `UpdateItemInput { sku?, description?, requiresShipping?, metadata? }`. `export type InventoryItem = InferSelectModel<typeof inventoryItems>`. Service `InventoryService` (Tag id `'@czo/inventory/InventoryService'`) — declare ONLY the item methods now: `findItem` (findFirst, soft-delete-filtered → `InventoryItemNotFound`), `findItems` (findMany, soft-delete-filtered), `createItem` (sku pre-check → `SkuTaken`; single insert; publish `InventoryItemCreated`), `updateItem` (existence check + `optimisticUpdate`; publish `InventoryItemUpdated`), `softDeleteItem` (`optimisticUpdate` set `deletedAt: sql\`NOW()\` as any`; publish `InventoryItemDeleted`). Mirror channel's `make`/`dbErr`/`dbErrOptimistic`/`findFirst`-closure patterns (here `findItem` is the closure reused internally). `export const layer = Layer.effect(InventoryService, make)`. The level/reservation methods are added in Tasks 5-6.

- [ ] **Step 3: `services/index.ts`** — clone channel's: export `Inventory`, `InventoryEvents`, `InventoryModuleLive = Inventory.layer.pipe(Layer.provideMerge(InventoryEvents.layer))`.

- [ ] **Step 4: failing integration test (items)** — Create `services/inventory.integration.test.ts`. Use channel's integration-test layer pattern (`makePostgresTestLayer({ migrationsFolder, relations: inventoryRelations })` + `truncateTables` + `@effect/vitest` `layer(...)`). Import `inventoryRelations` (it needs `organizations` from `@czo/auth/schema` — import it for the relations call as channel's test does). First tests:
```ts
it.effect('createItem + findItem round-trips', () =>
  Effect.gen(function* () {
    yield* truncateInv
    const svc = yield* Inventory.InventoryService
    const item = yield* svc.createItem({ organizationId: 1, sku: 'SKU-1' })
    expect(item.sku).toBe('SKU-1')
    const found = yield* svc.findItem({ where: { id: item.id } })
    expect(found.id).toBe(item.id)
  }))

it.effect('createItem with a duplicate sku in the same org → SkuTaken', () =>
  Effect.gen(function* () {
    yield* truncateInv
    const svc = yield* Inventory.InventoryService
    yield* svc.createItem({ organizationId: 1, sku: 'DUP' })
    const err = yield* svc.createItem({ organizationId: 1, sku: 'DUP' }).pipe(Effect.flip)
    expect(err._tag).toBe('SkuTaken')
  }))
```
`truncateInv = truncateTables(reservations, inventoryLevels, inventoryItems)`.

- [ ] **Step 5: RED → GREEN** — `pnpm --filter @czo/inventory test src/services/inventory.integration.test.ts` (RED, then GREEN after Step 2-3). Add a soft-delete test (`softDeleteItem` then `findItem` → `InventoryItemNotFound`) and an optimistic-lock test (stale `updateItem` → `OptimisticLockError` name).

- [ ] **Step 6: quality gate + stage** — `pnpm --filter @czo/inventory check-types && pnpm --filter @czo/inventory lint --fix`. If the channel-cross-module augmentation gap appears (stock-location relations referencing `organizations`), confirm `relations.ts` already imports `@czo/auth/schema` (Task 3) — it does. `git add packages/modules/inventory/src/services/`.

---

## Task 5: Levels — createLevel (cross-org guard), setLevel, adjustStocked (atomic), deleteLevel

**Files:** Modify `services/inventory.ts`. Extend `inventory.integration.test.ts`.

- [ ] **Step 1: failing tests** — append (the test layer must now provide a `StockLocationService` — add a STUB like channel's: id→org map, e.g. ids 100/101→org 1, 200→org 2; compose `Layer.provide(StockLocationStub)` into `TestLayer`):
```ts
it.effect('createLevel links a same-org location; rejects cross-org', () =>
  Effect.gen(function* () {
    yield* truncateInv
    const svc = yield* Inventory.InventoryService
    const item = yield* svc.createItem({ organizationId: 1, sku: 'L1' })
    const lvl = yield* svc.createLevel(item.id, 100, { stocked: 10 })
    expect(lvl.stockedQuantity).toBe(10)
    const err = yield* svc.createLevel(item.id, 200, {}).pipe(Effect.flip) // org 2
    expect(err._tag).toBe('CrossOrgStockLocation')
  }))

it.effect('adjustStocked increments atomically; rejects below reserved', () =>
  Effect.gen(function* () {
    yield* truncateInv
    const svc = yield* Inventory.InventoryService
    const item = yield* svc.createItem({ organizationId: 1, sku: 'L2' })
    const lvl = yield* svc.createLevel(item.id, 100, { stocked: 5 })
    const up = yield* svc.adjustStocked(lvl.id, 3)
    expect(up.stockedQuantity).toBe(8)
    const err = yield* svc.adjustStocked(lvl.id, -100).pipe(Effect.flip) // below 0
    expect(err._tag).toBe('InsufficientStock')
  }))
```

- [ ] **Step 2: RED** — run → fail (`createLevel`/`adjustStocked` undefined).

- [ ] **Step 3: implement in `services/inventory.ts`** — add errors `InventoryLevelNotFound`, `LevelAlreadyExists` (`{ inventoryItemId, stockLocationId }`), `InsufficientStock`, `CrossOrgStockLocation` (`{ inventoryItemId, stockLocationId }`), `LevelHasReservations`. Add `InventoryLevel = InferSelectModel<typeof inventoryLevels>`. Import `inventoryLevels` from `../database/schema` and `StockLocationService` from `@czo/stock-location/services` (verify export shape — likely `import { StockLocation } from '@czo/stock-location/services'` then `StockLocation.StockLocationService`). In `make`, add `const stockLocations = yield* StockLocation.StockLocationService`. Implement:
```ts
    // ── Levels ────────────────────────────────────────────────────────────
    createLevel: (inventoryItemId, stockLocationId, input) =>
      Effect.gen(function* () {
        const item = yield* findItem({ where: { id: inventoryItemId } }) // InventoryItemNotFound
        // Cross-org guard: the stock location must be in the item's org.
        const sl = yield* stockLocations.findFirst({ where: { id: stockLocationId } }).pipe(
          Effect.catchTag('StockLocationNotFound', () => Effect.succeed(null)),
          Effect.mapError(cause => new InventoryDbFailed({ cause })),
        )
        if (!sl || sl.organizationId !== item.organizationId)
          return yield* Effect.fail(new CrossOrgStockLocation({ inventoryItemId, stockLocationId }))
        const existing = yield* dbErr(db.query.inventoryLevels.findFirst({
          columns: { id: true },
          where: { inventoryItemId, stockLocationId, deletedAt: { isNull: true } },
        }))
        if (existing)
          return yield* Effect.fail(new LevelAlreadyExists({ inventoryItemId, stockLocationId }))
        const [created] = yield* dbErr(db.insert(inventoryLevels).values({
          organizationId: item.organizationId,
          inventoryItemId,
          stockLocationId,
          stockedQuantity: input.stocked ?? 0,
          incomingQuantity: input.incoming ?? 0,
        }).returning())
        yield* publish({ _tag: 'InventoryLevelChanged', id: created!.id, organizationId: item.organizationId, inventoryItemId, stockLocationId })
        return created!
      }),

    setLevel: (levelId, expectedVersion, input) =>
      Effect.gen(function* () {
        const lvl = yield* findLevel({ where: { id: levelId } }) // InventoryLevelNotFound
        const updated = yield* dbErrOptimistic(
          optimisticUpdate({ db, table: inventoryLevels, id: levelId, expectedVersion, values: {
            ...(input.stocked != null ? { stockedQuantity: input.stocked } : {}),
            ...(input.incoming != null ? { incomingQuantity: input.incoming } : {}),
          } }),
        ).pipe(Effect.catchTag('InventoryDbFailed', e =>
          // A CHECK violation (reserved <= stocked) surfaces as a DB error → InsufficientStock.
          isCheckViolation(e.cause) ? Effect.fail(new InsufficientStock()) : Effect.fail(e)))
        yield* publish({ _tag: 'InventoryLevelChanged', id: levelId, organizationId: lvl.organizationId, inventoryItemId: lvl.inventoryItemId, stockLocationId: lvl.stockLocationId })
        return updated
      }),

    adjustStocked: (levelId, delta) =>
      Effect.gen(function* () {
        // Atomic: increment guarded by the CHECK invariants — no read-modify-write.
        const [row] = yield* dbErr(db.update(inventoryLevels)
          .set({ stockedQuantity: sql`${inventoryLevels.stockedQuantity} + ${delta}`, version: sql`${inventoryLevels.version} + 1`, updatedAt: sql`NOW()` })
          .where(and(
            eq(inventoryLevels.id, levelId),
            sql`${inventoryLevels.deletedAt} IS NULL`,
            sql`${inventoryLevels.stockedQuantity} + ${delta} >= ${inventoryLevels.reservedQuantity}`,
            sql`${inventoryLevels.stockedQuantity} + ${delta} >= 0`,
          ))
          .returning())
        if (row)
          return row
        // 0 rows: not found vs guard failure.
        const exists = yield* dbErr(db.query.inventoryLevels.findFirst({ columns: { id: true }, where: { id: levelId, deletedAt: { isNull: true } } }))
        return yield* Effect.fail(exists ? new InsufficientStock() : new InventoryLevelNotFound())
      }),

    deleteLevel: (levelId) =>
      Effect.gen(function* () {
        const lvl = yield* findLevel({ where: { id: levelId } })
        if (lvl.reservedQuantity > 0)
          return yield* Effect.fail(new LevelHasReservations())
        yield* dbErr(db.update(inventoryLevels).set({ deletedAt: sql`NOW()` }).where(eq(inventoryLevels.id, levelId)))
        yield* publish({ _tag: 'InventoryLevelChanged', id: levelId, organizationId: lvl.organizationId, inventoryItemId: lvl.inventoryItemId, stockLocationId: lvl.stockLocationId })
        return { ...lvl, deletedAt: new Date() }
      }),
```
Add a `findLevel` closure (soft-delete-filtered, → `InventoryLevelNotFound`) next to `findItem`. Add a small helper `isCheckViolation(cause)` that detects a Postgres CHECK-constraint error (`(cause as any)?.code === '23514'` — the PG check_violation SQLSTATE; the `@effect/sql-pg` error wraps the pg error — inspect the actual error shape in a quick scratch run if unsure and match). Declare the new methods on the Service interface with their error unions.

- [ ] **Step 4: GREEN** — run → all green. Add a `LevelAlreadyExists` test and a `deleteLevel`-blocked-by-reservations test (after Task 6 reservations exist, OR a direct level with reservedQuantity>0 via a raw update in the test).

- [ ] **Step 5: gate + stage** — `pnpm --filter @czo/inventory check-types && pnpm --filter @czo/inventory lint --fix`; `git add packages/modules/inventory/src/services/`.

---

## Task 6: Reservations — atomic reserve/update/release + the concurrency test

**Files:** Modify `services/inventory.ts`. Extend `inventory.integration.test.ts`.

- [ ] **Step 1: failing tests (incl. concurrency)**
```ts
it.effect('createReservation reserves; over-reserve → InsufficientInventory', () =>
  Effect.gen(function* () {
    yield* truncateInv
    const svc = yield* Inventory.InventoryService
    const item = yield* svc.createItem({ organizationId: 1, sku: 'R1' })
    const lvl = yield* svc.createLevel(item.id, 100, { stocked: 10 })
    const res = yield* svc.createReservation({ inventoryItemId: item.id, stockLocationId: 100, quantity: 4 })
    expect(res.quantity).toBe(4)
    const after = yield* svc.findLevelById(lvl.id)
    expect(after.reservedQuantity).toBe(4)
    const err = yield* svc.createReservation({ inventoryItemId: item.id, stockLocationId: 100, quantity: 7 }).pipe(Effect.flip) // 4+7 > 10
    expect(err._tag).toBe('InsufficientInventory')
  }))

it.effect('deleteReservation releases the reserved quantity', () =>
  Effect.gen(function* () {
    yield* truncateInv
    const svc = yield* Inventory.InventoryService
    const item = yield* svc.createItem({ organizationId: 1, sku: 'R2' })
    const lvl = yield* svc.createLevel(item.id, 100, { stocked: 10 })
    const res = yield* svc.createReservation({ inventoryItemId: item.id, stockLocationId: 100, quantity: 6 })
    yield* svc.deleteReservation(res.id)
    const after = yield* svc.findLevelById(lvl.id)
    expect(after.reservedQuantity).toBe(0)
  }))

it.effect('concurrent reservations cannot over-reserve (atomic guard)', () =>
  Effect.gen(function* () {
    yield* truncateInv
    const svc = yield* Inventory.InventoryService
    const item = yield* svc.createItem({ organizationId: 1, sku: 'R3' })
    yield* svc.createLevel(item.id, 100, { stocked: 10 })
    // Two parallel reservations of 6 each; only one can succeed (6+6 > 10).
    const results = yield* Effect.all([
      svc.createReservation({ inventoryItemId: item.id, stockLocationId: 100, quantity: 6 }).pipe(Effect.either),
      svc.createReservation({ inventoryItemId: item.id, stockLocationId: 100, quantity: 6 }).pipe(Effect.either),
    ], { concurrency: 'unbounded' })
    const oks = results.filter(r => r._tag === 'Right').length
    const fails = results.filter(r => r._tag === 'Left').length
    expect(oks).toBe(1)
    expect(fails).toBe(1)
  }))
```
Add a `findLevelById(id)` service method (returns the level or `InventoryLevelNotFound`) if not already present — OR have the test read the level via `db.query` directly. (Prefer adding `findLevelById` to the service for clean test reads.)

- [ ] **Step 2: RED** — run → fail.

- [ ] **Step 3: implement** — add errors `InsufficientInventory`, `ReservationNotFound`. Add `Reservation = InferSelectModel<typeof reservations>`. Import `reservations` from `../database/schema`. Implement:
```ts
    createReservation: (input) =>
      Effect.gen(function* () {
        const lvl = yield* findLevel({ where: { inventoryItemId: input.inventoryItemId, stockLocationId: input.stockLocationId } }) // InventoryLevelNotFound
        return yield* dbErr(db.transaction(tx => Effect.gen(function* () {
          // Atomic guard: only reserve if available (stocked - reserved) >= qty.
          const [bumped] = yield* tx.update(inventoryLevels)
            .set({ reservedQuantity: sql`${inventoryLevels.reservedQuantity} + ${input.quantity}`, updatedAt: sql`NOW()` })
            .where(and(
              eq(inventoryLevels.id, lvl.id),
              sql`${inventoryLevels.stockedQuantity} - ${inventoryLevels.reservedQuantity} >= ${input.quantity}`,
            ))
            .returning({ id: inventoryLevels.id })
          if (!bumped)
            return yield* Effect.fail(new InsufficientInventory())
          const [res] = yield* tx.insert(reservations).values({
            organizationId: lvl.organizationId,
            inventoryItemId: input.inventoryItemId,
            stockLocationId: input.stockLocationId,
            quantity: input.quantity,
            lineItemId: input.lineItemId ?? null,
            description: input.description ?? null,
            createdBy: input.createdBy ?? null,
            metadata: input.metadata ?? null,
          }).returning()
          return res!
        }))).pipe(Effect.tap(res => publish({ _tag: 'ReservationCreated', id: res.id, organizationId: res.organizationId, inventoryItemId: res.inventoryItemId, quantity: res.quantity })))
      }),

    deleteReservation: (id) =>
      Effect.gen(function* () {
        return yield* dbErr(db.transaction(tx => Effect.gen(function* () {
          const res = yield* tx.query.reservations.findFirst({ where: { id, deletedAt: { isNull: true } } })
          if (!res)
            return yield* Effect.fail(new ReservationNotFound())
          yield* tx.update(inventoryLevels)
            .set({ reservedQuantity: sql`${inventoryLevels.reservedQuantity} - ${res.quantity}`, updatedAt: sql`NOW()` })
            .where(and(eq(inventoryLevels.inventoryItemId, res.inventoryItemId), eq(inventoryLevels.stockLocationId, res.stockLocationId), sql`${inventoryLevels.deletedAt} IS NULL`))
          yield* tx.update(reservations).set({ deletedAt: sql`NOW()` }).where(eq(reservations.id, id))
          return res
        }))).pipe(Effect.tap(res => publish({ _tag: 'ReservationReleased', id: res.id, organizationId: res.organizationId, inventoryItemId: res.inventoryItemId, quantity: res.quantity })))
      }),

    updateReservation: (id, input) =>
      Effect.gen(function* () {
        return yield* dbErr(db.transaction(tx => Effect.gen(function* () {
          const res = yield* tx.query.reservations.findFirst({ where: { id, deletedAt: { isNull: true } } })
          if (!res)
            return yield* Effect.fail(new ReservationNotFound())
          if (input.quantity != null && input.quantity !== res.quantity) {
            const delta = input.quantity - res.quantity
            const [bumped] = yield* tx.update(inventoryLevels)
              .set({ reservedQuantity: sql`${inventoryLevels.reservedQuantity} + ${delta}`, updatedAt: sql`NOW()` })
              .where(and(
                eq(inventoryLevels.inventoryItemId, res.inventoryItemId),
                eq(inventoryLevels.stockLocationId, res.stockLocationId),
                sql`${inventoryLevels.deletedAt} IS NULL`,
                // Positive delta must fit available; negative always allowed.
                sql`${inventoryLevels.stockedQuantity} - ${inventoryLevels.reservedQuantity} >= ${delta}`,
              ))
              .returning({ id: inventoryLevels.id })
            if (!bumped)
              return yield* Effect.fail(new InsufficientInventory())
          }
          const [updated] = yield* tx.update(reservations).set({
            ...(input.quantity != null ? { quantity: input.quantity } : {}),
            ...(input.lineItemId !== undefined ? { lineItemId: input.lineItemId } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
            updatedAt: sql`NOW()`,
          }).where(eq(reservations.id, id)).returning()
          return updated!
        })))
      }),
```
Add `findLevelById(id)` (find by id, soft-delete-filtered, → `InventoryLevelNotFound`) and declare all reservation methods + input types (`CreateReservationInput`, `UpdateReservationInput`) on the interface.

- [ ] **Step 4: GREEN** — run → all green, including the concurrency test (Testcontainers Postgres gives real row-level locking; the atomic `WHERE` makes exactly one of the two parallel reserves win).

- [ ] **Step 5: gate + stage** — `pnpm --filter @czo/inventory check-types && pnpm --filter @czo/inventory lint --fix`; `git add packages/modules/inventory/src/services/`.

---

## Task 7: GraphQL scaffolding (builder, types, errors, inputs, queries, authz)

**Files:** Create `graphql/index.ts`, `graphql/schema/index.ts`, `graphql/schema/inventory/{types,errors,inputs,queries,authz}.ts`. Mutations + connections are Tasks 8-11.

- [ ] **Step 1: `graphql/index.ts`** — clone channel's, rename. Import `@czo/auth/graphql` + `@czo/stock-location/graphql`. `BuilderSchemaObjects` declares `InventoryItem`, `InventoryLevel`, `Reservation` (import the three model types from `../services/inventory`). `InventoryItemWhereInput` (`sku?`, `organizationId?`, `requiresShipping?`, `createdAt?` + AND/OR/NOT) + `InventoryItemOrderByInput: OrderByInput<'sku' | 'createdAt'>`. Comment out `export { inventoryNodeGuards } from './node-guards'` (Task 12 uncomments). Export `registerInventorySchema`, `InventoryBuilder`, `InventoryGraphQLSchemaBuilder`.

- [ ] **Step 2: `graphql/schema/inventory/authz.ts`** — clone channel's, but provide THREE org-loaders (each soft-delete-filtered, catch NotFound→null): `loadItemOrganizationId(ctx, id)` (via `InventoryService.findItem`), `loadLevelOrganizationId(ctx, id)` (via `findLevelById`), `loadReservationOrganizationId(ctx, id)` (via a `findReservationById` — add it to the service if absent, soft-delete-filtered). Each returns `row?.organizationId ?? null`.

- [ ] **Step 3: `graphql/schema/inventory/errors.ts`** — clone, register every tagged error: `InventoryItemNotFound`→`InventoryItemNotFoundError`, `SkuTaken`→`SkuTakenError` (`sku` field), `InventoryLevelNotFound`→`InventoryLevelNotFoundError`, `LevelAlreadyExists`→`LevelAlreadyExistsError` (`inventoryItemId`,`stockLocationId`), `InsufficientStock`→`InsufficientStockError`, `InsufficientInventory`→`InsufficientInventoryError`, `CrossOrgStockLocation`→`CrossOrgStockLocationError` (`inventoryItemId`,`stockLocationId`), `ReservationNotFound`→`ReservationNotFoundError`, `LevelHasReservations`→`LevelHasReservationsError`.

- [ ] **Step 4: `graphql/schema/inventory/inputs.ts`** — clone channel's: `InventoryItemWhereInput` (`sku`/`organizationId`/`requiresShipping`/`createdAt` + AND/OR/NOT), `InventoryItemOrderField` (SKU/CREATED_AT), `InventoryItemOrderDirection`, `InventoryItemOrderByInput`.

- [ ] **Step 5: `graphql/schema/inventory/types.ts`** — define the three drizzleNodes (all `select: true`):
  - `InventoryItem` (`inventoryItems`): `sku`, `description?`, `requiresShipping`, `metadata`, `createdAt`/`updatedAt`/`version`, `organization: t.relation('organization')`. Placeholder comment `// levels + reservations connections — Task 11`.
  - `InventoryLevel` (`inventoryLevels`): `stockedQuantity`(exposeInt), `reservedQuantity`(exposeInt), `incomingQuantity`(exposeInt), **`availableQuantity: t.int({ resolve: l => l.stockedQuantity - l.reservedQuantity })`**, `version`, `stockLocation: t.relation('stockLocation')`, `inventoryItem: t.relation('inventoryItem')`. Placeholder `// reservations connection — Task 11`.
  - `Reservation` (`reservations`): `quantity`(exposeInt), `lineItemId: t.exposeString('lineItemId', { nullable: true })`, `description?`, `createdBy: t.exposeInt('createdBy', { nullable: true })`, `metadata`, `createdAt`, `inventoryItem: t.relation('inventoryItem')`, `stockLocation: t.relation('stockLocation')`.

- [ ] **Step 6: `graphql/schema/inventory/queries.ts`** — clone channel's queries: `inventoryItem(id: globalID<InventoryItem>)` (nullable, authz via `loadItemOrganizationId`, resolve via `findItem`, catch NotFound→null, resource `'inventory'`) and `inventoryItems(organizationId: globalID<Organization>, search over sku, where, orderBy)` (org-scoped connection, `inventory:read`).

- [ ] **Step 7: `graphql/schema/index.ts`** — clone, rename: `registerInventorySchema` calls types→errors→inputs→queries→mutations. Use a TEMPORARY no-op `registerInventoryMutations` stub in `graphql/schema/inventory/mutations/index.ts` (Tasks 8-10 fill the entity files; create the `mutations/` dir + an `index.ts` barrel that re-exports `registerInventoryMutations` calling the three entity registrars — stub them as no-ops now, fill in Tasks 8-10).

- [ ] **Step 8: gate + stage** — `pnpm --filter @czo/inventory check-types` (clean with stubs) `&& lint --fix`; `git add packages/modules/inventory/src/graphql/`.

---

## Task 8: Item mutations

**Files:** Create `graphql/schema/inventory/mutations/item.ts`.

- [ ] **Step 1: write `item.ts`** — clone channel's CRUD mutations (`createChannel`/`updateChannel`/`deleteChannel`) → `createInventoryItem`/`updateInventoryItem`/`deleteInventoryItem`. `export function registerInventoryItemMutations(builder)`. create inputFields: `organizationId: globalID<Organization>`, `sku: t.string({ required: true, validate: z.string().min(1).max(255).transform(v => v.trim()) })`, `description: t.string()`, `requiresShipping: t.boolean()`, `metadata: JSONObject`. errors `[ValidationError, SkuTaken]`, authScope `inventory:create` (input org). resolve → `svc.createItem({...})`. update: `id: globalID<InventoryItem>`, `version`, `sku?`, `description?`, `requiresShipping?`, `metadata?` → `svc.updateItem`, authz via `loadItemOrganizationId` → `inventory:update`, errors `[ValidationError, InventoryItemNotFound, OptimisticLockError]`. delete: `id`+`version` → `svc.softDeleteItem`, `inventory:delete`. Output `inventoryItem: t.field({ type: 'InventoryItem', resolve: p => p.item })`.

- [ ] **Step 2: wire into the mutations barrel** — `graphql/schema/inventory/mutations/index.ts` calls `registerInventoryItemMutations(builder)` (replace its item stub).

- [ ] **Step 3: gate + stage** — `pnpm --filter @czo/inventory check-types && lint --fix`; `git add packages/modules/inventory/src/graphql/schema/inventory/mutations/`.

---

## Task 9: Level mutations (incl. atomic adjust)

**Files:** Create `graphql/schema/inventory/mutations/level.ts`.

- [ ] **Step 1: write `level.ts`** — `export function registerInventoryLevelMutations(builder)` with:
  - `createInventoryLevel`: inputFields `inventoryItemId: globalID<InventoryItem>`, `stockLocationId: globalID<StockLocation>`, `stockedQuantity: t.int()`, `incomingQuantity: t.int()`. authScope `inventory:update` in the item's org (via `loadItemOrganizationId(ctx, Number(input.inventoryItemId.id))`). errors `[InventoryItemNotFound, CrossOrgStockLocation, LevelAlreadyExists]`. resolve → `svc.createLevel(Number(input.inventoryItemId.id), Number(input.stockLocationId.id), { stocked: input.stockedQuantity ?? undefined, incoming: input.incomingQuantity ?? undefined })`.
  - `setInventoryLevel`: `id: globalID<InventoryLevel>`, `version: int`, `stockedQuantity: t.int()`, `incomingQuantity: t.int()`. authScope `inventory:update` via `loadLevelOrganizationId`. errors `[InventoryLevelNotFound, OptimisticLockError, InsufficientStock]`. resolve → `svc.setLevel(Number(id), version, { stocked, incoming })`.
  - `adjustInventoryStock`: `id: globalID<InventoryLevel>`, `delta: t.int({ required: true })`. authScope `inventory:update` via `loadLevelOrganizationId`. errors `[InventoryLevelNotFound, InsufficientStock]`. resolve → `svc.adjustStocked(Number(id), input.delta)`.
  - `deleteInventoryLevel`: `id: globalID<InventoryLevel>`. authScope `inventory:delete` via `loadLevelOrganizationId`. errors `[InventoryLevelNotFound, LevelHasReservations]`. resolve → `svc.deleteLevel(Number(id))`.
  - Output `inventoryLevel: t.field({ type: 'InventoryLevel', resolve: p => p.level })`.

- [ ] **Step 2: barrel + gate + stage** — wire `registerInventoryLevelMutations` into the barrel; `pnpm --filter @czo/inventory check-types && lint --fix`; `git add .../mutations/`.

---

## Task 10: Reservation mutations

**Files:** Create `graphql/schema/inventory/mutations/reservation.ts`.

- [ ] **Step 1: write `reservation.ts`** — `export function registerReservationMutations(builder)` with:
  - `createReservation`: inputFields `inventoryItemId: globalID<InventoryItem>`, `stockLocationId: globalID<StockLocation>`, `quantity: t.int({ required: true })`, `lineItemId: t.string()`, `description: t.string()`, `metadata: JSONObject`. authScope `inventory:update` in the item's org (`loadItemOrganizationId`). errors `[InventoryLevelNotFound, InsufficientInventory]`. resolve → `svc.createReservation({ inventoryItemId: Number(input.inventoryItemId.id), stockLocationId: Number(input.stockLocationId.id), quantity: input.quantity, lineItemId: input.lineItemId ?? undefined, description: input.description ?? undefined, createdBy: Number(ctx.auth?.user?.id) || undefined, metadata: input.metadata })`. (Read `createdBy` from the session via `ctx.auth` — confirm the field path against auth's context; pass undefined if absent.)
  - `updateReservation`: `id: globalID<Reservation>`, `quantity: t.int()`, `lineItemId: t.string()`, `description: t.string()`, `metadata: JSONObject`. authScope `inventory:update` via `loadReservationOrganizationId`. errors `[ReservationNotFound, InsufficientInventory]`. resolve → `svc.updateReservation(Number(id), {...})`.
  - `deleteReservation` (release): `id: globalID<Reservation>`. authScope `inventory:update` via `loadReservationOrganizationId`. errors `[ReservationNotFound]`. resolve → `svc.deleteReservation(Number(id))`.
  - Output `reservation: t.field({ type: 'Reservation', resolve: p => p.reservation })`.

- [ ] **Step 2: barrel + gate + stage** — wire `registerReservationMutations`; `check-types && lint --fix`; `git add .../mutations/`.

---

## Task 11: Relay connections (item→levels/reservations, level→reservations)

**Files:** Modify `graphql/schema/inventory/types.ts` (+ maybe `relations.ts`).

- [ ] **Step 1: item connections (always work — single-column 1:N)** — on the `InventoryItem` node, replace the placeholder with:
```ts
      levels: t.relatedConnection('levels', {
        type: 'inventoryLevels',
        authScopes: parent => ({ permission: { resource: 'inventory', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
      reservations: t.relatedConnection('reservations', {
        type: 'reservations',
        authScopes: parent => ({ permission: { resource: 'inventory', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
```

- [ ] **Step 2: level→reservations (composite — verify+fallback)** — PRIMARY: add a composite relation in `relations.ts` on `inventoryLevels`:
```ts
        reservations: r.many.reservations({
          from: [r.inventoryLevels.inventoryItemId, r.inventoryLevels.stockLocationId],
          to: [r.reservations.inventoryItemId, r.reservations.stockLocationId],
        }),
```
and on the `InventoryLevel` node:
```ts
      reservations: t.relatedConnection('reservations', {
        type: 'reservations',
        authScopes: parent => ({ permission: { resource: 'inventory', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
```
Run `pnpm --filter @czo/inventory check-types`. If the array `from`/`to` composite relation is NOT supported by this drizzle version (type error), FALLBACK: remove the level→reservations relation + connection; the `InventoryItem.reservations` connection (Step 1) covers reservation listing. Document which path was taken in a comment.

- [ ] **Step 3: gate + stage** — `check-types && lint --fix`; `git add packages/modules/inventory/src/graphql/schema/inventory/types.ts packages/modules/inventory/src/database/relations.ts`.

> As in channel, these connections resolve on the query/node path; selecting them inside a mutation payload is unsupported (POJO parent) and fails closed — mutations return the affected entity scalars; clients re-query via `inventoryItem(id:)`. Add the same one-line comment near the mutations.

---

## Task 12: node-guards + module definition + app wiring

**Files:** Create `graphql/node-guards.ts`, `src/index.ts`. Modify `apps/life/src/modules.ts`, `apps/life/package.json`.

- [ ] **Step 1: `graphql/node-guards.ts`**
```ts
import type { NodeGuard } from '@czo/kit/graphql'

const inventoryReadGuard: NodeGuard = (row: { organizationId: number }) => ({
  permission: { resource: 'inventory', actions: ['read'], organization: row.organizationId },
})

export const inventoryNodeGuards: Record<string, NodeGuard> = {
  InventoryItem: inventoryReadGuard,
  InventoryLevel: inventoryReadGuard,
  Reservation: inventoryReadGuard,
}
```
Uncomment the `inventoryNodeGuards` export in `graphql/index.ts`.

- [ ] **Step 2: `src/index.ts`** — clone channel's, rename; access domain:
```ts
const INVENTORY_STATEMENTS = { inventory: ['create', 'read', 'update', 'delete'] } as const
const INVENTORY_HIERARCHY: Access.HierarchyLevel<typeof INVENTORY_STATEMENTS>[] = [
  { name: 'inventory:viewer', permissions: { inventory: ['read'] } },
  { name: 'inventory:manager', permissions: { inventory: ['create', 'update'] } },
  { name: 'inventory:admin', permissions: { inventory: ['delete'] } },
]
```
`defineModule(() => ({ name: 'inventory', version: '0.0.1', layer: InventoryModuleLive as unknown as Layer..., db: { schema: inventorySchema, relations: inventoryRelations }, graphql: { contribution: builder => registerInventorySchema(builder as never), nodeGuards: inventoryNodeGuards }, onStart: register the 'inventory' domain }))`. Imports from `@czo/inventory/{graphql,relations,schema,services}` + `Access` from `@czo/auth/services`. Doc comment notes the auth + stock-location dependency.

- [ ] **Step 3: app manifest** — `apps/life/src/modules.ts`: `import inventoryModule from '@czo/inventory'`, append `inventoryModule` after `channelModule` → `[authModule, attributeModule, stockLocationModule, channelModule, inventoryModule]`. `apps/life/package.json`: add `"@czo/inventory": "workspace:*"`. `pnpm install`.

- [ ] **Step 4: type-check module + app** — `pnpm --filter @czo/inventory check-types && pnpm --filter @czo/life check-types` → both clean (confirms the `StockLocationService` requirement resolves in the app fold). `lint --fix`; `git add packages/modules/inventory/src/index.ts packages/modules/inventory/src/graphql/node-guards.ts packages/modules/inventory/src/graphql/index.ts apps/life/src/modules.ts apps/life/package.json pnpm-lock.yaml`.

---

## Task 13: E2E harness

**Files:** Create `e2e/harness.ts`.

- [ ] **Step 1: clone channel's harness** — copy `packages/modules/channel/src/e2e/harness.ts` → inventory; rename `ChannelHarness`→`InventoryHarness`, `bootChannelApp`→`bootInventoryApp`; boot `[authModule, stockLocationModule, inventoryModule]` with `[AUTH_MIGRATIONS, SL_MIGRATIONS, INVENTORY_MIGRATIONS]` (SL_MIGRATIONS resolves `../../../stock-location/migrations`, INVENTORY_MIGRATIONS `../../migrations`). Keep `signUp` (per-actor IP), `createOrganization`, `setMemberRole`, `gql`, `close`.

- [ ] **Step 2: gate + stage** — `pnpm --filter @czo/inventory check-types`; `git add packages/modules/inventory/src/e2e/harness.ts`.

---

## Task 14: E2E test

**Files:** Create `e2e/inventory.e2e.test.ts`.

- [ ] **Step 1: write the E2E** (mirror channel's e2e structure). `FULL_ROLE = 'org:owner,inventory:viewer,inventory:manager,inventory:admin,stock-loc:viewer,stock-loc:manager,stock-loc:admin'`. Op constants (verify generated union/input names like channel did — `Create<Name>Success { data { ... } }`, `Create<Name>Input`). Cases:
  1. create item → read back via `inventoryItem(id)`.
  2. denies `createInventoryItem` without `inventory:create`.
  3. denies cross-org read of an item.
  4. create a stock location (via the booted stock-location mutations, same org) → `createInventoryLevel` → read item with `levels { edges { node { stockedQuantity availableQuantity } } }` via `inventoryItem(id)`.
  5. `adjustInventoryStock(+/-)` → `availableQuantity` reflects it; over-decrement → `InsufficientStockError` (typed error in `data.<field>.__typename`, not top-level errors).
  6. `createReservation(quantity)` → the level's `reservedQuantity` up, `availableQuantity` down (read via query); over-reserve → `InsufficientInventoryError`.
  7. `deleteReservation` → `reservedQuantity` back down.
  8. `deleteInventoryLevel` blocked while a reservation exists → `LevelHasReservationsError`; succeeds after release.
  9. node-guard: `node(id:)` on an InventoryItem — member ok, non-member denied (null).
  10. cross-org: `createInventoryLevel` with a stock location from a SECOND org → `CrossOrgStockLocationError`.
  Use the connection-via-query pattern for reading levels/reservations (NOT in mutation payloads, per the documented boundary). Assert typed errors via the payload `__typename`/error-field, not top-level `errors`.

- [ ] **Step 2: run + debug** — `pnpm --filter @czo/inventory test src/e2e/inventory.e2e.test.ts` → all green. This is where the combined `[auth, stock-location, inventory]` schema, the cross-module `StockLocationService`, the migration CHECK/partial-unique, and the computed `availableQuantity` are proven at runtime. Debug real failures here (schema-build, migration format, atomic-op behavior) — do NOT weaken assertions; report real bugs in prior tasks.

- [ ] **Step 3: full module + stage** — `pnpm --filter @czo/inventory test` (integration incl. concurrency + E2E green); `git add packages/modules/inventory/src/e2e/inventory.e2e.test.ts`.

---

## Task 15: Full verification + single commit

- [ ] **Step 1: verification**
```bash
pnpm --filter @czo/inventory check-types && pnpm --filter @czo/inventory lint && pnpm --filter @czo/inventory test
pnpm --filter @czo/stock-location check-types && pnpm --filter @czo/auth check-types && pnpm --filter @czo/life check-types
```
All green; no regressions. Remove any `scratchpad/` debug files created during Task 5's `isCheckViolation` shape-check.

- [ ] **Step 2: stage + review** — `git add -A` (ensure no stray scratchpad/debug files); `git status && git diff --cached --stat`.

- [ ] **Step 3: single commit (ONLY after the user reviews)**
```bash
git commit -m "feat(inventory): @czo/inventory module — items, per-location levels, reservations

New Effect-native module: org-scoped inventory_items + per-stock-location
inventory_levels (stocked/reserved/incoming, available computed) + reservations,
all soft-delete. Quantity writes are atomic SQL (adjustStocked guarded by the
CHECK invariants; reserve/release guarded by stocked-reserved>=qty in one tx) —
concurrency-safe, no read-modify-write. Cross-org guard validates a level/
reservation's stock location is in the item's org via StockLocationService.
GraphQL: InventoryItem/InventoryLevel/Reservation nodes (+ availableQuantity,
levels/reservations connections), ~12 mutations split by entity, inventory:*
access domain, 3 node-guards. Wired into apps/life after stock-location.
Integration (incl. a concurrent-reservation race test) + E2E
bootTestApp([auth, stock-location, inventory])."
```

- [ ] **Step 4: push + PR** — `git push -u origin feat/inventory-module`; `gh pr create --base main --title "feat(inventory): @czo/inventory module (items + levels + reservations)" --body "<summary per the spec>"`.

---

## Self-Review

**Spec coverage:** 3 tables + CHECK + partial unique + soft-delete → Task 2; relations → Tasks 3, 11; items CRUD → Task 4; levels (createLevel cross-org guard, setLevel, atomic adjustStocked, soft deleteLevel) → Task 5; reservations (atomic create/update/release) + concurrency → Task 6; GraphQL scaffold + computed availableQuantity → Task 7; mutations split item/level/reservation → Tasks 8-10; connections → Task 11; node-guards (3) + access domain + module + manifest → Task 12; harness/E2E → Tasks 13-14; verify/commit → Task 15. Out-of-scope (products, order lifecycle, top-level level/reservation queries) not built. Covered.

**Placeholder scan:** Clone tasks reference a concrete template file + rename + explicit field lists. The two genuine unknowns (composite level→reservations relation in Task 11; the PG check-violation SQLSTATE shape for `isCheckViolation` in Task 5) have verify+fallback / inspect-and-match instructions, not TODOs. Novel-logic code (schema constraints, the 3 atomic methods, the concurrency test, availableQuantity) is fully written.

**Type consistency:** Service methods — items (`findItem/findItems/createItem/updateItem/softDeleteItem`, Task 4), levels (`createLevel/setLevel/adjustStocked/deleteLevel/findLevelById`, Task 5), reservations (`createReservation/updateReservation/deleteReservation`, Task 6) — match their GraphQL resolvers (Tasks 8-10) and the authz loaders (`loadItem/Level/ReservationOrganizationId`, Task 7). Errors defined Tasks 4-6, registered Task 7, used in mutation unions Tasks 8-10. Tables `inventoryItems/inventoryLevels/reservations` (Task 2) ↔ relations (Task 3) ↔ service usage consistent. Resource string `'inventory'` + `inventory:*` roles consistent across authz/mutations/node-guard/hierarchy.
