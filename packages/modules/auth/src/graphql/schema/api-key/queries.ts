import { NotFoundError, UnauthenticatedError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'

// ─── API Key Queries ──────────────────────────────────────────────────────────

export function registerApiKeyQueries(builder: any): void {
  // ── apiKey(id) — single API key by ID ────────────────────────────────────
  builder.queryField('apiKey', (t: any) =>
    t.drizzleField({
      type: 'apikeys',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (query: any, _root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user) throw new UnauthenticatedError()

        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase()
        return db.query.apikeys.findFirst(
          query({ where: (k: any, { eq }: any) => eq(k.id, String(args.id)) }),
        )
      },
    }),
  )

  // ── myApiKeys — all API keys for the current user ─────────────────────────
  builder.queryField('myApiKeys', (t: any) =>
    t.drizzleField({
      type: ['apikeys'],
      authScopes: { loggedIn: true },
      resolve: async (query: any, _root: any, _args: any, ctx: any) => {
        const authUser = (ctx as any).auth?.user
        if (!authUser) throw new UnauthenticatedError()

        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase()
        return db.query.apikeys.findMany(
          query({ where: (k: any, { eq }: any) => eq(k.userId, String(authUser.id)) }),
        )
      },
    }),
  )
}
