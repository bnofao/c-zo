import type { SendEmailInput } from '@czo/kit/email'
import type { AuthHarness } from '../../../e2e/harness'
import { EmailService } from '@czo/kit/email'
import { decodeGlobalID, encodeGlobalID } from '@czo/kit/graphql'
import { Effect, Layer } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from '../../../e2e/harness'

// ─── Real schema-execution coverage for the resendInvitation resolver ────────
// Mirrors `create-user-invite.integration.test.ts` (Task 2): drives the actual
// GraphQL mutation through the booted app (bootAuthApp → bootTestApp, real
// h3/Yoga fetch handler) with the host EmailService swapped for a capturing
// layer, rather than calling AccountService.sendInvitation directly.

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

const CREATE_USER = `mutation ($input: CreateUserInput!) {
  createUser(input: $input) {
    __typename
    ... on CreateUserSuccess { data { user { id email } } }
  }
}`

const RESEND_INVITATION = `mutation ($input: ResendInvitationInput!) {
  resendInvitation(input: $input) {
    __typename
    ... on ResendInvitationSuccess { data { success } }
    ... on UserNotFoundError { message }
  }
}`

// Mirrors `adminActor` in `create-user-invite.integration.test.ts`: this suite
// also creates users via the `createUser` mutation, which advances the real DB
// id sequence without advancing the harness's own `signUpCount`-based counter.
// So fetch the actor's real numeric id via `me` rather than trusting it.
async function adminActor(h: AuthHarness, email: string) {
  const a = await h.signUp(email, 'Admin', 'password123!')
  const me = await h.gql('query { me { id } }', {}, a.token, a.ip)
  const numericId = Number(decodeGlobalID(me.data.me.id).id)
  await h.grantGlobalRole(numericId, 'admin')
  const re = await h.signIn(email, 'password123!', a.ip)
  const token = ((await re.json()) as { token: string }).token
  return { ...a, token }
}

describe('resendInvitation (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp({ services: EmailCapture })
  }, 120_000)
  afterAll(() => h.close())

  it('resends a fresh invitation email to an existing user', async () => {
    const admin = await adminActor(h, 'resend-admin-1@ex.com')

    // Create the user WITHOUT `invite: true` — no password-reset token is
    // written for them, so the very first `resendInvitation` call below can't
    // be shadowed by `sendInvitation`'s 60s cooldown (both share the
    // `password-reset:{userId}` identifier). Documented per the task's
    // instruction to pick the clean path over advancing time.
    const created = await h.gql(
      CREATE_USER,
      { input: { email: 'resend-invitee-1@ex.com', name: 'Resend Invitee', password: 'password123!' } },
      admin.token,
      admin.ip,
    )
    expect(created.errors).toBeUndefined()
    expect(created.data?.createUser?.__typename).toBe('CreateUserSuccess')
    const userGid: string = created.data.createUser.data.user.id

    const res = await h.gql(RESEND_INVITATION, { input: { id: userGid } }, admin.token, admin.ip)

    expect(res.errors).toBeUndefined()
    expect(res.data?.resendInvitation?.__typename).toBe('ResendInvitationSuccess')
    expect(res.data?.resendInvitation?.data?.success).toBe(true)

    const mail = await waitFor(() => sent.find(m => m.to === 'resend-invitee-1@ex.com'))
    expect(mail.html).toContain('/reset-password?token=')
  })

  it('returns UserNotFoundError when resending for a non-existent user id', async () => {
    const admin = await adminActor(h, 'resend-admin-2@ex.com')

    const res = await h.gql(
      RESEND_INVITATION,
      { input: { id: encodeGlobalID('User', '999999999') } },
      admin.token,
      admin.ip,
    )

    expect(res.errors).toBeUndefined()
    expect(res.data?.resendInvitation?.__typename).toBe('UserNotFoundError')
  })
})
