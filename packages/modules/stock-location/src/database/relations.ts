import type { SchemaRegistry } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'

export function stockLocationRelations(schema: SchemaRegistry) {
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
