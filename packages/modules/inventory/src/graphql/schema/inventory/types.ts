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
    // Always load all columns so the `node(id:)` guard (graphql/node-guards.ts)
    // can read `organizationId` to scope the read, regardless of the client's
    // field selection.
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      sku: t.exposeString('sku'),
      title: t.exposeString('title', { nullable: true }),
      description: t.exposeString('description', { nullable: true }),
      requiresShipping: t.exposeBoolean('requiresShipping'),
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        resolve: item => item.metadata as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
      version: t.exposeInt('version'),

      // Cross-module ref — resolved via auth:organizations service
      organization: t.relation('organization'),

      levels: t.relatedConnection('levels', {
        authScopes: parent => ({ permission: { resource: 'inventory', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
      reservations: t.relatedConnection('reservations', {
        authScopes: parent => ({ permission: { resource: 'inventory', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
    }),
  })

  // ── InventoryLevel node ────────────────────────────────────────────────────
  builder.drizzleNode('inventoryLevels', {
    name: 'InventoryLevel',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      stockedQuantity: t.exposeInt('stockedQuantity'),
      reservedQuantity: t.exposeInt('reservedQuantity'),
      incomingQuantity: t.exposeInt('incomingQuantity'),
      availableQuantity: t.int({
        resolve: l => l.stockedQuantity - l.reservedQuantity,
      }),
      version: t.exposeInt('version'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),

      // Cross-module refs
      stockLocation: t.relation('stockLocation'),
      inventoryItem: t.relation('inventoryItem'),

      reservations: t.relatedConnection('reservations', {
        authScopes: parent => ({ permission: { resource: 'inventory', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
    }),
  })

  // ── Reservation node ───────────────────────────────────────────────────────
  builder.drizzleNode('reservations', {
    name: 'Reservation',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      quantity: t.exposeInt('quantity'),
      lineItemId: t.exposeString('lineItemId', { nullable: true }),
      description: t.exposeString('description', { nullable: true }),
      createdBy: t.exposeInt('createdBy', { nullable: true }),
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        resolve: r => r.metadata as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),

      // Cross-module refs
      inventoryItem: t.relation('inventoryItem'),
      stockLocation: t.relation('stockLocation'),
    }),
  })
}
