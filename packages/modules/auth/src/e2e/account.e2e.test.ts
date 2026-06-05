import type { AuthHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from './harness'

// `newPassword` is `validate: passwordSchema` (min 8, must include
// upper/lower/digit/special). The original sign-up password goes through the
// looser REST signUp schema, but new passwords set via GraphQL must satisfy the
// strict schema — hence the uppercase here.
const ORIGINAL_PASSWORD = 'password123!'
const NEW_PASSWORD = 'NewPass456!'

const CHANGE_PASSWORD = `mutation ($input: ChangePasswordInput!) {
  changePassword(input: $input) {
    ... on ChangePasswordSuccess { data { success } }
    ... on IncorrectCurrentPasswordError { message }
  }
}`

const REQUEST_PASSWORD_RESET = `mutation ($input: RequestPasswordResetInput!) {
  requestPasswordReset(input: $input) {
    ... on RequestPasswordResetSuccess { data { success } }
  }
}`

const REQUEST_EMAIL_VERIFICATION = `mutation ($input: RequestEmailVerificationInput!) {
  requestEmailVerification(input: $input) {
    ... on RequestEmailVerificationSuccess { data { success } }
  }
}`

const DELETE_ACCOUNT = `mutation ($input: DeleteAccountInput!) {
  deleteAccount(input: $input) {
    __typename
    ... on DeleteAccountSuccess { data { success } }
    ... on CannotDeleteWithOwnedOrgsError { message }
  }
}`

// Regression guard for a fixed bug: `deleteAccount`'s sole-owner check used
// `eq(members.role, 'owner')`, but membership roles are stored namespaced as
// `'org:owner'`, so the guard never matched and a sole owner could orphan their
// org. Fixed to `like(members.role, '%owner%')` (mirrors OrganizationService).

describe('account flows (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp()
  }, 120_000)
  afterAll(() => h.close())

  it('changePassword: happy path changes the credential', async () => {
    const u = await h.signUp('cp-happy@ex.com', 'CP Happy', ORIGINAL_PASSWORD)
    const res = await h.gql(
      CHANGE_PASSWORD,
      { input: { currentPassword: ORIGINAL_PASSWORD, newPassword: NEW_PASSWORD } },
      u.token,
      u.ip,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data?.changePassword?.data?.success).toBe(true)

    const signedIn = await h.signIn('cp-happy@ex.com', NEW_PASSWORD, u.ip)
    expect(signedIn.status).toBe(200)
  })

  it('changePassword: wrong current password resolves to a typed error member', async () => {
    const u = await h.signUp('cp-wrong@ex.com', 'CP Wrong', ORIGINAL_PASSWORD)
    const res = await h.gql(
      CHANGE_PASSWORD,
      { input: { currentPassword: 'NotThePassword1!', newPassword: NEW_PASSWORD } },
      u.token,
      u.ip,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data?.changePassword?.message).toBeTruthy()
  })

  it('changePassword: unauthenticated is denied', async () => {
    const res = await h.gql(
      CHANGE_PASSWORD,
      { input: { currentPassword: ORIGINAL_PASSWORD, newPassword: NEW_PASSWORD } },
    )
    expect(res.errors).toBeTruthy()
  })

  it('requestPasswordReset: public and does not leak account existence', async () => {
    const res = await h.gql(
      REQUEST_PASSWORD_RESET,
      { input: { email: 'nobody-here@ex.com' } },
    )
    expect(res.errors).toBeUndefined()
    expect(res.data?.requestPasswordReset?.data?.success).toBe(true)
  })

  it('requestEmailVerification: authed succeeds', async () => {
    const u = await h.signUp('verify@ex.com', 'Verify', ORIGINAL_PASSWORD)
    const res = await h.gql(REQUEST_EMAIL_VERIFICATION, { input: {} }, u.token, u.ip)
    expect(res.errors).toBeUndefined()
    expect(res.data?.requestEmailVerification?.data?.success).toBe(true)
  })

  it('requestEmailVerification: unauthenticated is denied', async () => {
    const res = await h.gql(REQUEST_EMAIL_VERIFICATION, { input: {} })
    expect(res.errors).toBeTruthy()
  })

  it('deleteAccount: succeeds for a user with no owned orgs', async () => {
    const u = await h.signUp('del-ok@ex.com', 'Del OK', ORIGINAL_PASSWORD)
    // The user has a credential account, so the current password is required.
    const res = await h.gql(DELETE_ACCOUNT, { input: { currentPassword: ORIGINAL_PASSWORD } }, u.token, u.ip)
    expect(res.errors).toBeUndefined()
    expect(res.data?.deleteAccount?.data?.success).toBe(true)
    // B3-dependent: cannot assert the deleted user can no longer sign in — the
    // soft-delete sign-in filter is not on this branch.
  })

  it('deleteAccount: blocked by an owned organization', async () => {
    const u = await h.signUp('del-owner@ex.com', 'Del Owner', ORIGINAL_PASSWORD)
    await h.createOrganization(u.token, 'Owned Org', 'owned-org', u.ip)
    const res = await h.gql(DELETE_ACCOUNT, { input: { currentPassword: ORIGINAL_PASSWORD } }, u.token, u.ip)
    expect(res.errors).toBeUndefined()
    // A sole owner cannot delete their account (would orphan the org).
    expect(res.data?.deleteAccount?.__typename).toBe('CannotDeleteWithOwnedOrgsError')
    expect(res.data?.deleteAccount?.message).toBeTruthy()
  })
})
