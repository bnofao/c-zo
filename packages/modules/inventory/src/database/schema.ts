import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core'

export const inventoryItems = pgTable('inventory_items', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  sku: text('sku').notNull(),
  title: text('title'),
  description: text('description'),
  requiresShipping: boolean('requires_shipping').notNull().default(true),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('inventory_items_organization_id_idx').on(t.organizationId),
  unique('inventory_items_org_sku_uniq').on(t.organizationId, t.sku),
])

export const inventoryLevels = pgTable('inventory_levels', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  inventoryItemId: integer('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  stockLocationId: integer('stock_location_id').notNull(),
  stockedQuantity: integer('stocked_quantity').notNull().default(0),
  reservedQuantity: integer('reserved_quantity').notNull().default(0),
  incomingQuantity: integer('incoming_quantity').notNull().default(0),
  version: integer('version').notNull().default(1),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('inventory_levels_item_id_idx').on(t.inventoryItemId),
  index('inventory_levels_stock_location_id_idx').on(t.stockLocationId),
  uniqueIndex('inventory_levels_item_loc_uniq').on(t.inventoryItemId, t.stockLocationId).where(sql`${t.deletedAt} IS NULL`),
  check('chk_inv_level_stocked_nonneg', sql`${t.stockedQuantity} >= 0`),
  check('chk_inv_level_reserved_nonneg', sql`${t.reservedQuantity} >= 0`),
  check('chk_inv_level_incoming_nonneg', sql`${t.incomingQuantity} >= 0`),
  check('chk_inv_level_reserved_le_stocked', sql`${t.reservedQuantity} <= ${t.stockedQuantity}`),
])

export const reservations = pgTable('inventory_reservations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  inventoryItemId: integer('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  stockLocationId: integer('stock_location_id').notNull(),
  quantity: integer('quantity').notNull(),
  lineItemId: text('line_item_id'),
  description: text('description'),
  createdBy: integer('created_by'),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('inventory_reservations_item_id_idx').on(t.inventoryItemId),
  index('inventory_reservations_stock_location_id_idx').on(t.stockLocationId),
  index('inventory_reservations_line_item_id_idx').on(t.lineItemId),
  check('chk_inv_reservation_qty_pos', sql`${t.quantity} > 0`),
])

declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    inventoryItems: typeof inventoryItems
    inventoryLevels: typeof inventoryLevels
    reservations: typeof reservations
  }
}
