import { UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import { verifyBackupCodeSchema, verifyOtpSchema, verifyTotpSchema } from './inputs'
import { BackupCodeInvalidError, TotpVerificationFailedError, TwoFactorNotEnabledError } from './errors'

// ─── Two-Factor Mutations ─────────────────────────────────────────────────────

export function registerTwoFactorMutations(builder: any): void {
  // ── enableTwoFactor ───────────────────────────────────────────────────────
  builder.mutationField('enableTwoFactor', (t: any) =>
    t.field({
      type: 'String',
      nullable: true,
      errors: { types: [UnauthenticatedError, ValidationError] },
      args: {
        password: t.arg.string({ required: true }),
        issuer: t.arg.string({ required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user) throw new UnauthenticatedError()

        const container = useContainer()
        const twoFactorService = await container.make('auth:twoFactor')
        const result = await (twoFactorService as any).enable(
          { password: args.password, issuer: args.issuer ?? undefined },
          ctx.request?.headers,
        )
        // Return the TOTP URI (for QR scanning) if present
        return (result as any)?.totpURI ?? (result as any)?.uri ?? null
      },
    }),
  )

  // ── disableTwoFactor ──────────────────────────────────────────────────────
  builder.mutationField('disableTwoFactor', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [UnauthenticatedError, TwoFactorNotEnabledError] },
      args: {
        password: t.arg.string({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user) throw new UnauthenticatedError()

        const container = useContainer()
        const twoFactorService = await container.make('auth:twoFactor')
        await (twoFactorService as any).disable(args.password, ctx.request?.headers)
        return true
      },
    }),
  )

  // ── verifyTotp ────────────────────────────────────────────────────────────
  builder.mutationField('verifyTotp', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, TotpVerificationFailedError] },
      args: {
        input: t.arg({ type: 'VerifyTotpInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const parsed = verifyTotpSchema.safeParse(args.input)
        if (!parsed.success) throw ValidationError.fromZod(parsed.error)

        const container = useContainer()
        const twoFactorService = await container.make('auth:twoFactor')
        await (twoFactorService as any).verifyTotp(parsed.data, ctx.request?.headers)
        return true
      },
    }),
  )

  // ── verifyOtp ─────────────────────────────────────────────────────────────
  builder.mutationField('verifyOtp', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, TotpVerificationFailedError] },
      args: {
        input: t.arg({ type: 'VerifyOtpInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const parsed = verifyOtpSchema.safeParse(args.input)
        if (!parsed.success) throw ValidationError.fromZod(parsed.error)

        const container = useContainer()
        const twoFactorService = await container.make('auth:twoFactor')
        await (twoFactorService as any).verifyOtp(parsed.data, ctx.request?.headers)
        return true
      },
    }),
  )

  // ── sendOtp ───────────────────────────────────────────────────────────────
  builder.mutationField('sendOtp', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [UnauthenticatedError] },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, _args: any, ctx: any) => {
        if (!(ctx as any).auth?.user) throw new UnauthenticatedError()

        const container = useContainer()
        const twoFactorService = await container.make('auth:twoFactor')
        await (twoFactorService as any).sendOtp(ctx.request?.headers)
        return true
      },
    }),
  )

  // ── verifyBackupCode ──────────────────────────────────────────────────────
  builder.mutationField('verifyBackupCode', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, BackupCodeInvalidError] },
      args: {
        input: t.arg({ type: 'VerifyBackupCodeInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const parsed = verifyBackupCodeSchema.safeParse(args.input)
        if (!parsed.success) throw ValidationError.fromZod(parsed.error)

        const container = useContainer()
        const twoFactorService = await container.make('auth:twoFactor')
        await (twoFactorService as any).verifyBackupCode(parsed.data, ctx.request?.headers)
        return true
      },
    }),
  )

  // ── generateBackupCodes ───────────────────────────────────────────────────
  builder.mutationField('generateBackupCodes', (t: any) =>
    t.field({
      type: ['String'],
      errors: { types: [UnauthenticatedError, TwoFactorNotEnabledError] },
      args: {
        password: t.arg.string({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user) throw new UnauthenticatedError()

        const container = useContainer()
        const twoFactorService = await container.make('auth:twoFactor')
        const result = await (twoFactorService as any).generateBackupCodes(
          args.password,
          ctx.request?.headers,
        )
        return (result as any)?.backupCodes ?? result ?? []
      },
    }),
  )
}
