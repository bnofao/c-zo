import type { AuthHarness } from '../../../e2e/harness'
import { decodeGlobalID } from '@czo/kit/graphql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from '../../../e2e/harness'

// The `User.accounts` field exposes the provider IDs of the user's linked login
// accounts, loaded (batched) via the accounts relation. Empty for an invite-only
// user (no credential yet); contains "credential" once a password exists.

const CREATE = `mutation ($input: CreateUserInput!) {
  createUser(input: $input) {
    __typename
    ... on CreateUserSuccess { data { user { id accounts } } }
  }
}`

const USERS = `query {
  users(first: 50) { edges { node { email accounts } } }
}`

async function adminActor(h: AuthHarness) {
  const a = await h.signUp('accounts-field-admin@ex.com', 'Admin', 'password123!')
  const me = await h.gql('query { me { id } }', {}, a.token, a.ip)
  const numericId = Number(decodeGlobalID(me.data.me.id).id)
  await h.grantGlobalRole(numericId, 'admin')
  const re = await h.signIn('accounts-field-admin@ex.com', 'password123!', a.ip)
  const token = ((await re.json()) as { token: string }).token
  return { ...a, token }
}

describe('user.accounts field (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp()
  }, 120_000)
  afterAll(() => h.close())

  it('is empty for an invite-only user and contains "credential" once a password is set', async () => {
    const admin = await adminActor(h)

    // invite-only (no password) → no credential account
    const invited = await h.gql(CREATE, {
      input: { email: 'accounts-invited@ex.com', name: 'Invited' },
    }, admin.token, admin.ip)
    expect(invited.data.createUser.__typename).toBe('CreateUserSuccess')
    expect(invited.data.createUser.data.user.accounts).toEqual([])

    // created with a password → a credential account exists
    const withPw = await h.gql(CREATE, {
      input: { email: 'accounts-withpw@ex.com', name: 'WithPw', password: 'password123!' },
    }, admin.token, admin.ip)
    expect(withPw.data.createUser.__typename).toBe('CreateUserSuccess')
    expect(withPw.data.createUser.data.user.accounts).toEqual(['credential'])

    // batched load across the list resolves per-user correctly
    const list = await h.gql(USERS, {}, admin.token, admin.ip)
    const byEmail = Object.fromEntries(
      (list.data.users.edges as { node: { email: string, accounts: string[] } }[]).map(e => [e.node.email, e.node.accounts]),
    )
    expect(byEmail['accounts-invited@ex.com']).toEqual([])
    expect(byEmail['accounts-withpw@ex.com']).toEqual(['credential'])
    expect(byEmail['accounts-field-admin@ex.com']).toEqual(['credential'])
  })
})
