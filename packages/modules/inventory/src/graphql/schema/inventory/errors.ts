import type { InventoryGraphQLSchemaBuilder } from '@czo/inventory/graphql'
import { registerError } from '@czo/kit/graphql'
import {
  CrossOrgStockLocation,
  InsufficientInventory,
  InsufficientStock,
  InventoryItemNotFound,
  InventoryLevelNotFound,
  LevelAlreadyExists,
  LevelHasReservations,
  ReservationNotFound,
  SkuTaken,
} from '../../../services/inventory'

export {
  CrossOrgStockLocation,
  InsufficientInventory,
  InsufficientStock,
  InventoryItemNotFound,
  InventoryLevelNotFound,
  LevelAlreadyExists,
  LevelHasReservations,
  ReservationNotFound,
  SkuTaken,
}

export function registerInventoryErrors(builder: InventoryGraphQLSchemaBuilder): void {
  registerError(builder, InventoryItemNotFound, { name: 'InventoryItemNotFoundError' })
  registerError(builder, SkuTaken, {
    name: 'SkuTakenError',
    fields: t => ({ sku: t.exposeString('sku') }),
  })
  registerError(builder, InventoryLevelNotFound, { name: 'InventoryLevelNotFoundError' })
  registerError(builder, LevelAlreadyExists, {
    name: 'LevelAlreadyExistsError',
    fields: t => ({
      inventoryItemId: t.exposeInt('inventoryItemId'),
      stockLocationId: t.exposeInt('stockLocationId'),
    }),
  })
  registerError(builder, InsufficientStock, { name: 'InsufficientStockError' })
  registerError(builder, InsufficientInventory, { name: 'InsufficientInventoryError' })
  registerError(builder, CrossOrgStockLocation, {
    name: 'CrossOrgStockLocationError',
    fields: t => ({
      inventoryItemId: t.exposeInt('inventoryItemId'),
      stockLocationId: t.exposeInt('stockLocationId'),
    }),
  })
  registerError(builder, ReservationNotFound, { name: 'ReservationNotFoundError' })
  registerError(builder, LevelHasReservations, { name: 'LevelHasReservationsError' })
}
