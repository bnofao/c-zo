import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { Effect } from 'effect'
import { UserService } from '../../../services/user'

// ─── User Queries ─────────────────────────────────────────────────────────────

export function registerUserQueries(builder: AuthGraphQLSchemaBuilder): void {
  // ── user(id) — single user by ID ─────────────────────────────────────────
  builder.queryField('user', t =>
    t.drizzleField({
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

  // ── users(connection) — paginated list with optional search ───────────────
  builder.queryField('users', t =>
    t.drizzleConnection({
      description: 'Returns a paginated connection of users, with optional full-text search, filtering, and ordering.',
      type: 'users',
      args: {
        search: t.arg.string({ description: 'Free-text term to search users by.' }),
        where: t.arg({ description: 'Filter conditions restricting which users are returned.', type: 'UserWhereInput' }),
        orderBy: t.arg({ description: 'Ordering criteria applied to the returned users.', type: ['UserOrderByInput'] }),
      },
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: async (query, _root, args, ctx) => {
        const program = Effect.gen(function* () {
          const svc = yield* UserService
          return yield* svc.findMany(query({
            where: args.where as any,
            orderBy: args.orderBy
              ? args.orderBy.map(o => ({ [o.field]: o.direction }))
              : undefined,
          }))
        })
        return ctx.runEffect(program)
      },
    }))
}
