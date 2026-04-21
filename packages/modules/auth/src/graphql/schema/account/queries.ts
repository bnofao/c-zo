import { UnauthenticatedError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'

// ─── Account Queries ──────────────────────────────────────────────────────────

export function registerAccountQueries(builder: any): void {
  // ── me — the currently authenticated user ─────────────────────────────────
  builder.queryField('me', (t: any) =>
    t.drizzleField({
      type: 'users',
      nullable: true,
      resolve: async (query: any, _root: any, _args: any, ctx: any) => {
        const authUser = (ctx as any).auth?.user
        if (!authUser)
          return null

        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any
        return db.query.users.findFirst(
          query({ where: (u: any, { eq }: any) => eq(u.id, String(authUser.id)) }),
        )
      },
    }))

  // ── myAccounts — linked OAuth / credential accounts for the current user ──
  builder.queryField('myAccounts', (t: any) =>
    t.field({
      type: ['LinkedAccount'],
      authScopes: { loggedIn: true },
      resolve: async (_root: any, _args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const container = useContainer()
        const accountService = await container.make('auth:accounts')
        const result = await (accountService as any).listAccounts(ctx.request?.headers)
        return result ?? []
      },
    }))

  // ── mySessions — active sessions for the current user ────────────────────
  // Uses MySession (not admin Session) — self-service view with token exposed
  builder.queryField('mySessions', (t: any) =>
    t.field({
      type: ['MySession'],
      authScopes: { loggedIn: true },
      resolve: async (_root: any, _args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const container = useContainer()
        const sessionService = await container.make('auth:sessions')
        const result = await (sessionService as any).listSessions(ctx.request?.headers)
        return result ?? []
      },
    }))

  // ── accountInfo — raw account info from better-auth ───────────────────────
  builder.queryField('accountInfo', (t: any) =>
    t.field({
      type: 'LinkedAccount',
      nullable: true,
      authScopes: { loggedIn: true },
      resolve: async (_root: any, _args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const container = useContainer()
        const accountService = await container.make('auth:accounts')
        return (accountService as any).accountInfo(ctx.request?.headers)
      },
    }))
}
