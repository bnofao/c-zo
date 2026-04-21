import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import { CannotBanSelfError, CannotDemoteSelfError, UserAlreadyBannedError } from './errors'
import { createUserSchema, updateUserSchema } from './inputs'

// ─── User Mutations ───────────────────────────────────────────────────────────

export function registerUserMutations(builder: any): void {
  // ── createUser ────────────────────────────────────────────────────────────
  builder.mutationField('createUser', (t: any) =>
    t.field({
      type: 'User',
      errors: { types: [ValidationError, NotFoundError] },
      args: {
        input: t.arg({ type: 'CreateUserInput', required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['create'] } },
      resolve: async (_root: any, args: any, ctx: any) => {
        const parsed = createUserSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const container = useContainer()
        const userService = await container.make('auth:users')
        const result = await (userService as any).create(parsed.data, ctx.request?.headers)
        if (!result)
          throw new NotFoundError('User', 'created')
        return result
      },
    }))

  // ── updateUser ────────────────────────────────────────────────────────────
  builder.mutationField('updateUser', (t: any) =>
    t.field({
      type: 'User',
      errors: { types: [ValidationError, NotFoundError] },
      args: {
        id: t.arg.id({ required: true }),
        input: t.arg({ type: 'UpdateUserInput', required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['update'] } },
      resolve: async (_root: any, args: any, ctx: any) => {
        const parsed = updateUserSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const container = useContainer()
        const userService = await container.make('auth:users')
        const result = await (userService as any).update(
          { userId: String(args.id), data: parsed.data },
          ctx.request?.headers,
        )
        if (!result)
          throw new NotFoundError('User', String(args.id))
        return result.user ?? result
      },
    }))

  // ── banUser ───────────────────────────────────────────────────────────────
  builder.mutationField('banUser', (t: any) =>
    t.field({
      type: 'User',
      errors: { types: [NotFoundError, ForbiddenError, CannotBanSelfError, UserAlreadyBannedError] },
      args: {
        id: t.arg.id({ required: true }),
        reason: t.arg.string({ required: false }),
        expiresIn: t.arg.int({ required: false }),
      },
      authScopes: { permission: { resource: 'user', actions: ['ban'] } },
      resolve: async (_root: any, args: any, ctx: any) => {
        const authUser = (ctx as any).auth?.user
        if (authUser?.id === String(args.id))
          throw new CannotBanSelfError()

        const container = useContainer()
        const userService = await container.make('auth:users')
        const result = await (userService as any).ban(
          {
            userId: String(args.id),
            banReason: args.reason ?? undefined,
            banExpiresIn: args.expiresIn ?? undefined,
          },
          ctx.request?.headers,
        )
        if (!result)
          throw new NotFoundError('User', String(args.id))
        return result
      },
    }))

  // ── unbanUser ─────────────────────────────────────────────────────────────
  builder.mutationField('unbanUser', (t: any) =>
    t.field({
      type: 'User',
      errors: { types: [NotFoundError] },
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['ban'] } },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const userService = await container.make('auth:users')
        const result = await (userService as any).unban(String(args.id), ctx.request?.headers)
        if (!result)
          throw new NotFoundError('User', String(args.id))
        return result
      },
    }))

  // ── setRole ───────────────────────────────────────────────────────────────
  builder.mutationField('setRole', (t: any) =>
    t.field({
      type: 'User',
      errors: { types: [NotFoundError, ForbiddenError, CannotDemoteSelfError] },
      args: {
        id: t.arg.id({ required: true }),
        role: t.arg.string({ required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['setRole'] } },
      resolve: async (_root: any, args: any, ctx: any) => {
        const authUser = (ctx as any).auth?.user
        if (authUser?.id === String(args.id))
          throw new CannotDemoteSelfError()

        const container = useContainer()
        const userService = await container.make('auth:users')
        const result = await (userService as any).setRole(
          { userId: String(args.id), role: args.role },
          ctx.request?.headers,
        )
        if (!result)
          throw new NotFoundError('User', String(args.id))
        return result
      },
    }))

  // ── setUserPassword ───────────────────────────────────────────────────────
  builder.mutationField('setUserPassword', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError] },
      args: {
        id: t.arg.id({ required: true }),
        newPassword: t.arg.string({ required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['setPassword'] } },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const userService = await container.make('auth:users')
        await (userService as any).setPassword(
          { userId: String(args.id), newPassword: args.newPassword },
          ctx.request?.headers,
        )
        return true
      },
    }))

  // ── removeUser ────────────────────────────────────────────────────────────
  builder.mutationField('removeUser', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError] },
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['delete'] } },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const userService = await container.make('auth:users')
        await (userService as any).remove(String(args.id), ctx.request?.headers)
        return true
      },
    }))

  // ── impersonateUser ───────────────────────────────────────────────────────
  builder.mutationField('impersonateUser', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, ForbiddenError] },
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'user', actions: ['impersonate'] } },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const userService = await container.make('auth:users')
        await (userService as any).impersonate(String(args.id), ctx.request?.headers)
        return true
      },
    }))

  // ── stopImpersonation ─────────────────────────────────────────────────────
  builder.mutationField('stopImpersonation', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [UnauthenticatedError] },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, _args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const container = useContainer()
        const userService = await container.make('auth:users')
        await (userService as any).stopImpersonating(ctx.request?.headers)
        return true
      },
    }))

  // ── revokeSession ─────────────────────────────────────────────────────────
  builder.mutationField('revokeSession', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError] },
      args: {
        sessionToken: t.arg.string({ required: true }),
      },
      authScopes: { permission: { resource: 'session', actions: ['revoke'] } },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const userService = await container.make('auth:users')
        await (userService as any).revokeSession(args.sessionToken, ctx.request?.headers)
        return true
      },
    }))

  // ── revokeSessions ────────────────────────────────────────────────────────
  builder.mutationField('revokeSessions', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError] },
      args: {
        userId: t.arg.id({ required: true }),
      },
      authScopes: { permission: { resource: 'session', actions: ['revoke'] } },
      resolve: async (_root: any, args: any, ctx: any) => {
        const container = useContainer()
        const userService = await container.make('auth:users')
        await (userService as any).revokeSessions(String(args.userId), ctx.request?.headers)
        return true
      },
    }))
}
