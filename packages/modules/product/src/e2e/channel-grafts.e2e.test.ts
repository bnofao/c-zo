// @czo/product channel-scoped GRAFT resolution E2E (G6) — proves that the public,
// anonymous `channelProducts(channel: C)` storefront read resolves each graft
// field for the org that PUBLISHED the product on C (its live
// `product_channel_listings.organizationId`), gated only by publication — no
// `viewerOrg`, no authentication.
//
// Seed (org A owns a product, grafts onto it, publishes LIVE on channel C):
//   • org A + two org-A channels C and C2 (C2 = a channel pg is NOT live on).
//   • product `pg` (org A) on a fresh type that declares a PRODUCT attribute, with
//     one variant.
//   • Grafts as org A: a media row (addMedia), an attribute value
//     (assignProductValue), a category placement (createOrganizationCategory +
//     placeProduct), a variant price binding (bindPriceSet → capture priceSetId),
//     and a variant inventory link (linkInventoryItem).
//   • publishProduct `pg` LIVE on C (own-channel default reviewState=approved).
//
// The category, attribute + value, price set, and inventory item are seeded via
// `runEffect` against their upstream services (mirroring product-org.e2e); the
// product, its variant, and every graft are driven through the real GraphQL
// graft mutations so the feature path under test is exercised end-to-end.
//
// Assertions:
//   1. Storefront resolves the publishing org's grafts ANONYMOUSLY via
//      `channelProducts(channel: C)` — media/assignedAttributes/categories ≥1,
//      priceSet non-null (expected priceSetId), inventoryItems ≥1 edge.
//   2. No leak on a non-matching channel — `channel: C2` (pg is not live on C2) →
//      base-only: priceSet null, media/inventoryItems carry NONE of A's grafts.
//   3. C1 still holds — passing `viewerOrg: A` (no channel) anonymously is DENIED.
//
// For (2) and (3) `pg` is reached via the PUBLIC `productByHandle(handle)` query
// (pg is live on C so it is returned), then C2 / viewerOrg are passed into the
// graft field args directly.

import type { ProductHarness } from './harness'
import { Attribute as AttributeSvc, AttributeValue as AttributeValueSvc } from '@czo/attribute/services'
import { Channel as ChannelSvc } from '@czo/channel/services'
import { Inventory as InventorySvc } from '@czo/inventory/services'
import { decodeGlobalID } from '@czo/kit/graphql'
import { Price as PriceSvc } from '@czo/price/services'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootProductApp } from './harness'

describe('product channel-scoped graft resolution e2e', () => {
  let h: ProductHarness

  let aToken: string
  let aOrgGlobalId: string
  let aOrgNumericId: number

  // Org-A channels: C (pg is live on it) and C2 (pg is NOT live on it).
  let channelCId: number
  let channelC2Id: number

  // The product under test + its captured ids.
  let pgHandle: string
  let pgGlobalId: string
  let pgNumericId: number
  let variantGlobalId: string

  // The price set bound to pg's variant (asserted back on the storefront read).
  let boundPriceSetId: number

  beforeAll(async () => {
    h = await bootProductApp()

    const aUser = await h.signUp('a@x.io', 'AOwner', 'password1234')
    aToken = aUser.token
    const a = await h.createOrgWithProductAccess(aUser, 'Acme', 'acme')
    aOrgGlobalId = a.orgGlobalId
    aOrgNumericId = a.orgNumericId

    // Upstream rows for the grafts (attribute + value, price set, inventory item,
    // two channels) — seeded directly via their services (mirrors product-org).
    const seeded = await h.app.runEffect(
      Effect.gen(function* () {
        const chanSvc = yield* ChannelSvc.ChannelService
        const c = yield* chanSvc.create({ organizationId: aOrgNumericId, name: 'A Web', handle: 'a-web' })
        const c2 = yield* chanSvc.create({ organizationId: aOrgNumericId, name: 'A Wholesale', handle: 'a-wholesale' })

        const attrSvc = yield* AttributeSvc.AttributeService
        const material = yield* attrSvc.create({ name: 'Material', type: 'DROPDOWN', organizationId: aOrgNumericId })
        const valueSvc = yield* AttributeValueSvc.AttributeValueService
        const cotton = yield* valueSvc.createValue({ attributeId: material.id, value: 'Cotton', organizationId: aOrgNumericId })

        const priceSvc = yield* PriceSvc.PriceService
        const set = yield* priceSvc.createPriceSet({ organizationId: aOrgNumericId })

        const invSvc = yield* InventorySvc.InventoryService
        const item = yield* invSvc.createItem({ organizationId: aOrgNumericId, sku: 'PG-SKU-1' })

        return {
          channelCId: c.id,
          channelC2Id: c2.id,
          materialAttrId: material.id,
          cottonValueId: cotton.id,
          priceSetId: set.id,
          inventoryItemId: item.id,
        }
      }),
    )
    channelCId = seeded.channelCId
    channelC2Id = seeded.channelC2Id
    boundPriceSetId = seeded.priceSetId

    // ── product `pg` (org A) on a fresh type declaring a PRODUCT attribute ──────
    pgHandle = 'pg-grafts'
    const type = await h.gql(
      `mutation($input:CreateOrganizationProductTypeInput!){ createOrganizationProductType(input:$input){ ... on CreateOrganizationProductTypeSuccess { data { productType { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, name: 'pg-type', slug: 'pg-type', isShippingRequired: true } },
      aToken,
    )
    if (type.errors)
      throw new Error(`createOrganizationProductType failed: ${JSON.stringify(type.errors)}`)
    const typeGlobalId: string = type.data.createOrganizationProductType.data.productType.id

    // Declare the material attribute on the type (PRODUCT assignment) so the
    // product attribute value graft is valid.
    const decl = await h.gql(
      `mutation($input:DeclareAttributeInput!){ declareAttribute(input:$input){ __typename ... on DeclareAttributeSuccess { data { attribute { id } } } } }`,
      { input: { productTypeId: typeGlobalId, attributeId: seeded.materialAttrId, assignment: 'PRODUCT', variantSelection: false, position: 0 } },
      aToken,
    )
    if (decl.errors)
      throw new Error(`declareAttribute failed: ${JSON.stringify(decl.errors)}`)

    const product = await h.gql(
      `mutation($input:CreateOrganizationProductInput!){ createOrganizationProduct(input:$input){ ... on CreateOrganizationProductSuccess { data { product { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, productTypeId: Number(decodeGlobalID(typeGlobalId).id), handle: pgHandle, name: 'Acme Grafted Product' } },
      aToken,
    )
    if (product.errors)
      throw new Error(`createOrganizationProduct failed: ${JSON.stringify(product.errors)}`)
    pgGlobalId = product.data.createOrganizationProduct.data.product.id
    pgNumericId = Number(decodeGlobalID(pgGlobalId).id)

    const variant = await h.gql(
      `mutation($input:CreateVariantInput!){ createVariant(input:$input){ __typename ... on CreateVariantSuccess { data { variant { id } } } } }`,
      { input: { productId: pgGlobalId, sku: `${pgHandle}-SKU` } },
      aToken,
    )
    if (variant.errors)
      throw new Error(`createVariant failed: ${JSON.stringify(variant.errors)}`)
    variantGlobalId = variant.data.createVariant.data.variant.id

    // ── Grafts as org A (real GraphQL graft mutations) ──────────────────────────

    // media graft — addMedia (productId Int, organizationId globalID, url).
    const media = await h.gql(
      `mutation($input:AddMediaInput!){ addMedia(input:$input){ __typename ... on AddMediaSuccess { data { media { id } } } } }`,
      { input: { productId: pgNumericId, organizationId: aOrgGlobalId, url: 'https://cdn.example/pg.png', type: 'IMAGE' } },
      aToken,
    )
    if (media.errors)
      throw new Error(`addMedia failed: ${JSON.stringify(media.errors)}`)

    // attribute value graft — assignProductValue.
    const assign = await h.gql(
      `mutation($input:AssignProductValueInput!){ assignProductValue(input:$input){ __typename ... on AssignProductValueSuccess { data { pivotIds } } } }`,
      { input: { productId: pgGlobalId, organizationId: aOrgGlobalId, attributeId: seeded.materialAttrId, value: { valueIds: [seeded.cottonValueId] } } },
      aToken,
    )
    if (assign.errors)
      throw new Error(`assignProductValue failed: ${JSON.stringify(assign.errors)}`)

    // category graft — createOrganizationCategory then placeProduct.
    const cat = await h.gql(
      `mutation($input:CreateOrganizationCategoryInput!){ createOrganizationCategory(input:$input){ __typename ... on CreateOrganizationCategorySuccess { data { category { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, name: 'Acme Cat', slug: 'acme-cat' } },
      aToken,
    )
    if (cat.errors)
      throw new Error(`createOrganizationCategory failed: ${JSON.stringify(cat.errors)}`)
    const categoryGlobalId: string = cat.data.createOrganizationCategory.data.category.id

    const place = await h.gql(
      `mutation($input:PlaceProductInput!){ placeProduct(input:$input){ __typename ... on PlaceProductSuccess { data { productId categoryId } } } }`,
      { input: { categoryId: categoryGlobalId, productId: pgNumericId, organizationId: aOrgGlobalId } },
      aToken,
    )
    if (place.errors)
      throw new Error(`placeProduct failed: ${JSON.stringify(place.errors)}`)

    // variant price binding — bindPriceSet (capture priceSetId echoed back).
    const bind = await h.gql(
      `mutation($input:BindPriceSetInput!){ bindPriceSet(input:$input){ __typename ... on BindPriceSetSuccess { data { priceSetId } } } }`,
      { input: { variantId: variantGlobalId, organizationId: aOrgGlobalId, priceSetId: boundPriceSetId } },
      aToken,
    )
    if (bind.errors)
      throw new Error(`bindPriceSet failed: ${JSON.stringify(bind.errors)}`)

    // variant inventory link — linkInventoryItem.
    const link = await h.gql(
      `mutation($input:LinkInventoryItemInput!){ linkInventoryItem(input:$input){ __typename ... on LinkInventoryItemSuccess { data { inventoryItemId } } } }`,
      { input: { variantId: variantGlobalId, organizationId: aOrgGlobalId, inventoryItemId: seeded.inventoryItemId } },
      aToken,
    )
    if (link.errors)
      throw new Error(`linkInventoryItem failed: ${JSON.stringify(link.errors)}`)

    // publish LIVE on channel C (own-channel default reviewState=approved).
    const pub = await h.gql(
      `mutation($input:PublishProductInput!){ publishProduct(input:$input){ __typename ... on PublishProductSuccess { data { isPublished } } } }`,
      { input: { productId: pgGlobalId, organizationId: aOrgGlobalId, channelId: channelCId, isPublished: true } },
      aToken,
    )
    if (pub.errors)
      throw new Error(`publishProduct failed: ${JSON.stringify(pub.errors)}`)
    if (pub.data.publishProduct.data?.isPublished !== true)
      throw new Error(`publishProduct did not publish: ${JSON.stringify(pub.data)}`)
  }, 240_000)

  afterAll(async () => {
    await h.close()
  })

  // ── 1. storefront resolves the publishing org's grafts ANONYMOUSLY ───────────

  it('channelProducts(channel: C) resolves the publishing org\'s grafts with NO auth', async () => {
    const res = await h.gql(
      `query($c:Int!){
        channelProducts(channel:$c, first:50){
          edges { node {
            handle
            media(channel:$c){ edges { node { id } } }
            assignedAttributes(channel:$c){ __typename attribute { slug } ... on AssignedDropdownAttribute { values { slug } } }
            categories(channel:$c){ edges { node { id } } }
            variants{ edges { node {
              priceSet(channel:$c){ priceSetId }
              inventoryItems(channel:$c){ edges { node { id } } }
            } } }
          } }
        }
      }`,
      { c: channelCId },
    )
    expect(res.errors).toBeUndefined()
    const node = res.data.channelProducts.edges
      .map((e: any) => e.node)
      .find((n: any) => n.handle === pgHandle)
    expect(node).toBeTruthy()

    // Product-level grafts: each surfaces A's grafted row. The grafted Material
    // (DROPDOWN) attribute resolves into its typed AssignedDropdownAttribute.
    expect(node.media.edges.length).toBeGreaterThan(0)
    expect(node.assignedAttributes.length).toBeGreaterThan(0)
    const material = node.assignedAttributes.find((a: any) => a.attribute.slug === 'material')
    expect(material).toBeTruthy()
    expect(material.__typename).toBe('AssignedDropdownAttribute')
    expect(material.values.length).toBeGreaterThan(0)
    expect(node.categories.edges.length).toBeGreaterThan(0)

    // Variant-level grafts: the bound price set + the linked inventory item.
    const boundVariant = node.variants.edges
      .map((e: any) => e.node)
      .find((v: any) => v.priceSet != null)
    expect(boundVariant).toBeTruthy()
    expect(boundVariant.priceSet.priceSetId).toBe(boundPriceSetId)
    expect(boundVariant.inventoryItems.edges.length).toBeGreaterThan(0)
  })

  // ── 2. no leak on a non-matching channel (pg is NOT live on C2) ───────────────

  it('channel: C2 (pg not live there) → base-only: no org-grafted rows surface', async () => {
    // pg is org-owned, so the public `productByHandle(handle)` (no viewerOrg)
    // scopes to base rows and returns null for it — the storefront reaches pg's
    // node only via the channel it IS live on (C). We list it from C, then pass
    // the BOGUS channel C2 into the graft args: a channel pg isn't live on must
    // surface NONE of A's private grafts (base-only).
    const res = await h.gql(
      `query($c:Int!,$c2:Int!){
        channelProducts(channel:$c, first:50){
          edges { node {
            handle
            media(channel:$c2){ edges { node { id } } }
            variants{ edges { node {
              priceSet(channel:$c2){ priceSetId }
              inventoryItems(channel:$c2){ edges { node { id } } }
            } } }
          } }
        }
      }`,
      { c: channelCId, c2: channelC2Id },
    )
    expect(res.errors).toBeUndefined()
    const node = res.data.channelProducts.edges
      .map((e: any) => e.node)
      .find((n: any) => n.handle === pgHandle)
    expect(node).toBeTruthy()
    expect(node.handle).toBe(pgHandle)

    // C2 has no live listing → org derives to null → base-only. A's media graft
    // is org-scoped (no base media row) so none surface; price/inventory grafts
    // have no base rows at all → empty.
    expect(node.media.edges).toHaveLength(0)
    const variants = node.variants.edges.map((e: any) => e.node)
    for (const v of variants) {
      expect(v.priceSet).toBeNull()
      expect(v.inventoryItems.edges).toHaveLength(0)
    }
  })

  // ── 3. C1 still holds — the viewerOrg path is gated for anonymous callers ─────

  it('passing viewerOrg: A anonymously is DENIED (C1 gate)', async () => {
    const res = await h.gql(
      `query($handle:String!,$org:ID!){
        productByHandle(handle:$handle, viewerOrg:$org){
          handle
          media(viewerOrg:$org){ edges { node { id } } }
        }
      }`,
      { handle: pgHandle, org: aOrgGlobalId },
    )
    // The graft field requires `product:read` in org A; an anonymous caller is
    // denied → errors present and the gated field resolves null.
    expect(res.errors).toBeDefined()
    expect(res.data?.productByHandle?.media ?? null).toBeNull()
  })
})
