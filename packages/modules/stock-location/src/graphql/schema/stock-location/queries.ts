import type { SchemaBuilder } from '@czo/kit/graphql'
import { useDatabase, withNotDeleted } from '@czo/kit/db'

// ─── Stock Location Queries ───────────────────────────────────────────────────

export function registerStockLocationQueries(builder: SchemaBuilder): void {
  // ── stockLocation(id) — single stock location by global ID ────────────────
  builder.queryField('stockLocation', t =>
    t.drizzleField({
      type: 'stockLocations',
      nullable: true,
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['read'] } },
      resolve: async (query, _root: unknown, args: Record<string, unknown>) => {
        const db = await useDatabase()
        const id = (args.id as { id: string }).id
        return (db as any).query.stockLocations.findFirst( // db.query.* shape not available without full schema generic threading
          query({
            where: withNotDeleted({ id: Number(id) }),
          }),
        )
      },
    }))

  // ── stockLocations — paginated connection with optional filters ────────────
  builder.queryField('stockLocations', t =>
    t.drizzleConnection({
      type: 'stockLocations',
      authScopes: { permission: { resource: 'stock-location', actions: ['read'] } },
      args: {
        organizationId: t.arg.globalID({ for: ['Organization'] }),
        isActive: t.arg.boolean(),
        isDefault: t.arg.boolean(),
      },
      resolve: async (query, _root: unknown, args: any) => { // Pothos drizzleConnection with globalID args: complex inferred type requires any here
        const db = await useDatabase()
        const organizationId = args.organizationId as { id: string } | null | undefined
        const isActive = args.isActive as boolean | null | undefined
        const isDefault = args.isDefault as boolean | null | undefined
        return (db as any).query.stockLocations.findMany( // db.query.* shape not available without full schema generic threading
          query({
            where: withNotDeleted({
              ...(organizationId && { organizationId: organizationId.id }),
              ...(isActive !== null && isActive !== undefined && { isActive }),
              ...(isDefault !== null && isDefault !== undefined && { isDefault }),
            }),
            orderBy: { createdAt: 'desc' },
          }),
        )
      },
    }))
}
