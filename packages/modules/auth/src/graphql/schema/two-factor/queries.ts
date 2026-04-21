import type { AuthContext } from '@czo/auth/types'
import { UnauthenticatedError } from '@czo/kit/graphql'

interface Ctx { auth: AuthContext, request?: Request }

// ─── Two-Factor Queries ───────────────────────────────────────────────────────

export function registerTwoFactorQueries(builder: any): void {
  // ── totpUri — get the TOTP URI for QR code generation ────────────────────
  builder.queryField('totpUri', (t: any) =>
    t.field({
      type: 'String',
      nullable: true,
      args: {
        password: t.arg.string({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const result = await ctx.auth.twoFactorService.getTotpUri(args.password, ctx.request?.headers ?? new Headers())
        return (result as any)?.totpURI ?? (result as any)?.uri ?? null
      },
    }))
}
