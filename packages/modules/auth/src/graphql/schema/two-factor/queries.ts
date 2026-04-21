import { UnauthenticatedError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'

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
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const container = useContainer()
        const twoFactorService = await container.make('auth:twoFactor')
        const result = await (twoFactorService as any).getTotpUri(args.password, ctx.request?.headers)
        return result?.totpURI ?? result?.uri ?? null
      },
    }))
}
