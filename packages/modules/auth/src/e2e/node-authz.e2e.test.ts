/**
 * E2E — relay `node(id:)` authorization for the auth domain's five
 * `drizzleNode`s (User, Organization, Member, Invitation, ApiKey), enforced by
 * the kit node-guard registry (`graphql/node-guards.ts`). Each guard returns the
 * SAME effective scope its query computes, so `node()` is never a weaker path:
 * an authorized caller gets the row, a denied (authenticated) caller gets
 * `node` = null — no error, existence not leaked.
 *
 * Boots the REAL app ([auth]) on a Testcontainers Postgres via the shared
 * `bootAuthApp` harness (default merged schema, all fields present) and drives
 * the REAL fetch handler. No mocks, no stubbed authz.
 */
import type { AuthHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from './harness'

let h: AuthHarness

beforeAll(async () => {
  h = await bootAuthApp()
}, 180_000)
afterAll(async () => {
  await h?.close()
})

const NODE_QUERY = `query ($id: ID!) { node(id: $id) { id __typename } }`
const readNode = (gid: string, token?: string) => h.gql(NODE_QUERY, { id: gid }, token)

/**
 * Sign in afresh to obtain a token whose session resolves the caller's CURRENT
 * global role. A role granted after sign-up only reaches an existing session
 * once the (async) cache invalidation propagates; a fresh sign-in sidesteps that
 * race deterministically by minting a new session that resolves the live role.
 */
async function signInToken(email: string, password: string): Promise<string> {
  const res = await h.signIn(email, password)
  const body = (await res.json()) as { token?: string }
  if (!res.ok || !body.token)
    throw new Error(`sign-in failed (${res.status}): ${JSON.stringify(body)}`)
  return body.token
}

// Org variants — owner is the given organization.
const CREATE_ORG_KEY = `mutation ($i: CreateOrganizationApiKeyInput!) { createOrganizationApiKey(input: $i) {
  ... on CreateOrganizationApiKeySuccess { data { apiKey { id } } } } }`
const CREATE_KEY = `mutation ($i: CreateApiKeyInput!) { createApiKey(input: $i) {
  ... on CreateApiKeySuccess { data { apiKey { id } } } } }`
const INVITE = `mutation ($i: InviteMemberInput!) { inviteMember(input: $i) {
  ... on InviteMemberSuccess { data { invitation { id } } } } }`
const ACCEPT = `mutation ($i: AcceptInvitationInput!) { acceptInvitation(input: $i) {
  ... on AcceptInvitationSuccess { data { member { id } } } } }`

describe('node(id:) authz on the User node (kit nodeGuards registry)', () => {
  it('allows a global user:read admin, denies a roleless authenticated user', async () => {
    // A reader with global `user:read` (admin:viewer grants user:read+list).
    // Granted via UserService.setRole keyed on the signup-counter user id, so
    // this block uses ONLY signUp (no createUser) to keep that counter aligned
    // with real serial ids. Sign in afresh so the new role is in the session.
    const reader = await h.signUp('na-user-reader@ex.com', 'Reader', 'password123!')
    await h.grantGlobalRole(reader.userId, 'admin:viewer')
    const readerToken = await signInToken('na-user-reader@ex.com', 'password123!')

    // A plain target user — its global id is fetched via the gated `users`
    // connection (the reader holds user:read+list), so no createUser is needed.
    await h.signUp('na-target@ex.com', 'Target', 'password123!')
    const listed = await h.gql(
      `query { users(first: 50) { edges { node { id email } } } }`,
      {},
      readerToken,
    )
    expect(listed.errors, `users list should succeed for the reader: ${JSON.stringify(listed.errors)}`).toBeUndefined()
    const targetEdge = (listed.data?.users?.edges ?? []).find((e: any) => e.node.email === 'na-target@ex.com')
    const userGid: string = targetEdge?.node?.id
    expect(userGid, 'target user must be listed').toBeTruthy()

    // Allowed: the reader reads the target User node.
    const allowed = await readNode(userGid, readerToken)
    expect(allowed.errors, `global user:read should succeed: ${JSON.stringify(allowed.errors)}`).toBeUndefined()
    expect(allowed.data?.node?.__typename).toBe('User')

    // Denied: a plain authenticated user with no global role → null, no error.
    const stranger = await h.signUp('na-user-stranger@ex.com', 'Stranger', 'password123!')
    const denied = await readNode(userGid, stranger.token)
    expect(denied.data?.node, 'a roleless user must not read a User node').toBeNull()
    expect(denied.errors).toBeUndefined()
  }, 120_000)
})

describe('node(id:) authz on the Organization node (kit nodeGuards registry)', () => {
  it('allows a member with organization:read, denies a non-member', async () => {
    // The creator becomes org:owner (cumulative → organization:read).
    const owner = await h.signUp('na-org-owner@ex.com', 'OrgOwner', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'OrgNode Co', 'orgnode-co', owner.ip)

    const allowed = await readNode(orgGlobalId, owner.token)
    expect(allowed.errors, `owner read should succeed: ${JSON.stringify(allowed.errors)}`).toBeUndefined()
    expect(allowed.data?.node?.__typename).toBe('Organization')

    // A non-member authed user → null, no error.
    const outsider = await h.signUp('na-org-outsider@ex.com', 'Outsider', 'password123!')
    const denied = await readNode(orgGlobalId, outsider.token)
    expect(denied.data?.node, 'a non-member must not read an Organization node').toBeNull()
    expect(denied.errors).toBeUndefined()
  }, 120_000)
})

describe('node(id:) authz on the Member node (kit nodeGuards registry)', () => {
  it('allows a caller with member:read in the org, denies a non-member', async () => {
    // Owner creates org + invites a member who accepts → a real Member row.
    const owner = await h.signUp('na-mem-owner@ex.com', 'MemOwner', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'MemberNode Co', 'membernode-co', owner.ip)
    const member = await h.signUp('na-mem-member@ex.com', 'Member', 'password123!')
    const inv = await h.gql(
      INVITE,
      { i: { organizationId: orgGlobalId, email: 'na-mem-member@ex.com', role: 'org:viewer' } },
      owner.token,
      owner.ip,
    )
    expect(inv.errors).toBeUndefined()
    const accepted = await h.gql(
      ACCEPT,
      { i: { invitationId: inv.data.inviteMember.data.invitation.id } },
      member.token,
      member.ip,
    )
    expect(accepted.errors).toBeUndefined()
    const memberGid: string = accepted.data.acceptInvitation.data.member.id
    expect(memberGid).toBeTruthy()

    // The owner (org:owner → member:read) reads the member node.
    const allowed = await readNode(memberGid, owner.token)
    expect(allowed.errors, `owner read should succeed: ${JSON.stringify(allowed.errors)}`).toBeUndefined()
    expect(allowed.data?.node?.__typename).toBe('Member')

    // A non-member authed user → null, no error.
    const outsider = await h.signUp('na-mem-outsider@ex.com', 'Outsider', 'password123!')
    const denied = await readNode(memberGid, outsider.token)
    expect(denied.data?.node, 'a non-member must not read a Member node').toBeNull()
    expect(denied.errors).toBeUndefined()
  }, 120_000)
})

describe('node(id:) authz on the Invitation node (kit nodeGuards registry)', () => {
  it('allows the invitee (self-email) and a member with invitation:read, denies an unrelated user', async () => {
    const owner = await h.signUp('na-inv-owner@ex.com', 'InvOwner', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'InviteNode Co', 'invitenode-co', owner.ip)

    // The invitee — addressed by email; never joins.
    const invitee = await h.signUp('na-inv-invitee@ex.com', 'Invitee', 'password123!')
    const inv = await h.gql(
      INVITE,
      { i: { organizationId: orgGlobalId, email: 'na-inv-invitee@ex.com', role: 'org:viewer' } },
      owner.token,
      owner.ip,
    )
    expect(inv.errors).toBeUndefined()
    const invitationGid: string = inv.data.inviteMember.data.invitation.id
    expect(invitationGid).toBeTruthy()

    // Allowed (self-email branch): the invitee reads their own invitation.
    const asInvitee = await readNode(invitationGid, invitee.token)
    expect(asInvitee.errors, `invitee read should succeed: ${JSON.stringify(asInvitee.errors)}`).toBeUndefined()
    expect(asInvitee.data?.node?.__typename).toBe('Invitation')

    // Allowed (org-permission branch): the owner holds invitation:read.
    const asOwner = await readNode(invitationGid, owner.token)
    expect(asOwner.errors, `owner read should succeed: ${JSON.stringify(asOwner.errors)}`).toBeUndefined()
    expect(asOwner.data?.node?.__typename).toBe('Invitation')

    // Denied: an unrelated authed user (not the invitee, not a member) → null.
    const stranger = await h.signUp('na-inv-stranger@ex.com', 'Stranger', 'password123!')
    const denied = await readNode(invitationGid, stranger.token)
    expect(denied.data?.node, 'an unrelated user must not read an Invitation node').toBeNull()
    expect(denied.errors).toBeUndefined()
  }, 120_000)
})

describe('node(id:) authz on the ApiKey node (kit nodeGuards registry)', () => {
  it('allows the owning user for a personal key, denies a stranger', async () => {
    const owner = await h.signUp('na-key-owner@ex.com', 'KeyOwner', 'password123!')
    const created = await h.gql(
      CREATE_KEY,
      { i: { name: 'Personal', group: 'default', prefix: 'pk' } },
      owner.token,
      owner.ip,
    )
    expect(created.errors).toBeUndefined()
    const keyGid: string = created.data.createApiKey.data.apiKey.id
    expect(keyGid).toBeTruthy()

    // The owner reads their own key node.
    const allowed = await readNode(keyGid, owner.token)
    expect(allowed.errors, `owner read should succeed: ${JSON.stringify(allowed.errors)}`).toBeUndefined()
    expect(allowed.data?.node?.__typename).toBe('ApiKey')

    // A stranger (not the owner) → null, no error.
    const stranger = await h.signUp('na-key-stranger@ex.com', 'Stranger', 'password123!')
    const denied = await readNode(keyGid, stranger.token)
    expect(denied.data?.node, 'a non-owner must not read a personal ApiKey node').toBeNull()
    expect(denied.errors).toBeUndefined()
  }, 120_000)

  it('allows a member of the owning org for an org key, denies a non-member', async () => {
    const owner = await h.signUp('na-orgkey-owner@ex.com', 'OrgKeyOwner', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'OrgKeyNode Co', 'orgkeynode-co', owner.ip)

    // Bring a member into the org, then grant api-key create+read via the
    // updateMemberRole mutation (owner has member:update). Granting through the
    // member's global id avoids any reliance on signup-counter user ids.
    const member = await h.signUp('na-orgkey-member@ex.com', 'Member', 'password123!')
    const inv = await h.gql(
      INVITE,
      { i: { organizationId: orgGlobalId, email: 'na-orgkey-member@ex.com', role: 'org:viewer' } },
      owner.token,
      owner.ip,
    )
    const accepted = await h.gql(
      ACCEPT,
      { i: { invitationId: inv.data.inviteMember.data.invitation.id } },
      member.token,
      member.ip,
    )
    const memberGid: string = accepted.data.acceptInvitation.data.member.id
    const roleUpdate = await h.gql(
      `mutation ($i: UpdateMemberRoleInput!) { updateMemberRole(input: $i) {
        ... on UpdateMemberRoleSuccess { data { member { id } } } } }`,
      { i: { memberId: memberGid, organizationId: orgGlobalId, role: 'org:viewer,api-key:manager,api-key:viewer' } },
      owner.token,
      owner.ip,
    )
    expect(roleUpdate.errors).toBeUndefined()

    // The member creates an org-owned key (api-key:create).
    const created = await h.gql(
      CREATE_ORG_KEY,
      { i: { organizationId: orgGlobalId, name: 'Org Key', group: 'default', prefix: 'ok' } },
      member.token,
      member.ip,
    )
    expect(created.errors).toBeUndefined()
    const keyGid: string = created.data.createOrganizationApiKey.data.apiKey.id
    expect(keyGid).toBeTruthy()

    // Any member of the owning org reads the org key node (read branch).
    const allowed = await readNode(keyGid, member.token)
    expect(allowed.errors, `member read should succeed: ${JSON.stringify(allowed.errors)}`).toBeUndefined()
    expect(allowed.data?.node?.__typename).toBe('ApiKey')

    // A non-member authed user → null, no error.
    const outsider = await h.signUp('na-orgkey-outsider@ex.com', 'Outsider', 'password123!')
    const denied = await readNode(keyGid, outsider.token)
    expect(denied.data?.node, 'a non-member must not read an org ApiKey node').toBeNull()
    expect(denied.errors).toBeUndefined()
  }, 120_000)
})
