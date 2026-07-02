import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { ForbiddenError, ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import z from 'zod'
import { Account, Session, User } from '../../../services'
import { passwordSchema } from '../../../services/utils/password-schema'
import { sg } from '../subgraphs'
import {
  CannotBanSelf,
  CannotDemoteSelf,
  CannotRemoveSelf,
  CredentialLinkFailed,
  InvalidRole,
  PasswordHashFailed,
  RoleAssignmentDenied,
  UserAlreadyBanned,
  UserAlreadyExists,
  UserNoChanges,
  UserNotBanned,
  UserNotFound,
} from './errors'

// ─── User Mutations ───────────────────────────────────────────────────────────

export function registerUserMutations(builder: AuthGraphQLSchemaBuilder): void {
  const A = sg('admin')

  // ── updateUser ────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateUser',
    {
      ...A.input,
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user to update.', for: 'User', required: true }),
        name: t.string({ description: 'New display name for the user.', validate: z.string().max(225).min(1).transform(name => name?.trim()) }),
        role: t.stringList({ description: 'New set of global platform roles to assign to the user; requires the user:set-role permission.' }),
      }),
    },
    {
      ...A.field,
      description: 'Updates an existing user\'s profile and, optionally, their global roles. Admin-only.',
      errors: {
        types: [
          ValidationError,
          ForbiddenError,
          UserNotFound,
          UserNoChanges,
          InvalidRole,
          CannotDemoteSelf,
          RoleAssignmentDenied,
        ],
        ...A.errorOpts,
      },
      authScopes: { permission: { resource: 'user', actions: ['update'] } },
      resolve: async (_root, { input }, ctx) => {
        const id = input.id.id
        const userId = Number(id)
        const actorId = ctx.auth?.user?.id != null ? Number(ctx.auth.user.id) : undefined

        if (input.role) {
          if (actorId === undefined)
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
              name: input.name || undefined,
              role: input.role ?? undefined,
            }, actorId)
          }),
        )
        return { user: result }
      },
    },
    {
      ...A.payload,
      outputFields: t => ({
        user: t.field({ description: 'The updated user.', type: 'User', resolve: payload => payload.user }),
      }),
    },
  )

  // ── createUser ────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createUser',
    {
      ...A.input,
      inputFields: t => ({
        email: t.string({ description: 'Email address for the new user; normalized to lowercase.', required: true, validate: z.email().transform(email => email.toLowerCase()) }),
        name: t.string({ description: 'Display name for the new user.', required: true, validate: z.string().max(225).min(1).transform(name => name.trim()) }),
        password: t.string({ description: 'Optional initial password. Omit to create an invite-only account whose password is set via the invitation email.', required: false, validate: z.string().min(8).max(128).nullable().optional() }),
        role: t.stringList({ description: 'Global platform roles to assign to the new user.' }),
        invite: t.boolean({ description: 'When true, send an invitation email with a set-password link after creation.', required: false }),
      }),
    },
    {
      ...A.field,
      description: 'Creates a new platform user with a credential account and optional global roles. Admin-only.',
      errors: {
        types: [
          ValidationError,
          UserAlreadyExists,
          InvalidRole,
          RoleAssignmentDenied,
          CredentialLinkFailed,
          PasswordHashFailed,
        ],
        ...A.errorOpts,
      },
      authScopes: { permission: { resource: 'user', actions: ['create'] } },
      resolve: async (_root, { input }, ctx) => {
        const actorId = ctx.auth?.user?.id != null ? Number(ctx.auth.user.id) : undefined
        const result = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* User.UserService
            const created = yield* svc.create(input, actorId)
            if (input.invite) {
              const account = yield* Account.AccountService
              yield* account.sendInvitation({ userId: created.id, email: created.email }).pipe(
                Effect.catchTag('AccountDbFailed', e => Effect.logError('createUser: invitation send failed', e)),
              )
            }
            return created
          }),
        )
        return result
      },
    },
    {
      ...A.payload,
      outputFields: t => ({
        user: t.field({ description: 'The newly created user.', type: 'User', resolve: payload => payload }),
      }),
    },
  )

  // ── banUser ───────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'banUser',
    {
      ...A.input,
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user to ban.', for: 'User', required: true }),
        reason: t.string({ description: 'Reason recorded for the ban.' }),
        expiresIn: t.int({ description: 'Duration, in seconds, after which the ban expires; omit for a permanent ban.' }),
      }),
    },
    {
      ...A.field,
      description: 'Bans a user from the platform, optionally with a reason and expiry. Cannot be used to ban oneself. Admin-only.',
      errors: { types: [ForbiddenError, UserNotFound, CannotBanSelf, UserAlreadyBanned], ...A.errorOpts },
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
      ...A.payload,
      outputFields: t => ({
        user: t.field({ description: 'The banned user.', type: 'User', resolve: payload => payload.user }),
      }),
    },
  )

  // ── unbanUser ─────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'unbanUser',
    {
      ...A.input,
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user to unban.', for: 'User', required: true }),
      }),
    },
    {
      ...A.field,
      description: 'Lifts an active ban on a user, restoring their platform access. Admin-only.',
      errors: { types: [UserNotFound, UserNotBanned], ...A.errorOpts },
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
      ...A.payload,
      outputFields: t => ({
        user: t.field({ description: 'The unbanned user.', type: 'User', resolve: payload => payload.user }),
      }),
    },
  )

  // ── resendInvitation ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'resendInvitation',
    {
      ...A.input,
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user to (re)invite.', for: 'User', required: true }),
      }),
    },
    {
      ...A.field,
      description: 'Re-sends the invitation email (a set-password link) to a user. Admin-only.',
      errors: { types: [UserNotFound], ...A.errorOpts },
      authScopes: { permission: { resource: 'user', actions: ['create'] } },
      resolve: async (_root, { input }, ctx) => {
        const userId = Number(input.id.id)
        await ctx.runEffect(
          Effect.gen(function* () {
            const users = yield* User.UserService
            const user = yield* users.findFirst({ where: { id: userId } })
            const account = yield* Account.AccountService
            yield* account.sendInvitation({ userId: user.id, email: user.email, bypassCooldown: true })
          }),
        )
        return { success: true }
      },
    },
    {
      ...A.payload,
      outputFields: t => ({
        success: t.boolean({ description: 'Whether the invitation was dispatched.', resolve: payload => payload.success }),
      }),
    },
  )

  // ── setRole ───────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'setRole',
    {
      ...A.input,
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user whose role is being set.', for: 'User', required: true }),
        role: t.stringList({ description: 'Global platform roles to assign to the user (at most one tier per hierarchy); replaces the user\'s current role set.', required: true }),
      }),
    },
    {
      ...A.field,
      description: 'Sets a user\'s global platform roles (one tier per hierarchy). Cannot be used to demote oneself. Admin-only.',
      errors: { types: [ForbiddenError, UserNotFound, InvalidRole, CannotDemoteSelf, RoleAssignmentDenied], ...A.errorOpts },
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
      ...A.payload,
      outputFields: t => ({
        user: t.field({ description: 'The user with their updated global role.', type: 'User', resolve: payload => payload }),
      }),
    },
  )

  // ── setUserPassword ───────────────────────────────────────────────────────
  builder.relayMutationField(
    'setUserPassword',
    {
      ...A.input,
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
      ...A.field,
      description: 'Sets a new password on a user\'s credential account. Admin-only.',
      errors: { types: [UserNotFound, PasswordHashFailed], ...A.errorOpts },
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
      ...A.payload,
      outputFields: t => ({
        success: t.boolean({ description: 'Whether the password was successfully set.', resolve: payload => payload.success }),
      }),
    },
  )

  // ── removeUser ────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'removeUser',
    {
      ...A.input,
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user to remove.', for: 'User', required: true }),
      }),
    },
    {
      ...A.field,
      description: 'Soft-deletes a user account, setting its deletedAt timestamp. Cannot be used to remove oneself. Admin-only.',
      errors: { types: [UserNotFound, CannotRemoveSelf], ...A.errorOpts },
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
      ...A.payload,
      outputFields: t => ({
        success: t.boolean({ description: 'Whether the user was successfully removed.', resolve: payload => payload.success }),
      }),
    },
  )

  // ── revokeSession ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'revokeSession',
    {
      ...A.input,
      inputFields: t => ({
        sessionToken: t.string({ description: 'Token of the specific session to revoke.', required: true }),
      }),
    },
    {
      ...A.field,
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
      ...A.payload,
      outputFields: t => ({
        success: t.boolean({ description: 'Whether the session was successfully revoked.', resolve: payload => payload.success }),
      }),
    },
  )

  // ── revokeSessions ────────────────────────────────────────────────────────
  builder.relayMutationField(
    'revokeSessions',
    {
      ...A.input,
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user whose sessions should all be revoked.', for: 'User', required: true }),
      }),
    },
    {
      ...A.field,
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
      ...A.payload,
      outputFields: t => ({
        success: t.boolean({ resolve: payload => payload.success }),
      }),
    },
  )
}
