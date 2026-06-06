import type { ChannelGraphQLSchemaBuilder } from '@czo/channel/graphql'
import { Effect } from 'effect'
import { ChannelService } from '../../../services/channel'
import { loadOrganizationId } from './authz'

// ─── Channel Queries ──────────────────────────────────────────────────────────

export function registerChannelQueries(builder: ChannelGraphQLSchemaBuilder): void {
  // ── channel(id) — single channel by global ID ──────────────────────────────
  // `t.drizzleField`'s `query` builder threads the Pothos selection set into
  // the RQBv2 config; we forward that config to the service so soft-delete
  // filtering AND selection-aware reads both apply.
  builder.queryField('channel', t =>
    t.drizzleField({
      type: 'channels',
      nullable: true,
      args: {
        id: t.arg.globalID({ for: 'Channel', required: true }),
      },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadOrganizationId(ctx, Number(args.id.id))
        // Unknown id → require auth and let the nullable field resolve to null
        // (the service NotFound is collapsed below), rather than a gate 403.
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'channel', actions: ['read'], organization } }
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
      type: 'channels',
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
        organizationId: t.arg.globalID({ for: 'Organization', required: true }),
        /** Free-text search across `name` and `handle` (case-insensitive substring). */
        search: t.arg.string(),
        where: t.arg({ type: 'ChannelWhereInput' }),
        orderBy: t.arg({ type: ['ChannelOrderByInput'] }),
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
    }))
}
