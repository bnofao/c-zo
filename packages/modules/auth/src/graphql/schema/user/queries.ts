import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { Effect } from 'effect'
import { AccessService } from '../../../services/access'
import { UserService } from '../../../services/user'

// Position-independent CSV membership for the `admin` role element, expressed in
// the RQBv2 object DSL (the relay connection `where` only accepts object form,
// not raw SQL). Logically equivalent to `UserService.counts()`'s
// `'admin' = ANY(string_to_array(role,','))` — keep the two in sync (a divergence
// is exactly the count/list mismatch this guards against; covered by a test).
const ADMIN_ROLE_MATCH = [
  { eq: 'admin' },
  { like: 'admin,%' },
  { like: '%,admin' },
  { like: '%,admin,%' },
] as const

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

  // ── roleHierarchies — assignable role registry for the admin role picker ───
  // `organization` roles live on `members.role` (per-membership, not global), and
  // `api-key` roles gate API-key management rather than backoffice access — neither
  // belongs in the user role picker, so both are excluded.
  const EXCLUDED_ROLE_DOMAINS = new Set(['organization', 'api-key'])
  builder.queryField('roleHierarchies', t =>
    t.field({
      type: ['RoleHierarchy'],
      subGraphs: ['admin'],
      description: 'Registered global platform-role hierarchies and their assignable tiers, for the admin role picker. Excludes the per-organization `organization` and the `api-key` hierarchies.',
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: (_root, _args, ctx) => ctx.runEffect(Effect.gen(function* () {
        const access = yield* AccessService
        const hs = yield* access.hierarchies
        return hs
          .filter(h => !EXCLUDED_ROLE_DOMAINS.has(h.name))
          .map(h => ({ name: h.name, tiers: h.hierarchy.map(l => ({ name: l.name })) }))
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
        admin: t.arg.boolean({ description: 'Filter by admin-role membership: true → only users whose role set includes "admin"; false → only non-admins (incl. roleless users); omitted → no role filter. Matches the userCounts `admins` bucket.' }),
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
        // Admin-role membership filter (CSV-aware): true → has 'admin'; false →
        // not an admin (roleless users included via `isNull`). Matches `counts`.
        const adminClause = args.admin == null
          ? null
          : args.admin
            ? { role: { OR: ADMIN_ROLE_MATCH } }
            : { OR: [{ role: { isNull: true } }, { role: { NOT: { OR: ADMIN_ROLE_MATCH } } }] }
        const where = { AND: [args.where, searchClause, adminClause].filter(Boolean) }
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
