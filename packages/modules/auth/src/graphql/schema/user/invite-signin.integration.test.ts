import type { SendEmailInput } from '@czo/kit/email'
import type { AuthHarness } from '../../../e2e/harness'
import { EmailService } from '@czo/kit/email'
import { decodeGlobalID } from '@czo/kit/graphql'
import { Effect, Layer } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from '../../../e2e/harness'

// ─── Regression coverage for the invite-only sign-in Critical ────────────────
// `UserService.create` inserts NO `credential` account row for invite-only
// users (no password). Every set-password path was UPDATE-only
// (`setCredentialPassword` → `updateCredentialPassword`), so it matched 0 rows
// and silently no-op'd: the invited user's `resetPassword` call "succeeded"
// but never wrote a password, and they could never sign in. This suite drives
// the real end-to-end flow through the booted app (create → capture email →
// extract token → resetPassword → SIGN IN) so the missing sign-in assertion
// that would have caught this is now in place. It also proves the
// `bypassCooldown` fix on `resendInvitation` (Fix 3): resending immediately
// after creation must still dispatch a second email instead of silently
// no-op'ing on the 60s cooldown.

const sent: SendEmailInput[] = []
const EmailCapture = Layer.succeed(EmailService, {
  send: (input: SendEmailInput) => Effect.sync(() => { sent.push(input) }),
})

async function waitFor<T>(get: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const v = get()
    if (v !== undefined)
      return v
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('timed out waiting for captured email')
}

/** Extracts the raw reset token from a `/reset-password?token=<TOKEN>` link in an email body. */
function extractResetToken(html: string): string {
  const match = html.match(/\/reset-password\?token=([^"&\s<]+)/)
  const token = match?.[1]
  if (!token)
    throw new Error(`no reset-password token found in email html: ${html}`)
  return token
}

const CREATE_USER = `mutation ($input: CreateUserInput!) {
  createUser(input: $input) {
    __typename
    ... on CreateUserSuccess { data { user { id email emailVerified } } }
  }
}`

const RESEND_INVITATION = `mutation ($input: ResendInvitationInput!) {
  resendInvitation(input: $input) {
    __typename
    ... on ResendInvitationSuccess { data { success } }
  }
}`

const RESET_PASSWORD = `mutation ($input: ResetPasswordInput!) {
  resetPassword(input: $input) {
    __typename
    ... on ResetPasswordSuccess { data { success } }
    ... on InvalidPasswordResetTokenError { message }
  }
}`

const ME = `query { me { id emailVerified } }`

// Mirrors `adminActor` in `create-user-invite.integration.test.ts`: this suite
// also creates users via the `createUser` mutation, which advances the real DB
// id sequence without advancing the harness's own `signUpCount`-based counter.
async function adminActor(h: AuthHarness, email: string) {
  const a = await h.signUp(email, 'Admin', 'password123!')
  const me = await h.gql('query { me { id } }', {}, a.token, a.ip)
  const numericId = Number(decodeGlobalID(me.data.me.id).id)
  await h.grantGlobalRole(numericId, 'admin')
  const re = await h.signIn(email, 'password123!', a.ip)
  const token = ((await re.json()) as { token: string }).token
  return { ...a, token }
}

describe('invite-only user: reset link sets a password and sign-in works (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp({ services: EmailCapture })
  }, 120_000)
  afterAll(() => h.close())

  it('invited user with no credential account can set a password via the reset link and sign in', async () => {
    const admin = await adminActor(h, 'invite-signin-admin@ex.com')

    const created = await h.gql(
      CREATE_USER,
      { input: { email: 'invite-signin-user@ex.com', name: 'Invited User', invite: true } },
      admin.token,
      admin.ip,
    )
    expect(created.errors).toBeUndefined()
    expect(created.data?.createUser?.__typename).toBe('CreateUserSuccess')
    expect(created.data.createUser.data.user.emailVerified).toBe(false)

    const mail = await waitFor(() => sent.find(m => m.to === 'invite-signin-user@ex.com'))
    const token = extractResetToken(mail.html)

    const reset = await h.gql(
      RESET_PASSWORD,
      { input: { token, newPassword: 'brandNewPassword123!' } },
      undefined,
      admin.ip,
    )
    expect(reset.errors).toBeUndefined()
    expect(reset.data?.resetPassword?.__typename).toBe('ResetPasswordSuccess')
    expect(reset.data?.resetPassword?.data?.success).toBe(true)

    // The Critical this test guards against: before the fix, the credential
    // row was never inserted, so sign-in with the freshly-set password failed.
    const signInRes = await h.signIn('invite-signin-user@ex.com', 'brandNewPassword123!', admin.ip)
    expect(signInRes.ok).toBe(true)
    const signInBody = (await signInRes.json()) as { token?: string }
    expect(signInBody.token).toBeTruthy()

    // Fix 2: clicking the invitation/reset link proves email ownership.
    const me = await h.gql(ME, {}, signInBody.token, admin.ip)
    expect(me.errors).toBeUndefined()
    expect(me.data?.me?.emailVerified).toBe(true)
  })

  it('resendInvitation bypasses the 60s cooldown and dispatches a second email immediately', async () => {
    const admin = await adminActor(h, 'invite-cooldown-admin@ex.com')

    const created = await h.gql(
      CREATE_USER,
      { input: { email: 'invite-cooldown-user@ex.com', name: 'Cooldown User', invite: true } },
      admin.token,
      admin.ip,
    )
    expect(created.errors).toBeUndefined()
    expect(created.data?.createUser?.__typename).toBe('CreateUserSuccess')
    const userGid: string = created.data.createUser.data.user.id

    // First invitation email, from `createUser(invite: true)`.
    await waitFor(() => sent.find(m => m.to === 'invite-cooldown-user@ex.com'))
    const sentBefore = sent.filter(m => m.to === 'invite-cooldown-user@ex.com').length

    // Immediately resend, well within the 60s cooldown window.
    const resend = await h.gql(RESEND_INVITATION, { input: { id: userGid } }, admin.token, admin.ip)
    expect(resend.errors).toBeUndefined()
    expect(resend.data?.resendInvitation?.__typename).toBe('ResendInvitationSuccess')
    expect(resend.data?.resendInvitation?.data?.success).toBe(true)

    await waitFor(() => (sent.filter(m => m.to === 'invite-cooldown-user@ex.com').length > sentBefore ? true : undefined))
    const sentAfter = sent.filter(m => m.to === 'invite-cooldown-user@ex.com').length
    expect(sentAfter).toBe(sentBefore + 1)
  })
})
