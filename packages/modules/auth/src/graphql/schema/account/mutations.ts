import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { Effect } from 'effect'
import {
  AccountService,
  AccountUnrecoverable,
  CannotDeleteWithOwnedOrgs,
  IncorrectCurrentPassword,
  InvalidAccountRestoreToken,
  InvalidEmailChangeToken,
  InvalidEmailVerificationToken,
  InvalidPasswordResetToken,
} from '../../../services/account'
import { PasswordHashFailed, UserNotFound } from '../../../services/user'
import { emailSchema } from '../../../services/utils/email-schema'
import { passwordSchema } from '../../../services/utils/password-schema'

export function registerAccountMutations(builder: AuthGraphQLSchemaBuilder): void {
  builder.relayMutationField(
    'requestPasswordReset',
    { inputFields: t => ({
      email: t.string({ required: true, validate: emailSchema }),
    }) },
    {
      errors: { types: [] },
      resolve: async (_root, { input }, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).requestPasswordReset(input.email)
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  builder.relayMutationField(
    'resetPassword',
    { inputFields: t => ({
      token: t.string({ required: true }),
      newPassword: t.string({ required: true, validate: passwordSchema }),
    }) },
    {
      errors: { types: [InvalidPasswordResetToken, PasswordHashFailed] },
      resolve: async (_root, { input }, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).resetPassword({
              token: input.token,
              newPassword: input.newPassword,
            })
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  builder.relayMutationField(
    'requestEmailVerification',
    // No client input — the user comes from the session. GraphQL forbids an
    // empty input object, and the relay plugin omits `clientMutationId`
    // globally, so declare it here as the single (optional) input field.
    { inputFields: t => ({ clientMutationId: t.string({ required: false }) }) },
    {
      errors: { types: [] },
      authScopes: { auth: true },
      resolve: async (_root, _input, ctx) => {
        const userId = Number(ctx.auth.user!.id)
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).requestEmailVerification(userId)
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  builder.relayMutationField(
    'verifyEmail',
    { inputFields: t => ({ token: t.string({ required: true }) }) },
    {
      errors: { types: [InvalidEmailVerificationToken] },
      resolve: async (_root, { input }, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).verifyEmail(input.token)
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  builder.relayMutationField(
    'changePassword',
    { inputFields: t => ({
      currentPassword: t.string({ required: true }),
      newPassword: t.string({ required: true, validate: passwordSchema }),
    }) },
    {
      errors: { types: [UserNotFound, IncorrectCurrentPassword, PasswordHashFailed] },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        const userId = Number(ctx.auth.user!.id)
        const currentSessionToken = ctx.auth.session!.token
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).changePassword({
              userId,
              currentSessionToken,
              currentPassword: input.currentPassword,
              newPassword: input.newPassword,
            })
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  builder.relayMutationField(
    'requestEmailChange',
    { inputFields: t => ({
      currentPassword: t.string({ required: false }),
      newEmail: t.string({ required: true, validate: emailSchema }),
    }) },
    {
      errors: { types: [IncorrectCurrentPassword] },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        const userId = Number(ctx.auth.user!.id)
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).requestEmailChange({
              userId,
              currentPassword: input.currentPassword ?? undefined,
              newEmail: input.newEmail,
            })
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  builder.relayMutationField(
    'confirmEmailChange',
    { inputFields: t => ({
      token: t.string({ required: true }),
    }) },
    {
      errors: { types: [InvalidEmailChangeToken] },
      resolve: async (_root, { input }, ctx) => {
        const currentSessionToken = ctx.auth.session?.token ?? null
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).confirmEmailChange({
              token: input.token,
              currentSessionToken,
            })
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  builder.relayMutationField(
    'deleteAccount',
    { inputFields: t => ({
      currentPassword: t.string({ required: false }),
    }) },
    {
      errors: { types: [IncorrectCurrentPassword, CannotDeleteWithOwnedOrgs] },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        const userId = Number(ctx.auth.user!.id)
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).deleteAccount({
              userId,
              currentPassword: input.currentPassword ?? undefined,
            })
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  builder.relayMutationField(
    'restoreAccount',
    { inputFields: t => ({
      token: t.string({ required: true }),
    }) },
    {
      errors: { types: [InvalidAccountRestoreToken, AccountUnrecoverable] },
      resolve: async (_root, { input }, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).restoreAccount(input.token)
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )
}
