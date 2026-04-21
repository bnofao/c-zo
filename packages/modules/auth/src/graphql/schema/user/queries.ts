import { useContainer } from '@czo/kit/ioc'

// ─── User Queries ─────────────────────────────────────────────────────────────

export function registerUserQueries(builder: any): void {
  // ── user(id) — single user by ID ─────────────────────────────────────────
  builder.queryField('user', (t: any) =>
    t.drizzleField({
      type: 'users',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: async (query: any, _root: any, args: any) => {
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any
        return db.query.users.findFirst(
          query({ where: (u: any, { eq }: any) => eq(u.id, String(args.id)) }),
        )
      },
    }))

  // ── users(connection) — paginated list with optional search ───────────────
  builder.queryField('users', (t: any) =>
    t.drizzleConnection({
      type: 'users',
      args: {
        search: t.arg.string({ required: false }),
        where: t.arg({ type: 'UserWhereInput', required: false }),
        orderBy: t.arg({ type: 'UserOrderByInput', required: false }),
      },
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: async (query: any, _root: any, args: any) => {
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any
        return db.query.users.findMany(
          query({
            where: args.search
              ? (u: any, { ilike }: any) => ilike(u.name, `%${args.search}%`)
              : undefined,
          }),
        )
      },
      edgesField: {},
    }))

  // ── userSessions(userId) — admin: list sessions for a user ────────────────
  // Direct Drizzle since sessions is not in authRelations
  builder.queryField('userSessions', (t: any) =>
    t.field({
      type: ['Session'],
      args: {
        userId: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: async (_root: any, args: any) => {
        const container = useContainer()
        const userService = await container.make('auth:users')
        const sessions = await (userService as any).listSessions(String(args.userId))
        return sessions ?? []
      },
    }))
}
