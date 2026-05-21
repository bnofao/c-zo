export { StockLocationEventsLive } from './events/stock-location'
export { StockLocationServiceLive } from './stock-location'

import { Layer } from 'effect'
import { StockLocationEventsLive } from './events/stock-location'
import { StockLocationServiceLive } from './stock-location'

/**
 * Composite layer for the whole stock-location module. `provideMerge` keeps
 * `StockLocationEvents` visible at the runtime surface so external subscribers
 * (other modules, background streams) can `yield* StockLocationEvents` and
 * call `.subscribe`.
 */
export const StockLocationModuleLive = StockLocationServiceLive.pipe(
  Layer.provideMerge(StockLocationEventsLive),
)
