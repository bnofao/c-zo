import type { AuthGraphQLShemaBuilder, User } from '@czo/auth/types'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { createUserSchema, passwordSchema, updateUserSchema } from '@czo/auth/types'
import { decodeGlobalID, ForbiddenError, NotFoundError, ValidationError } from '@czo/kit/graphql'
import { CannotBanSelfError, CannotDemoteSelfError, UserAlreadyBannedError, UserNotBannedError } from './errors'

// ─── User Mutations ───────────────────────────────────────────────────────────

export function registerUserMutations(builder: AuthGraphQLShemaBuilder): void {

  // ── updateUser ────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateUser',
    {
      inputFields: t => ({
        id: t.id({ required: true }),
        data: t.field({ type: 'UserUpdateData', required: true }),
      }),
    },
    {
      errors: { types: [ValidationError, NotFoundError, ForbiddenError] },
      authScopes: { permission: { resource: 'user', actions: ['update'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const userId = Number(id)

        if (input.data.role) {
          const canSetRole = await ctx.auth.authService.hasPermission(
            { userId: ctx.auth.user?.id, organizationId: ctx.auth.user?.organizationId },
            { user: ['set-role'] },
          )

          if (!canSetRole)
            throw new ForbiddenError('You do not have permission to set user roles')

          const roles = Array.isArray(input.data.role) ? input.data.role : [input.data.role]

          for (const role of roles) {
            if (ctx.auth.authService.roles && !ctx.auth.authService.roles[role]) {
              throw ValidationError.fromStandardSchema({
                issues: [{
                  path: ['role'],
                  message: 'You are not allowed to set non existed role',
                }],
              })
            }
          }
        }

        const result = await ctx.auth.userService.update(userId, {
          ...input.data,
          name: input.data.name || undefined,
        }, {
          onNotFound: async () => {
            throw new NotFoundError('User', input.id)
          },
          onFailed: async () => {
            throw new Error('Failed to update user')
          },
        }) as User

        await publishAuthEvent(AUTH_EVENTS.USER_UPDATED, {
          userId,
          changes: input.data,
        })

        return { user: result }
      },
    },
    {
      outputFields: t => ({
        user: t.field({ type: 'User', resolve: payload => payload.user }),
      }),
    },
  )

  // ── createUser ────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createUser',
    {
      inputFields: t => ({
        data: t.field({ type: 'UserCreateData', required: true, validate: createUserSchema, }),
      }),
    },
    {
      errors: { types: [ValidationError, NotFoundError] },
      authScopes: { permission: { resource: 'user', actions: ['create'] } },
      resolve: async (_root, { input }, ctx) => {
        const result = await ctx.auth.userService.create(input.data, {
          onUserExists: async (existing) => {
            throw ValidationError.fromStandardSchema({
              issues: [{
                path: ['email'],
                message: `User with email ${existing.email} already exists`,
              }],
            })
          },
          onFailed: async () => {
            throw new Error('Failed to create user')
          },
        }) as User

        await publishAuthEvent(AUTH_EVENTS.USER_REGISTERED, {
          userId: result.id,
          email: result.email,
        })

        return result
      },
    },
    {
      outputFields: t => ({
        user: t.field({ type: 'User', resolve: payload => payload }),
      }),
    },
  )

  // ── banUser ───────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'banUser',
    {
      inputFields: t => ({
        id: t.id({ required: true }),
        data: t.field({ type: 'UserBanData', required: true , validate: updateUserSchema}),
      }),
    },
    {
      errors: { types: [NotFoundError, ForbiddenError, CannotBanSelfError, UserAlreadyBannedError] },
      authScopes: { permission: { resource: 'user', actions: ['ban'] } },
      resolve: async (_root, { input }, ctx) => {
        const authUser = ctx.auth?.user as User
        const { id } = decodeGlobalID(input.id)
        const userId = Number(id)
        const result = await ctx.auth.userService.ban(userId, input.data, {
          onNotFound: async () => {
            throw new NotFoundError('User', input.id)
          },
          onSelfBan: async () => {
            throw new CannotBanSelfError()
          },
          onAlreadyBanned: async () => {
            throw new UserAlreadyBannedError(input.id)
          },
          onFailed: async () => {
            throw new Error('Failed to ban user')
          },
          authUserId: Number(authUser.id),
        }) as User

        publishAuthEvent(AUTH_EVENTS.USER_BANNED, {
          userId,
          bannedBy: authUser.id,
          reason: result.banReason,
          expires: result.banExpires,
        })

        return { user: result }
      },
    },
    {
      outputFields: t => ({
        user: t.field({ type: 'User', resolve: payload => payload.user }),
      }),
    },
  )

  // ── unbanUser ─────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'unbanUser',
    {
      inputFields: t => ({
        id: t.id({ required: true }),
      }),
    },
    {
      errors: { types: [NotFoundError] },
      authScopes: { permission: { resource: 'user', actions: ['ban'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const userId = Number(id)
        const result = await ctx.auth.userService.unban(userId, {
          onNotFound: async () => {
            throw new NotFoundError('User', input.id)
          },
          onNotBanned: async () => {
            throw new UserNotBannedError(input.id)
          },
          onFailed: async () => {
            throw new Error('Failed to unban user')
          },
        }) as User
        if (!result)
          throw new NotFoundError('User', String(input.id))

        await publishAuthEvent(AUTH_EVENTS.USER_UNBANNED, {
          userId,
          unbannedBy: (ctx.auth?.user as User).id,
        })

        return { user: result }
      },
    },
    {
      outputFields: t => ({
        user: t.field({ type: 'User', resolve: payload => payload.user }),
      }),
    },
  )

  // ── setRole ───────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'setRole',
    {
      inputFields: t => ({
        id: t.id({ required: true }),
        role: t.string({ required: true }),
      }),
    },
    {
      errors: { types: [NotFoundError, ForbiddenError, CannotDemoteSelfError] },
      authScopes: { permission: { resource: 'user', actions: ['set-role'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const userId = Number(id)

        // TODO: prevent demoting self (e.g. admin setting their own role to non-admin)

        const result = await ctx.auth.userService.setRole(
          userId,
          input.role,
          {
            onNotFound: async () => {
              throw new NotFoundError('User', input.id)
            },
            onInvalidRole: async () => {
              throw ValidationError.fromStandardSchema({
                issues: [{
                  path: ['role'],
                  message: 'You are not allowed to set non existed role',
                }],
              })
            },
            onFailed: async () => {
              throw new Error('Failed to set user role')
            },
          },
        ) as User

        return result
      },
    },
    {
      outputFields: t => ({
        user: t.field({ type: 'User', resolve: payload => payload }),
      }),
    },
  )

  // ── setUserPassword ───────────────────────────────────────────────────────
  builder.relayMutationField(
    'setUserPassword',
    {
      inputFields: t => ({
        id: t.id({ required: true }),
        newPassword: t.string({
          required: true,
          validate: passwordSchema,
        }),
      }),
    },
    {
      errors: { types: [NotFoundError] },
      authScopes: { permission: { resource: 'user', actions: ['set-password'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const userId = Number(id)
        await ctx.auth.userService.setPassword(
          userId,
          input.newPassword,
          {
            onNotFound: async () => {
              throw new NotFoundError('User', input.id)
            },
            onFailed: async () => {
              throw new Error('Failed to set user password')
            },
          },
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ resolve: payload => payload.success }),
      }),
    },
  )

  // ── removeUser ────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'removeUser',
    {
      inputFields: t => ({
        id: t.id({ required: true }),
      }),
    },
    {
      errors: { types: [NotFoundError, ValidationError] },
      authScopes: { permission: { resource: 'user', actions: ['delete'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const userId = Number(id)
        await ctx.auth.userService.remove(userId, {
          onNotFound: async () => {
            throw new NotFoundError('User', input.id)
          },
          onFailed: async () => {
            throw new Error('Failed to remove user')
          },
          onSelfRemove: async () => {
            throw ValidationError.fromStandardSchema({
              issues: [{
                path: ['id'],
                message: 'You cannot remove yourself',
              }],
            })
          },
          authUserId: Number(ctx.auth?.user?.id),
        })

        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ resolve: payload => payload.success }),
      }),
    },
  )

  // ── revokeSession ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'revokeSession',
    {
      inputFields: t => ({
        sessionToken: t.string({ required: true }),
      }),
    },
    {
      // errors: { types: [NotFoundError] },
      authScopes: { permission: { resource: 'session', actions: ['revoke'] } },
      resolve: async (_root, { input }, ctx) => {
        await ctx.auth.userService.revokeSession(input.sessionToken)
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ resolve: payload => payload.success }),
      }),
    },
  )

  // ── revokeSessions ────────────────────────────────────────────────────────
  builder.relayMutationField(
    'revokeSessions',
    {
      inputFields: t => ({
        id: t.id({ required: true }),
      }),
    },
    {
      // errors: { types: [NotFoundError] },
      authScopes: { permission: { resource: 'session', actions: ['revoke'] } },
      resolve: async (_root, { input }, ctx) => {
        await ctx.auth.userService.revokeSessions(Number(input.id))
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ resolve: payload => payload.success }),
      }),
    },
  )
}
