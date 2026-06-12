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
  registerError(builder, InventoryItemNotFound, { name: 'InventoryItemNotFoundError', subGraphs: ['org'] })
  registerError(builder, SkuTaken, {
    name: 'SkuTakenError',
    subGraphs: ['org'],
    fields: t => ({ sku: t.exposeString('sku') }),
  })
  registerError(builder, InventoryLevelNotFound, { name: 'InventoryLevelNotFoundError', subGraphs: ['org'] })
  registerError(builder, LevelAlreadyExists, {
    name: 'LevelAlreadyExistsError',
    subGraphs: ['org'],
    fields: t => ({
      inventoryItemId: t.exposeInt('inventoryItemId'),
      stockLocationId: t.exposeInt('stockLocationId'),
    }),
  })
  registerError(builder, InsufficientStock, { name: 'InsufficientStockError', subGraphs: ['org'] })
  registerError(builder, InsufficientInventory, { name: 'InsufficientInventoryError', subGraphs: ['org'] })
  // Module-qualified GraphQL typename: the channel module also defines a
  // `CrossOrgStockLocation` tagged error and registers it as
  // `CrossOrgStockLocationError`. When both modules are mounted on one schema
  // (e.g. the product full-chain build) the unqualified name collides, so the
  // inventory variant is namespaced here.
  registerError(builder, CrossOrgStockLocation, {
    name: 'InventoryCrossOrgStockLocationError',
    subGraphs: ['org'],
    fields: t => ({
      inventoryItemId: t.exposeInt('inventoryItemId'),
      stockLocationId: t.exposeInt('stockLocationId'),
    }),
  })
  registerError(builder, ReservationNotFound, { name: 'ReservationNotFoundError', subGraphs: ['org'] })
  registerError(builder, LevelHasReservations, { name: 'LevelHasReservationsError', subGraphs: ['org'] })
}
