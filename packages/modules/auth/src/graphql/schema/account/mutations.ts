import type { AuthContext } from '@czo/auth/types'
import { NotFoundError, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { CannotUnlinkLastAccountError, PasswordMismatchError } from './errors'
import { changeEmailSchema, changePasswordSchema, deleteAccountSchema, updateProfileSchema } from './inputs'

interface Ctx { auth: AuthContext, request?: Request }

// ─── Account Mutations ────────────────────────────────────────────────────────

export function registerAccountMutations(builder: any): void {
  // ── changeEmail ───────────────────────────────────────────────────────────
  builder.mutationField('changeEmail', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, UnauthenticatedError] },
      args: {
        input: t.arg({ type: 'ChangeEmailInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const parsed = changeEmailSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        await ctx.auth.accountService.changeEmail(parsed.data, ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── changePassword ────────────────────────────────────────────────────────
  builder.mutationField('changePassword', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, UnauthenticatedError, PasswordMismatchError] },
      args: {
        input: t.arg({ type: 'ChangePasswordInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const parsed = changePasswordSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        await ctx.auth.accountService.changePassword(parsed.data, ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── revokeMySession ───────────────────────────────────────────────────────
  builder.mutationField('revokeMySession', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [UnauthenticatedError] },
      args: {
        token: t.arg.string({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.sessionService.revoke(args.token, ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── revokeOtherSessions ───────────────────────────────────────────────────
  builder.mutationField('revokeOtherSessions', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [UnauthenticatedError] },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, _args: unknown, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.sessionService.revokeOtherSessions(ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── unlinkAccount ─────────────────────────────────────────────────────────
  builder.mutationField('unlinkAccount', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, UnauthenticatedError, CannotUnlinkLastAccountError] },
      args: {
        providerId: t.arg.string({ required: true }),
        accountId: t.arg.string({ required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.accountService.unlinkAccount(
          { providerId: args.providerId, accountId: args.accountId ?? undefined },
          ctx.request?.headers ?? new Headers(),
        )
        return true
      },
    }))

  // ── updateProfile ─────────────────────────────────────────────────────────
  builder.mutationField('updateProfile', (t: any) =>
    t.field({
      type: 'User',
      errors: { types: [ValidationError, UnauthenticatedError] },
      args: {
        input: t.arg({ type: 'UpdateProfileInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const parsed = updateProfileSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const result = await ctx.auth.accountService.updateProfile(parsed.data, ctx.request?.headers ?? new Headers())
        if (!result)
          throw new NotFoundError('User', ctx.auth.user.id)
        return (result as any).user ?? result
      },
    }))

  // ── deleteAccount ─────────────────────────────────────────────────────────
  builder.mutationField('deleteAccount', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, UnauthenticatedError] },
      args: {
        input: t.arg({ type: 'DeleteAccountInput', required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const parsed = deleteAccountSchema.safeParse(args.input ?? {})
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        await ctx.auth.accountService.deleteAccount(ctx.auth.user.id)
        return true
      },
    }))
}
