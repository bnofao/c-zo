import type { AuthGraphQLShemaBuilder, User } from '@czo/auth/types'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { createUserSchema, passwordSchema, updateUserSchema } from '@czo/auth/types'
import { runEffect } from '@czo/kit/effect'
import { decodeGlobalID, ForbiddenError, ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { UserService } from '../../../services/user'
import {
  CannotBanSelf,
  CannotDemoteSelf,
  CannotRemoveSelf,
  CredentialLinkFailed,
  InvalidRole,
  PasswordHashFailed,
  UserAlreadyBanned,
  UserAlreadyExists,
  UserNoChanges,
  UserNotBanned,
  UserNotFound,
} from './errors'

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
      errors: {
        types: [
          ValidationError, ForbiddenError,
          UserNotFound, UserNoChanges, InvalidRole,
        ],
      },
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
        }

        const result = await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* UserService
            return yield* svc.update(userId, {
              ...input.data,
              name: input.data.name || undefined,
            })
          }),
        )

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
        data: t.field({ type: 'UserCreateData', required: true, validate: createUserSchema }),
      }),
    },
    {
      errors: {
        types: [
          ValidationError,
          UserAlreadyExists, InvalidRole,
          CredentialLinkFailed, PasswordHashFailed,
        ],
      },
      authScopes: { permission: { resource: 'user', actions: ['create'] } },
      resolve: async (_root, { input }, ctx) => {
        const result = await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* UserService
            return yield* svc.create(input.data)
          }),
        )

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
        data: t.field({ type: 'UserBanData', required: true, validate: updateUserSchema }),
      }),
    },
    {
      errors: { types: [ForbiddenError, UserNotFound, CannotBanSelf, UserAlreadyBanned] },
      authScopes: { permission: { resource: 'user', actions: ['ban'] } },
      resolve: async (_root, { input }, ctx) => {
        const authUser = ctx.auth?.user as User
        const { id } = decodeGlobalID(input.id)
        const userId = Number(id)

        const result = await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* UserService
            return yield* svc.ban(userId, input.data, Number(authUser.id))
          }),
        )

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
      errors: { types: [UserNotFound, UserNotBanned] },
      authScopes: { permission: { resource: 'user', actions: ['ban'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const userId = Number(id)

        const result = await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* UserService
            return yield* svc.unban(userId)
          }),
        )

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
      errors: { types: [ForbiddenError, UserNotFound, InvalidRole, CannotDemoteSelf] },
      authScopes: { permission: { resource: 'user', actions: ['set-role'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const userId = Number(id)
        const actorId = ctx.auth?.user?.id != null ? Number(ctx.auth.user.id) : undefined

        const result = await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* UserService
            return yield* svc.setRole(userId, input.role, actorId)
          }),
        )

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
      errors: { types: [UserNotFound, PasswordHashFailed] },
      authScopes: { permission: { resource: 'user', actions: ['set-password'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const userId = Number(id)

        await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* UserService
            return yield* svc.setPassword(userId, input.newPassword)
          }),
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
      errors: { types: [UserNotFound, CannotRemoveSelf] },
      authScopes: { permission: { resource: 'user', actions: ['delete'] } },
      resolve: async (_root, { input }, ctx) => {
        const { id } = decodeGlobalID(input.id)
        const userId = Number(id)
        const actorId = ctx.auth?.user?.id != null ? Number(ctx.auth.user.id) : undefined

        await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* UserService
            return yield* svc.remove(userId, actorId)
          }),
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

  // ── revokeSession ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'revokeSession',
    {
      inputFields: t => ({
        sessionToken: t.string({ required: true }),
      }),
    },
    {
      authScopes: { permission: { resource: 'session', actions: ['revoke'] } },
      resolve: async (_root, { input }, ctx) => {
        await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* UserService
            return yield* svc.revokeSession(input.sessionToken)
          }),
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

  // ── revokeSessions ────────────────────────────────────────────────────────
  builder.relayMutationField(
    'revokeSessions',
    {
      inputFields: t => ({
        id: t.id({ required: true }),
      }),
    },
    {
      authScopes: { permission: { resource: 'session', actions: ['revoke'] } },
      resolve: async (_root, { input }, ctx) => {
        await runEffect(
          ctx.auth.runtime,
          Effect.gen(function* () {
            const svc = yield* UserService
            return yield* svc.revokeSessions(Number(input.id))
          }),
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
}
