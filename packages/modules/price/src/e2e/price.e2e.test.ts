import type { PriceHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootPriceApp } from './harness'

// `relayMutationField` wraps each mutation payload in an errors-union
// (`Create<X>Result = Create<X>Success | …`), and the success member nests the
// payload under `data`. So the create mutations select
// `... on Create<X>Success { data { … } }` — the same shape auth's
// `createOrganization` uses.

describe('price e2e', () => {
  let h: PriceHarness
  let token: string
  let orgGlobalId: string
  let orgNumericId: number

  beforeAll(async () => {
    h = await bootPriceApp()
    const u = await h.signUp('owner@x.io', 'Owner', 'password1234')
    token = u.token
    const org = await h.createOrganization(token, 'Acme', 'acme')
    orgGlobalId = org.orgGlobalId
    orgNumericId = org.orgNumericId
    await h.setMemberRole(orgNumericId, u.userId, 'price:admin')
  }, 180_000)
  afterAll(async () => {
    await h.close()
  })

  it('creates a set + base price, then resolves it (public, org-scoped)', async () => {
    const setRes = await h.gql(`mutation($input:CreatePriceSetInput!){ createPriceSet(input:$input){ ... on CreatePriceSetSuccess { data { priceSet { id } } } } }`, { input: { organizationId: orgGlobalId } }, token)
    expect(setRes.errors).toBeUndefined()
    const setId: string = setRes.data.createPriceSet.data.priceSet.id
    expect(setId).toBeTruthy()
    await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ ... on CreatePriceSuccess { data { price { id amount } } } } }`, { input: { priceSetId: setId, currencyCode: 'eur', amount: '20' } }, token)
    // PUBLIC resolve — no token.
    const r = await h.gql(`query($org:ID!,$set:ID!){ resolvePrice(organizationId:$org, priceSetId:$set, currencyCode:"eur"){ __typename ... on BasePrice { amount } } }`, { org: orgGlobalId, set: setId })
    expect(r.errors).toBeUndefined()
    expect(r.data.resolvePrice).toEqual({ __typename: 'BasePrice', amount: '20' })
  })

  it('resolvePrices resolves many sets in one call (public, org-scoped)', async () => {
    const mkSet = async () => {
      const r = await h.gql(`mutation($input:CreatePriceSetInput!){ createPriceSet(input:$input){ ... on CreatePriceSetSuccess { data { priceSet { id } } } } }`, { input: { organizationId: orgGlobalId } }, token)
      return r.data.createPriceSet.data.priceSet.id as string
    }
    const setA = await mkSet()
    const setB = await mkSet()
    await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ ... on CreatePriceSuccess { data { price { id } } } } }`, { input: { priceSetId: setA, currencyCode: 'eur', amount: '20' } }, token)
    await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ ... on CreatePriceSuccess { data { price { id } } } } }`, { input: { priceSetId: setB, currencyCode: 'eur', amount: '7' } }, token)
    // PUBLIC bulk resolve — no token.
    const r = await h.gql(
      `query($org:ID!,$sets:[ID!]!){ resolvePrices(organizationId:$org, priceSetIds:$sets, currencyCode:"eur"){ priceSetId price { __typename ... on BasePrice { amount } } } }`,
      { org: orgGlobalId, sets: [setA, setB] },
    )
    expect(r.errors).toBeUndefined()
    const byId = new Map<string, any>(r.data.resolvePrices.map((e: any) => [e.priceSetId, e]))
    expect(byId.get(setA)?.price).toEqual({ __typename: 'BasePrice', amount: '20' })
    expect(byId.get(setB)?.price).toEqual({ __typename: 'BasePrice', amount: '7' })
  })

  it('resolvePrice returns null for a foreign org (H1)', async () => {
    const u2 = await h.signUp('owner2@x.io', 'Owner2', 'password1234')
    const org2 = await h.createOrganization(u2.token, 'Beta', 'beta')
    await h.setMemberRole(org2.orgNumericId, u2.userId, 'price:admin')
    const setRes = await h.gql(`mutation($input:CreatePriceSetInput!){ createPriceSet(input:$input){ ... on CreatePriceSetSuccess { data { priceSet { id } } } } }`, { input: { organizationId: org2.orgGlobalId } }, u2.token)
    const set2: string = setRes.data.createPriceSet.data.priceSet.id
    await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ ... on CreatePriceSuccess { data { price { id } } } } }`, { input: { priceSetId: set2, currencyCode: 'eur', amount: '5' } }, u2.token)
    const mismatched = await h.gql(`query($org:ID!,$set:ID!){ resolvePrice(organizationId:$org, priceSetId:$set, currencyCode:"eur"){ __typename } }`, { org: orgGlobalId, set: set2 })
    expect(mismatched.data.resolvePrice).toBe(null)
  })

  it('an active sale list overrides base (Sale with originalAmount)', async () => {
    const setRes = await h.gql(`mutation($input:CreatePriceSetInput!){ createPriceSet(input:$input){ ... on CreatePriceSetSuccess { data { priceSet { id } } } } }`, { input: { organizationId: orgGlobalId } }, token)
    const setId: string = setRes.data.createPriceSet.data.priceSet.id
    await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ ... on CreatePriceSuccess { data { price { id } } } } }`, { input: { priceSetId: setId, currencyCode: 'eur', amount: '20' } }, token)
    const listRes = await h.gql(`mutation($input:CreatePriceListInput!){ createPriceList(input:$input){ ... on CreatePriceListSuccess { data { priceList { id } } } } }`, { input: { organizationId: orgGlobalId, title: 'S', type: 'sale', status: 'active' } }, token)
    const listId: string = listRes.data.createPriceList.data.priceList.id
    await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ ... on CreatePriceSuccess { data { price { id } } } } }`, { input: { priceSetId: setId, priceListId: listId, currencyCode: 'eur', amount: '15' } }, token)
    const r = await h.gql(`query($org:ID!,$set:ID!){ resolvePrice(organizationId:$org, priceSetId:$set, currencyCode:"eur"){ __typename ... on SalePrice { amount originalAmount } } }`, { org: orgGlobalId, set: setId })
    expect(r.data.resolvePrice).toEqual({ __typename: 'SalePrice', amount: '15', originalAmount: '20' })
  })

  // Gap 3 — a stranger (owner of their OWN org, not a member of org1) holds no
  // `price` permission in org1. The `createPrice` authScope
  // (`permission: { resource:'price', actions:['create'], organization: <org1> }`)
  // must deny: scope-auth denial surfaces as a top-level `errors` array with the
  // field absent from `data` (the same shape attribute/auth E2E assert).
  it('createPrice is denied for a user without price permission in the target org (Gap 3)', async () => {
    const setRes = await h.gql(`mutation($input:CreatePriceSetInput!){ createPriceSet(input:$input){ ... on CreatePriceSetSuccess { data { priceSet { id } } } } }`, { input: { organizationId: orgGlobalId } }, token)
    const setId: string = setRes.data.createPriceSet.data.priceSet.id
    const stranger = await h.signUp('stranger@x.io', 'Stranger', 'password1234')
    await h.createOrganization(stranger.token, 'Gamma', 'gamma')
    const denied = await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ __typename } }`, { input: { priceSetId: setId, currencyCode: 'eur', amount: '5' } }, stranger.token)
    // DENIED: top-level errors present, and the field is absent from data.
    expect(denied.errors).toBeTruthy()
    expect((denied.errors ?? []).length).toBeGreaterThan(0)
    expect(denied.data?.createPrice == null).toBe(true)
    // No side effect: the set has no prices, so the public resolve is null.
    const r = await h.gql(`query($org:ID!,$set:ID!){ resolvePrice(organizationId:$org, priceSetId:$set, currencyCode:"eur"){ __typename } }`, { org: orgGlobalId, set: setId })
    expect(r.data.resolvePrice).toBe(null)
  })

  // Gap 4 — the kit node-guard registry gates `node(id:)` on the `Price` node with
  // the same `price:read` permission scope. A denied node resolves to NULL (no
  // error — existence is not leaked); the owner reads the row.
  it('node(id:) on a Price is org-scoped — owner sees it, stranger gets null (Gap 4)', async () => {
    const setRes = await h.gql(`mutation($input:CreatePriceSetInput!){ createPriceSet(input:$input){ ... on CreatePriceSetSuccess { data { priceSet { id } } } } }`, { input: { organizationId: orgGlobalId } }, token)
    const setId: string = setRes.data.createPriceSet.data.priceSet.id
    const priceRes = await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ ... on CreatePriceSuccess { data { price { id } } } } }`, { input: { priceSetId: setId, currencyCode: 'eur', amount: '20' } }, token)
    const priceGid: string = priceRes.data.createPrice.data.price.id
    // Owner (price:admin in org1) → sees the node.
    const asOwner = await h.gql(`query($id:ID!){ node(id:$id){ __typename ... on Price { id } } }`, { id: priceGid }, token)
    expect(asOwner.errors).toBeUndefined()
    expect(asOwner.data.node?.id).toBe(priceGid)
    // Stranger (owner of own org, no membership in org1) → deny-as-null.
    const stranger = await h.signUp('stranger2@x.io', 'Stranger2', 'password1234')
    await h.createOrganization(stranger.token, 'Delta', 'delta')
    const asStranger = await h.gql(`query($id:ID!){ node(id:$id){ __typename ... on Price { id } } }`, { id: priceGid }, stranger.token)
    expect(asStranger.data.node).toBe(null)
  })

  // Gap 6 — admin list query + the update/delete CRUD path via GraphQL: the
  // `priceSets` connection lists the org's sets, `updatePrice` enforces optimistic
  // locking (stale version → `OptimisticLockError` union member), and `deletePrice`
  // soft-deletes so the base price no longer resolves.
  it('priceSets list + updatePrice (lock) + deletePrice via GraphQL (Gap 6)', async () => {
    const setRes = await h.gql(`mutation($input:CreatePriceSetInput!){ createPriceSet(input:$input){ ... on CreatePriceSetSuccess { data { priceSet { id } } } } }`, { input: { organizationId: orgGlobalId } }, token)
    const setId: string = setRes.data.createPriceSet.data.priceSet.id
    // admin list query returns at least this set
    const list = await h.gql(`query($org:ID!){ priceSets(organizationId:$org, first:50){ edges { node { id } } } }`, { org: orgGlobalId }, token)
    expect(list.errors).toBeUndefined()
    expect(list.data.priceSets.edges.some((e: any) => e.node.id === setId)).toBe(true)
    // create a price, read its version, update it
    const priceRes = await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ ... on CreatePriceSuccess { data { price { id version } } } } }`, { input: { priceSetId: setId, currencyCode: 'eur', amount: '20' } }, token)
    const { id: priceGid, version }: { id: string, version: number } = priceRes.data.createPrice.data.price
    const upd = await h.gql(`mutation($input:UpdatePriceInput!){ updatePrice(input:$input){ __typename ... on UpdatePriceSuccess { data { price { amount version } } } } }`, { input: { id: priceGid, version, amount: '18' } }, token)
    expect(upd.data.updatePrice.data?.price?.amount).toBe('18')
    // stale version → optimistic-lock error union member
    const stale = await h.gql(`mutation($input:UpdatePriceInput!){ updatePrice(input:$input){ __typename } }`, { input: { id: priceGid, version, amount: '99' } }, token)
    expect(stale.data.updatePrice.__typename).toBe('OptimisticLockError')
    // delete (soft) using the post-update version → resolve no longer returns it
    const updatedVersion: number = upd.data.updatePrice.data.price.version
    await h.gql(`mutation($input:DeletePriceInput!){ deletePrice(input:$input){ __typename } }`, { input: { id: priceGid, version: updatedVersion } }, token)
    const afterDelete = await h.gql(`query($org:ID!,$set:ID!){ resolvePrice(organizationId:$org, priceSetId:$set, currencyCode:"eur"){ __typename } }`, { org: orgGlobalId, set: setId })
    expect(afterDelete.data.resolvePrice).toBe(null)
  })
})
