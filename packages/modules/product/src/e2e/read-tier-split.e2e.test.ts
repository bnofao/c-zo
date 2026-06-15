// @czo/product read tier-split authz E2E — verifies the catalog-read split:
//   • `productTypes` is the ADMIN global-only connection: gated by the global
//     `product:read` role, returns global (org-null) rows only.
//   • `organizationProductTypes` is the ORG merged connection: gated by
//     `product:read` in the given org, returns base ∪ org rows.
//   • an org member WITHOUT a global role is DENIED the admin `productTypes`.

import type { ProductHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootProductApp } from './harness'

describe('product read tier-split authz e2e', () => {
  let h: ProductHarness

  // Platform admin (global `product` role) + one org user.
  let adminToken: string
  let orgToken: string
  let orgGlobalId: string

  // Seeded ids — one GLOBAL type, one ORG-1 type.
  let globalTypeId: string
  let orgTypeId: string

  beforeAll(async () => {
    h = await bootProductApp()

    const admin = await h.signUp('admin@x.io', 'Admin', 'password1234')
    adminToken = admin.token
    await h.grantGlobalRole(admin.userId, 'product:admin')

    const orgUser = await h.signUp('org@x.io', 'OrgOwner', 'password1234')
    orgToken = orgUser.token
    const org = await h.createOrgWithProductAccess(orgUser, 'Acme', 'acme')
    orgGlobalId = org.orgGlobalId

    // Seed a GLOBAL product type (admin; org null).
    const g = await h.gql(
      `mutation($input:CreateProductTypeInput!){ createProductType(input:$input){ ... on CreateProductTypeSuccess { data { productType { id } } } } }`,
      { input: { name: 'Global Shirt', slug: 'rts-global-shirt', isShippingRequired: true } },
      adminToken,
    )
    if (g.errors)
      throw new Error(`createProductType failed: ${JSON.stringify(g.errors)}`)
    globalTypeId = g.data.createProductType.data.productType.id

    // Seed an ORG-1 product type.
    const o = await h.gql(
      `mutation($input:CreateOrganizationProductTypeInput!){ createOrganizationProductType(input:$input){ ... on CreateOrganizationProductTypeSuccess { data { productType { id } } } } }`,
      { input: { organizationId: orgGlobalId, name: 'Org Mug', slug: 'rts-org-mug', isShippingRequired: true } },
      orgToken,
    )
    if (o.errors)
      throw new Error(`createOrganizationProductType failed: ${JSON.stringify(o.errors)}`)
    orgTypeId = o.data.createOrganizationProductType.data.productType.id
  }, 240_000)

  afterAll(async () => {
    await h.close()
  })

  it('admin global read: productTypes returns global rows only (not org-1)', async () => {
    const res = await h.gql(
      `query{ productTypes(first:50){ edges { node { id name } } } }`,
      {},
      adminToken,
    )
    expect(res.errors).toBeUndefined()
    const ids: string[] = res.data.productTypes.edges.map((e: any) => e.node.id)
    expect(ids).toContain(globalTypeId)
    expect(ids).not.toContain(orgTypeId)
  })

  it('org merged read: organizationProductTypes returns base ∪ org (global + org-1)', async () => {
    const res = await h.gql(
      `query($org:ID!){ organizationProductTypes(organizationId:$org, first:50){ edges { node { id } } } }`,
      { org: orgGlobalId },
      orgToken,
    )
    expect(res.errors).toBeUndefined()
    const ids: string[] = res.data.organizationProductTypes.edges.map((e: any) => e.node.id)
    expect(ids).toContain(globalTypeId)
    expect(ids).toContain(orgTypeId)
  })

  it('denial: org member without a global role is DENIED the admin productTypes', async () => {
    const res = await h.gql(
      `query{ productTypes(first:10){ edges { node { id } } } }`,
      {},
      orgToken,
    )
    // Global-role scope denies → GraphQL error, no data.
    expect(res.errors).toBeDefined()
    expect(res.errors!.length).toBeGreaterThan(0)
    expect(res.data?.productTypes ?? null).toBeNull()
  })
})
