import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'
// Pull in stock-location's AND auth's SchemaRegistryShape augmentations so
// `stockLocations` is visible in the Pick below, and `organizations` is visible
// when stock-location's own relations.ts is compiled as part of this module's
// graph (channel imports the stock-location service). Mirrors how stock-location
// imports '@czo/auth/graphql'.
import '@czo/auth/schema'
import '@czo/stock-location/schema'

// Pick only the tables this part uses (channels + junction + the cross-module
// stockLocations and organizations tables). Picking keys keeps callers valid
// once sibling modules augment the registry (mirrors attribute/stock-location).
type ChannelSchema = Pick<SchemaRegistryShape, 'channels' | 'channelStockLocations' | 'stockLocations' | 'organizations'>

export function channelRelations(schema: ChannelSchema) {
  const { channels, channelStockLocations, stockLocations, organizations } = schema

  return defineRelationsPart(
    { channels, channelStockLocations, stockLocations, organizations },
    r => ({
      channels: {
        // 1:N to the junction — drives the service's add/remove.
        stockLocationLinks: r.many.channelStockLocations({
          from: r.channels.id,
          to: r.channelStockLocations.channelId,
        }),
        // M:N through the junction — drives the relay connection (Task 9).
        stockLocations: r.many.stockLocations({
          from: r.channels.id.through(r.channelStockLocations.channelId),
          to: r.stockLocations.id.through(r.channelStockLocations.stockLocationId),
        }),
        // Cross-module ref — resolved via auth:organizations service.
        organization: r.one.organizations({
          from: r.channels.organizationId,
          to: r.organizations.id,
        }),
      },
      channelStockLocations: {
        channel: r.one.channels({ from: r.channelStockLocations.channelId, to: r.channels.id }),
        // Cross-module: resolve the StockLocation row via the junction FK.
        stockLocation: r.one.stockLocations({ from: r.channelStockLocations.stockLocationId, to: r.stockLocations.id }),
      },
    }),
  )
}

export type Relations = ReturnType<typeof channelRelations>
