// Inventory sub-module — Pothos type definitions
//
// Relations available (relations.ts):
//   inventoryItems.organization → one organizations
//   inventoryItems.levels → many inventoryLevels        (→ InventoryItem.levels connection)
//   inventoryItems.reservations → many reservations     (→ InventoryItem.reservations connection)
//   inventoryLevels.inventoryItem → one inventoryItems
//   inventoryLevels.stockLocation → one stockLocations
//   inventoryLevels.reservations → many reservations    (→ InventoryLevel.reservations connection, composite FK)
//   reservations.inventoryItem → one inventoryItems
//   reservations.stockLocation → one stockLocations
//
// Cross-module refs:
//   InventoryItem.organization resolves via auth:organizations service.
//   InventoryLevel.stockLocation / Reservation.stockLocation resolve via stock-location service.

import type { InventoryGraphQLSchemaBuilder } from '../..'

export function registerInventoryTypes(builder: InventoryGraphQLSchemaBuilder): void {
  // ── InventoryItem node ─────────────────────────────────────────────────────
  builder.drizzleNode('inventoryItems', {
    name: 'InventoryItem',
    description: 'An organization-scoped, stock-tracked unit (one per SKU, e.g. a product variant\'s stockable unit). Its stock is tracked per location via InventoryLevels and held by Reservations.',
    // Always load all columns so the `node(id:)` guard (graphql/node-guards.ts)
    // can read `organizationId` to scope the read, regardless of the client's
    // field selection.
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      sku: t.exposeString('sku', { description: 'Stock-keeping unit, unique within the owning organization.' }),
      title: t.exposeString('title', { nullable: true, description: 'Optional human-readable title for the item.' }),
      description: t.exposeString('description', { nullable: true, description: 'Optional freeform description of the item.' }),
      requiresShipping: t.exposeBoolean('requiresShipping', { description: 'Whether this item must be physically shipped.' }),
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        description: 'Freeform JSON metadata attached to the item.',
        resolve: item => item.metadata as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),
      version: t.exposeInt('version', { description: 'Optimistic-lock version, incremented on each update.' }),

      // Cross-module ref — resolved via auth:organizations service
      organization: t.relation('organization', { description: 'The organization that owns this inventory item.' }),

      levels: t.relatedConnection('levels', {
        description: 'Per-stock-location stock levels for this item. Requires `inventory:read` in the item\'s org.',
        authScopes: parent => ({ permission: { resource: 'inventory', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
      reservations: t.relatedConnection('reservations', {
        description: 'Active reservations holding stock of this item. Requires `inventory:read` in the item\'s org.',
        authScopes: parent => ({ permission: { resource: 'inventory', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
    }),
  })

  // ── InventoryLevel node ────────────────────────────────────────────────────
  builder.drizzleNode('inventoryLevels', {
    name: 'InventoryLevel',
    description: 'The stock of one inventory item at one stock location: stocked, reserved, and incoming quantities, with available derived as stocked − reserved.',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      stockedQuantity: t.exposeInt('stockedQuantity', { description: 'Units physically on hand at this location.' }),
      reservedQuantity: t.exposeInt('reservedQuantity', { description: 'Units held by active reservations at this location.' }),
      incomingQuantity: t.exposeInt('incomingQuantity', { description: 'Units expected to arrive (e.g. inbound restock) at this location.' }),
      availableQuantity: t.int({
        description: 'Units available to sell: stockedQuantity minus reservedQuantity.',
        resolve: l => l.stockedQuantity - l.reservedQuantity,
      }),
      version: t.exposeInt('version', { description: 'Optimistic-lock version, incremented on each update.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),

      // Cross-module refs
      stockLocation: t.relation('stockLocation', { description: 'The stock location this level tracks stock at.' }),
      inventoryItem: t.relation('inventoryItem', { description: 'The inventory item this level tracks stock for.' }),

      reservations: t.relatedConnection('reservations', {
        description: 'Active reservations against this specific item-at-location level. Requires `inventory:read` in the item\'s org.',
        authScopes: parent => ({ permission: { resource: 'inventory', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
    }),
  })

  // ── Reservation node ───────────────────────────────────────────────────────
  builder.drizzleNode('reservations', {
    name: 'Reservation',
    description: 'A hold on a quantity of an inventory item at a stock location, backing a pending order line; it raises the level\'s reservedQuantity (lowering available) until released.',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      quantity: t.exposeInt('quantity', { description: 'Number of units held by this reservation.' }),
      lineItemId: t.exposeString('lineItemId', { nullable: true, description: 'Identifier of the order line this reservation backs, if any.' }),
      description: t.exposeString('description', { nullable: true, description: 'Optional freeform note about the reservation.' }),
      createdBy: t.exposeInt('createdBy', { nullable: true, description: 'Id of the user who created the reservation, if recorded.' }),
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        description: 'Freeform JSON metadata attached to the reservation.',
        resolve: r => r.metadata as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),

      // Cross-module refs
      inventoryItem: t.relation('inventoryItem', { description: 'The inventory item being reserved.' }),
      stockLocation: t.relation('stockLocation', { description: 'The stock location the reservation is held at.' }),
    }),
  })
}
