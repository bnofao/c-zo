import type { AuthContext } from '@czo/auth/types'
import type { SchemaBuilder } from '@czo/kit/graphql'
import { UnauthenticatedError } from '@czo/kit/graphql'

interface Ctx { auth: AuthContext, request?: Request }

// ─── API Key Queries ──────────────────────────────────────────────────────────

export function registerApiKeyQueries(builder: SchemaBuilder): void {
  // ── apiKey(id) — single API key by ID ────────────────────────────────────
  builder.queryField('apiKey', t =>
    t.drizzleField({
      type: 'apikeys',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (query, _root: unknown, args: Record<string, unknown>, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any // db.query.* shape not available without full schema generic threading
        // Drizzle RQBv2: filter callback type (`TableFilter`) not publicly exported; cast required
        return db.query.apikeys.findFirst(query({ where: (k: any, { eq }: any) => eq(k.id, String(args.id)) } as any))
      },
    }))

  // ── myApiKeys — all API keys for the current user ─────────────────────────
  builder.queryField('myApiKeys', t =>
    t.drizzleField({
      type: ['apikeys'],
      authScopes: { loggedIn: true },
      resolve: async (query, _root: unknown, _args: unknown, ctx: Ctx) => {
        const authUser = ctx.auth?.user
        if (!authUser)
          throw new UnauthenticatedError()

        const { useDatabase } = await import('@czo/kit/db')
        const db = await useDatabase() as any // db.query.* shape not available without full schema generic threading
        // Drizzle RQBv2: filter callback type (`TableFilter`) not publicly exported; cast required
        return db.query.apikeys.findMany(query({ where: (k: any, { eq }: any) => eq(k.userId, String(authUser.id)) } as any))
      },
    }))
}
