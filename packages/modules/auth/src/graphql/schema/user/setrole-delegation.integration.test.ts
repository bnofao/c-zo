import type { AuthHarness } from '../../../e2e/harness'
import { encodeGlobalID } from '@czo/kit/graphql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from '../../../e2e/harness'

// Delegated-admin role model. Per domain, comparing the actor's tier to the
// change on the target:
//  • self, domain you already hold  → frozen (no raise / lower / remove).
//  • self, domain you don't hold    → any tier (self-onboarding).
//  • others, domain D               → tier_actor(D) ≥ max(before, after).
//  • plus: you cannot administer someone who outranks you in a domain you BOTH
//    hold (a domain where you hold nothing is gated by the per-domain rule, not
//    this seniority check).
// (The harness's grantGlobalRole is a system call — it bypasses the guard.)

const SET_ROLE = `mutation ($input: SetRoleInput!) {
  setRole(input: $input) {
    __typename
    ... on SetRoleSuccess { data { user { id role } } }
    ... on CannotDemoteSelfError { message }
    ... on RoleAssignmentDeniedError { message roles }
    ... on InvalidRoleError { message }
    ... on ForbiddenError { message }
    ... on UserNotFoundError { message }
  }
}`

async function actor(h: AuthHarness, email: string, role = 'admin') {
  const a = await h.signUp(email, 'Admin', 'password123!')
  await h.grantGlobalRole(a.userId, role)
  const re = await h.signIn(email, 'password123!', a.ip)
  const token = ((await re.json()) as { token: string }).token
  return { ...a, token, gid: encodeGlobalID('User', String(a.userId)) }
}

const gidOf = (userId: number) => encodeGlobalID('User', String(userId))

describe('setRole delegated-admin model (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp()
  }, 120_000)
  afterAll(() => h.close())

  it('self CAN onboard into a domain it does not hold yet, at any tier', async () => {
    const me = await actor(h, 'deleg-self-onboard@ex.com')
    const res = await h.gql(SET_ROLE, { input: { id: me.gid, role: ['admin', 'apps:admin'] } }, me.token, me.ip)
    expect(res.data.setRole.__typename).toBe('SetRoleSuccess')
    expect(res.data.setRole.data.user.role.split(',').sort()).toEqual(['admin', 'apps:admin'])
  })

  it('self CANNOT change its own role in a domain it already holds', async () => {
    const me = await actor(h, 'deleg-self-frozen@ex.com')
    const res = await h.gql(SET_ROLE, { input: { id: me.gid, role: ['admin:manager'] } }, me.token, me.ip)
    expect(res.data.setRole.__typename).toBe('CannotDemoteSelfError')
  })

  it('grants another user a role at/below the actor\'s tier in that domain', async () => {
    const me = await actor(h, 'deleg-grant-ok@ex.com')
    const victim = await h.signUp('deleg-victim1@ex.com', 'Victim', 'password123!')
    const res = await h.gql(SET_ROLE, { input: { id: gidOf(victim.userId), role: ['admin:manager'] } }, me.token, me.ip)
    expect(res.data.setRole.__typename).toBe('SetRoleSuccess')
    expect(res.data.setRole.data.user.role).toBe('admin:manager')
  })

  it('blocks granting a role in a domain where the actor holds nothing', async () => {
    const me = await actor(h, 'deleg-grant-nodomain@ex.com')
    const victim = await h.signUp('deleg-victim2@ex.com', 'Victim', 'password123!')
    const res = await h.gql(SET_ROLE, { input: { id: gidOf(victim.userId), role: ['apps:viewer'] } }, me.token, me.ip)
    expect(res.data.setRole.__typename).toBe('RoleAssignmentDeniedError')
    expect(res.data.setRole.roles).toEqual(['apps:viewer'])
  })

  it('after self-onboarding a domain, grants others there only up to the actor\'s tier', async () => {
    const me = await actor(h, 'deleg-onboard-then-grant@ex.com')
    // Self-onboard apps at the manager tier.
    const onboard = await h.gql(SET_ROLE, { input: { id: me.gid, role: ['admin', 'apps:manager'] } }, me.token, me.ip)
    expect(onboard.data.setRole.__typename).toBe('SetRoleSuccess')

    const victim = await h.signUp('deleg-victim3@ex.com', 'Victim', 'password123!')
    // ≤ actor's apps tier (manager) → allowed.
    const ok = await h.gql(SET_ROLE, { input: { id: gidOf(victim.userId), role: ['apps:viewer'] } }, me.token, me.ip)
    expect(ok.data.setRole.__typename).toBe('SetRoleSuccess')
    // Above actor's apps tier (admin > manager) → denied.
    const denied = await h.gql(SET_ROLE, { input: { id: gidOf(victim.userId), role: ['apps:admin'] } }, me.token, me.ip)
    expect(denied.data.setRole.__typename).toBe('RoleAssignmentDeniedError')
  })

  it('cannot administer a user who outranks the actor in a shared domain', async () => {
    // Actor is admin:manager (has user:set-role); target is a full admin (higher
    // in the shared `admin` domain) — even an unrelated grant is refused.
    const manager = await actor(h, 'deleg-manager@ex.com', 'admin:manager')
    const senior = await h.signUp('deleg-senior@ex.com', 'Senior', 'password123!')
    await h.grantGlobalRole(senior.userId, 'admin')
    const res = await h.gql(SET_ROLE, { input: { id: gidOf(senior.userId), role: ['admin', 'apps:viewer'] } }, manager.token, manager.ip)
    expect(res.data.setRole.__typename).toBe('RoleAssignmentDeniedError')
  })

  it('administers another domain even if the target holds a role the actor lacks (left untouched)', async () => {
    // Actor is a full admin with NO apps role; target holds apps:viewer. A domain
    // the actor lacks is NOT a seniority block — the actor may grant an admin role
    // as long as it leaves the untouched `apps` role in place.
    const me = await actor(h, 'deleg-other-domain@ex.com')
    const target = await h.signUp('deleg-has-apps@ex.com', 'HasApps', 'password123!')
    await h.grantGlobalRole(target.userId, 'apps:viewer')
    const res = await h.gql(SET_ROLE, { input: { id: gidOf(target.userId), role: ['admin:viewer', 'apps:viewer'] } }, me.token, me.ip)
    expect(res.data.setRole.__typename).toBe('SetRoleSuccess')
    expect(res.data.setRole.data.user.role.split(',').sort()).toEqual(['admin:viewer', 'apps:viewer'])
  })

  it('but still cannot touch that lacked domain (per-domain rule)', async () => {
    // Same setup, but now the actor tries to change the target's `apps` role —
    // a domain the actor holds nothing in — which point 4 refuses.
    const me = await actor(h, 'deleg-touch-lacked@ex.com')
    const target = await h.signUp('deleg-has-apps2@ex.com', 'HasApps', 'password123!')
    await h.grantGlobalRole(target.userId, 'apps:viewer')
    const res = await h.gql(SET_ROLE, { input: { id: gidOf(target.userId), role: ['admin:viewer'] } }, me.token, me.ip)
    expect(res.data.setRole.__typename).toBe('RoleAssignmentDeniedError')
  })

  // createUser goes through the same guard for the roles it assigns at creation
  // (no target yet → "the actor dominates each requested role's domain").
  const CREATE_USER = `mutation ($input: CreateUserInput!) {
    createUser(input: $input) {
      __typename
      ... on CreateUserSuccess { data { user { id role } } }
      ... on RoleAssignmentDeniedError { message roles }
    }
  }`

  it('createUser grants roles at/below the actor\'s tier in domains it holds', async () => {
    const me = await actor(h, 'deleg-create-ok@ex.com')
    const res = await h.gql(CREATE_USER, {
      input: { email: 'deleg-created1@ex.com', name: 'Created', password: 'password123!', role: ['admin:viewer'] },
    }, me.token, me.ip)
    expect(res.data.createUser.__typename).toBe('CreateUserSuccess')
    expect(res.data.createUser.data.user.role.split(',')).toContain('admin:viewer')
  })

  it('createUser refuses roles in a domain the actor lacks', async () => {
    const me = await actor(h, 'deleg-create-denied@ex.com')
    const res = await h.gql(CREATE_USER, {
      input: { email: 'deleg-created2@ex.com', name: 'Created', password: 'password123!', role: ['apps:viewer'] },
    }, me.token, me.ip)
    expect(res.data.createUser.__typename).toBe('RoleAssignmentDeniedError')
    expect(res.data.createUser.roles).toEqual(['apps:viewer'])
  })
})
