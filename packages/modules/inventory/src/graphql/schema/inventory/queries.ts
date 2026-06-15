import type { InventoryGraphQLSchemaBuilder } from '@czo/inventory/graphql'
import { Effect } from 'effect'
import { InventoryService } from '../../../services/inventory'
import { loadItemOrganizationId } from './authz'

// ─── Inventory Queries ────────────────────────────────────────────────────────

export function registerInventoryQueries(builder: InventoryGraphQLSchemaBuilder): void {
  // ── inventoryItem(id) — single item by global ID ───────────────────────────
  // `t.drizzleField`'s `query` builder threads the Pothos selection set into
  // the RQBv2 config; we forward that config to the service so soft-delete
  // filtering AND selection-aware reads both apply.
  builder.queryField('inventoryItem', t =>
    t.drizzleField({
      subGraphs: ['org'],
      type: 'inventoryItems',
      nullable: true,
      description: 'Fetch a single inventory item by id. Requires `inventory:read` in the item\'s owning organization. Returns null if not found or soft-deleted.',
      args: {
        id: t.arg.globalID({ for: 'InventoryItem', required: true, description: 'Relay global id of the InventoryItem to fetch.' }),
      },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadItemOrganizationId(ctx, Number(args.id.id))
        // Unknown id → require auth and let the nullable field resolve to null
        // (the service NotFound is collapsed below), rather than a gate 403.
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'inventory', actions: ['read'], organization } }
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryService
            return yield* svc.findItem(query({ where: { id: Number(args.id.id) } }))
          }).pipe(
            // Service surfaces `InventoryItemNotFound`; the GraphQL field is
            // nullable, so we collapse that specific failure to `null`.
            Effect.catchTag('InventoryItemNotFound', () => Effect.succeed(null)),
          ),
        ),
    }))

  // ── inventoryItems — paginated connection with search/where/orderBy ────────
  builder.queryField('inventoryItems', t =>
    t.drizzleConnection({
      subGraphs: ['org'],
      type: 'inventoryItems',
      description: 'Paginated (relay) connection over an organization\'s inventory items, with optional free-text SKU search, filtering, and ordering. Always tenant-scoped; requires `inventory:read` in the given org.',
      // Org-scoped: the caller must hold `read` permission in the target org.
      // Listing is always bounded to a single organization (below) so it never
      // spans tenants.
      authScopes: (_parent, args) => ({
        permission: {
          resource: 'inventory',
          actions: ['read'],
          organization: Number(args.organizationId.id),
        },
      }),
      args: {
        /** Organization to list within. Listing is always tenant-scoped. */
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose inventory items to list.' }),
        /** Free-text search across `sku` (case-insensitive substring). */
        search: t.arg.string({ description: 'Free-text search across SKU (case-insensitive substring).' }),
        where: t.arg({ type: 'InventoryItemWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['InventoryItemOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryService

            // Compose `search` into the where clause as an OR over sku using the
            // RQBv2 `ilike` operator. The user-supplied `where` is AND-ed via the
            // service's own filter merge.
            const searchClause = args.search?.trim()
              ? { sku: { ilike: `%${args.search.trim()}%` } }
              : null

            // Tenant boundary: always constrain to the requested org so the
            // listing can never cross organizations, regardless of `where`.
            const orgClause = { organizationId: Number(args.organizationId.id) }
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const clauses = [orgClause, userWhere, searchClause].filter(Boolean)
            const where = clauses.length === 1 ? clauses[0] : { AND: clauses }

            return yield* svc.findItems(query({
              where: where as any,
              // Fold the ordering clauses into ONE { column: direction } object.
              // @pothos/plugin-drizzle's cursor parser rejects an array of
              // single-key objects ("Typescript name not found for column
              // undefined"); only the object form hits its column branch.
              orderBy: args.orderBy?.length
                ? Object.fromEntries(args.orderBy.map(o => [o.field, o.direction]))
                : { createdAt: 'desc' },
            }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['org'] }, { subGraphs: ['org'] }))
}
