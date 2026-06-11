import type { SlHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootStockLocationApp } from './harness'

// FIXED in this sprint — the stock-location migration shipped as a single flat
// `migrations/0001_create_stock_locations.sql` (drizzle-kit format with stale
// `text` columns), but the runtime/test migrator (`drizzle-orm/effect-postgres`)
// reads the timestamped-DIRECTORY format (`<ts>_<name>/migration.sql`) every
// auth migration uses — so the flat file was silently skipped and the table was
// never created. Regenerated via `drizzle-kit generate` into
// `migrations/20260604221656_init/` (correct `integer` identity PKs matching the
// Drizzle schema). The table is created on boot and CRUD/scoping/optimistic-lock
// tests below pass.
//
// Both former relay-layer FINDINGS are now FIXED (B16 + B18): (1) the
// `created.id` global id round-trips through `stockLocation(id:)` once the authz
// helper stopped double-decoding (B16); (2) the module now registers a
// `StockLocation` node-guard (`graphql/node-guards.ts`), so `node(id:)` is
// org-scoped — a non-member can no longer read another org's location by global
// id (B18). Both tests below are plain `it`.

const FULL_ROLE = 'org:owner,stock-loc:viewer,stock-loc:manager,stock-loc:admin'

const CREATE = `mutation ($i: CreateStockLocationInput!) {
  createStockLocation(input: $i) {
    ... on CreateStockLocationSuccess { data { stockLocation { id name version } } }
  }
}`
const UPDATE = `mutation ($i: UpdateStockLocationInput!) {
  updateStockLocation(input: $i) {
    ... on UpdateStockLocationSuccess { data { stockLocation { id name version } } }
    ... on OptimisticLockError { message }
  }
}`
const DELETE = `mutation ($i: DeleteStockLocationInput!) {
  deleteStockLocation(input: $i) {
    ... on DeleteStockLocationSuccess { data { stockLocation { id } } }
  }
}`
const READ = `query ($id: ID!) { stockLocation(id: $id) { id name } }`
const LIST = `query ($org: ID!) { stockLocations(organizationId: $org) { edges { node { id name } } } }`
const NODE = `query ($id: ID!) { node(id: $id) { ... on StockLocation { id name } } }`
const ADDRESS_NODE = `query ($id: ID!) { node(id: $id) { ... on StockLocationAddress { id city } } }`
const CREATE_WITH_ADDRESS = `mutation ($i: CreateStockLocationInput!) {
  createStockLocation(input: $i) {
    ... on CreateStockLocationSuccess { data { stockLocation { id address { id city } } } }
  }
}`

interface Actor { token: string, userId: number, ip: string }
interface Org { orgGlobalId: string, orgNumericId: number }

async function orgWithAccess(h: SlHarness, email: string, slug: string): Promise<{ u: Actor, org: Org }> {
  const u = await h.signUp(email, 'U', 'password123!')
  const org = await h.createOrganization(u.token, 'Org', slug, u.ip)
  await h.setMemberRole(org.orgNumericId, u.userId, FULL_ROLE)
  return { u, org }
}

async function createLocation(h: SlHarness, u: Actor, org: Org, name: string) {
  const res = await h.gql(CREATE, { i: { organizationId: org.orgGlobalId, name } }, u.token, u.ip)
  expect(res.errors).toBeUndefined()
  const sl = res.data.createStockLocation.data.stockLocation
  return { id: sl.id as string, name: sl.name as string, version: sl.version as number }
}

async function createLocationWithAddress(h: SlHarness, u: Actor, org: Org, name: string, city: string) {
  const res = await h.gql(
    CREATE_WITH_ADDRESS,
    { i: { organizationId: org.orgGlobalId, name, address: { addressLine1: '1 Main St', city, countryCode: 'US' } } },
    u.token,
    u.ip,
  )
  expect(res.errors).toBeUndefined()
  const sl = res.data.createStockLocation.data.stockLocation
  return { locationId: sl.id as string, addressId: sl.address.id as string, city: sl.address.city as string }
}

describe('stock-location (E2E)', () => {
  let h: SlHarness
  beforeAll(async () => {
    h = await bootStockLocationApp()
  }, 120_000)
  afterAll(() => h.close())

  // Fixed by B16. The earlier `it.fails` mis-attributed the failure to the
  // mutation returning a raw int id; the real cause was `stockLocation(id:)`'s
  // authz calling `loadOrganizationId(ctx, args.id.id)` with the already-decoded
  // numeric, which `decodeGlobalID`'d it AGAIN → "Invalid global ID" threw. The
  // `globalID({ for })` migration makes the helper take the numeric directly, so
  // `created.id` (a valid global id) round-trips through `stockLocation(id:)`.
  it('creates a stock-location within an org and reads it back', async () => {
    const { u, org } = await orgWithAccess(h, 'sl-create@ex.com', 'sl-create')
    const created = await createLocation(h, u, org, 'Main Warehouse')
    expect(created.id).toBeTruthy()
    expect(created.version).toBeGreaterThanOrEqual(1)

    const read = await h.gql(READ, { id: created.id }, u.token, u.ip)
    expect(read.errors).toBeUndefined()
    expect(read.data.stockLocation.id).toBe(created.id)
    expect(read.data.stockLocation.name).toBe('Main Warehouse')
  })

  // Real green check: the authScope denies BEFORE any DB access, so this is
  // unaffected by the missing-migration bug.
  it('denies createStockLocation without stock-location:create', async () => {
    // Owner of the org but no stock-loc:* roles → lacks `stock-location:create`.
    const u = await h.signUp('sl-nocreate@ex.com', 'U', 'password123!')
    const org = await h.createOrganization(u.token, 'Org', 'sl-nocreate', u.ip)
    await h.setMemberRole(org.orgNumericId, u.userId, 'org:owner')

    const res = await h.gql(CREATE, { i: { organizationId: org.orgGlobalId, name: 'X' } }, u.token, u.ip)
    expect(res.errors).toBeTruthy()
    expect(res.data?.createStockLocation ?? null).toBeNull()
  })

  // FINDING: blocked by the missing-migration bug above. Encodes intended behaviour.
  it('denies cross-org reads of a stock-location', async () => {
    const a = await orgWithAccess(h, 'sl-xa@ex.com', 'sl-xa')
    const created = await createLocation(h, a.u, a.org, 'A Warehouse')

    // B has full access in their OWN org, but no permission in org A.
    const b = await orgWithAccess(h, 'sl-xb@ex.com', 'sl-xb')

    const res = await h.gql(READ, { id: created.id }, b.u.token, b.u.ip)
    // Denied either by the authScope (errors) or by the nullable field collapsing.
    const denied = Boolean(res.errors) || (res.data?.stockLocation ?? null) === null
    expect(denied).toBe(true)
  })

  // FINDING: blocked by the missing-migration bug above. Encodes intended behaviour.
  it('updates with optimistic locking and rejects a stale version', async () => {
    const { u, org } = await orgWithAccess(h, 'sl-update@ex.com', 'sl-update')
    const created = await createLocation(h, u, org, 'Old Name')

    const ok = await h.gql(
      UPDATE,
      { i: { id: created.id, version: created.version, name: 'New Name' } },
      u.token,
      u.ip,
    )
    expect(ok.errors).toBeUndefined()
    expect(ok.data.updateStockLocation.data.stockLocation.name).toBe('New Name')
    expect(ok.data.updateStockLocation.data.stockLocation.version).toBeGreaterThan(created.version)

    // Reusing the now-stale original version fails optimistic locking.
    const stale = await h.gql(
      UPDATE,
      { i: { id: created.id, version: created.version, name: 'Newer Name' } },
      u.token,
      u.ip,
    )
    expect(stale.errors).toBeUndefined()
    expect(stale.data.updateStockLocation.message).toBeTruthy()
  })

  // FINDING: blocked by the missing-migration bug above. Encodes intended behaviour.
  it('soft-deletes a stock-location', async () => {
    const { u, org } = await orgWithAccess(h, 'sl-delete@ex.com', 'sl-delete')
    const created = await createLocation(h, u, org, 'Doomed')

    const res = await h.gql(
      DELETE,
      { i: { id: created.id, version: created.version } },
      u.token,
      u.ip,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.deleteStockLocation.data.stockLocation.id).toBe(created.id)
  })

  // FINDING: blocked by the missing-migration bug above. Encodes intended behaviour.
  it('lists stockLocations for a member and denies a non-member', async () => {
    const { u, org } = await orgWithAccess(h, 'sl-list@ex.com', 'sl-list')
    await createLocation(h, u, org, 'L1')
    await createLocation(h, u, org, 'L2')

    const asMember = await h.gql(LIST, { org: org.orgGlobalId }, u.token, u.ip)
    expect(asMember.errors).toBeUndefined()
    expect(asMember.data.stockLocations.edges.length).toBeGreaterThanOrEqual(2)

    // A user with no membership in this org is denied the connection.
    const stranger = await orgWithAccess(h, 'sl-list-stranger@ex.com', 'sl-list-stranger')
    const denied = await h.gql(LIST, { org: org.orgGlobalId }, stranger.u.token, stranger.u.ip)
    expect(denied.errors).toBeTruthy()
  })

  // Fixed by B16 + B18: the global id round-trips through `node(id:)` (B16), and
  // the `StockLocation` node-guard org-scopes the read so a non-member is denied
  // (deny-as-null) on another org's location (B18), mirroring `attribute`'s
  // node-guards.
  it('reads a StockLocation via node(id:) — member ok, non-member denied', async () => {
    const { u, org } = await orgWithAccess(h, 'sl-node@ex.com', 'sl-node')
    const created = await createLocation(h, u, org, 'Node Warehouse')

    const asMember = await h.gql(NODE, { id: created.id }, u.token, u.ip)
    expect(asMember.errors).toBeUndefined()
    expect(asMember.data.node.id).toBe(created.id)
    expect(asMember.data.node.name).toBe('Node Warehouse')

    // Non-member: the node guard denies (deny-as-null) or errors.
    const stranger = await orgWithAccess(h, 'sl-node-stranger@ex.com', 'sl-node-stranger')
    const res = await h.gql(NODE, { id: created.id }, stranger.u.token, stranger.u.ip)
    const denied = Boolean(res.errors) || (res.data?.node ?? null) === null
    expect(denied).toBe(true)
  })

  // The address node has no own `organizationId`, so its node-guard gates on the
  // parent location's org (loaded via the node's `select.with.stockLocation`). A
  // member of the owning org reads it (incl. the `city` field, proving the
  // exposed columns still resolve under the relation `select`); a non-member is
  // denied (deny-as-null), closing the cross-org leak via the global id.
  it('reads a StockLocationAddress via node(id:) — member ok, non-member denied', async () => {
    const { u, org } = await orgWithAccess(h, 'sl-addr-node@ex.com', 'sl-addr-node')
    const created = await createLocationWithAddress(h, u, org, 'Addr Warehouse', 'Springfield')

    const asMember = await h.gql(ADDRESS_NODE, { id: created.addressId }, u.token, u.ip)
    expect(asMember.errors).toBeUndefined()
    expect(asMember.data.node).not.toBeNull()
    expect(asMember.data.node.id).toBe(created.addressId)
    expect(asMember.data.node.city).toBe('Springfield')

    // Non-member: the node guard denies (deny-as-null).
    const stranger = await orgWithAccess(h, 'sl-addr-node-stranger@ex.com', 'sl-addr-node-stranger')
    const denied = await h.gql(ADDRESS_NODE, { id: created.addressId }, stranger.u.token, stranger.u.ip)
    expect(denied.data.node).toBeNull()
    expect(denied.errors).toBeUndefined()
  })
})
