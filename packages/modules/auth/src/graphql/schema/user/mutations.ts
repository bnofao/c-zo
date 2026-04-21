import type { AuthContext } from '@czo/auth/types'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { CannotBanSelfError, CannotDemoteSelfError, UserAlreadyBannedError } from './errors'
import { createUserSchema, updateUserSchema } from './inputs'

interface Ctx { auth: AuthContext, request?: Request }

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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        const parsed = createUserSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const result = await ctx.auth.userService.create(parsed.data)
        if (!result)
          throw new NotFoundError('User', 'created')

        await publishAuthEvent(AUTH_EVENTS.USER_REGISTERED, {
          userId: result.id,
          email: result.email,
        })

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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        const parsed = updateUserSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const result = await ctx.auth.userService.update(
          { userId: String(args.id), data: parsed.data },
        )
        if (!result)
          throw new NotFoundError('User', String(args.id))

        await publishAuthEvent(AUTH_EVENTS.USER_UPDATED, {
          userId: String(args.id),
          changes: parsed.data,
        })

        return result
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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        const authUser = ctx.auth?.user
        if (authUser?.id === String(args.id))
          throw new CannotBanSelfError()

        const result = await ctx.auth.userService.ban(
          {
            userId: String(args.id),
            banReason: args.reason ?? undefined,
            banExpiresIn: args.expiresIn ?? undefined,
          },
        )
        if (!result)
          throw new NotFoundError('User', String(args.id))

        await publishAuthEvent(AUTH_EVENTS.USER_BANNED, {
          userId: String(args.id),
          bannedBy: 'admin',
          reason: args.reason ?? null,
          expiresIn: args.expiresIn ?? null,
        })

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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        const result = await ctx.auth.userService.unban(String(args.id))
        if (!result)
          throw new NotFoundError('User', String(args.id))

        await publishAuthEvent(AUTH_EVENTS.USER_UNBANNED, {
          userId: String(args.id),
          unbannedBy: 'admin',
        })

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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        const authUser = ctx.auth?.user
        if (authUser?.id === String(args.id))
          throw new CannotDemoteSelfError()

        const result = await ctx.auth.userService.setRole(
          { userId: String(args.id), role: args.role },
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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        await ctx.auth.userService.setPassword(
          { userId: String(args.id), newPassword: args.newPassword },
          ctx.request?.headers ?? new Headers(),
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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        await ctx.auth.userService.remove(String(args.id))
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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        await ctx.auth.userService.impersonate(String(args.id), ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── stopImpersonation ─────────────────────────────────────────────────────
  builder.mutationField('stopImpersonation', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [UnauthenticatedError] },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, _args: unknown, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.userService.stopImpersonating(ctx.request?.headers ?? new Headers())
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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        await ctx.auth.userService.revokeSession(args.sessionToken, ctx.request?.headers ?? new Headers())
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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        await ctx.auth.userService.revokeSessions(String(args.userId), ctx.request?.headers ?? new Headers())
        return true
      },
    }))
}
