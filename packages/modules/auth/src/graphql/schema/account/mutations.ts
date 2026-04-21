import { NotFoundError, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import { CannotUnlinkLastAccountError, PasswordMismatchError } from './errors'
import { changeEmailSchema, changePasswordSchema, deleteAccountSchema, updateProfileSchema } from './inputs'

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
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const parsed = changeEmailSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const container = useContainer()
        const accountService = await container.make('auth:accounts')
        await (accountService as any).changeEmail(parsed.data, ctx.request?.headers)
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
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const parsed = changePasswordSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const container = useContainer()
        const accountService = await container.make('auth:accounts')
        await (accountService as any).changePassword(parsed.data, ctx.request?.headers)
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
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const container = useContainer()
        const sessionService = await container.make('auth:sessions')
        await (sessionService as any).revoke(args.token, ctx.request?.headers)
        return true
      },
    }))

  // ── revokeOtherSessions ───────────────────────────────────────────────────
  builder.mutationField('revokeOtherSessions', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [UnauthenticatedError] },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, _args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const container = useContainer()
        const sessionService = await container.make('auth:sessions')
        await (sessionService as any).revokeOtherSessions(ctx.request?.headers)
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
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const container = useContainer()
        const accountService = await container.make('auth:accounts')
        await (accountService as any).unlinkAccount(
          { providerId: args.providerId, accountId: args.accountId ?? undefined },
          ctx.request?.headers,
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
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const parsed = updateProfileSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const container = useContainer()
        const accountService = await container.make('auth:accounts')
        const result = await (accountService as any).updateProfile(parsed.data, ctx.request?.headers)
        if (!result)
          throw new NotFoundError('User', (ctx as any).auth.user.id)
        return result.user ?? result
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
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const parsed = deleteAccountSchema.safeParse(args.input ?? {})
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const container = useContainer()
        const accountService = await container.make('auth:accounts')
        await (accountService as any).deleteAccount(parsed.data, ctx.request?.headers)
        return true
      },
    }))
}
