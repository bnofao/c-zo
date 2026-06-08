import type { InventoryHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootInventoryApp } from './harness'

// Structural E2E for @czo/inventory: boots [auth, stock-location, inventory] on
// Testcontainers. Covers CRUD, authz scoping, node-guard, atomic level/reservation
// ops, the computed `availableQuantity`, the cross-module StockLocationService
// dependency, and the combined schema. First run pulls postgres:17 — allow up to
// 120s in beforeAll.

const FULL_ROLE = 'org:owner,inventory:viewer,inventory:manager,inventory:admin,stock-loc:viewer,stock-loc:manager,stock-loc:admin'

// ─── GraphQL operation strings ────────────────────────────────────────────────

// Pothos relayMutationField generates:
//   - input type:   `<MutationName>Input`
//   - success type: `<MutationName>Success`  (carrying `data { <outputField> }`)
// e.g. createInventoryItem → CreateInventoryItemInput / CreateInventoryItemSuccess

const CREATE_ITEM = `mutation ($i: CreateInventoryItemInput!) {
  createInventoryItem(input: $i) {
    ... on CreateInventoryItemSuccess { data { inventoryItem { id sku version } } }
    ... on SkuTakenError { sku }
  }
}`

const READ_ITEM = `query ($id: ID!) {
  inventoryItem(id: $id) { id sku }
}`

const LIST_ITEMS = `query ($org: ID!) {
  inventoryItems(organizationId: $org) { edges { node { id sku } } }
}`

const NODE_ITEM = `query ($id: ID!) {
  node(id: $id) { ... on InventoryItem { id sku } }
}`

const CREATE_SL = `mutation ($i: CreateStockLocationInput!) {
  createStockLocation(input: $i) {
    ... on CreateStockLocationSuccess { data { stockLocation { id name } } }
  }
}`

const CREATE_LEVEL = `mutation ($i: CreateInventoryLevelInput!) {
  createInventoryLevel(input: $i) {
    ... on CreateInventoryLevelSuccess { data { inventoryLevel { id stockedQuantity reservedQuantity } } }
    ... on CrossOrgStockLocationError { inventoryItemId stockLocationId }
    ... on LevelAlreadyExistsError { inventoryItemId stockLocationId }
  }
}`

const ADJUST = `mutation ($i: AdjustInventoryStockInput!) {
  adjustInventoryStock(input: $i) {
    ... on AdjustInventoryStockSuccess { data { inventoryLevel { id stockedQuantity } } }
    ... on InsufficientStockError { code }
  }
}`

const DELETE_LEVEL = `mutation ($i: DeleteInventoryLevelInput!) {
  deleteInventoryLevel(input: $i) {
    ... on DeleteInventoryLevelSuccess { data { inventoryLevel { id } } }
    ... on LevelHasReservationsError { code }
  }
}`

const CREATE_RES = `mutation ($i: CreateReservationInput!) {
  createReservation(input: $i) {
    ... on CreateReservationSuccess { data { reservation { id quantity } } }
    ... on InsufficientInventoryError { code }
  }
}`

const DELETE_RES = `mutation ($i: DeleteReservationInput!) {
  deleteReservation(input: $i) {
    ... on DeleteReservationSuccess { data { reservation { id quantity } } }
    ... on ReservationNotFoundError { code }
  }
}`

// Reads the levels connection on a specific item via the standalone query path.
// The relatedConnection only resolves on the query/node path — selecting it
// inside a mutation payload fails closed (same pattern as channel's e2e).
const READ_ITEM_LEVELS = `query ($id: ID!) {
  inventoryItem(id: $id) {
    id
    levels {
      edges {
        node { id stockedQuantity reservedQuantity availableQuantity }
      }
    }
  }
}`

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Actor { token: string, userId: number, ip: string }
interface Org { orgGlobalId: string, orgNumericId: number }

async function orgWithAccess(h: InventoryHarness, email: string, slug: string): Promise<{ u: Actor, org: Org }> {
  const u = await h.signUp(email, 'U', 'password123!')
  const org = await h.createOrganization(u.token, 'Org', slug, u.ip)
  await h.setMemberRole(org.orgNumericId, u.userId, FULL_ROLE)
  return { u, org }
}

async function createItem(h: InventoryHarness, u: Actor, org: Org, sku: string) {
  const res = await h.gql(CREATE_ITEM, { i: { organizationId: org.orgGlobalId, sku } }, u.token, u.ip)
  expect(res.errors).toBeUndefined()
  const item = res.data.createInventoryItem.data.inventoryItem
  return { id: item.id as string, sku: item.sku as string, version: item.version as number }
}

async function createStockLocation(h: InventoryHarness, u: Actor, org: Org, name: string) {
  const res = await h.gql(CREATE_SL, { i: { organizationId: org.orgGlobalId, name } }, u.token, u.ip)
  expect(res.errors).toBeUndefined()
  const sl = res.data.createStockLocation.data.stockLocation
  return { id: sl.id as string, name: sl.name as string }
}

async function createLevel(h: InventoryHarness, u: Actor, inventoryItemId: string, stockLocationId: string, stockedQuantity?: number) {
  const res = await h.gql(
    CREATE_LEVEL,
    { i: { inventoryItemId, stockLocationId, ...(stockedQuantity != null ? { stockedQuantity } : {}) } },
    u.token,
    u.ip,
  )
  expect(res.errors).toBeUndefined()
  const level = res.data.createInventoryLevel.data.inventoryLevel
  return { id: level.id as string, stockedQuantity: level.stockedQuantity as number, reservedQuantity: level.reservedQuantity as number }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('inventory (E2E)', () => {
  let h: InventoryHarness
  beforeAll(async () => {
    h = await bootInventoryApp()
  }, 120_000)
  afterAll(() => h.close())

  // 1 ─ Basic CRUD: create + read-back
  it('creates an item and reads it back', async () => {
    const { u, org } = await orgWithAccess(h, 'inv-create@ex.com', 'inv-create')
    const created = await createItem(h, u, org, 'SKU-001')
    expect(created.id).toBeTruthy()
    expect(created.sku).toBe('SKU-001')
    expect(created.version).toBeGreaterThanOrEqual(1)

    const read = await h.gql(READ_ITEM, { id: created.id }, u.token, u.ip)
    expect(read.errors).toBeUndefined()
    expect(read.data.inventoryItem.id).toBe(created.id)
    expect(read.data.inventoryItem.sku).toBe('SKU-001')

    // Also verify the item is visible via the paginated connection
    const list = await h.gql(LIST_ITEMS, { org: org.orgGlobalId }, u.token, u.ip)
    expect(list.errors).toBeUndefined()
    const ids = (list.data.inventoryItems.edges as Array<{ node: { id: string } }>).map(e => e.node.id)
    expect(ids).toContain(created.id)
  })

  // 2 ─ AuthZ: missing inventory:create → denied
  it('denies createInventoryItem without inventory:create', async () => {
    // org:owner only — no inventory:* permissions
    const u = await h.signUp('inv-nocreate@ex.com', 'U', 'password123!')
    const org = await h.createOrganization(u.token, 'Org', 'inv-nocreate', u.ip)
    await h.setMemberRole(org.orgNumericId, u.userId, 'org:owner')

    const res = await h.gql(CREATE_ITEM, { i: { organizationId: org.orgGlobalId, sku: 'SKU-DENIED' } }, u.token, u.ip)
    expect(res.errors).toBeTruthy()
    expect(res.data?.createInventoryItem ?? null).toBeNull()
  })

  // 3 ─ Tenant isolation: cross-org item read denied
  it('denies cross-org reads of an item', async () => {
    const a = await orgWithAccess(h, 'inv-xa@ex.com', 'inv-xa')
    const created = await createItem(h, a.u, a.org, 'SKU-ISOA')

    // B has full access in THEIR org, no membership in org A
    const b = await orgWithAccess(h, 'inv-xb@ex.com', 'inv-xb')
    const res = await h.gql(READ_ITEM, { id: created.id }, b.u.token, b.u.ip)
    const denied = Boolean(res.errors) || (res.data?.inventoryItem ?? null) === null
    expect(denied).toBe(true)
  })

  // 4 ─ Level creation + computed availableQuantity
  it('creates a level for a same-org stock location and exposes availableQuantity', async () => {
    const { u, org } = await orgWithAccess(h, 'inv-level@ex.com', 'inv-level')
    const item = await createItem(h, u, org, 'SKU-LEVEL')
    const sl = await createStockLocation(h, u, org, 'Level Warehouse')

    await createLevel(h, u, item.id, sl.id, 10)

    // Read the levels connection via the standalone query path (not mutation payload)
    const levelsRes = await h.gql(READ_ITEM_LEVELS, { id: item.id }, u.token, u.ip)
    expect(levelsRes.errors).toBeUndefined()
    const edges = levelsRes.data.inventoryItem.levels.edges as Array<{
      node: { id: string, stockedQuantity: number, reservedQuantity: number, availableQuantity: number }
    }>
    expect(edges).toHaveLength(1)
    const lvl = edges[0]!.node
    expect(lvl.stockedQuantity).toBe(10)
    expect(lvl.reservedQuantity).toBe(0)
    // availableQuantity is the computed field: stocked - reserved
    expect(lvl.availableQuantity).toBe(10)
  })

  // 5 ─ adjustInventoryStock: +5 ok, over-decrement → InsufficientStockError
  it('adjustInventoryStock changes available; over-decrement → InsufficientStockError', async () => {
    const { u, org } = await orgWithAccess(h, 'inv-adjust@ex.com', 'inv-adjust')
    const item = await createItem(h, u, org, 'SKU-ADJUST')
    const sl = await createStockLocation(h, u, org, 'Adjust Warehouse')
    const lvl = await createLevel(h, u, item.id, sl.id, 10)

    // +5 should succeed: stocked becomes 15
    const addRes = await h.gql(ADJUST, { i: { id: lvl.id, delta: 5 } }, u.token, u.ip)
    expect(addRes.errors).toBeUndefined()
    expect(addRes.data.adjustInventoryStock.data.inventoryLevel.stockedQuantity).toBe(15)

    // Verify via the query path — availableQuantity should be 15 (no reservations)
    const levelsAfterAdd = await h.gql(READ_ITEM_LEVELS, { id: item.id }, u.token, u.ip)
    expect(levelsAfterAdd.errors).toBeUndefined()
    const addedLevel = levelsAfterAdd.data.inventoryItem.levels.edges[0].node
    expect(addedLevel.stockedQuantity).toBe(15)
    expect(addedLevel.availableQuantity).toBe(15)

    // -100 should fail: insufficient stock → InsufficientStockError (typed error in data)
    const overRes = await h.gql(ADJUST, { i: { id: lvl.id, delta: -100 } }, u.token, u.ip)
    expect(overRes.errors).toBeUndefined()
    // Typed errors surface in data.<field>, not top-level errors
    const payload = overRes.data.adjustInventoryStock
    expect(payload.data ?? null).toBeNull()
    expect(payload.code).toBe('INVENTORY_INSUFFICIENT_STOCK')
  })

  // 6 ─ createReservation reduces available; over-reserve → InsufficientInventoryError
  it('createReservation reduces available; over-reserve → InsufficientInventoryError', async () => {
    const { u, org } = await orgWithAccess(h, 'inv-reserve@ex.com', 'inv-reserve')
    const item = await createItem(h, u, org, 'SKU-RESERVE')
    const sl = await createStockLocation(h, u, org, 'Reserve Warehouse')
    // Start at stocked=15 (after +5 in a similar flow, but here we just init at 15)
    await createLevel(h, u, item.id, sl.id, 15)

    // Reserve 4
    const res4 = await h.gql(
      CREATE_RES,
      { i: { inventoryItemId: item.id, stockLocationId: sl.id, quantity: 4 } },
      u.token,
      u.ip,
    )
    expect(res4.errors).toBeUndefined()
    expect(res4.data.createReservation.data.reservation.quantity).toBe(4)
    const reservation = res4.data.createReservation.data.reservation

    // Read levels: reserved 4, available 11 (stocked 15)
    const afterRes = await h.gql(READ_ITEM_LEVELS, { id: item.id }, u.token, u.ip)
    expect(afterRes.errors).toBeUndefined()
    const lvlAfterRes = afterRes.data.inventoryItem.levels.edges[0].node
    expect(lvlAfterRes.reservedQuantity).toBe(4)
    expect(lvlAfterRes.availableQuantity).toBe(11)

    // Over-reserve → InsufficientInventoryError (typed error in data)
    const overRes = await h.gql(
      CREATE_RES,
      { i: { inventoryItemId: item.id, stockLocationId: sl.id, quantity: 1000 } },
      u.token,
      u.ip,
    )
    expect(overRes.errors).toBeUndefined()
    const overPayload = overRes.data.createReservation
    expect(overPayload.data ?? null).toBeNull()
    expect(overPayload.code).toBe('INVENTORY_INSUFFICIENT_INVENTORY')

    // Stash for use in test 7
    ;(h as any).__reservationId6 = reservation.id as string
    ;(h as any).__itemId6 = item.id as string
  })

  // 7 ─ deleteReservation restores available
  it('deleteReservation restores available', async () => {
    const { u, org } = await orgWithAccess(h, 'inv-delres@ex.com', 'inv-delres')
    const item = await createItem(h, u, org, 'SKU-DELRES')
    const sl = await createStockLocation(h, u, org, 'DelRes Warehouse')
    await createLevel(h, u, item.id, sl.id, 10)

    // Create a reservation of 3
    const resRes = await h.gql(
      CREATE_RES,
      { i: { inventoryItemId: item.id, stockLocationId: sl.id, quantity: 3 } },
      u.token,
      u.ip,
    )
    expect(resRes.errors).toBeUndefined()
    const reservationId = resRes.data.createReservation.data.reservation.id as string

    // Verify before delete: reserved=3, available=7
    const before = await h.gql(READ_ITEM_LEVELS, { id: item.id }, u.token, u.ip)
    const lvlBefore = before.data.inventoryItem.levels.edges[0].node
    expect(lvlBefore.reservedQuantity).toBe(3)
    expect(lvlBefore.availableQuantity).toBe(7)

    // Delete the reservation
    const delRes = await h.gql(DELETE_RES, { i: { id: reservationId } }, u.token, u.ip)
    expect(delRes.errors).toBeUndefined()
    expect(delRes.data.deleteReservation.data.reservation.id).toBe(reservationId)

    // Verify after delete: reserved=0, available=10
    const after = await h.gql(READ_ITEM_LEVELS, { id: item.id }, u.token, u.ip)
    const lvlAfter = after.data.inventoryItem.levels.edges[0].node
    expect(lvlAfter.reservedQuantity).toBe(0)
    expect(lvlAfter.availableQuantity).toBe(10)
  })

  // 8 ─ deleteInventoryLevel blocked while a reservation exists → LevelHasReservationsError; succeeds after release
  it('deleteInventoryLevel blocked while a reservation exists; succeeds after release', async () => {
    const { u, org } = await orgWithAccess(h, 'inv-dellvl@ex.com', 'inv-dellvl')
    const item = await createItem(h, u, org, 'SKU-DELLVL')
    const sl = await createStockLocation(h, u, org, 'DelLvl Warehouse')
    const lvl = await createLevel(h, u, item.id, sl.id, 20)

    // Create a reservation
    const resRes = await h.gql(
      CREATE_RES,
      { i: { inventoryItemId: item.id, stockLocationId: sl.id, quantity: 5 } },
      u.token,
      u.ip,
    )
    expect(resRes.errors).toBeUndefined()
    const reservationId = resRes.data.createReservation.data.reservation.id as string

    // Attempt to delete the level — should fail with LevelHasReservationsError
    const blockedRes = await h.gql(DELETE_LEVEL, { i: { id: lvl.id } }, u.token, u.ip)
    expect(blockedRes.errors).toBeUndefined()
    const blockedPayload = blockedRes.data.deleteInventoryLevel
    expect(blockedPayload.data ?? null).toBeNull()
    expect(blockedPayload.code).toBe('INVENTORY_LEVEL_HAS_RESERVATIONS')

    // Release the reservation
    const delResRes = await h.gql(DELETE_RES, { i: { id: reservationId } }, u.token, u.ip)
    expect(delResRes.errors).toBeUndefined()

    // Now the level deletion should succeed
    const okRes = await h.gql(DELETE_LEVEL, { i: { id: lvl.id } }, u.token, u.ip)
    expect(okRes.errors).toBeUndefined()
    expect(okRes.data.deleteInventoryLevel.data.inventoryLevel.id).toBe(lvl.id)
  })

  // 9 ─ node(id:) relay read: member ok, non-member denied as null
  it('reads an InventoryItem via node(id:) — member ok, non-member denied', async () => {
    const { u, org } = await orgWithAccess(h, 'inv-node@ex.com', 'inv-node')
    const created = await createItem(h, u, org, 'SKU-NODE')

    const asMember = await h.gql(NODE_ITEM, { id: created.id }, u.token, u.ip)
    expect(asMember.errors).toBeUndefined()
    expect(asMember.data.node.id).toBe(created.id)
    expect(asMember.data.node.sku).toBe('SKU-NODE')

    // Non-member: node-guard denies (deny-as-null) or errors
    const stranger = await orgWithAccess(h, 'inv-node-stranger@ex.com', 'inv-node-stranger')
    const res = await h.gql(NODE_ITEM, { id: created.id }, stranger.u.token, stranger.u.ip)
    const denied = Boolean(res.errors) || (res.data?.node ?? null) === null
    expect(denied).toBe(true)
  })

  // 10 ─ Cross-org: createInventoryLevel with a stock location from a different org → CrossOrgStockLocationError
  it('rejects createInventoryLevel with a cross-org stock location', async () => {
    // Actor A's org + item
    const a = await orgWithAccess(h, 'inv-crossA@ex.com', 'inv-cross-a')
    const item = await createItem(h, a.u, a.org, 'SKU-CROSSA')

    // Actor B's org + stock location
    const b = await orgWithAccess(h, 'inv-crossB@ex.com', 'inv-cross-b')
    const slB = await createStockLocation(h, b.u, b.org, 'Cross Warehouse B')

    // Actor A tries to create a level linking their item to B's stock location
    const res = await h.gql(
      CREATE_LEVEL,
      { i: { inventoryItemId: item.id, stockLocationId: slB.id } },
      a.u.token,
      a.u.ip,
    )
    expect(res.errors).toBeUndefined()
    // Typed error surfaces in data.<field>
    const payload = res.data.createInventoryLevel
    expect(payload.data ?? null).toBeNull()
    // CrossOrgStockLocationError exposes inventoryItemId and stockLocationId
    expect(payload.inventoryItemId).toBeTruthy()
    expect(payload.stockLocationId).toBeTruthy()
  })
})
