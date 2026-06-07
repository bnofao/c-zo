/**
 * Module manifest for the life app.
 *
 * Every module is listed explicitly here. `composeApp(modules)` in
 * `main.ts` consumes this list to aggregate DB schemas, GraphQL
 * contributions, Effect Layers, and lifecycle hooks.
 *
 * Modules read their own config from the environment via Effect `Config`,
 * so the manifest is a plain list — no per-module config is threaded here.
 */
import type { CzoModule } from '@czo/kit/module'
import attributeModule from '@czo/attribute'
import authModule from '@czo/auth'
import channelModule from '@czo/channel'
import inventoryModule from '@czo/inventory'
import stockLocationModule from '@czo/stock-location'

// Order matters: `buildApp` provides earlier modules to later ones (its
// `provideMerge` layer fold), so dependency providers come first. Auth must
// precede stock-location, which reaches auth's OrganizationService/AccessService.
// Attribute depends on auth's AccessService + permission scope, so it comes after
// auth. Channel depends on both auth (AccessService) and stock-location
// (StockLocationService), so it must come after both. Inventory also depends on
// both auth (AccessService) and stock-location (StockLocationService), so it
// comes after both — listed after channel.
export const modules: ReadonlyArray<CzoModule> = [
  authModule,
  attributeModule,
  stockLocationModule,
  channelModule,
  inventoryModule,
]
