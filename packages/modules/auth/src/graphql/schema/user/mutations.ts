import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { ForbiddenError, ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import z from 'zod'
import { Session, User } from '../../../services'
import { passwordSchema } from '../../../services/utils/password-schema'
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

export function registerUserMutations(builder: AuthGraphQLSchemaBuilder): void {
  // ── updateUser ────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateUser',
    {
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user to update.', for: 'User', required: true }),
        name: t.string({ description: 'New display name for the user.', validate: z.string().max(225).min(1).transform(name => name?.trim()) }),
        role: t.stringList({ description: 'New set of global platform roles to assign to the user; requires the user:set-role permission.' }),
      }),
    },
    {
      description: 'Updates an existing user\'s profile and, optionally, their global roles. Admin-only.',
      errors: {
        types: [
          ValidationError,
          ForbiddenError,
          UserNotFound,
          UserNoChanges,
          InvalidRole,
        ],
      },
      authScopes: { permission: { resource: 'user', actions: ['update'] } },
      resolve: async (_root, { input }, ctx) => {
        const id = input.id.id
        const userId = Number(id)

        if (input.role) {
          const actorId = ctx.auth.user?.id
          if (!actorId)
            throw new ForbiddenError('You do not have permission to set user roles')

          const canSetRole = await ctx.runEffect(
            Effect.gen(function* () {
              const svc = yield* User.UserService
              return yield* svc.hasPermission({
                role: ctx.auth.user?.role ?? undefined,
                permissions: { user: ['set-role'] },
              })
            }),
          )

          if (!canSetRole)
            throw new ForbiddenError('You do not have permission to set user roles')
        }

        const result = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* User.UserService
            return yield* svc.update(userId, {
              ...input,
              name: input.name || undefined,
            })
          }),
        )
        return { user: result }
      },
    },
    {
      outputFields: t => ({
        user: t.field({ description: 'The updated user.', type: 'User', resolve: payload => payload.user }),
      }),
    },
  )

  // ── createUser ────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createUser',
    {
      inputFields: t => ({
        email: t.string({ description: 'Email address for the new user; normalized to lowercase.', required: true, validate: z.email().transform(email => email.toLowerCase()) }),
        name: t.string({ description: 'Display name for the new user.', required: true, validate: z.string().max(225).min(1).transform(name => name.trim()) }),
        password: t.string({ description: 'Initial password for the new user\'s credential account.', required: true, validate: z.string().min(8).max(128).nullable().optional() }),
        role: t.stringList({ description: 'Global platform roles to assign to the new user.' }),
      }),
    },
    {
      description: 'Creates a new platform user with a credential account and optional global roles. Admin-only.',
      errors: {
        types: [
          ValidationError,
          UserAlreadyExists,
          InvalidRole,
          CredentialLinkFailed,
          PasswordHashFailed,
        ],
      },
      authScopes: { permission: { resource: 'user', actions: ['create'] } },
      resolve: async (_root, { input }, ctx) => {
        const result = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* User.UserService
            return yield* svc.create(input)
          }),
        )
        return result
      },
    },
    {
      outputFields: t => ({
        user: t.field({ description: 'The newly created user.', type: 'User', resolve: payload => payload }),
      }),
    },
  )

  // ── banUser ───────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'banUser',
    {
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user to ban.', for: 'User', required: true }),
        reason: t.string({ description: 'Reason recorded for the ban.' }),
        expiresIn: t.int({ description: 'Duration, in seconds, after which the ban expires; omit for a permanent ban.' }),
      }),
    },
    {
      description: 'Bans a user from the platform, optionally with a reason and expiry. Cannot be used to ban oneself. Admin-only.',
      errors: { types: [ForbiddenError, UserNotFound, CannotBanSelf, UserAlreadyBanned] },
      authScopes: { permission: { resource: 'user', actions: ['ban'] } },
      resolve: async (_root, { input }, ctx) => {
        const authUser = ctx.auth?.user as User.User
        const id = input.id.id
        const userId = Number(id)

        const result = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* User.UserService
            return yield* svc.ban(userId, input, Number(authUser.id))
          }),
        )
        return { user: result }
      },
    },
    {
      outputFields: t => ({
        user: t.field({ description: 'The banned user.', type: 'User', resolve: payload => payload.user }),
      }),
    },
  )

  // ── unbanUser ─────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'unbanUser',
    {
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user to unban.', for: 'User', required: true }),
      }),
    },
    {
      description: 'Lifts an active ban on a user, restoring their platform access. Admin-only.',
      errors: { types: [UserNotFound, UserNotBanned] },
      authScopes: { permission: { resource: 'user', actions: ['ban'] } },
      resolve: async (_root, { input }, ctx) => {
        const id = input.id.id
        const userId = Number(id)
        const actorId = Number((ctx.auth?.user as User.User).id)

        const result = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* User.UserService
            return yield* svc.unban(userId, actorId)
          }),
        )
        return { user: result }
      },
    },
    {
      outputFields: t => ({
        user: t.field({ description: 'The unbanned user.', type: 'User', resolve: payload => payload.user }),
      }),
    },
  )

  // ── setRole ───────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'setRole',
    {
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user whose role is being set.', for: 'User', required: true }),
        role: t.string({ description: 'Global platform role to assign to the user.', required: true }),
      }),
    },
    {
      description: 'Sets a user\'s global platform role. Cannot be used to demote oneself. Admin-only.',
      errors: { types: [ForbiddenError, UserNotFound, InvalidRole, CannotDemoteSelf] },
      authScopes: { permission: { resource: 'user', actions: ['set-role'] } },
      resolve: async (_root, { input }, ctx) => {
        const id = input.id.id
        const userId = Number(id)
        const actorId = ctx.auth?.user?.id != null ? Number(ctx.auth.user.id) : undefined

        const result = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* User.UserService
            return yield* svc.setRole(userId, input.role, actorId)
          }),
        )

        return result
      },
    },
    {
      outputFields: t => ({
        user: t.field({ description: 'The user with their updated global role.', type: 'User', resolve: payload => payload }),
      }),
    },
  )

  // ── setUserPassword ───────────────────────────────────────────────────────
  builder.relayMutationField(
    'setUserPassword',
    {
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user whose password is being set.', for: 'User', required: true }),
        newPassword: t.string({
          description: 'New password to set on the user\'s credential account.',
          required: true,
          validate: passwordSchema,
        }),
      }),
    },
    {
      description: 'Sets a new password on a user\'s credential account. Admin-only.',
      errors: { types: [UserNotFound, PasswordHashFailed] },
      authScopes: { permission: { resource: 'user', actions: ['set-password'] } },
      resolve: async (_root, { input }, ctx) => {
        const id = input.id.id
        const userId = Number(id)

        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* User.UserService
            return yield* svc.setPassword(userId, input.newPassword)
          }),
        )

        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ description: 'Whether the password was successfully set.', resolve: payload => payload.success }),
      }),
    },
  )

  // ── removeUser ────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'removeUser',
    {
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user to remove.', for: 'User', required: true }),
      }),
    },
    {
      description: 'Soft-deletes a user account, setting its deletedAt timestamp. Cannot be used to remove oneself. Admin-only.',
      errors: { types: [UserNotFound, CannotRemoveSelf] },
      authScopes: { permission: { resource: 'user', actions: ['delete'] } },
      resolve: async (_root, { input }, ctx) => {
        const id = input.id.id
        const userId = Number(id)
        const actorId = ctx.auth?.user?.id != null ? Number(ctx.auth.user.id) : undefined

        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* User.UserService
            return yield* svc.remove(userId, actorId)
          }),
        )

        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ description: 'Whether the user was successfully removed.', resolve: payload => payload.success }),
      }),
    },
  )

  // ── revokeSession ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'revokeSession',
    {
      inputFields: t => ({
        sessionToken: t.string({ description: 'Token of the specific session to revoke.', required: true }),
      }),
    },
    {
      description: 'Revokes a single session identified by its token, signing out that session. Admin-only.',
      authScopes: { permission: { resource: 'session', actions: ['revoke'] } },
      resolve: async (_root, { input }, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* Session.SessionService
            yield* svc.revoke(input.sessionToken)
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ description: 'Whether the session was successfully revoked.', resolve: payload => payload.success }),
      }),
    },
  )

  // ── revokeSessions ────────────────────────────────────────────────────────
  builder.relayMutationField(
    'revokeSessions',
    {
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user whose sessions should all be revoked.', for: 'User', required: true }),
      }),
    },
    {
      description: 'Revokes all active sessions for a given user, signing them out everywhere. Admin-only.',
      authScopes: { permission: { resource: 'session', actions: ['revoke'] } },
      resolve: async (_root, { input }, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* Session.SessionService
            yield* svc.revokeAllForUser(Number(input.id.id))
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
