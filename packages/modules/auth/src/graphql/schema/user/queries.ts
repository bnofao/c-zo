import type { AuthContext } from '@czo/auth/types'
import type { SchemaBuilder } from '@czo/kit/graphql'

interface Ctx { auth: AuthContext, request?: Request }

// ─── User Queries ─────────────────────────────────────────────────────────────

export function registerUserQueries(builder: SchemaBuilder): void {
  // ── user(id) — single user by ID ─────────────────────────────────────────
  builder.queryField('user', t =>
    t.drizzleField({
      type: 'users',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: async (query, _root: unknown, args: Record<string, unknown>) => {
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any // db.query.* shape not available without full schema generic threading
        // Drizzle RQBv2: filter callback type (`TableFilter`) not publicly exported; cast required
        return db.query.users.findFirst(query({ where: (u: any, { eq }: any) => eq(u.id, String(args.id)) } as any))
      },
    }))

  // ── users(connection) — paginated list with optional search ───────────────
  builder.queryField('users', t =>
    t.drizzleConnection({
      type: 'users',
      args: {
        search: t.arg.string({ required: false }),
        where: t.arg({ type: 'UserWhereInput', required: false }),
        orderBy: t.arg({ type: 'UserOrderByInput', required: false }),
      },
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: async (query, _root: unknown, args: any) => { // Pothos drizzleConnection args: complex inferred type requires any here
        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any // db.query.* shape not available without full schema generic threading
        const search = args.search as string | null | undefined
        // Drizzle RQBv2: filter callback type (`TableFilter`) not publicly exported; cast required
        return db.query.users.findMany(query({
          where: search
            ? (u: any, { ilike }: any) => ilike(u.name, `%${search}%`)
            : undefined,
        } as any))
      },
      edgesField: {},
    }))

  // ── userSessions(userId) — admin: list sessions for a user ────────────────
  // Direct Drizzle since sessions is not in authRelations
  builder.queryField('userSessions', t =>
    t.field({
      type: ['Session'],
      args: {
        userId: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: async (_root: unknown, args: Record<string, unknown>, ctx: Ctx) => {
        const sessions = await ctx.auth.userService.listSessions(String(args.userId))
        return sessions ?? []
      },
    }))
}
