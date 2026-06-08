import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { organizations } from '@czo/auth/schema'
import { makePostgresTestLayer, truncateTables } from '@czo/kit/testing'
import { stockLocations } from '@czo/stock-location/schema'
import * as StockLocationMod from '@czo/stock-location/services'
import { expect, layer } from '@effect/vitest'
import { Effect, Exit, Layer } from 'effect'
import { inventoryRelations } from '../database/relations'
import { inventoryItems, inventoryLevels, reservations } from '../database/schema'
import * as InventoryEvents from './events/inventory'
import * as Inventory from './inventory'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')
const InventoryPostgresLayer = makePostgresTestLayer({
  migrationsFolder: MIGRATIONS,
  relations: inventoryRelations({ inventoryItems, inventoryLevels, reservations, stockLocations, organizations }),
})
const truncateInv = truncateTables(reservations, inventoryLevels, inventoryItems)

// Stub: stock-location id 200 → org 2 (cross-org); id 100/101 → org 1 (same org).
const StockLocationStub = Layer.succeed(StockLocationMod.StockLocation.StockLocationService, {
  findFirst: (config: any) => {
    const id = config?.where?.id as number
    return Effect.succeed({ id, organizationId: id === 200 ? 2 : 1 } as any)
  },
} as any)

const TestLayer = Inventory.layer.pipe(
  Layer.provide(InventoryEvents.layer),
  Layer.provide(StockLocationStub),
  Layer.provideMerge(InventoryPostgresLayer),
)

layer(TestLayer, { timeout: 120_000 })('InventoryService', (it) => {
  it.effect('createItem + findItem round-trips', () =>
    Effect.gen(function* () {
      yield* truncateInv
      const svc = yield* Inventory.InventoryService
      const item = yield* svc.createItem({ organizationId: 1, sku: 'SKU-1' })
      expect(item.sku).toBe('SKU-1')
      const found = yield* svc.findItem({ where: { id: item.id } })
      expect(found.id).toBe(item.id)
    }))

  it.effect('duplicate sku in same org → SkuTaken', () =>
    Effect.gen(function* () {
      yield* truncateInv
      const svc = yield* Inventory.InventoryService
      yield* svc.createItem({ organizationId: 1, sku: 'DUP' })
      const err = yield* svc.createItem({ organizationId: 1, sku: 'DUP' }).pipe(Effect.flip)
      expect(err._tag).toBe('SkuTaken')
    }))

  it.effect('softDeleteItem then findItem → InventoryItemNotFound', () =>
    Effect.gen(function* () {
      yield* truncateInv
      const svc = yield* Inventory.InventoryService
      const item = yield* svc.createItem({ organizationId: 1, sku: 'DEL' })
      yield* svc.softDeleteItem(item.id, item.version)
      const err = yield* svc.findItem({ where: { id: item.id } }).pipe(Effect.flip)
      expect(err._tag).toBe('InventoryItemNotFound')
    }))

  it.effect('updateItem rejects a stale version', () =>
    Effect.gen(function* () {
      yield* truncateInv
      const svc = yield* Inventory.InventoryService
      const item = yield* svc.createItem({ organizationId: 1, sku: 'UPD' })
      yield* svc.updateItem(item.id, item.version, { description: 'x' })
      const err = yield* svc.updateItem(item.id, item.version, { description: 'y' }).pipe(Effect.flip)
      expect(err.name).toBe('OptimisticLockError')
    }))

  it.effect('createLevel links same-org; rejects cross-org', () =>
    Effect.gen(function* () {
      yield* truncateInv
      const svc = yield* Inventory.InventoryService
      const item = yield* svc.createItem({ organizationId: 1, sku: 'L1' })
      const lvl = yield* svc.createLevel(item.id, 100, { stocked: 10 })
      expect(lvl.stockedQuantity).toBe(10)
      const err = yield* svc.createLevel(item.id, 200, {}).pipe(Effect.flip)
      expect(err._tag).toBe('CrossOrgStockLocation')
    }))

  it.effect('createLevel duplicate (item,loc) → LevelAlreadyExists', () =>
    Effect.gen(function* () {
      yield* truncateInv
      const svc = yield* Inventory.InventoryService
      const item = yield* svc.createItem({ organizationId: 1, sku: 'L1b' })
      yield* svc.createLevel(item.id, 100, {})
      const err = yield* svc.createLevel(item.id, 100, {}).pipe(Effect.flip)
      expect(err._tag).toBe('LevelAlreadyExists')
    }))

  it.effect('adjustStocked is atomic; rejects below 0', () =>
    Effect.gen(function* () {
      yield* truncateInv
      const svc = yield* Inventory.InventoryService
      const item = yield* svc.createItem({ organizationId: 1, sku: 'L2' })
      const lvl = yield* svc.createLevel(item.id, 100, { stocked: 5 })
      const up = yield* svc.adjustStocked(lvl.id, 3)
      expect(up.stockedQuantity).toBe(8)
      const err = yield* svc.adjustStocked(lvl.id, -100).pipe(Effect.flip)
      expect(err._tag).toBe('InsufficientStock')
    }))

  it.effect('adjustStocked on a missing level → InventoryLevelNotFound', () =>
    Effect.gen(function* () {
      yield* truncateInv
      const svc = yield* Inventory.InventoryService
      const err = yield* svc.adjustStocked(999999, 1).pipe(Effect.flip)
      expect(err._tag).toBe('InventoryLevelNotFound')
    }))

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
      const err = yield* svc.createReservation({ inventoryItemId: item.id, stockLocationId: 100, quantity: 7 }).pipe(Effect.flip)
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

  it.effect('deleteLevel blocked while reserved > 0 → LevelHasReservations', () =>
    Effect.gen(function* () {
      yield* truncateInv
      const svc = yield* Inventory.InventoryService
      const item = yield* svc.createItem({ organizationId: 1, sku: 'R2b' })
      const lvl = yield* svc.createLevel(item.id, 100, { stocked: 10 })
      yield* svc.createReservation({ inventoryItemId: item.id, stockLocationId: 100, quantity: 3 })
      const err = yield* svc.deleteLevel(lvl.id).pipe(Effect.flip)
      expect(err._tag).toBe('LevelHasReservations')
    }))

  it.effect('concurrent reservations cannot over-reserve (atomic guard)', () =>
    Effect.gen(function* () {
      yield* truncateInv
      const svc = yield* Inventory.InventoryService
      const item = yield* svc.createItem({ organizationId: 1, sku: 'R3' })
      yield* svc.createLevel(item.id, 100, { stocked: 10 })
      const results = yield* Effect.all([
        svc.createReservation({ inventoryItemId: item.id, stockLocationId: 100, quantity: 6 }).pipe(Effect.exit),
        svc.createReservation({ inventoryItemId: item.id, stockLocationId: 100, quantity: 6 }).pipe(Effect.exit),
      ], { concurrency: 'unbounded' })
      const oks = results.filter(Exit.isSuccess).length
      expect(oks).toBe(1)
      expect(results.filter(Exit.isFailure).length).toBe(1)
    }))
})
