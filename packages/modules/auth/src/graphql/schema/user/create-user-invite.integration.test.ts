import type { SendEmailInput } from '@czo/kit/email'
import type { AuthHarness } from '../../../e2e/harness'
import { EmailService } from '@czo/kit/email'
import { decodeGlobalID } from '@czo/kit/graphql'
import { Effect, Layer } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from '../../../e2e/harness'

// ─── Real schema-execution coverage for the createUser resolver ──────────────
// Task 2 made `createUser` invite-capable (`password` optional + `invite` flag
// → AccountService.sendInvitation). This drives the actual GraphQL mutation
// through the booted app (bootAuthApp → bootTestApp, real h3/Yoga fetch
// handler) rather than calling the services directly, so it exercises the
// resolver's `invite` gating and optional-password path, not just the
// underlying service composition (which `account.invitation.integration.test.ts`
// already covers). The host EmailService is swapped for a capturing layer via
// `bootAuthApp({ services })`, the same seam `email-injection.e2e.test.ts` uses.

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
    ... on CreateUserSuccess { data { user { id email emailVerified } } }
    ... on ValidationError { message }
    ... on UserAlreadyExistsError { message }
    ... on InvalidRoleError { message }
    ... on CredentialLinkFailedError { message }
    ... on PasswordHashFailedError { message }
  }
}`

// Mirrors `adminActor` in `user.e2e.test.ts`, with one difference: this suite
// also creates users via the `createUser` mutation (not `h.signUp`), which
// advances the real DB id sequence without advancing the harness's own
// `signUpCount`-based `userId` counter. So `a.userId` can no longer be trusted
// to name the right row — fetch the actor's real numeric id via `me` instead.
async function adminActor(h: AuthHarness, email: string) {
  const a = await h.signUp(email, 'Admin', 'password123!')
  const me = await h.gql('query { me { id } }', {}, a.token, a.ip)
  const numericId = Number(decodeGlobalID(me.data.me.id).id)
  await h.grantGlobalRole(numericId, 'admin')
  const re = await h.signIn(email, 'password123!', a.ip)
  const token = ((await re.json()) as { token: string }).token
  return { ...a, token }
}

describe('createUser invite (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp({ services: EmailCapture })
  }, 120_000)
  afterAll(() => h.close())

  it('invite: true creates a password-less user and sends an invitation email', async () => {
    const admin = await adminActor(h, 'invite-admin-1@ex.com')

    const res = await h.gql(
      CREATE_USER,
      { input: { email: 'invitee-1@ex.com', name: 'Invitee One', invite: true } },
      admin.token,
      admin.ip,
    )

    expect(res.errors).toBeUndefined()
    expect(res.data?.createUser?.__typename).toBe('CreateUserSuccess')
    const user = res.data?.createUser?.data?.user
    expect(user).toBeTruthy()
    expect(user.emailVerified).toBe(false)

    const mail = await waitFor(() => sent.find(m => m.to === 'invitee-1@ex.com'))
    expect(mail.html).toContain('/reset-password?token=')
  })

  it('invite omitted sends no invitation email', async () => {
    // `adminActor` itself triggers a "Verify your email" send for the admin's
    // own sign-up (a forked subscriber, not synchronous), so this asserts
    // absence by recipient rather than by array length — a plain length check
    // would be flaky against that unrelated, still-in-flight send.
    const admin = await adminActor(h, 'invite-admin-2@ex.com')

    const res = await h.gql(
      CREATE_USER,
      { input: { email: 'invitee-2@ex.com', name: 'Invitee Two', password: 'password123!' } },
      admin.token,
      admin.ip,
    )

    expect(res.errors).toBeUndefined()
    expect(res.data?.createUser?.__typename).toBe('CreateUserSuccess')

    // No subscriber fires for this path; give any stray activity a moment,
    // then assert nothing was captured for this recipient.
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(sent.find(m => m.to === 'invitee-2@ex.com')).toBeUndefined()
  })
})
