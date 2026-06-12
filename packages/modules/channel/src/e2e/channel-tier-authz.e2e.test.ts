/**
 * E2E — platform-tier authorization for `@czo/channel`, proven end-to-end
 * through the REAL booted app on a Testcontainers Postgres.
 *
 * The channel surface has two tiers:
 *  - ORG channels (org != null) — gated on the ORG `channel:*` permission held
 *    by a member of that organization (`createChannel`, `channels`).
 *  - PLATFORM channels (org == null) — gated on the GLOBAL `channel:*` role
 *    granted via `UserService.setRole` (`createPlatformChannel`,
 *    `platformChannels`), and reachable via `node(id:)` only by a global holder.
 *
 * The two tiers are exercised by genuinely DISTINCT principals: a global
 * `channel:manager`/`:viewer` holder vs. a plain org member with no global
 * role. The node-guard yields deny-as-null (`node` = null, no `errors`) so
 * `node(id:)` is never a weaker read than the gated queries.
 *
 * A global role granted after sign-up only reaches a session once cache
 * invalidation propagates, so the global holder signs in afresh (matching
 * auth's node-authz.e2e.test.ts) to mint a session that resolves the live role.
 */
import type { ChannelHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootChannelApp } from './harness'

// ─── GraphQL operation strings ────────────────────────────────────────────────

const CREATE_PLATFORM = `mutation ($i: CreatePlatformChannelInput!) {
  createPlatformChannel(input: $i) {
    ... on CreatePlatformChannelSuccess { data { channel { id name } } }
  }
}`

const CREATE_ORG = `mutation ($i: CreateChannelInput!) {
  createChannel(input: $i) {
    ... on CreateChannelSuccess { data { channel { id name } } }
  }
}`

const NODE = `query ($id: ID!) { node(id: $id) { ... on Channel { id name } } }`

const PLATFORM_LIST = `query { platformChannels { edges { node { id name } } } }`

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Actor { token: string, userId: number, ip: string }

/** Sign in afresh so the caller's CURRENT global role lands in the session. */
async function signInToken(h: ChannelHarness, email: string, password: string, ip?: string): Promise<string> {
  const res = await h.signIn(email, password, ip)
  const body = (await res.json()) as { token?: string }
  if (!res.ok || !body.token)
    throw new Error(`sign-in failed (${res.status}): ${JSON.stringify(body)}`)
  return body.token
}

describe('channel platform-tier authz (E2E)', () => {
  let h: ChannelHarness
  beforeAll(async () => {
    h = await bootChannelApp()
  }, 120_000)
  afterAll(() => h.close())

  it('createPlatformChannel: a global channel:manager succeeds, a plain org member is denied', async () => {
    // Global operator: signed up + granted the GLOBAL channel:manager role
    // (channel:create), then signed in afresh so the session resolves it.
    const op = await h.signUp('tier-pc-op@ex.com', 'Op', 'password123!')
    await h.grantGlobalRole(op.userId, 'channel:manager')
    const opToken = await signInToken(h, 'tier-pc-op@ex.com', 'password123!')

    const allowed = await h.gql(CREATE_PLATFORM, { i: { handle: 'platform-a', name: 'Platform A' } }, opToken)
    expect(allowed.errors, `global channel:manager should create a platform channel: ${JSON.stringify(allowed.errors)}`).toBeUndefined()
    const platformGid: string = allowed.data.createPlatformChannel.data.channel.id
    expect(platformGid).toBeTruthy()
    expect(allowed.data.createPlatformChannel.data.channel.name).toBe('Platform A')

    // A plain org member (owner of their own org, no GLOBAL channel role) is
    // denied — the platform tier gates on the global role, not org membership.
    const member = await h.signUp('tier-pc-member@ex.com', 'Member', 'password123!')
    const org = await h.createOrganization(member.token, 'Org', 'tier-pc-org', member.ip)
    await h.setMemberRole(org.orgNumericId, member.userId, 'org:owner,channel:manager,channel:viewer,channel:admin')

    const denied = await h.gql(CREATE_PLATFORM, { i: { handle: 'platform-x', name: 'Platform X' } }, member.token, member.ip)
    expect(denied.errors).toBeDefined()
    expect(denied.data?.createPlatformChannel ?? null).toBeNull()
  })

  it('createChannel: an org member with channel:create in org A succeeds', async () => {
    const u = await h.signUp('tier-org-create@ex.com', 'U', 'password123!')
    const org = await h.createOrganization(u.token, 'Org A', 'tier-org-a', u.ip)
    await h.setMemberRole(org.orgNumericId, u.userId, 'org:owner,channel:manager,channel:viewer,channel:admin')

    const res = await h.gql(CREATE_ORG, { i: { organizationId: org.orgGlobalId, name: 'Org A Channel' } }, u.token, u.ip)
    expect(res.errors, `org member should create an org channel: ${JSON.stringify(res.errors)}`).toBeUndefined()
    expect(res.data.createChannel.data.channel.name).toBe('Org A Channel')
  })

  it('node(id:): org member reads their org channel but not a platform channel; the global holder reads the platform channel', async () => {
    // Global operator creates a PLATFORM channel.
    const op = await h.signUp('tier-node-op@ex.com', 'Op', 'password123!')
    await h.grantGlobalRole(op.userId, 'channel:viewer')
    const opToken = await signInToken(h, 'tier-node-op@ex.com', 'password123!')
    // The operator needs channel:create to mint the platform channel; grant the
    // fuller role then re-sign for the session to resolve it.
    await h.grantGlobalRole(op.userId, 'channel:manager,channel:viewer')
    const opCreateToken = await signInToken(h, 'tier-node-op@ex.com', 'password123!')
    const pc = await h.gql(CREATE_PLATFORM, { i: { handle: 'platform-node', name: 'Platform Node' } }, opCreateToken)
    expect(pc.errors, `platform channel create: ${JSON.stringify(pc.errors)}`).toBeUndefined()
    const platformGid: string = pc.data.createPlatformChannel.data.channel.id
    expect(platformGid).toBeTruthy()

    // Plain org member creates an ORG channel in their own org.
    const member: Actor = await h.signUp('tier-node-member@ex.com', 'Member', 'password123!')
    const org = await h.createOrganization(member.token, 'Org N', 'tier-node-org', member.ip)
    await h.setMemberRole(org.orgNumericId, member.userId, 'org:owner,channel:manager,channel:viewer,channel:admin')
    const orgCh = await h.gql(CREATE_ORG, { i: { organizationId: org.orgGlobalId, name: 'Org N Channel' } }, member.token, member.ip)
    expect(orgCh.errors).toBeUndefined()
    const orgChannelGid: string = orgCh.data.createChannel.data.channel.id

    // Org member reads THEIR org channel via node(id:) → non-null.
    const ownNode = await h.gql(NODE, { id: orgChannelGid }, member.token, member.ip)
    expect(ownNode.errors).toBeUndefined()
    expect(ownNode.data.node.id).toBe(orgChannelGid)

    // Org member reads the PLATFORM channel via node(id:) → deny-as-null
    // (no GLOBAL channel role): data.node === null AND no errors.
    const memberOnPlatform = await h.gql(NODE, { id: platformGid }, member.token, member.ip)
    expect(memberOnPlatform.data?.node ?? null).toBeNull()
    expect(memberOnPlatform.errors).toBeUndefined()

    // Global holder reads the PLATFORM channel via node(id:) → non-null.
    const opOnPlatform = await h.gql(NODE, { id: platformGid }, opToken)
    expect(opOnPlatform.errors, `global holder should read platform node: ${JSON.stringify(opOnPlatform.errors)}`).toBeUndefined()
    expect(opOnPlatform.data.node.id).toBe(platformGid)
  })

  it('platformChannels: lists platform channels for the global holder, denies a plain org member', async () => {
    // Global reader.
    const op = await h.signUp('tier-list-op@ex.com', 'Op', 'password123!')
    await h.grantGlobalRole(op.userId, 'channel:manager,channel:viewer')
    const opToken = await signInToken(h, 'tier-list-op@ex.com', 'password123!')
    const created = await h.gql(CREATE_PLATFORM, { i: { handle: 'platform-list', name: 'Platform List' } }, opToken)
    expect(created.errors).toBeUndefined()
    const platformGid: string = created.data.createPlatformChannel.data.channel.id

    const listed = await h.gql(PLATFORM_LIST, {}, opToken)
    expect(listed.errors, `global reader should list platform channels: ${JSON.stringify(listed.errors)}`).toBeUndefined()
    const ids = (listed.data.platformChannels.edges as Array<{ node: { id: string } }>).map(e => e.node.id)
    expect(ids).toContain(platformGid)

    // Plain org member (no global role) → denied by platformChannels' global authScope.
    const member = await h.signUp('tier-list-member@ex.com', 'Member', 'password123!')
    const org = await h.createOrganization(member.token, 'Org L', 'tier-list-org', member.ip)
    await h.setMemberRole(org.orgNumericId, member.userId, 'org:owner,channel:viewer,channel:manager,channel:admin')
    const denied = await h.gql(PLATFORM_LIST, {}, member.token, member.ip)
    expect(denied.errors).toBeDefined()
    expect(denied.data?.platformChannels ?? null).toBeNull()
  })
})
