import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'

export function stockLocationRelations(schema: SchemaRegistryShape) {
  const { stockLocations, stockLocationAddresses } = schema

  return defineRelationsPart(
    { stockLocations, stockLocationAddresses },
    r => ({
      stockLocations: {
        address: r.one.stockLocationAddresses(),
      },
      stockLocationAddresses: {
        stockLocation: r.one.stockLocations({
          from: r.stockLocationAddresses.stockLocationId,
          to: r.stockLocations.id,
        }),
      },
    }),
  )
}

export type Relations = ReturnType<typeof stockLocationRelations>
