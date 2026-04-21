import type { AuthContext } from '@czo/auth/types'
import type { SchemaBuilder } from '@czo/kit/graphql'
import { UnauthenticatedError } from '@czo/kit/graphql'

interface Ctx { auth: AuthContext, request?: Request }

// ─── Account Queries ──────────────────────────────────────────────────────────

export function registerAccountQueries(builder: SchemaBuilder): void {
  // ── me — the currently authenticated user ─────────────────────────────────
  builder.queryField('me', t =>
    t.drizzleField({
      type: 'users',
      nullable: true,
      resolve: async (query, _root: unknown, _args: unknown, ctx: Ctx) => {
        const authUser = ctx.auth?.user
        if (!authUser)
          return null

        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any // db.query.* shape not available without full schema generic threading
        // Drizzle RQBv2: filter callback type (`TableFilter`) not publicly exported; cast required
        return db.query.users.findFirst(query({ where: (u: any, { eq }: any) => eq(u.id, String(authUser.id)) } as any))
      },
    }))

  // ── myAccounts — linked OAuth / credential accounts for the current user ──
  builder.queryField('myAccounts', t =>
    t.field({
      type: ['LinkedAccount'],
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, _args: unknown, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const result = await ctx.auth.accountService.listAccounts(ctx.request?.headers ?? new Headers())
        return result ?? []
      },
    }))

  // ── mySessions — active sessions for the current user ────────────────────
  // Uses MySession (not admin Session) — self-service view with token exposed
  builder.queryField('mySessions', t =>
    t.field({
      type: ['MySession'],
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, _args: unknown, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const result = await ctx.auth.sessionService.listSessions(ctx.request?.headers ?? new Headers())
        return result ?? []
      },
    }))

  // ── accountInfo — raw account info from better-auth ───────────────────────
  builder.queryField('accountInfo', t =>
    t.field({
      type: 'LinkedAccount',
      nullable: true,
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, _args: unknown, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        return ctx.auth.accountService.accountInfo(ctx.request?.headers ?? new Headers())
      },
    }))
}
