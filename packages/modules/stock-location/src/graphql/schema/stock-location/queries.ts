import { useDatabase, withNotDeleted } from '@czo/kit/db'

// ─── Stock Location Queries ───────────────────────────────────────────────────

export function registerStockLocationQueries(builder: any): void {
  // ── stockLocation(id) — single stock location by global ID ────────────────
  (builder as any).queryField('stockLocation', (t: any) =>
    t.drizzleField({
      type: 'stockLocations',
      nullable: true,
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['read'] } },
      resolve: async (query: any, _root: any, args: any) => {
        const db = await useDatabase()
        return (db as any).query.stockLocations.findFirst(
          query({
            where: withNotDeleted({ id: Number(args.id.id) }),
          }),
        )
      },
    }))

  // ── stockLocations — paginated connection with optional filters ────────────
  ;(builder as any).queryField('stockLocations', (t: any) =>
    t.drizzleConnection({
      type: 'stockLocations',
      authScopes: { permission: { resource: 'stock-location', actions: ['read'] } },
      args: {
        organizationId: t.arg.globalID({ for: ['Organization'] }),
        isActive: t.arg.boolean(),
        isDefault: t.arg.boolean(),
      },
      resolve: async (query: any, _root: any, args: any) => {
        const db = await useDatabase()
        return (db as any).query.stockLocations.findMany(
          query({
            where: withNotDeleted({
              ...(args.organizationId && { organizationId: args.organizationId.id }),
              ...(args.isActive !== null && args.isActive !== undefined && { isActive: args.isActive }),
              ...(args.isDefault !== null && args.isDefault !== undefined && { isDefault: args.isDefault }),
            }),
            orderBy: { createdAt: 'desc' },
          }),
        )
      },
    }))
}
