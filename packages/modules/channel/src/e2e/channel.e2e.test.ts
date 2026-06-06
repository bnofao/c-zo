import type { ChannelHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootChannelApp } from './harness'

// Structural E2E for @czo/channel: boots [auth, stock-location, channel] on
// Testcontainers. Covers CRUD, authz scoping, node-guard, M:N stockLocations
// connection, cross-module StockLocationService dependency, and cross-org
// rejection. First run pulls postgres:17 — allow up to 120s in beforeAll.

const FULL_ROLE = 'org:owner,channel:viewer,channel:manager,channel:admin,stock-loc:viewer,stock-loc:manager,stock-loc:admin'

// ─── GraphQL operation strings ────────────────────────────────────────────────

const CREATE = `mutation ($i: CreateChannelInput!) {
  createChannel(input: $i) {
    ... on CreateChannelSuccess { data { channel { id name version } } }
  }
}`

const UPDATE = `mutation ($i: UpdateChannelInput!) {
  updateChannel(input: $i) {
    ... on UpdateChannelSuccess { data { channel { id name version } } }
    ... on OptimisticLockError { message }
  }
}`

const DELETE = `mutation ($i: DeleteChannelInput!) {
  deleteChannel(input: $i) {
    ... on DeleteChannelSuccess { data { channel { id } } }
  }
}`

const READ = `query ($id: ID!) { channel(id: $id) { id name } }`

const LIST = `query ($org: ID!) { channels(organizationId: $org) { edges { node { id name } } } }`

const NODE = `query ($id: ID!) { node(id: $id) { ... on Channel { id name } } }`

const ADD_SL = `mutation ($i: AddStockLocationsToChannelInput!) {
  addStockLocationsToChannel(input: $i) {
    ... on AddStockLocationsToChannelSuccess {
      data { channel { id name version } }
    }
    ... on CrossOrgStockLocationError { stockLocationId }
  }
}`

const REMOVE_SL = `mutation ($i: RemoveStockLocationsFromChannelInput!) {
  removeStockLocationsFromChannel(input: $i) {
    ... on RemoveStockLocationsFromChannelSuccess {
      data { channel { id name version } }
    }
  }
}`

// Queries the stockLocations connection on a channel via the standalone
// channel(id:) query (not a mutation payload) — used to separately verify
// the M:N relation without the mutation-payload context.
const READ_WITH_STOCKS = `query ($id: ID!) {
  channel(id: $id) {
    id
    stockLocations { edges { node { id name } } }
  }
}`

const CREATE_SL = `mutation ($i: CreateStockLocationInput!) {
  createStockLocation(input: $i) {
    ... on CreateStockLocationSuccess { data { stockLocation { id name } } }
  }
}`

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Actor { token: string, userId: number, ip: string }
interface Org { orgGlobalId: string, orgNumericId: number }

async function orgWithAccess(h: ChannelHarness, email: string, slug: string): Promise<{ u: Actor, org: Org }> {
  const u = await h.signUp(email, 'U', 'password123!')
  const org = await h.createOrganization(u.token, 'Org', slug, u.ip)
  await h.setMemberRole(org.orgNumericId, u.userId, FULL_ROLE)
  return { u, org }
}

async function createChannel(h: ChannelHarness, u: Actor, org: Org, name: string) {
  const res = await h.gql(CREATE, { i: { organizationId: org.orgGlobalId, name } }, u.token, u.ip)
  expect(res.errors).toBeUndefined()
  const ch = res.data.createChannel.data.channel
  return { id: ch.id as string, name: ch.name as string, version: ch.version as number }
}

async function createStockLocation(h: ChannelHarness, u: Actor, org: Org, name: string) {
  const res = await h.gql(CREATE_SL, { i: { organizationId: org.orgGlobalId, name } }, u.token, u.ip)
  expect(res.errors).toBeUndefined()
  const sl = res.data.createStockLocation.data.stockLocation
  return { id: sl.id as string, name: sl.name as string }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('channel (E2E)', () => {
  let h: ChannelHarness
  beforeAll(async () => {
    h = await bootChannelApp()
  }, 120_000)
  afterAll(() => h.close())

  // 1 ─ Basic CRUD: create + read-back
  it('creates a channel within an org and reads it back', async () => {
    const { u, org } = await orgWithAccess(h, 'ch-create@ex.com', 'ch-create')
    const created = await createChannel(h, u, org, 'General')
    expect(created.id).toBeTruthy()
    expect(created.version).toBeGreaterThanOrEqual(1)

    const read = await h.gql(READ, { id: created.id }, u.token, u.ip)
    expect(read.errors).toBeUndefined()
    expect(read.data.channel.id).toBe(created.id)
    expect(read.data.channel.name).toBe('General')
  })

  // 2 ─ AuthZ: missing channel:create → denied
  it('denies createChannel without channel:create', async () => {
    // org:owner only — no channel:* permissions
    const u = await h.signUp('ch-nocreate@ex.com', 'U', 'password123!')
    const org = await h.createOrganization(u.token, 'Org', 'ch-nocreate', u.ip)
    await h.setMemberRole(org.orgNumericId, u.userId, 'org:owner')

    const res = await h.gql(CREATE, { i: { organizationId: org.orgGlobalId, name: 'X' } }, u.token, u.ip)
    expect(res.errors).toBeTruthy()
    expect(res.data?.createChannel ?? null).toBeNull()
  })

  // 3 ─ Tenant isolation: cross-org channel read denied
  it('denies cross-org reads of a channel', async () => {
    const a = await orgWithAccess(h, 'ch-xa@ex.com', 'ch-xa')
    const created = await createChannel(h, a.u, a.org, 'A Channel')

    // B has full access in THEIR org, no membership in org A
    const b = await orgWithAccess(h, 'ch-xb@ex.com', 'ch-xb')
    const res = await h.gql(READ, { id: created.id }, b.u.token, b.u.ip)
    const denied = Boolean(res.errors) || (res.data?.channel ?? null) === null
    expect(denied).toBe(true)
  })

  // 4 ─ Optimistic locking: ok on correct version, error on stale
  it('updates with optimistic lock and rejects stale version', async () => {
    const { u, org } = await orgWithAccess(h, 'ch-update@ex.com', 'ch-update')
    const created = await createChannel(h, u, org, 'Old Name')

    const ok = await h.gql(
      UPDATE,
      { i: { id: created.id, version: created.version, name: 'New Name' } },
      u.token,
      u.ip,
    )
    expect(ok.errors).toBeUndefined()
    expect(ok.data.updateChannel.data.channel.name).toBe('New Name')
    expect(ok.data.updateChannel.data.channel.version).toBeGreaterThan(created.version)

    // Re-use the now-stale original version → OptimisticLockError
    const stale = await h.gql(
      UPDATE,
      { i: { id: created.id, version: created.version, name: 'Newer Name' } },
      u.token,
      u.ip,
    )
    expect(stale.errors).toBeUndefined()
    expect(stale.data.updateChannel.message).toBeTruthy()
  })

  // 5 ─ Soft-delete
  it('soft-deletes a channel', async () => {
    const { u, org } = await orgWithAccess(h, 'ch-delete@ex.com', 'ch-delete')
    const created = await createChannel(h, u, org, 'Doomed')

    const res = await h.gql(
      DELETE,
      { i: { id: created.id, version: created.version } },
      u.token,
      u.ip,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.deleteChannel.data.channel.id).toBe(created.id)
  })

  // 6 ─ List connection: member sees items; non-member denied
  it('lists channels for a member and denies a non-member', async () => {
    const { u, org } = await orgWithAccess(h, 'ch-list@ex.com', 'ch-list')
    await createChannel(h, u, org, 'L1')
    await createChannel(h, u, org, 'L2')

    const asMember = await h.gql(LIST, { org: org.orgGlobalId }, u.token, u.ip)
    expect(asMember.errors).toBeUndefined()
    expect(asMember.data.channels.edges.length).toBeGreaterThanOrEqual(2)

    // A user with no membership in this org is denied
    const stranger = await orgWithAccess(h, 'ch-list-stranger@ex.com', 'ch-list-stranger')
    const denied = await h.gql(LIST, { org: org.orgGlobalId }, stranger.u.token, stranger.u.ip)
    expect(denied.errors).toBeTruthy()
  })

  // 7 ─ node(id:) relay read: member ok, non-member deny-as-null
  it('reads a Channel via node(id:) — member ok, non-member denied', async () => {
    const { u, org } = await orgWithAccess(h, 'ch-node@ex.com', 'ch-node')
    const created = await createChannel(h, u, org, 'Node Channel')

    const asMember = await h.gql(NODE, { id: created.id }, u.token, u.ip)
    expect(asMember.errors).toBeUndefined()
    expect(asMember.data.node.id).toBe(created.id)
    expect(asMember.data.node.name).toBe('Node Channel')

    // Non-member: node-guard denies (deny-as-null) or errors
    const stranger = await orgWithAccess(h, 'ch-node-stranger@ex.com', 'ch-node-stranger')
    const res = await h.gql(NODE, { id: created.id }, stranger.u.token, stranger.u.ip)
    const denied = Boolean(res.errors) || (res.data?.node ?? null) === null
    expect(denied).toBe(true)
  })

  // 8 ─ M:N: link same-org stock-location and verify the connection
  it('links same-org stock locations and exposes them via the connection', async () => {
    const { u, org } = await orgWithAccess(h, 'ch-link@ex.com', 'ch-link')
    const ch = await createChannel(h, u, org, 'Linked Channel')
    const sl = await createStockLocation(h, u, org, 'Linked Warehouse')

    const res = await h.gql(
      ADD_SL,
      { i: { channelId: ch.id, stockLocationIds: [sl.id] } },
      u.token,
      u.ip,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.addStockLocationsToChannel.data.channel.id).toBe(ch.id)

    // Verify the M:N link is visible via the standalone channel(id:) query —
    // the relay connection is the authoritative read path (not mutation payloads).
    const readRes = await h.gql(READ_WITH_STOCKS, { id: ch.id }, u.token, u.ip)
    expect(readRes.errors).toBeUndefined()
    const edges = readRes.data.channel.stockLocations.edges as Array<{ node: { id: string, name: string } }>
    const ids = edges.map(e => e.node.id)
    expect(ids).toContain(sl.id)
  })

  // 9 ─ Cross-org rejection: linking another org's stock-location fails
  it('rejects linking a cross-org stock location', async () => {
    // Actor A's org + channel
    const a = await orgWithAccess(h, 'ch-crossA@ex.com', 'ch-cross-a')
    const ch = await createChannel(h, a.u, a.org, 'Cross Channel')

    // Actor B's org + stock location
    const b = await orgWithAccess(h, 'ch-crossB@ex.com', 'ch-cross-b')
    const slB = await createStockLocation(h, b.u, b.org, 'Cross Warehouse')

    // Actor A tries to link B's SL → CrossOrgStockLocationError
    const res = await h.gql(
      ADD_SL,
      { i: { channelId: ch.id, stockLocationIds: [slB.id] } },
      a.u.token,
      a.u.ip,
    )
    expect(res.errors).toBeUndefined()
    // Typed errors surface in `data.<field>`, not the top-level `errors` array.
    const payload = res.data.addStockLocationsToChannel
    // Denied: the success branch (carrying `data`) is absent, AND it's
    // specifically the CrossOrgStockLocationError branch (exposes the offending
    // stockLocationId).
    expect(payload.data ?? null).toBeNull()
    expect(payload.stockLocationId).toBeTruthy()
  })

  // 10 ─ Unlink: remove a stock-location from the channel
  it('unlinks a stock location from the channel', async () => {
    const { u, org } = await orgWithAccess(h, 'ch-unlink@ex.com', 'ch-unlink')
    const ch = await createChannel(h, u, org, 'Unlink Channel')
    const sl = await createStockLocation(h, u, org, 'Unlink Warehouse')

    // First link it
    const addRes = await h.gql(
      ADD_SL,
      { i: { channelId: ch.id, stockLocationIds: [sl.id] } },
      u.token,
      u.ip,
    )
    expect(addRes.errors).toBeUndefined()
    expect(addRes.data.addStockLocationsToChannel.data.channel.id).toBe(ch.id)

    // Now unlink
    const removeRes = await h.gql(
      REMOVE_SL,
      { i: { channelId: ch.id, stockLocationIds: [sl.id] } },
      u.token,
      u.ip,
    )
    expect(removeRes.errors).toBeUndefined()
    expect(removeRes.data.removeStockLocationsFromChannel.data.channel.id).toBe(ch.id)

    // Verify via standalone channel(id:) query that the SL is gone —
    // the relay connection is the authoritative read path (not mutation payloads).
    const readRes = await h.gql(READ_WITH_STOCKS, { id: ch.id }, u.token, u.ip)
    expect(readRes.errors).toBeUndefined()
    const edges = readRes.data.channel.stockLocations.edges as Array<{ node: { id: string } }>
    const ids = edges.map(e => e.node.id)
    expect(ids).not.toContain(sl.id)
  })
})
