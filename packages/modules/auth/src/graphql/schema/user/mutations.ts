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
        id: t.globalID({ for: 'User', required: true }),
        name: t.string({ validate: z.string().max(225).min(1).transform(name => name?.trim()) }),
        role: t.stringList(),
      }),
    },
    {
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
        user: t.field({ type: 'User', resolve: payload => payload.user }),
      }),
    },
  )

  // ── createUser ────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createUser',
    {
      inputFields: t => ({
        email: t.string({ required: true, validate: z.email().transform(email => email.toLowerCase()) }),
        name: t.string({ required: true, validate: z.string().max(225).min(1).transform(name => name.trim()) }),
        password: t.string({ required: true, validate: z.string().min(8).max(128).nullable().optional() }),
        role: t.stringList(),
      }),
    },
    {
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
        user: t.field({ type: 'User', resolve: payload => payload }),
      }),
    },
  )

  // ── banUser ───────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'banUser',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'User', required: true }),
        reason: t.string(),
        expiresIn: t.int(),
      }),
    },
    {
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
        user: t.field({ type: 'User', resolve: payload => payload.user }),
      }),
    },
  )

  // ── unbanUser ─────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'unbanUser',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'User', required: true }),
      }),
    },
    {
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
        user: t.field({ type: 'User', resolve: payload => payload.user }),
      }),
    },
  )

  // ── setRole ───────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'setRole',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'User', required: true }),
        role: t.string({ required: true }),
      }),
    },
    {
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
        user: t.field({ type: 'User', resolve: payload => payload }),
      }),
    },
  )

  // ── setUserPassword ───────────────────────────────────────────────────────
  builder.relayMutationField(
    'setUserPassword',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'User', required: true }),
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
        success: t.boolean({ resolve: payload => payload.success }),
      }),
    },
  )

  // ── removeUser ────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'removeUser',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'User', required: true }),
      }),
    },
    {
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
        success: t.boolean({ resolve: payload => payload.success }),
      }),
    },
  )

  // ── revokeSessions ────────────────────────────────────────────────────────
  builder.relayMutationField(
    'revokeSessions',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'User', required: true }),
      }),
    },
    {
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
