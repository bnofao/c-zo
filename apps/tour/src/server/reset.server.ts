import { createServerFn } from '@tanstack/react-start'
import { GraphqlAdminError } from '../graphql/admin-error'
import { gqlAccount } from '../graphql/gql-admin.server'

// Account sub-graph documents as raw strings: the tour codegen only knows the
// admin SDL, and these two fixed-shape mutations don't justify a second
// emit/codegen pipeline. Result unions verified by introspection.
const REQUEST_RESET = `mutation RequestPasswordReset($input: RequestPasswordResetInput!) {
  requestPasswordReset(input: $input) {
    __typename
    ... on RequestPasswordResetSuccess { data { success } }
  }
}`

const RESET_PASSWORD = `mutation ResetPassword($input: ResetPasswordInput!) {
  resetPassword(input: $input) {
    __typename
    ... on ResetPasswordSuccess { data { success } }
    ... on InvalidPasswordResetTokenError { message }
    ... on PasswordHashFailedError { message }
  }
}`

interface MutationResult { __typename: string, message?: string }

/**
 * Sends the password-reset email. The API is enumeration-safe (always
 * succeeds, constant time) and rate-limited server-side.
 */
export const requestPasswordReset = createServerFn({ method: 'POST' })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    await gqlAccount<{ requestPasswordReset: MutationResult }>(REQUEST_RESET, {
      input: { email: data.email },
    })
    return { ok: true }
  })

/** Sets a new password from an emailed one-time token. */
export const resetPassword = createServerFn({ method: 'POST' })
  .validator((data: { token: string, newPassword: string }) => data)
  .handler(async ({ data }) => {
    const res = await gqlAccount<{ resetPassword: MutationResult }>(RESET_PASSWORD, {
      input: { token: data.token, newPassword: data.newPassword },
    })
    const result = res.resetPassword
    if (result.__typename !== 'ResetPasswordSuccess')
      throw new GraphqlAdminError(result.message ?? 'Failed to reset password', undefined, result.__typename)
    return { ok: true }
  })
