import type { AuthContext } from '@czo/auth/types'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { BackupCodeInvalidError, TotpVerificationFailedError, TwoFactorNotEnabledError } from './errors'
import { verifyBackupCodeSchema, verifyOtpSchema, verifyTotpSchema } from './inputs'

interface Ctx { auth: AuthContext, request?: Request }

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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const result = await ctx.auth.twoFactorService.enable(
          { password: args.password, issuer: args.issuer ?? undefined },
          ctx.request?.headers ?? new Headers(),
        )

        await publishAuthEvent(AUTH_EVENTS.TWO_FA_ENABLED, { userId: ctx.auth.user.id })

        // Return the TOTP URI (for QR scanning) if present
        return (result as any)?.totpURI ?? (result as any)?.uri ?? null
      },
    }))

  // ── disableTwoFactor ──────────────────────────────────────────────────────
  builder.mutationField('disableTwoFactor', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [UnauthenticatedError, TwoFactorNotEnabledError] },
      args: {
        password: t.arg.string({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.twoFactorService.disable(args.password, ctx.request?.headers ?? new Headers())

        await publishAuthEvent(AUTH_EVENTS.TWO_FA_DISABLED, { userId: ctx.auth.user.id })

        return true
      },
    }))

  // ── verifyTotp ────────────────────────────────────────────────────────────
  builder.mutationField('verifyTotp', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, TotpVerificationFailedError] },
      args: {
        input: t.arg({ type: 'VerifyTotpInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        const parsed = verifyTotpSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        await ctx.auth.twoFactorService.verifyTotp(parsed.data, ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── verifyOtp ─────────────────────────────────────────────────────────────
  builder.mutationField('verifyOtp', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, TotpVerificationFailedError] },
      args: {
        input: t.arg({ type: 'VerifyOtpInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        const parsed = verifyOtpSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        await ctx.auth.twoFactorService.verifyOtp(parsed.data, ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── sendOtp ───────────────────────────────────────────────────────────────
  builder.mutationField('sendOtp', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [UnauthenticatedError] },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, _args: unknown, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.twoFactorService.sendOtp(ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── verifyBackupCode ──────────────────────────────────────────────────────
  builder.mutationField('verifyBackupCode', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, BackupCodeInvalidError] },
      args: {
        input: t.arg({ type: 'VerifyBackupCodeInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        const parsed = verifyBackupCodeSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        await ctx.auth.twoFactorService.verifyBackupCode(parsed.data, ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── generateBackupCodes ───────────────────────────────────────────────────
  builder.mutationField('generateBackupCodes', (t: any) =>
    t.field({
      type: ['String'],
      errors: { types: [UnauthenticatedError, TwoFactorNotEnabledError] },
      args: {
        password: t.arg.string({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const result = await ctx.auth.twoFactorService.generateBackupCodes(
          args.password,
          ctx.request?.headers ?? new Headers(),
        )
        return (result as any)?.backupCodes ?? result ?? []
      },
    }))
}
