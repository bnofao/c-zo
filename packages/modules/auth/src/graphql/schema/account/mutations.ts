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
  NoCredentialAccount,
} from '../../../services/account'
import { PasswordHashFailed } from '../../../services/user'
import { emailSchema } from '../../../services/utils/email-schema'
import { passwordSchema } from '../../../services/utils/password-schema'
import { sg } from '../subgraphs'

export function registerAccountMutations(builder: AuthGraphQLSchemaBuilder): void {
  const ACC = sg('account')

  builder.relayMutationField(
    'requestPasswordReset',
    { ...ACC.input, inputFields: t => ({
      email: t.string({ required: true, validate: emailSchema, description: 'The email address of the account to send a password-reset token to.' }),
    }) },
    {
      ...ACC.field,
      description: 'Sends a one-time password-reset token to the given email address. Runs in constant time and never reveals whether an account exists.',
      errors: { types: [], ...ACC.errorOpts },
      directives: { rateLimit: { limit: 5, duration: 60 } },
      resolve: async (_root, { input }, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).requestPasswordReset(input.email)
          }),
        )
        return { success: true }
      },
    },
    { ...ACC.payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'Always true; indicates the request was accepted (no enumeration leak).' }) }) },
  )

  builder.relayMutationField(
    'resetPassword',
    { ...ACC.input, inputFields: t => ({
      token: t.string({ required: true, description: 'The one-time password-reset token emailed to the account owner.' }),
      newPassword: t.string({ required: true, validate: passwordSchema, description: 'The new password to set on the account.' }),
    }) },
    {
      ...ACC.field,
      description: 'Resets the account password using a valid emailed reset token. Gated by the token, not a session.',
      errors: { types: [InvalidPasswordResetToken, PasswordHashFailed], ...ACC.errorOpts },
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
    { ...ACC.payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the password was reset successfully.' }) }) },
  )

  builder.relayMutationField(
    'requestEmailVerification',
    // No client input — the user comes from the session. GraphQL forbids an
    // empty input object, and the relay plugin omits `clientMutationId`
    // globally, so declare it here as the single (optional) input field.
    { ...ACC.input, inputFields: t => ({ clientMutationId: t.string({ required: false, description: 'Optional client-supplied identifier echoed back by the relay mutation.' }) }) },
    {
      ...ACC.field,
      description: 'Sends an email-verification token to the signed-in user\'s current email address.',
      errors: { types: [], ...ACC.errorOpts },
      authScopes: { auth: true },
      directives: { rateLimit: { limit: 5, duration: 60 } },
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
    { ...ACC.payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the verification email was dispatched.' }) }) },
  )

  builder.relayMutationField(
    'verifyEmail',
    { ...ACC.input, inputFields: t => ({ token: t.string({ required: true, description: 'The one-time email-verification token emailed to the user.' }) }) },
    {
      ...ACC.field,
      description: 'Marks the user\'s email address as verified using a valid emailed token. Gated by the token, not a session.',
      errors: { types: [InvalidEmailVerificationToken], ...ACC.errorOpts },
      resolve: async (_root, { input }, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).verifyEmail(input.token)
          }),
        )
        return { success: true }
      },
    },
    { ...ACC.payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the email address was verified.' }) }) },
  )

  builder.relayMutationField(
    'changePassword',
    { ...ACC.input, inputFields: t => ({
      currentPassword: t.string({ required: true, description: 'The account\'s current password, required to authorize the change.' }),
      newPassword: t.string({ required: true, validate: passwordSchema, description: 'The new password to set on the account.' }),
    }) },
    {
      ...ACC.field,
      description: 'Changes the signed-in user\'s password after verifying their current password. Self-service; requires an active session.',
      errors: { types: [NoCredentialAccount, IncorrectCurrentPassword, PasswordHashFailed], ...ACC.errorOpts },
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
    { ...ACC.payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the password was changed.' }) }) },
  )

  builder.relayMutationField(
    'requestEmailChange',
    { ...ACC.input, inputFields: t => ({
      currentPassword: t.string({ required: false, description: 'The account\'s current password; required for credential accounts to authorize the change.' }),
      newEmail: t.string({ required: true, validate: emailSchema, description: 'The new email address to send a confirmation token to.' }),
    }) },
    {
      ...ACC.field,
      description: 'Begins an email-address change for the signed-in user by sending a confirmation token to the new address. Self-service; requires an active session.',
      errors: { types: [IncorrectCurrentPassword], ...ACC.errorOpts },
      authScopes: { auth: true },
      directives: { rateLimit: { limit: 5, duration: 60 } },
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
    { ...ACC.payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the confirmation email was dispatched.' }) }) },
  )

  builder.relayMutationField(
    'confirmEmailChange',
    { ...ACC.input, inputFields: t => ({
      token: t.string({ required: true, description: 'The one-time token emailed to the new address to confirm the change.' }),
    }) },
    {
      ...ACC.field,
      description: 'Completes a pending email-address change using the token emailed to the new address. Gated by the token, not a session.',
      errors: { types: [InvalidEmailChangeToken], ...ACC.errorOpts },
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
    { ...ACC.payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the email address change was applied.' }) }) },
  )

  builder.relayMutationField(
    'deleteAccount',
    { ...ACC.input, inputFields: t => ({
      currentPassword: t.string({ required: false, description: 'The account\'s current password; required for credential accounts to authorize deletion.' }),
    }) },
    {
      ...ACC.field,
      description: 'Soft-deletes the signed-in user\'s own account, entering a 30-day grace window before permanent removal. Self-service; requires an active session.',
      errors: { types: [IncorrectCurrentPassword, CannotDeleteWithOwnedOrgs], ...ACC.errorOpts },
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
    { ...ACC.payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the account was scheduled for deletion.' }) }) },
  )

  builder.relayMutationField(
    'restoreAccount',
    { ...ACC.input, inputFields: t => ({
      token: t.string({ required: true, description: 'The one-time token emailed to the owner to restore the account within the grace window.' }),
    }) },
    {
      ...ACC.field,
      description: 'Restores a soft-deleted account within its 30-day grace window using an emailed token. Gated by the token, not a session.',
      errors: { types: [InvalidAccountRestoreToken, AccountUnrecoverable], ...ACC.errorOpts },
      resolve: async (_root, { input }, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).restoreAccount(input.token)
          }),
        )
        return { success: true }
      },
    },
    { ...ACC.payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the account was restored.' }) }) },
  )
}
