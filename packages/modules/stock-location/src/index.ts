/**
 * `@czo/stock-location` module — defines the stock-location `CzoModule`,
 * replacing the legacy Nitro plugin wiring (`module.ts` + `plugins/index.ts`).
 *
 * The module depends on `@czo/auth`, but only at the edges — NOT in its
 * service layer, which is auth-free (requires just `DrizzleDb`):
 *  - `onStart` registers the `'stock-location'` access domain into auth's
 *    `AccessService`;
 *  - authorization is enforced at request time by auth's `permission`
 *    authScope (membership + permission), reached via `ctx.runEffect`.
 *
 * Both resolve against the app runtime built by `buildApp`, which provides
 * earlier-listed modules (auth) to later-listed ones via its
 * `provideMerge` layer fold — so the host manifest must list this module
 * AFTER `@czo/auth`.
 */
import type { Layer } from 'effect'
import { Access } from '@czo/auth/services'
import { defineModule } from '@czo/kit/module'
import { registerStockLocationSchema } from '@czo/stock-location/graphql'
import { stockLocationRelations } from '@czo/stock-location/relations'
import * as stockLocationSchema from '@czo/stock-location/schema'
import { StockLocationModuleLive } from '@czo/stock-location/services'
import { Effect } from 'effect'

// Access domain for stock locations. Statements enumerate the permissions a
// role may hold; the hierarchy maps role names to permission bundles, mirroring
// the legacy plugin's `czo:register` registration.
const STOCK_LOCATION_STATEMENTS = {
  'stock-location': ['create', 'read', 'update', 'delete'],
} as const

const STOCK_LOCATION_HIERARCHY: Access.HierarchyLevel<typeof STOCK_LOCATION_STATEMENTS>[] = [
  { name: 'stock-loc:viewer', permissions: { 'stock-location': ['read'] } },
  { name: 'stock-loc:manager', permissions: { 'stock-location': ['create', 'update'] } },
  { name: 'stock-loc:admin', permissions: { 'stock-location': ['delete'] } },
]

/**
 * Construct the stock-location `CzoModule`. The Layer exposes
 * `StockLocationService` (+ its event bus) and requires only `DrizzleDb`
 * (provided by `buildApp`) — no auth service at construction. `onStart`
 * registers the access domain while auth's registry is still mutable; auth
 * freezes it in its own `onStarted`, which runs after every module's `onStart`.
 */
export default defineModule(() => ({
  name: 'stock-location',
  version: '0.0.1',
  layer: StockLocationModuleLive as unknown as Layer.Layer<never, never, never>,
  db: {
    schema: stockLocationSchema as unknown as Record<string, unknown>,
    relations: stockLocationRelations,
  },
  graphql: {
    contribution: builder => registerStockLocationSchema(builder as never),
    // Authorization reuses auth's `permission` scope (registered by the auth
    // module's `authScope`); no stock-location-specific scope is needed.
  },
  onStart: Effect.gen(function* () {
    const access = yield* Access.AccessService
    yield* access.register({
      name: 'stock-location',
      statements: STOCK_LOCATION_STATEMENTS,
      hierarchy: STOCK_LOCATION_HIERARCHY,
    })
  }) as unknown as Effect.Effect<void, never, never>,
}))
