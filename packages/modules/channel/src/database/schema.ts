import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const channels = pgTable('channels', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  handle: text('handle').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('channels_organization_id_idx').on(t.organizationId),
  unique('channels_org_handle_uniq').on(t.organizationId, t.handle),
])

export const channelStockLocations = pgTable('channel_stock_locations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  // Cross-module ref to stock_locations.id — NO inter-module DB FK (same
  // convention as organizationId). Ownership is enforced in the service layer.
  stockLocationId: integer('stock_location_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [
  index('channel_stock_locations_channel_id_idx').on(t.channelId),
  unique('channel_stock_locations_uniq').on(t.channelId, t.stockLocationId),
])

// Register into the kit's global SchemaRegistryShape (travels with the schema
// import; applies in downstream packages reachable via the import graph).
declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    channels: typeof channels
    channelStockLocations: typeof channelStockLocations
  }
}
