import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'

export function stockLocationRelations(schema: SchemaRegistryShape) {
  const { stockLocations, stockLocationAddresses, organizations } = schema

  return defineRelationsPart(
    { stockLocations, stockLocationAddresses, organizations },
    r => ({
      stockLocations: {
        address: r.one.stockLocationAddresses(),
        organization: r.one.organizations({
          from: r.stockLocations.organizationId,
          to: r.organizations.id,
        }),
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
