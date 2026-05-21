import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { decodeGlobalID } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { UserService } from '../../../services/user'

// ─── User Queries ─────────────────────────────────────────────────────────────

export function registerUserQueries(builder: AuthGraphQLSchemaBuilder): void {
  // ── user(id) — single user by ID ─────────────────────────────────────────
  builder.queryField('user', t =>
    t.drizzleField({
      type: 'users',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: async (_query, _root, args, ctx) => {
        const { id } = decodeGlobalID(args.id)
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
      type: 'users',
      args: {
        search: t.arg.string(),
        where: t.arg({ type: 'UserWhereInput' }),
        orderBy: t.arg({ type: ['UserOrderByInput'] }),
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
        return ctx.runEffect(program) as any
      },
    }))
}
