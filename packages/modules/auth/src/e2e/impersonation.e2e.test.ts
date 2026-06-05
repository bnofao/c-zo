import type { AuthHarness } from './harness'
import { encodeGlobalID } from '@czo/kit/graphql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from './harness'

const START_IMPERSONATION = `mutation ($input: StartImpersonationInput!) {
  startImpersonation(input: $input) {
    __typename
    ... on StartImpersonationSuccess { data { session { id actorType } user { id email } } }
    ... on CannotImpersonateSelfError { message }
    ... on UserNotFoundError { message }
  }
}`

const STOP_IMPERSONATION = `mutation ($input: StopImpersonationInput!) {
  stopImpersonation(input: $input) {
    __typename
    ... on StopImpersonationSuccess { data { session { id actorType } user { id } } }
    ... on ImpersonationNotActiveError { message }
  }
}`

// A global admin role only takes effect on a session minted AFTER the role is
// granted, because the `permission` scope reads `ctx.auth.user.role` from the
// session context. So: signUp → grantGlobalRole('admin') → signIn again to mint
// a fresh token whose session reflects the admin role.
async function adminActor(h: AuthHarness, email: string) {
  const a = await h.signUp(email, 'Admin', 'password123!')
  await h.grantGlobalRole(a.userId, 'admin')
  const re = await h.signIn(email, 'password123!', a.ip)
  const token = ((await re.json()) as { token: string }).token
  return { ...a, token }
}

describe('impersonation (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp()
  }, 120_000)
  afterAll(() => h.close())

  it('non-admin is denied startImpersonation (lacks user:impersonate)', async () => {
    const caller = await h.signUp('imp-nonadmin@ex.com', 'Plain', 'password123!')
    const target = await h.signUp('imp-target-na@ex.com', 'Target', 'password123!')
    const res = await h.gql(
      START_IMPERSONATION,
      { input: { targetUserId: encodeGlobalID('User', String(target.userId)) } },
      caller.token,
      caller.ip,
    )
    expect(res.errors).toBeTruthy()
  })

  it('admin can impersonate a target user', async () => {
    const admin = await adminActor(h, 'imp-admin@ex.com')
    const target = await h.signUp('imp-target@ex.com', 'Target', 'password123!')
    const res = await h.gql(
      START_IMPERSONATION,
      { input: { targetUserId: encodeGlobalID('User', String(target.userId)) } },
      admin.token,
      admin.ip,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data?.startImpersonation?.__typename).toBe('StartImpersonationSuccess')
    expect(res.data?.startImpersonation?.data?.user?.email).toBe('imp-target@ex.com')
    // The impersonation child session is created with actorType 'user'
    // (impersonations are identified by impersonatedBy, not actorType).
    expect(res.data?.startImpersonation?.data?.session?.actorType).toBe('user')
  })

  it('cannotImpersonateSelf when admin targets their own id', async () => {
    const admin = await adminActor(h, 'imp-self@ex.com')
    const res = await h.gql(
      START_IMPERSONATION,
      { input: { targetUserId: encodeGlobalID('User', String(admin.userId)) } },
      admin.token,
      admin.ip,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data?.startImpersonation?.__typename).toBe('CannotImpersonateSelfError')
    expect(res.data?.startImpersonation?.message).toBeTruthy()
  })

  it('stopImpersonation returns ImpersonationNotActive when no impersonation is active', async () => {
    const caller = await h.signUp('imp-stop@ex.com', 'Stop', 'password123!')
    const res = await h.gql(STOP_IMPERSONATION, { input: {} }, caller.token, caller.ip)
    expect(res.errors).toBeUndefined()
    expect(res.data?.stopImpersonation?.__typename).toBe('ImpersonationNotActiveError')
    expect(res.data?.stopImpersonation?.message).toBeTruthy()
  })
})
