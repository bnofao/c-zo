// Channel sub-module — Pothos type definitions
//
// Relations available (relations.ts):
//   channels.stockLocationLinks → many channelStockLocations
//   channels.organization → one organizations
//   channelStockLocations.channel → one channels
//   channelStockLocations.stockLocation → one stockLocations
//
// Cross-module ref: Channel.organization resolves via auth:organizations service.

import type { ChannelGraphQLSchemaBuilder } from '../..'

export function registerChannelTypes(builder: ChannelGraphQLSchemaBuilder): void {
  // ── Channel node ───────────────────────────────────────────────────────────
  builder.drizzleNode('channels', {
    name: 'Channel',
    description: 'An organization-scoped sales channel — a storefront or market through which products are sold and published. Links to the stock locations that fulfil it.',
    // Always load all columns so the `node(id:)` guard (graphql/node-guards.ts)
    // can read `organizationId` to scope the read, regardless of the client's
    // field selection.
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      handle: t.exposeString('handle', { description: 'URL-safe handle, unique within the owning organization.' }),
      name: t.exposeString('name', { description: 'Human-readable channel name.' }),
      description: t.exposeString('description', { nullable: true, description: 'Optional freeform description of the channel.' }),
      isDefault: t.exposeBoolean('isDefault', { description: 'Whether this is the organization\'s default sales channel.' }),
      isActive: t.exposeBoolean('isActive', { description: 'Whether the channel is currently active (available for selling).' }),
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        description: 'Freeform JSON metadata attached to the channel.',
        resolve: c => c.metadata as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when the channel was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when the channel was last updated.' }),
      version: t.exposeInt('version', { description: 'Optimistic-lock version, incremented on each update.' }),

      // Cross-module ref — resolved via auth:organizations service
      organization: t.relation('organization', { description: 'The organization that owns this channel.' }),

      // The association is the channel's own data; gate on channel:read in the
      // channel's org (parent-derived; select:true loads organizationId).
      stockLocations: t.relatedConnection('stockLocations', {
        description: 'Stock locations linked to this channel (the inventory locations that fulfil it). Requires `channel:read` in the channel\'s org.',
        authScopes: parent => ({ permission: { resource: 'channel', actions: ['read'], organization: parent.organizationId } }),
      }),
    }),
  })
}
