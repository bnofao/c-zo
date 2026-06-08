/**
 * `@czo/price` module — defines the price `CzoModule`, wiring the pricing
 * feature into the app manifest.
 *
 * The module depends ONLY on `@czo/auth`:
 *  - `onStart` registers the `'price'` access domain into auth's
 *    `AccessService`;
 *  - `PriceModuleLive` requires `DrizzleDb` (provided by `buildApp`);
 *  - authorization is enforced at request time by auth's `permission`
 *    authScope (membership + permission), reached via `ctx.runEffect`; the
 *    public `resolvePrice` query enforces the org boundary inside the service.
 *
 * The host manifest must therefore list this module AFTER `@czo/auth`.
 */
import type { Layer } from 'effect'
import { Access } from '@czo/auth/services'
import { defineModule } from '@czo/kit/module'
import { priceNodeGuards, registerPriceSchema } from '@czo/price/graphql'
import { priceRelations } from '@czo/price/relations'
import * as priceSchema from '@czo/price/schema'
import { PriceModuleLive } from '@czo/price/services'
import { Effect } from 'effect'

// Access domain for prices. Statements enumerate the permissions a role may
// hold; the hierarchy maps role names to permission bundles.
const PRICE_STATEMENTS = {
  price: ['create', 'read', 'update', 'delete'],
} as const

const PRICE_HIERARCHY: Access.HierarchyLevel<typeof PRICE_STATEMENTS>[] = [
  { name: 'price:viewer', permissions: { price: ['read'] } },
  { name: 'price:manager', permissions: { price: ['create', 'update'] } },
  { name: 'price:admin', permissions: { price: ['delete'] } },
]

/**
 * Construct the price `CzoModule`. The Layer exposes `PriceService` and
 * requires `DrizzleDb` (provided by `buildApp`). `onStart` registers the
 * access domain while auth's registry is still mutable; auth freezes it in
 * its own `onStarted`, which runs after every module's `onStart`.
 */
export default defineModule(() => ({
  name: 'price',
  version: '0.0.1',
  layer: PriceModuleLive as unknown as Layer.Layer<never, never, never>,
  db: {
    schema: priceSchema as unknown as Record<string, unknown>,
    relations: priceRelations,
  },
  graphql: {
    contribution: builder => registerPriceSchema(builder as never),
    // The `PriceSet` / `Price` / `PriceList` node guards org-scope the global
    // `node(id:)` path so it's never a weaker read than `priceSet(id:)` etc.
    nodeGuards: priceNodeGuards,
  },
  onStart: Effect.gen(function* () {
    const access = yield* Access.AccessService
    yield* access.register({
      name: 'price',
      statements: PRICE_STATEMENTS,
      hierarchy: PRICE_HIERARCHY,
    })
  }) as unknown as Effect.Effect<void, never, never>,
}))
