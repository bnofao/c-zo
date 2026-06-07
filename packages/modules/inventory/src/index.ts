/**
 * `@czo/inventory` module — defines the inventory `CzoModule`, wiring the
 * inventory feature into the app manifest.
 *
 * The module depends on BOTH `@czo/auth` AND `@czo/stock-location`:
 *  - `onStart` registers the `'inventory'` access domain into auth's
 *    `AccessService`;
 *  - `InventoryModuleLive` requires `StockLocationService` (inventory levels
 *    reference stock locations), which is provided at runtime because
 *    `@czo/stock-location` is listed earlier in the app manifest —
 *    `buildApp`'s `provideMerge` fold supplies it to inventory's layer
 *    automatically;
 *  - authorization is enforced at request time by auth's `permission`
 *    authScope (membership + permission), reached via `ctx.runEffect`.
 *
 * The host manifest must therefore list this module AFTER both `@czo/auth`
 * and `@czo/stock-location`.
 */
import type { Layer } from 'effect'
import { Access } from '@czo/auth/services'
import { inventoryNodeGuards, registerInventorySchema } from '@czo/inventory/graphql'
import { inventoryRelations } from '@czo/inventory/relations'
import * as inventorySchema from '@czo/inventory/schema'
import { InventoryModuleLive } from '@czo/inventory/services'
import { defineModule } from '@czo/kit/module'
import { Effect } from 'effect'

// Access domain for inventory. Statements enumerate the permissions a role may
// hold; the hierarchy maps role names to permission bundles.
const INVENTORY_STATEMENTS = {
  inventory: ['create', 'read', 'update', 'delete'],
} as const

const INVENTORY_HIERARCHY: Access.HierarchyLevel<typeof INVENTORY_STATEMENTS>[] = [
  { name: 'inventory:viewer', permissions: { inventory: ['read'] } },
  { name: 'inventory:manager', permissions: { inventory: ['create', 'update'] } },
  { name: 'inventory:admin', permissions: { inventory: ['delete'] } },
]

/**
 * Construct the inventory `CzoModule`. The Layer exposes `InventoryService` (+
 * its event bus) and requires `DrizzleDb` + `StockLocationService` (provided
 * by `buildApp` via the manifest fold — stock-location precedes inventory).
 * `onStart` registers the access domain while auth's registry is still
 * mutable; auth freezes it in its own `onStarted`, which runs after every
 * module's `onStart`.
 */
export default defineModule(() => ({
  name: 'inventory',
  version: '0.0.1',
  layer: InventoryModuleLive as unknown as Layer.Layer<never, never, never>,
  db: {
    schema: inventorySchema as unknown as Record<string, unknown>,
    relations: inventoryRelations,
  },
  graphql: {
    contribution: builder => registerInventorySchema(builder as never),
    nodeGuards: inventoryNodeGuards,
  },
  onStart: Effect.gen(function* () {
    const access = yield* Access.AccessService
    yield* access.register({
      name: 'inventory',
      statements: INVENTORY_STATEMENTS,
      hierarchy: INVENTORY_HIERARCHY,
    })
  }) as unknown as Effect.Effect<void, never, never>,
}))
