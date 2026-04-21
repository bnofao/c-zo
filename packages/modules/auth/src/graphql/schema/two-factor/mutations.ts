import type { AuthContext } from '@czo/auth/types'
import type { SchemaBuilder } from '@czo/kit/graphql'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { BackupCodeInvalidError, TotpVerificationFailedError, TwoFactorNotEnabledError } from './errors'

interface Ctx { auth: AuthContext, request?: Request }

// ─── Two-Factor Mutations ─────────────────────────────────────────────────────

export function registerTwoFactorMutations(builder: SchemaBuilder): void {
  // ── enableTwoFactor ───────────────────────────────────────────────────────
  builder.mutationField('enableTwoFactor', t =>
    t.field({
      type: 'String',
      nullable: true,
      errors: { types: [UnauthenticatedError, ValidationError] },
      args: {
        password: t.arg.string({ required: true }),
        issuer: t.arg.string({ required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { password: string, issuer?: string | null }, ctx: Ctx) => {
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
  builder.mutationField('disableTwoFactor', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [UnauthenticatedError, TwoFactorNotEnabledError] },
      args: {
        password: t.arg.string({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { password: string }, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.twoFactorService.disable(args.password, ctx.request?.headers ?? new Headers())

        await publishAuthEvent(AUTH_EVENTS.TWO_FA_DISABLED, { userId: ctx.auth.user.id })

        return true
      },
    }))

  // ── verifyTotp ────────────────────────────────────────────────────────────
  builder.mutationField('verifyTotp', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, TotpVerificationFailedError] },
      args: {
        input: t.arg({ type: 'VerifyTotpInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { input: { code: string, trustDevice?: boolean } }, ctx: Ctx) => {
        await ctx.auth.twoFactorService.verifyTotp(args.input, ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── verifyOtp ─────────────────────────────────────────────────────────────
  builder.mutationField('verifyOtp', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, TotpVerificationFailedError] },
      args: {
        input: t.arg({ type: 'VerifyOtpInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { input: { code: string, trustDevice?: boolean } }, ctx: Ctx) => {
        await ctx.auth.twoFactorService.verifyOtp(args.input, ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── sendOtp ───────────────────────────────────────────────────────────────
  builder.mutationField('sendOtp', t =>
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
  builder.mutationField('verifyBackupCode', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, BackupCodeInvalidError] },
      args: {
        input: t.arg({ type: 'VerifyBackupCodeInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { input: { code: string, disableSession?: boolean, trustDevice?: boolean } }, ctx: Ctx) => {
        await ctx.auth.twoFactorService.verifyBackupCode(args.input, ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── generateBackupCodes ───────────────────────────────────────────────────
  builder.mutationField('generateBackupCodes', t =>
    t.field({
      type: ['String'],
      errors: { types: [UnauthenticatedError, TwoFactorNotEnabledError] },
      args: {
        password: t.arg.string({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { password: string }, ctx: Ctx) => {
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
