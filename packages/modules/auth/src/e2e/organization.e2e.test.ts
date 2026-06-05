import type { AuthHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from './harness'

const INVITE = `mutation ($i: InviteMemberInput!) { inviteMember(input: $i) {
  ... on InviteMemberSuccess { data { invitation { id } } } } }`
const ACCEPT = `mutation ($i: AcceptInvitationInput!) { acceptInvitation(input: $i) {
  ... on AcceptInvitationSuccess { data { member { id } } } } }`

describe('organization (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp()
  }, 120_000)
  afterAll(() => h.close())

  it('creates an organization (creator becomes owner)', async () => {
    const owner = await h.signUp('org-owner@ex.com', 'Owner', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'Acme', 'acme', owner.ip)
    expect(orgGlobalId).toBeTruthy()
  })

  it('enforces organization:update — owner can, plain viewer cannot', async () => {
    const owner = await h.signUp('org2-owner@ex.com', 'Owner2', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'Beta', 'beta', owner.ip)
    const viewer = await h.signUp('org2-viewer@ex.com', 'Viewer', 'password123!')

    const inv = await h.gql(
      INVITE,
      { i: { organizationId: orgGlobalId, email: 'org2-viewer@ex.com', role: 'org:viewer' } },
      owner.token,
      owner.ip,
    )
    const invId: string = inv.data.inviteMember.data.invitation.id
    const accepted = await h.gql(ACCEPT, { i: { invitationId: invId } }, viewer.token, viewer.ip)
    expect(accepted.errors).toBeUndefined()

    const denied = await h.gql(
      `mutation ($i: UpdateOrganizationInput!) { updateOrganization(input: $i) {
        ... on UpdateOrganizationSuccess { data { organization { id } } } } }`,
      { i: { id: orgGlobalId, name: 'Beta Renamed' } },
      viewer.token,
      viewer.ip,
    )
    // A plain viewer is denied by the `organization:update` authScope.
    expect(denied.errors).toBeTruthy()
    expect(denied.errors?.[0]?.message).toContain('Not authorized')
    expect(denied.data?.updateOrganization ?? null).toBeNull()

    // The owner clears the `organization:update` authScope and the rename succeeds.
    const ok = await h.gql(
      `mutation ($i: UpdateOrganizationInput!) { updateOrganization(input: $i) {
        ... on UpdateOrganizationSuccess { data { organization { id name } } } } }`,
      { i: { id: orgGlobalId, name: 'Beta Renamed' } },
      owner.token,
      owner.ip,
    )
    expect(ok.errors).toBeUndefined()
    expect(ok.data.updateOrganization.data.organization.name).toBe('Beta Renamed')
  })

  it('denies cross-org member reads', async () => {
    const a = await h.signUp('cross-a@ex.com', 'A', 'password123!')
    const b = await h.signUp('cross-b@ex.com', 'B', 'password123!')
    const orgA = await h.createOrganization(a.token, 'OrgA', 'org-a', a.ip)
    await h.createOrganization(b.token, 'OrgB', 'org-b', b.ip)
    const res = await h.gql(
      `query ($id: ID!) { members(organizationId: $id) { edges { node { id } } } }`,
      { id: orgA.orgGlobalId },
      b.token,
      b.ip,
    )
    expect(res.errors).toBeTruthy()
  })

  it('updateMemberRole — promoting a viewer to admin grants invitation:create', async () => {
    const owner = await h.signUp('umr-owner@ex.com', 'Owner', 'password123!')
    const { orgGlobalId, orgNumericId } = await h.createOrganization(owner.token, 'Umr', 'umr', owner.ip)
    const viewer = await h.signUp('umr-viewer@ex.com', 'Viewer', 'password123!')

    const inv = await h.gql(
      INVITE,
      { i: { organizationId: orgGlobalId, email: 'umr-viewer@ex.com', role: 'org:viewer' } },
      owner.token,
      owner.ip,
    )
    const accepted = await h.gql(
      ACCEPT,
      { i: { invitationId: inv.data.inviteMember.data.invitation.id } },
      viewer.token,
      viewer.ip,
    )
    const memberId: string = accepted.data.acceptInvitation.data.member.id

    // A plain viewer cannot invite.
    const deniedInvite = await h.gql(
      INVITE,
      { i: { organizationId: orgGlobalId, email: 'umr-third@ex.com', role: 'org:viewer' } },
      viewer.token,
      viewer.ip,
    )
    expect(deniedInvite.errors).toBeTruthy()
    expect(deniedInvite.data?.inviteMember ?? null).toBeNull()

    // Owner promotes the viewer to admin.
    const promoted = await h.gql(
      `mutation ($i: UpdateMemberRoleInput!) { updateMemberRole(input: $i) {
        ... on UpdateMemberRoleSuccess { data { member { id } } } } }`,
      { i: { memberId, organizationId: orgGlobalId, role: 'org:admin' } },
      owner.token,
      owner.ip,
    )
    expect(promoted.errors).toBeUndefined()
    expect(promoted.data.updateMemberRole.data.member.id).toBeTruthy()
    expect(orgNumericId).toBeTruthy()

    // Now that user can invite.
    const okInvite = await h.gql(
      INVITE,
      { i: { organizationId: orgGlobalId, email: 'umr-third@ex.com', role: 'org:viewer' } },
      viewer.token,
      viewer.ip,
    )
    expect(okInvite.errors).toBeUndefined()
    expect(okInvite.data.inviteMember.data.invitation.id).toBeTruthy()
  })

  it('removeMember — owner removes a member; a plain viewer is denied', async () => {
    const owner = await h.signUp('rm-owner@ex.com', 'Owner', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'Rm', 'rm-org', owner.ip)
    const viewer = await h.signUp('rm-viewer@ex.com', 'Viewer', 'password123!')
    const victim = await h.signUp('rm-victim@ex.com', 'Victim', 'password123!')

    const joinAs = async (email: string, user: { token: string, ip: string }) => {
      const inv = await h.gql(
        INVITE,
        { i: { organizationId: orgGlobalId, email, role: 'org:viewer' } },
        owner.token,
        owner.ip,
      )
      const acc = await h.gql(
        ACCEPT,
        { i: { invitationId: inv.data.inviteMember.data.invitation.id } },
        user.token,
        user.ip,
      )
      return acc.data.acceptInvitation.data.member.id as string
    }
    const viewerMemberId = await joinAs('rm-viewer@ex.com', viewer)
    const victimMemberId = await joinAs('rm-victim@ex.com', victim)

    // The owner holds `member:delete` and can remove a member.
    const asOwner = await h.gql(
      `mutation ($i: RemoveMemberInput!) { removeMember(input: $i) {
        ... on RemoveMemberSuccess { data { success } } } }`,
      { i: { memberId: victimMemberId, organizationId: orgGlobalId } },
      owner.token,
      owner.ip,
    )
    expect(asOwner.errors).toBeUndefined()
    expect(asOwner.data.removeMember.data.success).toBe(true)

    // A plain viewer lacks `member:delete` and is denied.
    const denied = await h.gql(
      `mutation ($i: RemoveMemberInput!) { removeMember(input: $i) {
        ... on RemoveMemberSuccess { data { success } } } }`,
      { i: { memberId: viewerMemberId, organizationId: orgGlobalId } },
      viewer.token,
      viewer.ip,
    )
    expect(denied.errors).toBeTruthy()
    expect(denied.errors?.[0]?.message).toContain('Not authorized')
    expect(denied.data?.removeMember ?? null).toBeNull()
  })

  it('rejectInvitation — invitee rejects a pending invite', async () => {
    const owner = await h.signUp('rej-owner@ex.com', 'Owner', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'Rej', 'rej-org', owner.ip)
    const invitee = await h.signUp('rej-invitee@ex.com', 'Invitee', 'password123!')

    const inv = await h.gql(
      INVITE,
      { i: { organizationId: orgGlobalId, email: 'rej-invitee@ex.com', role: 'org:viewer' } },
      owner.token,
      owner.ip,
    )
    const invId: string = inv.data.inviteMember.data.invitation.id

    const rejected = await h.gql(
      `mutation ($i: RejectInvitationInput!) { rejectInvitation(input: $i) {
        ... on RejectInvitationSuccess { data { invitation { id } } } } }`,
      { i: { invitationId: invId } },
      invitee.token,
      invitee.ip,
    )
    expect(rejected.errors).toBeUndefined()
    expect(rejected.data.rejectInvitation.data.invitation.id).toBeTruthy()
  })

  it('deleteOrganization — owner can, a non-owner member cannot', async () => {
    const owner = await h.signUp('del-owner@ex.com', 'Owner', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'Del', 'del-org', owner.ip)
    const admin = await h.signUp('del-admin@ex.com', 'Admin', 'password123!')

    const inv = await h.gql(
      INVITE,
      { i: { organizationId: orgGlobalId, email: 'del-admin@ex.com', role: 'org:admin' } },
      owner.token,
      owner.ip,
    )
    await h.gql(ACCEPT, { i: { invitationId: inv.data.inviteMember.data.invitation.id } }, admin.token, admin.ip)

    // An admin (non-owner) cannot delete.
    const denied = await h.gql(
      `mutation ($i: DeleteOrganizationInput!) { deleteOrganization(input: $i) {
        ... on DeleteOrganizationSuccess { data { success } } } }`,
      { i: { id: orgGlobalId } },
      admin.token,
      admin.ip,
    )
    expect(denied.errors).toBeTruthy()
    expect(denied.data?.deleteOrganization ?? null).toBeNull()

    // The owner can.
    const ok = await h.gql(
      `mutation ($i: DeleteOrganizationInput!) { deleteOrganization(input: $i) {
        ... on DeleteOrganizationSuccess { data { success } } } }`,
      { i: { id: orgGlobalId } },
      owner.token,
      owner.ip,
    )
    expect(ok.errors).toBeUndefined()
    expect(ok.data.deleteOrganization.data.success).toBe(true)
  })

  it('leaveOrganization — a member leaves their org', async () => {
    const owner = await h.signUp('leave-owner@ex.com', 'Owner', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'Leave', 'leave-org', owner.ip)
    const member = await h.signUp('leave-member@ex.com', 'Member', 'password123!')

    const inv = await h.gql(
      INVITE,
      { i: { organizationId: orgGlobalId, email: 'leave-member@ex.com', role: 'org:viewer' } },
      owner.token,
      owner.ip,
    )
    await h.gql(ACCEPT, { i: { invitationId: inv.data.inviteMember.data.invitation.id } }, member.token, member.ip)

    const left = await h.gql(
      `mutation ($i: LeaveOrganizationInput!) { leaveOrganization(input: $i) {
        ... on LeaveOrganizationSuccess { data { success } } } }`,
      { i: { organizationId: orgGlobalId } },
      member.token,
      member.ip,
    )
    expect(left.errors).toBeUndefined()
    expect(left.data.leaveOrganization.data.success).toBe(true)
  })

  it('organization(id) — a member can read their org; a non-member is denied', async () => {
    const owner = await h.signUp('q-owner@ex.com', 'Owner', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'QOrg', 'q-org', owner.ip)
    const stranger = await h.signUp('q-stranger@ex.com', 'Stranger', 'password123!')

    // A member (owner) holds `organization:read` and can read their own org.
    const asMember = await h.gql(
      `query ($id: ID!) { organization(id: $id) { id name } }`,
      { id: orgGlobalId },
      owner.token,
      owner.ip,
    )
    expect(asMember.errors).toBeUndefined()
    expect(asMember.data.organization.id).toBe(orgGlobalId)
    expect(asMember.data.organization.name).toBe('QOrg')

    const asStranger = await h.gql(
      `query ($id: ID!) { organization(id: $id) { id name } }`,
      { id: orgGlobalId },
      stranger.token,
      stranger.ip,
    )
    expect(asStranger.errors).toBeTruthy()
    expect(asStranger.data?.organization ?? null).toBeNull()
  })

  it('organizations — returns the caller\'s orgs', async () => {
    const owner = await h.signUp('list-owner@ex.com', 'Owner', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'Listed', 'listed-org', owner.ip)

    const res = await h.gql(
      `query { organizations { edges { node { id name } } } }`,
      {},
      owner.token,
      owner.ip,
    )
    expect(res.errors).toBeUndefined()
    const ids: string[] = res.data.organizations.edges.map((e: any) => e.node.id)
    expect(ids).toContain(orgGlobalId)
  })

  it('myInvitations — an invitee sees their pending invite', async () => {
    const owner = await h.signUp('mi-owner@ex.com', 'Owner', 'password123!')
    const { orgGlobalId } = await h.createOrganization(owner.token, 'MyInv', 'myinv-org', owner.ip)
    const invitee = await h.signUp('mi-invitee@ex.com', 'Invitee', 'password123!')

    const inv = await h.gql(
      INVITE,
      { i: { organizationId: orgGlobalId, email: 'mi-invitee@ex.com', role: 'org:viewer' } },
      owner.token,
      owner.ip,
    )
    const invId: string = inv.data.inviteMember.data.invitation.id

    const res = await h.gql(
      `query { myInvitations { edges { node { id } } } }`,
      {},
      invitee.token,
      invitee.ip,
    )
    expect(res.errors).toBeUndefined()
    const ids: string[] = res.data.myInvitations.edges.map((e: any) => e.node.id)
    expect(ids).toContain(invId)
  })
})
