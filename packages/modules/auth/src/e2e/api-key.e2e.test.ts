import type { AuthHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from './harness'

// Account (personal) variants — owner is implicitly the session user.
const CREATE = `mutation ($i: CreateApiKeyInput!) { createApiKey(input: $i) {
  ... on CreateApiKeySuccess { data { apiKey { id name } plain } } } }`
const UPDATE = `mutation ($i: UpdateApiKeyInput!) { updateApiKey(input: $i) {
  ... on UpdateApiKeySuccess { data { apiKey { id name } } } } }`
const REMOVE = `mutation ($i: RemoveApiKeyInput!) { removeApiKey(input: $i) {
  ... on RemoveApiKeySuccess { data { success } } } }`
// Org variants — owner is the given organization.
const CREATE_ORG = `mutation ($i: CreateOrganizationApiKeyInput!) { createOrganizationApiKey(input: $i) {
  ... on CreateOrganizationApiKeySuccess { data { apiKey { id name } plain } } } }`
const MY_KEYS = `query { myApiKeys { edges { node { id name } } } }`
const ORG_KEYS = `query ($id: ID!) { organizationApiKeys(organizationId: $id) {
  edges { node { id name } } } }`

/** Personal (account) create input — owner is the session user. */
function createInput(name: string, slug: string) {
  return {
    name,
    group: 'default',
    prefix: slug,
  }
}

/** Org-scoped create input. */
function createOrgInput(organizationId: string, name: string, slug: string) {
  return {
    organizationId,
    name,
    group: 'default',
    prefix: slug,
  }
}

// The api-key GraphQL surface (create/update/remove/myApiKeys/apiKey/
// organizationApiKeys) was completed in B17: the schema is registered in
// `src/graphql/schema/index.ts`, `ApiKeyService.create` returns the one-time
// plaintext as `{ apiKey, plain }`, and the resolver surfaces it as `plain`.
describe('api-key (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp()
  }, 120_000)
  afterAll(() => h.close())

  it('a user creates a personal key for themselves', async () => {
    const user = await h.signUp('ak-self@ex.com', 'Self', 'password123!')
    const res = await h.gql(
      CREATE,
      { i: createInput('My Key', 'mk') },
      user.token,
      user.ip,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.createApiKey.data.apiKey.id).toBeTruthy()
    expect(typeof res.data.createApiKey.data.plain).toBe('string')
    expect(res.data.createApiKey.data.plain.length).toBeGreaterThan(0)
  })

  it('myApiKeys — a user sees their own key', async () => {
    const user = await h.signUp('ak-list@ex.com', 'Lister', 'password123!')
    const created = await h.gql(
      CREATE,
      { i: createInput('Listed Key', 'lk') },
      user.token,
      user.ip,
    )
    const keyId: string = created.data.createApiKey.data.apiKey.id

    const res = await h.gql(MY_KEYS, {}, user.token, user.ip)
    expect(res.errors).toBeUndefined()
    const ids: string[] = res.data.myApiKeys.edges.map((e: any) => e.node.id)
    expect(ids).toContain(keyId)
  })

  it('owner updates and removes their own key', async () => {
    const user = await h.signUp('ak-mutate@ex.com', 'Mutator', 'password123!')
    const created = await h.gql(
      CREATE,
      { i: createInput('Before', 'bf') },
      user.token,
      user.ip,
    )
    const keyId: string = created.data.createApiKey.data.apiKey.id

    const updated = await h.gql(
      UPDATE,
      { i: { id: keyId, name: 'After' } },
      user.token,
      user.ip,
    )
    expect(updated.errors).toBeUndefined()
    expect(updated.data.updateApiKey.data.apiKey.name).toBe('After')

    const removed = await h.gql(REMOVE, { i: { id: keyId } }, user.token, user.ip)
    expect(removed.errors).toBeUndefined()
    expect(removed.data.removeApiKey.data.success).toBe(true)
  })

  it('non-owner cannot update or remove another user\'s key', async () => {
    const owner = await h.signUp('ak-owner@ex.com', 'Owner', 'password123!')
    const stranger = await h.signUp('ak-stranger@ex.com', 'Stranger', 'password123!')
    const created = await h.gql(
      CREATE,
      { i: createInput('Private', 'pv') },
      owner.token,
      owner.ip,
    )
    const keyId: string = created.data.createApiKey.data.apiKey.id

    const deniedUpdate = await h.gql(
      UPDATE,
      { i: { id: keyId, name: 'Hacked' } },
      stranger.token,
      stranger.ip,
    )
    expect(deniedUpdate.errors).toBeTruthy()
    expect(deniedUpdate.data?.updateApiKey ?? null).toBeNull()

    const deniedRemove = await h.gql(REMOVE, { i: { id: keyId } }, stranger.token, stranger.ip)
    expect(deniedRemove.errors).toBeTruthy()
    expect(deniedRemove.data?.removeApiKey ?? null).toBeNull()
  })

  it('a member with api-key roles creates and lists an ORG-owned key; a non-member is denied', async () => {
    const owner = await h.signUp('ak-org-owner@ex.com', 'OrgOwner', 'password123!')
    const { orgGlobalId, orgNumericId } = await h.createOrganization(owner.token, 'AkOrg', 'ak-org', owner.ip)
    const member = await h.signUp('ak-org-member@ex.com', 'Member', 'password123!')
    const outsider = await h.signUp('ak-org-outsider@ex.com', 'Outsider', 'password123!')

    // Bring the member into the org as a viewer, then grant api-key create+read roles.
    const inv = await h.gql(
      `mutation ($i: InviteMemberInput!) { inviteMember(input: $i) {
        ... on InviteMemberSuccess { data { invitation { id } } } } }`,
      { i: { organizationId: orgGlobalId, email: 'ak-org-member@ex.com', role: 'org:viewer' } },
      owner.token,
      owner.ip,
    )
    await h.gql(
      `mutation ($i: AcceptInvitationInput!) { acceptInvitation(input: $i) {
        ... on AcceptInvitationSuccess { data { member { id } } } } }`,
      { i: { invitationId: inv.data.inviteMember.data.invitation.id } },
      member.token,
      member.ip,
    )
    // api-key:manager grants 'api-key':['create','update']; api-key:viewer grants 'read'.
    await h.setMemberRole(orgNumericId, member.userId, 'org:viewer,api-key:manager,api-key:viewer')

    // The member can create an org-owned key.
    const created = await h.gql(
      CREATE_ORG,
      { i: createOrgInput(orgGlobalId, 'Org Key', 'ok') },
      member.token,
      member.ip,
    )
    expect(created.errors).toBeUndefined()
    expect(created.data.createOrganizationApiKey.data.apiKey.id).toBeTruthy()
    const keyId: string = created.data.createOrganizationApiKey.data.apiKey.id

    // The member can list org keys (api-key:read).
    const listed = await h.gql(ORG_KEYS, { id: orgGlobalId }, member.token, member.ip)
    expect(listed.errors).toBeUndefined()
    const ids: string[] = listed.data.organizationApiKeys.edges.map((e: any) => e.node.id)
    expect(ids).toContain(keyId)

    // A non-member is denied org-key reads.
    const deniedRead = await h.gql(ORG_KEYS, { id: orgGlobalId }, outsider.token, outsider.ip)
    expect(deniedRead.errors).toBeTruthy()
    expect(deniedRead.data?.organizationApiKeys ?? null).toBeNull()

    // A non-member cannot create an org-owned key either.
    const deniedCreate = await h.gql(
      CREATE_ORG,
      { i: createOrgInput(orgGlobalId, 'Sneaky', 'sn') },
      outsider.token,
      outsider.ip,
    )
    expect(deniedCreate.errors).toBeTruthy()
    expect(deniedCreate.data?.createOrganizationApiKey ?? null).toBeNull()
  })
})
