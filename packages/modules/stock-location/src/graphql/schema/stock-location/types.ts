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
    id: { column: a => a.id },
    fields: t => ({
      addressLine1: t.exposeString('addressLine1'),
      addressLine2: t.exposeString('addressLine2', { nullable: true }),
      city: t.exposeString('city'),
      province: t.exposeString('province', { nullable: true }),
      postalCode: t.exposeString('postalCode', { nullable: true }),
      countryCode: t.exposeString('countryCode'),
      phone: t.exposeString('phone', { nullable: true }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
  })

  // ── StockLocation node ─────────────────────────────────────────────────────
  builder.drizzleNode('stockLocations', {
    name: 'StockLocation',
    id: { column: l => l.id },
    fields: t => ({
      handle: t.exposeString('handle'),
      name: t.exposeString('name'),
      isDefault: t.exposeBoolean('isDefault'),
      isActive: t.exposeBoolean('isActive'),
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        resolve: l => l.metadata as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
      version: t.exposeInt('version'),

      // Cross-module ref — resolved via auth:organizations service
      organization: t.relation('organization'),

      // Relation 1:0..1 towards address (auto-batched by Pothos Drizzle plugin)
      address: t.relation('address', { nullable: true }),
    }),
  })
}
