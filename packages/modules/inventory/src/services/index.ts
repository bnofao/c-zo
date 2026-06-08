import { Layer } from 'effect'
import * as InventoryEvents from './events/inventory'
import * as Inventory from './inventory'

export { Inventory, InventoryEvents }

/**
 * Composite layer for the whole inventory module. `provideMerge` keeps
 * `InventoryEvents` visible at the runtime surface so external subscribers
 * can `yield* InventoryEvents` and call `.subscribe`.
 */
export const InventoryModuleLive = Inventory.layer.pipe(
  Layer.provideMerge(InventoryEvents.layer),
)
