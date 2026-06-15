// @czo/product list-connection E2E — exercises the relay `drizzleConnection`
// pagination / filter / order args THROUGH GraphQL end-to-end.
//
// Two connections are covered:
//   • organizationProductTypes(organizationId, first, after, orderBy, search) —
//     the merged base ∪ org connection: pages through global + org types, asserts the
//     pagination invariants (page size, hasNextPage, endCursor), the base∪org
//     union holds through paging, and that `search` narrows to a name match.
//   • taxonomyRequests(where: { state }) — the admin moderation queue: with
//     rows seeded in ≥2 states, the enum `state` filter returns only matching
//     rows.

import type { ProductHarness } from './harness'
import { decodeGlobalID } from '@czo/kit/graphql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootProductApp } from './harness'

describe('product list-connection pagination/filter e2e', () => {
  let h: ProductHarness

  // Platform admin (global `product` role) + one org user.
  let adminToken: string
  let orgToken: string
  let orgGlobalId: string

  beforeAll(async () => {
    h = await bootProductApp()

    const admin = await h.signUp('admin@x.io', 'Admin', 'password1234')
    adminToken = admin.token
    await h.grantGlobalRole(admin.userId, 'product:admin')

    const orgUser = await h.signUp('org@x.io', 'OrgOwner', 'password1234')
    orgToken = orgUser.token
    const org = await h.createOrgWithProductAccess(orgUser, 'Acme', 'acme')
    orgGlobalId = org.orgGlobalId
  }, 240_000)

  afterAll(async () => {
    await h.close()
  })

  // Create a GLOBAL product type (admin; org null).
  async function createGlobalType(name: string, slug: string): Promise<string> {
    const res = await h.gql(
      `mutation($input:CreateProductTypeInput!){ createProductType(input:$input){ ... on CreateProductTypeSuccess { data { productType { id name } } } } }`,
      { input: { name, slug, isShippingRequired: true } },
      adminToken,
    )
    if (res.errors)
      throw new Error(`createProductType failed: ${JSON.stringify(res.errors)}`)
    return res.data.createProductType.data.productType.id
  }

  // Create an ORG-owned product type.
  async function createOrgType(name: string, slug: string): Promise<string> {
    const res = await h.gql(
      `mutation($input:CreateOrganizationProductTypeInput!){ createOrganizationProductType(input:$input){ ... on CreateOrganizationProductTypeSuccess { data { productType { id name } } } } }`,
      { input: { organizationId: orgGlobalId, name, slug, isShippingRequired: true } },
      orgToken,
    )
    if (res.errors)
      throw new Error(`createOrganizationProductType failed: ${JSON.stringify(res.errors)}`)
    return res.data.createOrganizationProductType.data.productType.id
  }

  it('productTypes connection: paginates, unions base ∪ org, and filters by search', async () => {
    // Seed 3 GLOBAL types + 2 ORG types → 5 total, exceeding a 2-wide page.
    const g1 = await createGlobalType('Global Shirt', 'lc-global-shirt')
    const g2 = await createGlobalType('Global Pants', 'lc-global-pants')
    const g3 = await createGlobalType('Global Hat', 'lc-global-hat')
    const o1 = await createOrgType('Org Mug', 'lc-org-mug')
    const o2 = await createOrgType('Org Sticker', 'lc-org-sticker')
    const globalIds = [g1, g2, g3]
    const orgIds = [o1, o2]
    const seededIds = new Set([...globalIds, ...orgIds])

    // ── Page 1: first 2, newest-first. ────────────────────────────────────────
    const page1 = await h.gql(
      `query($org:ID!){
        organizationProductTypes(organizationId:$org, first:2, orderBy:[{ field: CREATED_AT, direction: DESC }]){
          edges { node { id name } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { org: orgGlobalId },
      orgToken,
    )
    expect(page1.errors).toBeUndefined()
    const p1Edges = page1.data.organizationProductTypes.edges
    expect(p1Edges).toHaveLength(2)
    expect(page1.data.organizationProductTypes.pageInfo.hasNextPage).toBe(true)
    const endCursor: string = page1.data.organizationProductTypes.pageInfo.endCursor
    expect(endCursor).toBeTruthy()

    // ── Page 2: the rest via `after`. ─────────────────────────────────────────
    const page2 = await h.gql(
      `query($org:ID!,$after:String!){
        organizationProductTypes(organizationId:$org, first:10, after:$after, orderBy:[{ field: CREATED_AT, direction: DESC }]){
          edges { node { id name } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { org: orgGlobalId, after: endCursor },
      orgToken,
    )
    expect(page2.errors).toBeUndefined()
    const p2Edges = page2.data.organizationProductTypes.edges

    // The two pages together cover all 5 seeded types, with no overlap.
    const p1Ids: string[] = p1Edges.map((e: any) => e.node.id)
    const p2Ids: string[] = p2Edges.map((e: any) => e.node.id)
    expect(new Set([...p1Ids, ...p2Ids]).size).toBe(p1Ids.length + p2Ids.length)
    const seenSeeded = [...p1Ids, ...p2Ids].filter(id => seededIds.has(id))
    for (const id of seededIds)
      expect(seenSeeded).toContain(id)

    // base ∪ org merge holds THROUGH the connection: both a global and an org
    // type are present across the paged union.
    expect(seenSeeded.some(id => globalIds.includes(id))).toBe(true)
    expect(seenSeeded.some(id => orgIds.includes(id))).toBe(true)

    // ── search narrows to the matching type(s) only. ─────────────────────────
    const searched = await h.gql(
      `query($org:ID!){
        organizationProductTypes(organizationId:$org, search:"Sticker", first:50){
          edges { node { id name } }
        }
      }`,
      { org: orgGlobalId },
      orgToken,
    )
    expect(searched.errors).toBeUndefined()
    const names: string[] = searched.data.organizationProductTypes.edges.map((e: any) => e.node.name)
    expect(names).toContain('Org Sticker')
    expect(names.every((n: string) => n.includes('Sticker'))).toBe(true)
    // The non-matching seeded types are excluded.
    const searchedIds: string[] = searched.data.organizationProductTypes.edges.map((e: any) => e.node.id)
    expect(searchedIds).toContain(o2)
    expect(searchedIds).not.toContain(g1)
  })

  it('taxonomyRequests connection: enum state filter returns only matching rows', async () => {
    // Seed two PENDING requests as the org, then reject one as admin → one row
    // REJECTED, one still PENDING (≥2 states).
    const orgTypeForPromotion = await createOrgType('Promote Me', 'lc-promote-me')
    const orgTypeNumericId = Number(decodeGlobalID(orgTypeForPromotion).id)

    const submitPromotion = await h.gql(
      `mutation($input:RequestProductTypePromotionInput!){ requestProductTypePromotion(input:$input){ __typename ... on RequestProductTypePromotionSuccess { data { request { id state } } } } }`,
      { input: { organizationId: orgGlobalId, productTypeId: orgTypeNumericId } },
      orgToken,
    )
    expect(submitPromotion.errors).toBeUndefined()
    const promotionReqId: string = submitPromotion.data.requestProductTypePromotion.data.request.id
    expect(submitPromotion.data.requestProductTypePromotion.data.request.state).toBe('PENDING')

    const submitCreation = await h.gql(
      `mutation($input:RequestCategoryCreationInput!){ requestCategoryCreation(input:$input){ __typename ... on RequestCategoryCreationSuccess { data { request { id state } } } } }`,
      { input: { organizationId: orgGlobalId, name: 'New Global Cat', slug: 'lc-new-global-cat' } },
      orgToken,
    )
    expect(submitCreation.errors).toBeUndefined()
    const creationReqId: string = submitCreation.data.requestCategoryCreation.data.request.id
    expect(submitCreation.data.requestCategoryCreation.data.request.state).toBe('PENDING')

    // Admin REJECTS the creation request → it leaves PENDING.
    const reject = await h.gql(
      `mutation($input:RejectTaxonomyRequestInput!){ rejectTaxonomyRequest(input:$input){ __typename ... on RejectTaxonomyRequestSuccess { data { request { id state } } } } }`,
      { input: { requestId: creationReqId, reason: 'not needed' } },
      adminToken,
    )
    expect(reject.errors).toBeUndefined()
    expect(reject.data.rejectTaxonomyRequest.data.request.state).toBe('REJECTED')

    // ── Filter: state = PENDING → the promotion request is in, the rejected ───
    //    creation request is out.
    const pending = await h.gql(
      `query{
        taxonomyRequests(where: { state: PENDING }, first:50){
          edges { node { id state } }
        }
      }`,
      {},
      adminToken,
    )
    expect(pending.errors).toBeUndefined()
    const pendingNodes = pending.data.taxonomyRequests.edges.map((e: any) => e.node)
    // Every returned node is PENDING.
    expect(pendingNodes.every((n: any) => n.state === 'PENDING')).toBe(true)
    const pendingIds: string[] = pendingNodes.map((n: any) => n.id)
    expect(pendingIds).toContain(promotionReqId)
    expect(pendingIds).not.toContain(creationReqId)

    // ── Filter: state = REJECTED → the rejected creation request only. ────────
    const rejected = await h.gql(
      `query{
        taxonomyRequests(where: { state: REJECTED }, first:50){
          edges { node { id state } }
        }
      }`,
      {},
      adminToken,
    )
    expect(rejected.errors).toBeUndefined()
    const rejectedNodes = rejected.data.taxonomyRequests.edges.map((e: any) => e.node)
    expect(rejectedNodes.every((n: any) => n.state === 'REJECTED')).toBe(true)
    const rejectedIds: string[] = rejectedNodes.map((n: any) => n.id)
    expect(rejectedIds).toContain(creationReqId)
    expect(rejectedIds).not.toContain(promotionReqId)
  })
})
