import type { StockLocationGraphQLSchemaBuilder } from '@czo/stock-location/graphql'
import { Effect } from 'effect'
import { StockLocationService } from '../../../services/stock-location'
import { loadOrganizationId } from './authz'

// ─── Stock Location Queries ───────────────────────────────────────────────────

export function registerStockLocationQueries(builder: StockLocationGraphQLSchemaBuilder): void {
  // ── stockLocation(id) — single stock location by global ID ────────────────
  // `t.drizzleField`'s `query` builder threads the Pothos selection set into
  // the RQBv2 config; we forward that config to the service so soft-delete
  // filtering AND selection-aware reads both apply.
  builder.queryField('stockLocation', t =>
    t.drizzleField({
      type: 'stockLocations',
      nullable: true,
      args: {
        id: t.arg.globalID({ required: true }),
      },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadOrganizationId(ctx, args.id.id)
        // Unknown id → require auth and let the nullable field resolve to null
        // (the service NotFound is collapsed below), rather than a gate 403.
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'stock-location', actions: ['read'], organization } }
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* StockLocationService
            return yield* svc.findFirst(query({ where: { id: Number(args.id.id) } }))
          }).pipe(
            // Service surfaces `StockLocationNotFound`; the GraphQL field is
            // nullable, so we collapse that specific failure to `null`.
            Effect.catchTag('StockLocationNotFound', () => Effect.succeed(null)),
          ),
        ),
    }))

  // ── stockLocations — paginated connection with search/where/orderBy ──────
  builder.queryField('stockLocations', t =>
    t.drizzleConnection({
      type: 'stockLocations',
      // Org-scoped: the caller must hold `read` permission in the target org.
      // Listing is always bounded to a single organization (below) so it never
      // spans tenants.
      authScopes: (_parent, args) => ({
        permission: {
          resource: 'stock-location',
          actions: ['read'],
          organization: Number(args.organizationId.id),
        },
      }),
      args: {
        /** Organization to list within. Listing is always tenant-scoped. */
        organizationId: t.arg.globalID({ required: true }),
        /** Free-text search across `name` and `handle` (case-insensitive substring). */
        search: t.arg.string(),
        where: t.arg({ type: 'StockLocationWhereInput' }),
        orderBy: t.arg({ type: ['StockLocationOrderByInput'] }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* StockLocationService

            // Compose `search` into the where clause as an OR over name/handle
            // using the RQBv2 `ilike` operator. The user-supplied `where` is
            // AND-ed via the service's own filter merge.
            const searchClause = args.search?.trim()
              ? {
                  OR: [
                    { name: { ilike: `%${args.search.trim()}%` } },
                    { handle: { ilike: `%${args.search.trim()}%` } },
                  ],
                }
              : null

            // Tenant boundary: always constrain to the requested org so the
            // listing can never cross organizations, regardless of `where`.
            const orgClause = { organizationId: Number(args.organizationId.id) }
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const clauses = [orgClause, userWhere, searchClause].filter(Boolean)
            const where = clauses.length === 1 ? clauses[0] : { AND: clauses }

            return yield* svc.findMany(query({
              where: where as any,
              orderBy: args.orderBy?.length
                ? args.orderBy.map(o => ({ [o.field]: o.direction }))
                : { createdAt: 'desc' },
            }))
          }),
        ) as Promise<any>,
    }))
}
