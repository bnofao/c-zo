import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { Effect } from 'effect'
import z from 'zod'
import {
  AccountService,
  IncorrectCurrentPassword,
  InvalidEmailVerificationToken,
  InvalidPasswordResetToken,
} from '../../../services/account'
import { PasswordHashFailed, UserNotFound } from '../../../services/user'
import { passwordSchema } from '../../../services/utils/password-schema'

export function registerAccountMutations(builder: AuthGraphQLSchemaBuilder): void {
  builder.relayMutationField(
    'requestPasswordReset',
    { inputFields: t => ({
        email: t.string({ required: true, validate: z.email().transform(e => e.toLowerCase()) }),
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
    { inputFields: () => ({}) },
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
}
