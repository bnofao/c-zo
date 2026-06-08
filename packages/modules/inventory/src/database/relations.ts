import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'
// Side-effect imports: bring stock-location + auth registry augmentations into
// scope so `stockLocations`/`organizations` resolve in the Pick AND when their
// own relations.ts files compile as part of this module's graph (inventory
// imports the stock-location service). Mirrors channel.
import '@czo/auth/schema'
import '@czo/stock-location/schema'

type InventorySchema = Pick<
  SchemaRegistryShape,
  'inventoryItems' | 'inventoryLevels' | 'reservations' | 'stockLocations' | 'organizations'
>

export function inventoryRelations(schema: InventorySchema) {
  const { inventoryItems, inventoryLevels, reservations, stockLocations, organizations } = schema

  return defineRelationsPart(
    { inventoryItems, inventoryLevels, reservations, stockLocations, organizations },
    r => ({
      inventoryItems: {
        organization: r.one.organizations({ from: r.inventoryItems.organizationId, to: r.organizations.id }),
        levels: r.many.inventoryLevels({ from: r.inventoryItems.id, to: r.inventoryLevels.inventoryItemId }),
        reservations: r.many.reservations({ from: r.inventoryItems.id, to: r.reservations.inventoryItemId }),
      },
      inventoryLevels: {
        inventoryItem: r.one.inventoryItems({ from: r.inventoryLevels.inventoryItemId, to: r.inventoryItems.id }),
        stockLocation: r.one.stockLocations({ from: r.inventoryLevels.stockLocationId, to: r.stockLocations.id }),
        reservations: r.many.reservations({
          from: [r.inventoryLevels.inventoryItemId, r.inventoryLevels.stockLocationId],
          to: [r.reservations.inventoryItemId, r.reservations.stockLocationId],
        }),
      },
      reservations: {
        inventoryItem: r.one.inventoryItems({ from: r.reservations.inventoryItemId, to: r.inventoryItems.id }),
        stockLocation: r.one.stockLocations({ from: r.reservations.stockLocationId, to: r.stockLocations.id }),
      },
    }),
  )
}

export type Relations = ReturnType<typeof inventoryRelations>
