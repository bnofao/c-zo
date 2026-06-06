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
    // Always load all columns so the `node(id:)` guard (graphql/node-guards.ts)
    // can read `organizationId` to scope the read, regardless of the client's
    // field selection.
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      handle: t.exposeString('handle'),
      name: t.exposeString('name'),
      description: t.exposeString('description', { nullable: true }),
      isDefault: t.exposeBoolean('isDefault'),
      isActive: t.exposeBoolean('isActive'),
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        resolve: c => c.metadata as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
      version: t.exposeInt('version'),

      // Cross-module ref — resolved via auth:organizations service
      organization: t.relation('organization'),

      // The association is the channel's own data; gate on channel:read in the
      // channel's org (parent-derived; select:true loads organizationId).
      stockLocations: t.relatedConnection('stockLocations', {
        authScopes: parent => ({ permission: { resource: 'channel', actions: ['read'], organization: parent.organizationId } }),
      }),
    }),
  })
}
