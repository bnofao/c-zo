import type { InventoryGraphQLSchemaBuilder } from '@czo/inventory/graphql'
import { registerInventoryItemMutations } from './item'
import { registerInventoryLevelMutations } from './level'
import { registerReservationMutations } from './reservation'

export function registerInventoryMutations(builder: InventoryGraphQLSchemaBuilder): void {
  registerInventoryItemMutations(builder)
  registerInventoryLevelMutations(builder)
  registerReservationMutations(builder)
}
