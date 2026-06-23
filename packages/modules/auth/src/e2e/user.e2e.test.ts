import type { AuthHarness } from './harness'
import { encodeGlobalID } from '@czo/kit/graphql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from './harness'

const LIST_USERS = `query {
  users {
    edges { node { id email } }
  }
}`

const LIST_USERS_ORDERED = `query ($orderBy: [UserOrderByInput!]) {
  users(orderBy: $orderBy) {
    edges { node { id email createdAt } }
  }
}`

const LIST_USERS_FILTERED = `query ($where: UserWhereInput) {
  users(where: $where) {
    edges { node { id email role } }
  }
}`

const BAN_USER = `mutation ($input: BanUserInput!) {
  banUser(input: $input) {
    __typename
    ... on BanUserSuccess { data { user { id banned } } }
    ... on ForbiddenError { message }
    ... on UserNotFoundError { message }
    ... on CannotBanSelfError { message }
    ... on UserAlreadyBannedError { message }
  }
}`

const UNBAN_USER = `mutation ($input: UnbanUserInput!) {
  unbanUser(input: $input) {
    __typename
    ... on UnbanUserSuccess { data { user { id banned } } }
    ... on UserNotFoundError { message }
    ... on UserNotBannedError { message }
  }
}`

const SET_ROLE = `mutation ($input: SetRoleInput!) {
  setRole(input: $input) {
    __typename
    ... on SetRoleSuccess { data { user { id role } } }
    ... on ForbiddenError { message }
    ... on UserNotFoundError { message }
    ... on InvalidRoleError { message }
    ... on CannotDemoteSelfError { message }
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

describe('user-admin (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp()
  }, 120_000)
  afterAll(() => h.close())

  it('non-admin is denied the users query', async () => {
    const caller = await h.signUp('user-na-list@ex.com', 'Plain', 'password123!')
    const res = await h.gql(LIST_USERS, {}, caller.token, caller.ip)
    expect(res.errors).toBeTruthy()
  })

  it('rejects user(id:) with a non-User global ID (globalID for-validation)', async () => {
    const admin = await adminActor(h, 'user-gid-mismatch@ex.com')
    // An Organization global ID where a User id is required → Pothos `for: 'User'`
    // rejects it at the schema boundary (top-level error) instead of silently
    // decoding it and querying the wrong numeric id (the manual-decode gap B16 closed).
    const res = await h.gql(
      `query ($id: ID!) { user(id: $id) { id email } }`,
      { id: encodeGlobalID('Organization', '1') },
      admin.token,
      admin.ip,
    )
    expect(res.errors).toBeTruthy()
    expect(res.data?.user ?? null).toBeNull()
  })

  it('admin lists users ordered by createdAt (orderBy folds array → object for the cursor parser)', async () => {
    const admin = await adminActor(h, 'user-admin-orderby@ex.com')
    await h.signUp('user-orderby-extra@ex.com', 'Extra', 'password123!')

    const res = await h.gql(
      LIST_USERS_ORDERED,
      { orderBy: [{ field: 'CREATED_AT', direction: 'DESC' }] },
      admin.token,
      admin.ip,
    )
    expect(res.errors).toBeUndefined()
    const rows = res.data?.users?.edges?.map((e: { node: { createdAt: string } }) => e.node.createdAt) ?? []
    expect(rows.length).toBeGreaterThanOrEqual(2)
    // Descending by creation time: each timestamp is ≤ the previous one.
    const sorted = [...rows].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    expect(rows).toEqual(sorted)
  })

  it('admin filters users by role (powers the Administrateurs tab)', async () => {
    const admin = await adminActor(h, 'user-role-filter-admin@ex.com')
    // A plain (non-admin) user that must NOT appear in the role=admin result.
    await h.signUp('user-role-filter-plain@ex.com', 'Plain', 'password123!')

    const admins = await h.gql(LIST_USERS_FILTERED, { where: { role: { eq: 'admin' } } }, admin.token, admin.ip)
    expect(admins.errors).toBeUndefined()
    const emails = admins.data?.users?.edges?.map((e: { node: { email: string } }) => e.node.email) ?? []
    const roles = admins.data?.users?.edges?.map((e: { node: { role: string } }) => e.node.role) ?? []
    expect(roles.length).toBeGreaterThanOrEqual(1)
    expect(roles.every((r: string) => r === 'admin')).toBe(true)
    expect(emails).not.toContain('user-role-filter-plain@ex.com')
  })

  it('admin lists users and bans a victim', async () => {
    const admin = await adminActor(h, 'user-admin-list@ex.com')
    const victim = await h.signUp('user-victim-ban@ex.com', 'Victim', 'password123!')

    const list = await h.gql(LIST_USERS, {}, admin.token, admin.ip)
    expect(list.errors).toBeUndefined()
    expect(list.data?.users?.edges?.length).toBeGreaterThanOrEqual(1)

    const res = await h.gql(
      BAN_USER,
      { input: { id: encodeGlobalID('User', String(victim.userId)) } },
      admin.token,
      admin.ip,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data?.banUser?.__typename).toBe('BanUserSuccess')
    expect(res.data?.banUser?.data?.user?.banned).toBe(true)
  })

  it('admin bans then unbans a victim', async () => {
    const admin = await adminActor(h, 'user-admin-unban@ex.com')
    const victim = await h.signUp('user-victim-unban@ex.com', 'Victim', 'password123!')
    const victimId = encodeGlobalID('User', String(victim.userId))

    const banned = await h.gql(BAN_USER, { input: { id: victimId } }, admin.token, admin.ip)
    expect(banned.errors).toBeUndefined()
    expect(banned.data?.banUser?.data?.user?.banned).toBe(true)

    const res = await h.gql(UNBAN_USER, { input: { id: victimId } }, admin.token, admin.ip)
    expect(res.errors).toBeUndefined()
    expect(res.data?.unbanUser?.__typename).toBe('UnbanUserSuccess')
    expect(res.data?.unbanUser?.data?.user?.banned).toBe(false)
  })

  it('cannotBanSelf when admin bans their own id', async () => {
    const admin = await adminActor(h, 'user-admin-banself@ex.com')
    const res = await h.gql(
      BAN_USER,
      { input: { id: encodeGlobalID('User', String(admin.userId)) } },
      admin.token,
      admin.ip,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data?.banUser?.__typename).toBe('CannotBanSelfError')
    expect(res.data?.banUser?.message).toBeTruthy()
  })

  it('non-admin is denied setRole', async () => {
    const caller = await h.signUp('user-na-setrole@ex.com', 'Plain', 'password123!')
    const target = await h.signUp('user-target-setrole@ex.com', 'Target', 'password123!')
    const res = await h.gql(
      SET_ROLE,
      { input: { id: encodeGlobalID('User', String(target.userId)), role: 'admin:viewer' } },
      caller.token,
      caller.ip,
    )
    expect(res.errors).toBeTruthy()
  })

  it('admin sets a victim role', async () => {
    const admin = await adminActor(h, 'user-admin-setrole@ex.com')
    const victim = await h.signUp('user-victim-setrole@ex.com', 'Victim', 'password123!')
    const res = await h.gql(
      SET_ROLE,
      { input: { id: encodeGlobalID('User', String(victim.userId)), role: 'admin:viewer' } },
      admin.token,
      admin.ip,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data?.setRole?.__typename).toBe('SetRoleSuccess')
    // `role` is exposed as a single String on the User type (u.role ?? 'user').
    expect(res.data?.setRole?.data?.user?.role).toBe('admin:viewer')
  })
})
