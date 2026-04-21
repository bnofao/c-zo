import type { AuthContext } from '@czo/auth/types'
import type { SchemaBuilder } from '@czo/kit/graphql'
import { NotFoundError, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { CannotUnlinkLastAccountError, PasswordMismatchError } from './errors'

interface Ctx { auth: AuthContext, request?: Request }

// ─── Account Mutations ────────────────────────────────────────────────────────

export function registerAccountMutations(builder: SchemaBuilder): void {
  // ── changeEmail ───────────────────────────────────────────────────────────
  builder.mutationField('changeEmail', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, UnauthenticatedError] },
      args: {
        input: t.arg({ type: 'ChangeEmailInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { input: { newEmail: string, callbackURL?: string } }, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.accountService.changeEmail(args.input, ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── changePassword ────────────────────────────────────────────────────────
  builder.mutationField('changePassword', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, UnauthenticatedError, PasswordMismatchError] },
      args: {
        input: t.arg({ type: 'ChangePasswordInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { input: { currentPassword: string, newPassword: string, revokeOtherSessions?: boolean } }, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.accountService.changePassword(args.input, ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── revokeMySession ───────────────────────────────────────────────────────
  builder.mutationField('revokeMySession', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [UnauthenticatedError] },
      args: {
        token: t.arg.string({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { token: string }, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.sessionService.revoke(args.token, ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── revokeOtherSessions ───────────────────────────────────────────────────
  builder.mutationField('revokeOtherSessions', t =>
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
  builder.mutationField('unlinkAccount', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, UnauthenticatedError, CannotUnlinkLastAccountError] },
      args: {
        providerId: t.arg.string({ required: true }),
        accountId: t.arg.string({ required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { providerId: string, accountId?: string | null }, ctx: Ctx) => {
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
  builder.mutationField('updateProfile', t =>
    t.field({
      type: 'User',
      errors: { types: [ValidationError, UnauthenticatedError] },
      args: {
        input: t.arg({ type: 'UpdateProfileInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { input: { name?: string, image?: string } }, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const result = await ctx.auth.accountService.updateProfile(args.input, ctx.request?.headers ?? new Headers())
        if (!result)
          throw new NotFoundError('User', ctx.auth.user.id)
        return (result as any).user ?? result
      },
    }))

  // ── deleteAccount ─────────────────────────────────────────────────────────
  builder.mutationField('deleteAccount', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [ValidationError, UnauthenticatedError] },
      args: {
        input: t.arg({ type: 'DeleteAccountInput', required: false }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, _args: unknown, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.accountService.deleteAccount(ctx.auth.user.id)
        return true
      },
    }))
}
