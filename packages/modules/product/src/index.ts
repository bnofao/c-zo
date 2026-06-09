/**
 * `@czo/product` module — defines the product `CzoModule`, wiring the product
 * catalog feature into the app manifest.
 *
 * The module depends on `@czo/auth` (AccessService + permission scope) and,
 * through its GraphQL grafts and relations, on `@czo/attribute`, `@czo/channel`,
 * `@czo/inventory`, `@czo/price`, `@czo/translation`, and `@czo/stock-location`:
 *  - `onStart` registers the `'product'` access domain into auth's
 *    `AccessService`;
 *  - `ProductModuleLive` requires `DrizzleDb` (provided by `buildApp`);
 *  - authorization is enforced at request time by auth's `permission` authScope
 *    (membership + permission), reached via `ctx.runEffect`; global/base rows
 *    are readable by any authenticated viewer, org-owned rows require the
 *    `permission` scope.
 *
 * The host manifest must therefore list this module AFTER all of the above.
 */
import type { Layer } from 'effect'
import { Access } from '@czo/auth/services'
import { defineModule } from '@czo/kit/module'
import { productNodeGuards, registerProductSchema } from '@czo/product/graphql'
import { productRelations } from '@czo/product/relations'
import * as productSchema from '@czo/product/schema'
import { ProductModuleLive } from '@czo/product/services'
import { Effect } from 'effect'

// Access domain for products. Statements enumerate the permissions a role may
// hold; the hierarchy maps role names to permission bundles.
const PRODUCT_STATEMENTS = {
  product: ['create', 'read', 'update', 'delete'],
} as const

const PRODUCT_HIERARCHY: Access.HierarchyLevel<typeof PRODUCT_STATEMENTS>[] = [
  { name: 'product:viewer', permissions: { product: ['read'] } },
  { name: 'product:manager', permissions: { product: ['create', 'update'] } },
  { name: 'product:admin', permissions: { product: ['delete'] } },
]

/**
 * Construct the product `CzoModule`. The Layer exposes the product services and
 * requires `DrizzleDb` (provided by `buildApp`). `onStart` registers the access
 * domain while auth's registry is still mutable; auth freezes it in its own
 * `onStarted`, which runs after every module's `onStart`.
 */
export default defineModule(() => ({
  name: 'product',
  version: '0.0.1',
  layer: ProductModuleLive as unknown as Layer.Layer<never, never, never>,
  db: {
    schema: productSchema as unknown as Record<string, unknown>,
    relations: productRelations,
  },
  graphql: {
    contribution: builder => registerProductSchema(builder as never),
    // The product node guards org-scope the global `node(id:)` path so it's
    // never a weaker read than the per-id queries.
    nodeGuards: productNodeGuards,
  },
  onStart: Effect.gen(function* () {
    const access = yield* Access.AccessService
    yield* access.register({
      name: 'product',
      statements: PRODUCT_STATEMENTS,
      hierarchy: PRODUCT_HIERARCHY,
    })
  }) as unknown as Effect.Effect<void, never, never>,
}))
