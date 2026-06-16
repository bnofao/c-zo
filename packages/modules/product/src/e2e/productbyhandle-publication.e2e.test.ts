// @czo/product `productByHandle` publication-filter E2E (B19 interim) — proves
// the storefront read only returns products that are LIVE on a channel (≥1
// published, approved, non-deleted channel listing), and that a published
// org-owned product's variants are now publicly visible (the un-graft fix).
//
//   • Draft hidden: an org-owned product with NO listing is null via
//     productByHandle — even to its OWNING org (the read is the published
//     catalog, not a draft-access grant).
//   • Published shown + variants visible: once published on the org's own
//     channel (own-channel listings default reviewState='approved'), the product
//     resolves ANONYMOUSLY and its variant surfaces (the variants un-graft).
//   • No cross-tenant draft leak: org A's unpublished product is never returned,
//     to org B or to anonymous callers.
//
// Upstream rows (channels) are seeded directly via `runEffect`, as in the
// org-owned and global E2Es.

import type { ProductHarness } from './harness'
import { Channel as ChannelSvc } from '@czo/channel/services'
import { decodeGlobalID } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootProductApp } from './harness'

describe('product productByHandle publication-filter e2e', () => {
  let h: ProductHarness

  // Org A (owns the products under test) + org B (a bystander tenant).
  let aToken: string
  let aOrgGlobalId: string
  let bToken: string

  // Org-A channel (for publishing).
  let aChannelId: number

  beforeAll(async () => {
    h = await bootProductApp()

    const aUser = await h.signUp('a@x.io', 'AOwner', 'password1234')
    aToken = aUser.token
    const a = await h.createOrgWithProductAccess(aUser, 'Acme', 'acme')
    aOrgGlobalId = a.orgGlobalId

    const bUser = await h.signUp('b@x.io', 'BOwner', 'password1234')
    bToken = bUser.token
    await h.createOrgWithProductAccess(bUser, 'Bravo', 'bravo')

    // Org-A channel for publishing the live listing.
    const seeded = await h.app.runEffect(
      Effect.gen(function* () {
        const chanSvc = yield* ChannelSvc.ChannelService
        const aChan = yield* chanSvc.create({ organizationId: a.orgNumericId, name: 'A Web', handle: 'a-web' })
        return { aChannelId: aChan.id }
      }),
    )
    aChannelId = seeded.aChannelId
  }, 240_000)

  afterAll(async () => {
    await h.close()
  })

  // Create an org-A-owned product (fresh type) and return its global id + handle.
  async function createOrgProduct(slug: string, handle: string): Promise<string> {
    const type = await h.gql(
      `mutation($input:CreateOrganizationProductTypeInput!){ createOrganizationProductType(input:$input){ ... on CreateOrganizationProductTypeSuccess { data { productType { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, name: slug, slug, isShippingRequired: true } },
      aToken,
    )
    if (type.errors)
      throw new Error(`createOrganizationProductType failed: ${JSON.stringify(type.errors)}`)
    const typeNumericId = Number(decodeGlobalID(type.data.createOrganizationProductType.data.productType.id).id)

    const product = await h.gql(
      `mutation($input:CreateOrganizationProductInput!){ createOrganizationProduct(input:$input){ ... on CreateOrganizationProductSuccess { data { product { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, productTypeId: typeNumericId, handle, name: handle } },
      aToken,
    )
    if (product.errors)
      throw new Error(`createOrganizationProduct failed: ${JSON.stringify(product.errors)}`)
    return product.data.createOrganizationProduct.data.product.id
  }

  // ── 1. Draft hidden: no listing → null even to the owning org ────────────────

  it('draft (no listing) is null via productByHandle, even for the owning org', async () => {
    await createOrgProduct('pub-draft-type', 'pub-draft')

    const res = await h.gql(
      `query($handle:String!,$org:ID!){ productByHandle(handle:$handle, viewerOrg:$org){ id } }`,
      { handle: 'pub-draft', org: aOrgGlobalId },
      aToken,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.productByHandle).toBeNull()
  })

  // ── 2. Published shown + variants visible (anonymous) ────────────────────────

  it('published product is returned ANONYMOUSLY and its variant is visible', async () => {
    const productGlobalId = await createOrgProduct('pub-live-type', 'pub-live')

    // One variant on the product (no selection needed — uniqueness is trivially met).
    const variant = await h.gql(
      `mutation($input:CreateVariantInput!){ createVariant(input:$input){ __typename ... on CreateVariantSuccess { data { variant { id sku } } } } }`,
      { input: { productId: productGlobalId, sku: 'PUB-LIVE-SKU' } },
      aToken,
    )
    expect(variant.errors).toBeUndefined()
    expect(variant.data.createVariant.data.variant.id).toBeTruthy()

    // Publish on org A's own channel → live listing (own-channel default approved).
    const pub = await h.gql(
      `mutation($input:PublishProductInput!){ publishProduct(input:$input){ __typename ... on PublishProductSuccess { data { isPublished } } } }`,
      { input: { productId: productGlobalId, organizationId: aOrgGlobalId, channelId: aChannelId, isPublished: true } },
      aToken,
    )
    expect(pub.errors).toBeUndefined()
    expect(pub.data.publishProduct.data.isPublished).toBe(true)

    // Anonymous storefront read: product returned + variant visible (un-graft).
    const res = await h.gql(
      `query($handle:String!,$org:ID!){
        productByHandle(handle:$handle, viewerOrg:$org){
          id
          variants{ edges { node { id sku } } }
        }
      }`,
      { handle: 'pub-live', org: aOrgGlobalId },
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.productByHandle).not.toBeNull()
    expect(res.data.productByHandle.id).toBe(productGlobalId)
    const skus: string[] = res.data.productByHandle.variants.edges.map((e: any) => e.node.sku)
    expect(skus).toContain('PUB-LIVE-SKU')
  })

  // ── 3. No cross-tenant draft leak ────────────────────────────────────────────

  it('org A unpublished product is not returned to org B or anonymously', async () => {
    await createOrgProduct('pub-secret-type', 'pub-secret')

    // Org B (a different tenant) cannot see A's unpublished product.
    const asB = await h.gql(
      `query($handle:String!,$org:ID!){ productByHandle(handle:$handle, viewerOrg:$org){ id } }`,
      { handle: 'pub-secret', org: aOrgGlobalId },
      bToken,
    )
    expect(asB.errors).toBeUndefined()
    expect(asB.data.productByHandle).toBeNull()

    // Nor can an anonymous caller.
    const asAnon = await h.gql(
      `query($handle:String!,$org:ID!){ productByHandle(handle:$handle, viewerOrg:$org){ id } }`,
      { handle: 'pub-secret', org: aOrgGlobalId },
    )
    expect(asAnon.errors).toBeUndefined()
    expect(asAnon.data.productByHandle).toBeNull()
  })
})
