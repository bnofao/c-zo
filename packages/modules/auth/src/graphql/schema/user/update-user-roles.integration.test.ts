import type { AuthHarness } from '../../../e2e/harness'
import { decodeGlobalID } from '@czo/kit/graphql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from '../../../e2e/harness'

// Regression: `updateUser` must patch ONLY known columns. The relay resolver
// hands the service the whole mutation input (incl. the global-ID `id` object and
// `clientMutationId`); if those leak into `db.update(users).set(...)`, Postgres
// rejects the statement (`users.id` is GENERATED ALWAYS AS IDENTITY) → UserDbFailed.
//
// Also: `updateUser` role changes go through the SAME delegated-admin guard as
// `setRole` — it must not be a bypass route (see setrole-delegation tests).

const CREATE = `mutation ($input: CreateUserInput!) {
  createUser(input: $input) {
    __typename
    ... on CreateUserSuccess { data { user { id } } }
  }
}`

const UPDATE = `mutation ($input: UpdateUserInput!) {
  updateUser(input: $input) {
    __typename
    ... on UpdateUserSuccess { data { user { id role } } }
    ... on ForbiddenError { message }
    ... on UserNotFoundError { message }
    ... on ValidationError { message }
    ... on InvalidRoleError { message }
    ... on UserNoChangesError { message }
    ... on CannotDemoteSelfError { message }
    ... on RoleAssignmentDeniedError { message roles }
  }
}`

// The actor needs a role in EVERY domain it hands out (delegated-admin guard),
// so grant the top tier of both hierarchies used below.
async function adminActor(h: AuthHarness, email: string) {
  const a = await h.signUp(email, 'Admin', 'password123!')
  const me = await h.gql('query { me { id } }', {}, a.token, a.ip)
  const numericId = Number(decodeGlobalID(me.data.me.id).id)
  await h.grantGlobalRole(numericId, 'admin,api-key:admin')
  const re = await h.signIn(email, 'password123!', a.ip)
  const token = ((await re.json()) as { token: string }).token
  return { ...a, token }
}

describe('updateUser roles (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp()
  }, 120_000)
  afterAll(() => h.close())

  it('changes a user\'s roles to a multi-hierarchy set without failing on the id column', async () => {
    const admin = await adminActor(h, 'update-roles-admin@ex.com')

    const created = await h.gql(CREATE, {
      input: { email: 'update-roles-target@ex.com', name: 'Target', password: 'password123!' },
    }, admin.token, admin.ip)
    expect(created.data.createUser.__typename).toBe('CreateUserSuccess')
    const gid = created.data.createUser.data.user.id

    // Two roles across distinct hierarchies both registered by the auth module
    // boot (product/price/etc. live in their own modules, not booted here).
    const res = await h.gql(UPDATE, {
      input: { id: gid, role: ['admin:viewer', 'api-key:manager'] },
    }, admin.token, admin.ip)

    expect(res.errors).toBeUndefined()
    expect(res.data.updateUser.__typename).toBe('UpdateUserSuccess')
    expect(res.data.updateUser.data.user.role.split(',').sort()).toEqual(['admin:viewer', 'api-key:manager'])
  })

  it('applies the delegated-admin guard (no granting in a domain the actor lacks)', async () => {
    const admin = await adminActor(h, 'update-roles-guard@ex.com')

    const created = await h.gql(CREATE, {
      input: { email: 'update-roles-guard-target@ex.com', name: 'Target', password: 'password123!' },
    }, admin.token, admin.ip)
    const gid = created.data.createUser.data.user.id

    // The actor holds nothing in `apps` → updateUser must refuse, same as setRole.
    const res = await h.gql(UPDATE, {
      input: { id: gid, role: ['apps:viewer'] },
    }, admin.token, admin.ip)

    expect(res.data.updateUser.__typename).toBe('RoleAssignmentDeniedError')
    expect(res.data.updateUser.roles).toEqual(['apps:viewer'])
  })
})
