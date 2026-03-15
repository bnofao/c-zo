import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const stockLocations = pgTable('stock_locations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  handle: text('handle').notNull(),
  name: text('name').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('stock_locations_organization_id_idx').on(t.organizationId),
  unique('stock_locations_org_handle_uniq').on(t.organizationId, t.handle),
])

export const stockLocationAddresses = pgTable('stock_location_addresses', {
  id: text('id').primaryKey(),
  stockLocationId: text('stock_location_id').notNull().references(() => stockLocations.id, { onDelete: 'cascade' }).unique(),
  addressLine1: text('address_line_1').notNull(),
  addressLine2: text('address_line_2'),
  city: text('city').notNull(),
  province: text('province'),
  postalCode: text('postal_code'),
  countryCode: text('country_code').notNull(),
  phone: text('phone'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
