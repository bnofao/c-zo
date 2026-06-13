// StockLocation sub-module — Pothos type definitions
//
// Relations available (relations.ts):
//   stockLocations.address → one stockLocationAddresses
//   stockLocationAddresses.stockLocation → one stockLocations
//
// Cross-module ref: StockLocation.organization resolves via auth:organizations service.

import type { StockLocationGraphQLSchemaBuilder } from '../..'

export function registerStockLocationTypes(builder: StockLocationGraphQLSchemaBuilder): void {
  // ── StockLocationAddress node ──────────────────────────────────────────────
  builder.drizzleNode('stockLocationAddresses', {
    name: 'StockLocationAddress',
    subGraphs: ['org'],
    // Load the parent location's org so the `node(id:)` guard (graphql/node-guards.ts)
    // can scope the read, regardless of the client's field selection — the address
    // has no own `organizationId` column. The plugin unions this with the columns
    // referenced by the exposed fields, so those still resolve.
    select: { with: { stockLocation: { columns: { organizationId: true } } } },
    description: 'The postal address of a stock location.',
    id: { column: a => a.id },
    fields: t => ({
      addressLine1: t.exposeString('addressLine1', { description: 'First line of the street address.' }),
      addressLine2: t.exposeString('addressLine2', { nullable: true, description: 'Optional second line of the street address.' }),
      city: t.exposeString('city', { description: 'City or locality.' }),
      province: t.exposeString('province', { nullable: true, description: 'State, province, or region.' }),
      postalCode: t.exposeString('postalCode', { nullable: true, description: 'Postal or ZIP code.' }),
      countryCode: t.exposeString('countryCode', { description: 'ISO 3166-1 alpha-2 country code (e.g. `US`).' }),
      phone: t.exposeString('phone', { nullable: true, description: 'Optional contact phone number for the location.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),
    }),
  })

  // ── StockLocation node ─────────────────────────────────────────────────────
  builder.drizzleNode('stockLocations', {
    name: 'StockLocation',
    subGraphs: ['org'],
    description: 'An organization-scoped physical inventory location (warehouse, store) that holds and fulfils stock.',
    // Always load all columns so the `node(id:)` guard (graphql/node-guards.ts)
    // can read `organizationId` to scope the read, regardless of the client's
    // field selection.
    select: true,
    id: { column: l => l.id },
    fields: t => ({
      handle: t.exposeString('handle', { description: 'URL-safe handle, unique within the owning organization.' }),
      name: t.exposeString('name', { description: 'Human-readable location name.' }),
      isDefault: t.exposeBoolean('isDefault', { description: 'Whether this is the organization\'s default stock location.' }),
      isActive: t.exposeBoolean('isActive', { description: 'Whether the location is currently active (available for fulfilment).' }),
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        description: 'Freeform JSON metadata attached to the location.',
        resolve: l => l.metadata as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),
      version: t.exposeInt('version', { description: 'Optimistic-lock version, incremented on each update.' }),

      // Cross-module ref — resolved via auth:organizations service
      organization: t.relation('organization', { description: 'The organization that owns this stock location.' }),

      // Relation 1:0..1 towards address (auto-batched by Pothos Drizzle plugin)
      address: t.relation('address', { nullable: true, description: 'The location\'s postal address, or null if unset.' }),
    }),
  })
}
