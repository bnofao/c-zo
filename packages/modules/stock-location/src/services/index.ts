import { Layer } from 'effect'
import * as StockLocation from './stock-location'
import * as StockLocationEvents from './events/stock-location'

export { StockLocation, StockLocationEvents }

/**
 * Composite layer for the whole stock-location module. `provideMerge` keeps
 * `StockLocationEvents` visible at the runtime surface so external subscribers
 * can `yield* StockLocationEvents` and call `.subscribe`.
 */
export const StockLocationModuleLive = StockLocation.layer.pipe(
  Layer.provideMerge(StockLocationEvents.layer),
)
