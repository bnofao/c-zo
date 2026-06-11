import type { AuthHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from './harness'

// Boots auth with all four audiences SERVED so we can assert per-audience
// presence/isolation by introspecting each `/graphql/<name>` endpoint's root
// types. The introspection query needs no auth — schema introspection is
// allowed on any mounted endpoint.

describe('graphQL audience sub-graphs', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp({ subGraphs: ['public', 'account', 'org', 'admin'] })
  }, 120_000)
  afterAll(() => h.close())

  const fieldNames = async (path: string, root: 'Query' | 'Mutation') => {
    const res = await h.app.fetch(new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `query { __type(name: "${root}") { fields { name } } }` }),
    }))
    const body = (await res.json()) as { data?: { __type?: { fields?: { name: string }[] } } }
    return (body.data?.__type?.fields ?? []).map(f => f.name)
  }

  it('/graphql/admin exposes all admin operations (silent-drop guard)', async () => {
    const q = await fieldNames('/graphql/admin', 'Query')
    const m = await fieldNames('/graphql/admin', 'Mutation')
    for (const f of ['user', 'users']) expect(q).toContain(f)
    for (const f of ['createUser', 'updateUser', 'removeUser', 'banUser', 'unbanUser', 'setRole', 'setUserPassword', 'revokeSession', 'revokeSessions', 'startImpersonation', 'stopImpersonation'])
      expect(m).toContain(f)
  })

  it('/graphql/admin omits account/org operations (isolation)', async () => {
    const m = await fieldNames('/graphql/admin', 'Mutation')
    for (const f of ['changePassword', 'createOrganization', 'createApiKey']) expect(m).not.toContain(f)
  })

  it('/graphql/org exposes org management ops + queries (silent-drop guard)', async () => {
    const q = await fieldNames('/graphql/org', 'Query')
    const m = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['organization', 'organizations', 'members', 'checkSlug', 'invitation', 'invitations', 'organizationApiKeys'])
      expect(q).toContain(f)
    for (const f of ['createOrganization', 'updateOrganization', 'deleteOrganization', 'inviteMember', 'removeMember', 'updateMemberRole', 'cancelInvitation'])
      expect(m).toContain(f)
  })

  it('/graphql/org omits the account self-ops and admin ops (isolation)', async () => {
    const m = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['acceptInvitation', 'leaveOrganization', 'setActiveOrganization', 'createUser']) expect(m).not.toContain(f)
  })

  it('/graphql/account exposes account mutations + self org-ops + myInvitations (silent-drop guard)', async () => {
    const q = await fieldNames('/graphql/account', 'Query')
    const m = await fieldNames('/graphql/account', 'Mutation')
    expect(q).toContain('myInvitations')
    for (const f of ['changePassword', 'requestPasswordReset', 'resetPassword', 'requestEmailVerification', 'verifyEmail', 'requestEmailChange', 'confirmEmailChange', 'deleteAccount', 'restoreAccount', 'acceptInvitation', 'rejectInvitation', 'leaveOrganization', 'setActiveOrganization'])
      expect(m).toContain(f)
  })

  it('/graphql/account omits org-management + admin ops (isolation)', async () => {
    const m = await fieldNames('/graphql/account', 'Mutation')
    for (const f of ['inviteMember', 'createOrganization', 'createUser', 'banUser']) expect(m).not.toContain(f)
  })

  it('api-key ops are split per audience (account personal vs org)', async () => {
    const accM = await fieldNames('/graphql/account', 'Mutation')
    const orgM = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['createApiKey', 'updateApiKey', 'removeApiKey']) {
      expect(accM).toContain(f)
      expect(orgM).not.toContain(f)
    }
    for (const f of ['createOrganizationApiKey', 'updateOrganizationApiKey', 'removeOrganizationApiKey']) {
      expect(orgM).toContain(f)
      expect(accM).not.toContain(f)
    }
    expect(await fieldNames('/graphql/account', 'Query')).toEqual(expect.arrayContaining(['myApiKeys', 'apiKey']))
    expect(await fieldNames('/graphql/org', 'Query')).toEqual(expect.arrayContaining(['organizationApiKeys', 'organizationApiKey']))
  })

  it('apiKeyOwnerInput / ApiKeyOwnerType are gone from every served schema', async () => {
    for (const a of ['account', 'org', 'admin']) {
      const res = await h.app.fetch(new Request(`http://localhost/graphql/${a}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: `query { __type(name: "ApiKeyOwnerInput") { name } }` }),
      }))
      expect(((await res.json()) as { data: { __type: unknown } }).data.__type).toBeNull()
    }
  })

  it('node(id:) query is present per served audience (relay Node tagged into each sub-graph)', async () => {
    for (const a of ['account', 'org', 'admin'])
      expect(await fieldNames(`/graphql/${a}`, 'Query')).toContain('node')
  })
})
