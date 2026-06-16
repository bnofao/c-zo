// @czo/product `channelProducts` public storefront-catalog E2E — proves the
// anonymous channel catalog only returns products that have a LIVE listing
// (published, approved, non-deleted) on the GIVEN channel, and that the
// returned products' variants are publicly visible (the un-graft).
//
//   • Channel-scoped: a product live on channel C is returned for C, but a
//     product live on a DIFFERENT channel C2 is NOT, and an unpublished draft
//     (no listing) is never returned.
//   • Variants public: a returned node's `variants` field resolves with no
//     error (anonymous), proving variants are publicly visible.
//   • search + pagination work over the connection.
//
// Both live products under test are org-A-owned on org-A channels: own-channel
// listings default reviewState='approved' (live). A foreign org cannot get a
// LIVE listing on another org's channel (CrossOrgGraftDenied), and a platform
// channel only yields a `pending` listing — so an org-B-on-C live row is not a
// reachable state here, and the cross-tenant seed is intentionally omitted.
//
// Channels are seeded directly via `runEffect` (as in the other product E2Es);
// the raw int channel id captured there is what `publishProduct` and the
// `channelProducts(channel:)` arg consume.

import type { ProductHarness } from './harness'
import { Channel as ChannelSvc } from '@czo/channel/services'
import { decodeGlobalID } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootProductApp } from './harness'

describe('product channelProducts public storefront-catalog e2e', () => {
  let h: ProductHarness

  // Org A (the tenant under test).
  let aToken: string
  let aOrgGlobalId: string

  // Org-A channels: C (the catalog under test) and C2 (a different channel).
  let channelCId: number
  let channelC2Id: number

  beforeAll(async () => {
    h = await bootProductApp()

    const aUser = await h.signUp('a@x.io', 'AOwner', 'password1234')
    aToken = aUser.token
    const a = await h.createOrgWithProductAccess(aUser, 'Acme', 'acme')
    aOrgGlobalId = a.orgGlobalId

    // Two org-A channels — capture the raw int ids for publishing + the query.
    const seeded = await h.app.runEffect(
      Effect.gen(function* () {
        const chanSvc = yield* ChannelSvc.ChannelService
        const c = yield* chanSvc.create({ organizationId: a.orgNumericId, name: 'A Web', handle: 'a-web' })
        const c2 = yield* chanSvc.create({ organizationId: a.orgNumericId, name: 'A Wholesale', handle: 'a-wholesale' })
        return { channelCId: c.id, channelC2Id: c2.id }
      }),
    )
    channelCId = seeded.channelCId
    channelC2Id = seeded.channelC2Id

    // Seed the catalog (≥2 live on C so pagination has a next page):
    //   chp-a1 (org A) → published LIVE on C
    //   chp-a3 (org A) → published LIVE on C
    //   chp-a2 (org A) → published LIVE on C2 (a different channel)
    //   chp-draft (org A) → NOT published (no listing)
    const a1 = await createOrgProduct(aOrgGlobalId, aToken, 'chp-a1-type', 'chp-a1', 'Acme First Catalogue')
    await publish(a1, aOrgGlobalId, channelCId, aToken)

    const a3 = await createOrgProduct(aOrgGlobalId, aToken, 'chp-a3-type', 'chp-a3', 'Acme Third')
    await publish(a3, aOrgGlobalId, channelCId, aToken)

    const a2 = await createOrgProduct(aOrgGlobalId, aToken, 'chp-a2-type', 'chp-a2', 'Acme Wholesale Only')
    await publish(a2, aOrgGlobalId, channelC2Id, aToken)

    await createOrgProduct(aOrgGlobalId, aToken, 'chp-draft-type', 'chp-draft', 'Acme Draft')
  }, 240_000)

  afterAll(async () => {
    await h.close()
  })

  // Create an org-owned product (fresh type) + one variant; return its global id.
  async function createOrgProduct(
    orgGlobalId: string,
    token: string,
    slug: string,
    handle: string,
    name: string,
  ): Promise<string> {
    const type = await h.gql(
      `mutation($input:CreateOrganizationProductTypeInput!){ createOrganizationProductType(input:$input){ ... on CreateOrganizationProductTypeSuccess { data { productType { id } } } } }`,
      { input: { organizationId: orgGlobalId, name: slug, slug, isShippingRequired: true } },
      token,
    )
    if (type.errors)
      throw new Error(`createOrganizationProductType failed: ${JSON.stringify(type.errors)}`)
    const typeNumericId = Number(decodeGlobalID(type.data.createOrganizationProductType.data.productType.id).id)

    const product = await h.gql(
      `mutation($input:CreateOrganizationProductInput!){ createOrganizationProduct(input:$input){ ... on CreateOrganizationProductSuccess { data { product { id } } } } }`,
      { input: { organizationId: orgGlobalId, productTypeId: typeNumericId, handle, name } },
      token,
    )
    if (product.errors)
      throw new Error(`createOrganizationProduct failed: ${JSON.stringify(product.errors)}`)
    const productGlobalId: string = product.data.createOrganizationProduct.data.product.id

    const variant = await h.gql(
      `mutation($input:CreateVariantInput!){ createVariant(input:$input){ __typename ... on CreateVariantSuccess { data { variant { id } } } } }`,
      { input: { productId: productGlobalId, sku: `${handle}-SKU` } },
      token,
    )
    if (variant.errors)
      throw new Error(`createVariant failed: ${JSON.stringify(variant.errors)}`)

    return productGlobalId
  }

  // Publish a product on a channel → live listing (own-channel default approved).
  async function publish(productGlobalId: string, orgGlobalId: string, channelId: number, token: string): Promise<void> {
    const pub = await h.gql(
      `mutation($input:PublishProductInput!){ publishProduct(input:$input){ __typename ... on PublishProductSuccess { data { isPublished } } } }`,
      { input: { productId: productGlobalId, organizationId: orgGlobalId, channelId, isPublished: true } },
      token,
    )
    if (pub.errors)
      throw new Error(`publishProduct failed: ${JSON.stringify(pub.errors)}`)
    if (pub.data.publishProduct.data?.isPublished !== true)
      throw new Error(`publishProduct did not publish: ${JSON.stringify(pub.data)}`)
  }

  // ── 1. Channel-scoped catalog: only products live on C, variants visible ─────

  it('returns ONLY products live on the given channel (anonymous), with public variants', async () => {
    const res = await h.gql(
      `query($c:Int!){
        channelProducts(channel:$c, first:50){
          edges { node { id handle variants { edges { node { id } } } } }
        }
      }`,
      { c: channelCId },
    )
    expect(res.errors).toBeUndefined()
    const nodes: any[] = res.data.channelProducts.edges.map((e: any) => e.node)
    const handles: string[] = nodes.map(n => n.handle)

    // Live on C → present.
    expect(handles).toContain('chp-a1')
    expect(handles).toContain('chp-a3')
    // Live on a DIFFERENT channel / never published → absent.
    expect(handles).not.toContain('chp-a2')
    expect(handles).not.toContain('chp-draft')

    // Variants resolve with no error (anonymous) → variants are public.
    const withVariants = nodes.find(n => n.variants?.edges?.length > 0)
    expect(withVariants).toBeTruthy()
    expect(withVariants.variants.edges[0].node.id).toBeTruthy()
  })

  // ── 2. search narrows to the matching product ────────────────────────────────

  it('search filters the channel catalog to the matching product', async () => {
    const res = await h.gql(
      `query($c:Int!,$s:String){
        channelProducts(channel:$c, search:$s, first:50){ edges { node { handle name } } }
      }`,
      { c: channelCId, s: 'First Catalogue' },
    )
    expect(res.errors).toBeUndefined()
    const handles: string[] = res.data.channelProducts.edges.map((e: any) => e.node.handle)
    expect(handles).toEqual(['chp-a1'])
  })

  // ── 3. pagination: first:1 yields one edge + hasNextPage (≥2 live on C) ───────

  it('paginates: first:1 returns exactly one edge with hasNextPage', async () => {
    const res = await h.gql(
      `query($c:Int!){
        channelProducts(channel:$c, first:1){ edges { node { id } } pageInfo { hasNextPage } }
      }`,
      { c: channelCId },
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.channelProducts.edges).toHaveLength(1)
    expect(res.data.channelProducts.pageInfo.hasNextPage).toBe(true)
  })
})
