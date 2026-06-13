import type { ChannelGraphQLSchemaBuilder } from '@czo/channel/graphql'
import { Effect } from 'effect'
import { ChannelService } from '../../../services/channel'
import { channelPermission, channelTierScope, loadChannelTier } from './authz'

// ─── Channel Queries ──────────────────────────────────────────────────────────

export function registerChannelQueries(builder: ChannelGraphQLSchemaBuilder): void {
  // ── channel(id) — single channel by global ID ──────────────────────────────
  // `t.drizzleField`'s `query` builder threads the Pothos selection set into
  // the RQBv2 config; we forward that config to the service so soft-delete
  // filtering AND selection-aware reads both apply.
  builder.queryField('channel', t =>
    t.drizzleField({
      subGraphs: ['org', 'admin'],
      type: 'channels',
      nullable: true,
      description: 'Fetch a single channel by id. Requires `channel:read` in the channel\'s owning organization. Returns null if not found or soft-deleted.',
      args: {
        id: t.arg.globalID({ for: 'Channel', required: true, description: 'Relay global id of the Channel to fetch.' }),
      },
      authScopes: async (_parent, args, ctx) => {
        // Tier-aware: platform rows (org null) gate on the GLOBAL `channel:read`
        // role, org rows on `channel:read` in their org. Unknown id (undefined)
        // → `{ auth: true }` so the nullable field resolves to null (NotFound is
        // collapsed below), never a gate 403.
        const tier = await loadChannelTier(ctx, Number(args.id.id))
        return channelTierScope(tier, 'read')
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelService
            return yield* svc.findFirst(query({ where: { id: Number(args.id.id) } }))
          }).pipe(
            // Service surfaces `ChannelNotFound`; the GraphQL field is
            // nullable, so we collapse that specific failure to `null`.
            Effect.catchTag('ChannelNotFound', () => Effect.succeed(null)),
          ),
        ),
    }))

  // ── channels — paginated connection with search/where/orderBy ────────────
  builder.queryField('channels', t =>
    t.drizzleConnection({
      subGraphs: ['org'],
      type: 'channels',
      description: 'Paginated (relay) connection over an organization\'s channels, with optional free-text search, filtering, and ordering. Always tenant-scoped; requires `channel:read` in the given org.',
      // Org-scoped: the caller must hold `read` permission in the target org.
      // Listing is always bounded to a single organization (below) so it never
      // spans tenants.
      authScopes: (_parent, args) => ({
        permission: {
          resource: 'channel',
          actions: ['read'],
          organization: Number(args.organizationId.id),
        },
      }),
      args: {
        /** Organization to list within. Listing is always tenant-scoped. */
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose channels to list.' }),
        /** Free-text search across `name` and `handle` (case-insensitive substring). */
        search: t.arg.string({ description: 'Free-text search across name and handle (case-insensitive substring).' }),
        where: t.arg({ type: 'ChannelWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['ChannelOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelService

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
    }, { subGraphs: ['org'] }, { subGraphs: ['org'] }))

  // ── platformChannels — paginated connection over platform-wide channels ───
  builder.queryField('platformChannels', t =>
    t.drizzleConnection({
      subGraphs: ['admin'],
      type: 'channels',
      description: 'Lists platform-wide channels (no owning organization), with optional free-text search, filtering, and ordering. Requires the global `channel:read` role.',
      // Platform-tier: gated on the GLOBAL `channel:read` role (no org). Listing
      // is always bounded to platform rows (org null) so it never spans tenants.
      authScopes: channelPermission('read', null),
      args: {
        /** Free-text search across `name` and `handle` (case-insensitive substring). */
        search: t.arg.string({ description: 'Free-text search across name and handle (case-insensitive substring).' }),
        where: t.arg({ type: 'ChannelWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['ChannelOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelService

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

            // Platform boundary: always constrain to rows with no owning org so
            // the listing only ever returns platform-tier channels.
            const platformClause = { organizationId: { isNull: true } }
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const clauses = [platformClause, userWhere, searchClause].filter(Boolean)
            const where = clauses.length === 1 ? clauses[0] : { AND: clauses }

            return yield* svc.findMany(query({
              where: where as any,
              orderBy: args.orderBy?.length
                ? args.orderBy.map(o => ({ [o.field]: o.direction }))
                : { createdAt: 'desc' },
            }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['admin'] }, { subGraphs: ['admin'] }))
}
