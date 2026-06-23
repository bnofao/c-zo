import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { Effect } from 'effect'
import { UserService } from '../../../services/user'

// ─── User Queries ─────────────────────────────────────────────────────────────

export function registerUserQueries(builder: AuthGraphQLSchemaBuilder): void {
  // ── user(id) — single user by ID ─────────────────────────────────────────
  builder.queryField('user', t =>
    t.drizzleField({
      subGraphs: ['admin'],
      description: 'Fetches a single user by their global ID, returning null if no such user exists.',
      type: 'users',
      nullable: true,
      args: {
        id: t.arg.globalID({ description: 'Global ID of the user to fetch.', for: 'User', required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: async (_query, _root, args, ctx) => {
        const id = args.id.id
        // Treat UserNotFound as null (query semantics) — only DB errors propagate.
        const program = Effect.gen(function* () {
          const svc = yield* UserService
          return yield* svc.findFirst({ where: { id: Number(id) } })
        }).pipe(Effect.catchTag('UserNotFound', () => Effect.succeed(null)))
        return ctx.runEffect(program)
      },
    }))

  // ── me — the current authenticated principal (viewer) ─────────────────────
  builder.queryField('me', t =>
    t.field({
      type: 'User',
      nullable: true,
      subGraphs: ['account', 'admin'],
      description: 'The currently authenticated user (viewer), or null when the request is anonymous. Reads the resolved session principal; any authenticated caller may read itself.',
      resolve: (_root, _args, ctx) => (ctx.auth?.user ?? null) as never,
    }))

  // ── userCounts — per-tab totals for the admin user list ───────────────────
  builder.queryField('userCounts', t =>
    t.field({
      type: 'UserCounts',
      subGraphs: ['admin'],
      description: 'Live user totals per admin filter bucket (all/admins/unverified/banned), independent of pagination, search, or the active tab.',
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: (_root, _args, ctx) => ctx.runEffect(Effect.gen(function* () {
        const svc = yield* UserService
        return yield* svc.counts()
      })) as never,
    }))

  // ── users(connection) — paginated list with optional search ───────────────
  builder.queryField('users', t =>
    t.drizzleConnection({
      subGraphs: ['admin'],
      description: 'Returns a paginated connection of users, with optional full-text search, filtering, and ordering.',
      type: 'users',
      args: {
        search: t.arg.string({ description: 'Free-text term to search users by.' }),
        where: t.arg({ description: 'Filter conditions restricting which users are returned.', type: 'UserWhereInput' }),
        orderBy: t.arg({ description: 'Ordering criteria applied to the returned users.', type: ['UserOrderByInput'] }),
      },
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: async (query, _root, args, ctx) => {
        // Free-text search: fold `args.search` into an RQBv2 OR clause over the
        // user-facing text columns, mirroring the product module's convention
        // (`{ OR: [{ col: { ilike: `%term%` } }, ...] }`). AND-merge it with the
        // structured `where` so search narrows, never replaces, the filters.
        const s = args.search?.trim()
        const searchClause = s
          ? { OR: [{ name: { ilike: `%${s}%` } }, { email: { ilike: `%${s}%` } }] }
          : null
        const where = { AND: [args.where, searchClause].filter(Boolean) }
        const program = Effect.gen(function* () {
          const svc = yield* UserService
          return yield* svc.findMany(query({
            where: where as any,
            // Fold the clauses into a single object: plugin-drizzle's cursor
            // parser expects the RQB object form (`{ createdAt: 'desc' }`), not
            // an array of single-key objects (which crashes `parseOrderBy`).
            orderBy: args.orderBy?.length
              ? Object.fromEntries(args.orderBy.map(o => [o.field, o.direction]))
              : undefined,
          }))
        })
        return ctx.runEffect(program)
      },
    }, { subGraphs: ['admin'] }, { subGraphs: ['admin'] }))
}
