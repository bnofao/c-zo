// @czo/product `channelProducts` typed attribute FACETING E2E (F5) — proves the
// `where: { attributes: [...] }` facet surface narrows the anonymous channel
// catalog through the real translator (`buildProductWhere`) + Drizzle relational
// cross-module `where` (product pivot → @czo/attribute typed-value tables).
//
// Seed (one org A + one channel C; each product published LIVE on C):
//   • filterable attribute `color` (DROPDOWN) with a select value `red`;
//     filterable attribute `finish` (SWATCH) with a swatch value `blue`;
//     filterable attribute `weight` (NUMERIC) with a numeric value `60`;
//     a NON-filterable attribute `internal` with a value `x`.
//   • prod-rh: color=red (VALUE) + weight=60 (NUMERIC) + internal=x
//   • prod-r:  color=red (VALUE)
//   • prod-b:  finish=blue (SWATCH)
//
// The pivot's kind is NO LONGER a column — it derives from the attribute's TYPE
// (one attribute = one kind), so a SWATCH value must live on a SWATCH attribute
// (`finish`), not on the DROPDOWN `color`. The facet OR (select ∪ swatch) is thus
// exercised across two real attributes: `red` matches the DROPDOWN/selectValue
// branch, `blue` the SWATCH/swatchValue branch.
// Products are still created org-owned via GraphQL so the real `publishProduct`
// mutation yields a default-approved (live) listing on the org's own channel C.

import type { ProductHarness } from './harness'
import { Attribute as AttributeSvc, AttributeValue as AttributeValueSvc, TypedValue as TypedValueSvc } from '@czo/attribute/services'
import { Channel as ChannelSvc } from '@czo/channel/services'
import { DrizzleDb } from '@czo/kit/db'
import { decodeGlobalID, encodeGlobalID } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { productAttributeValues } from '../database/schema'
import { bootProductApp } from './harness'

describe('product channelProducts typed attribute faceting e2e', () => {
  let h: ProductHarness

  let aToken: string
  let aOrgGlobalId: string
  let channelCId: number

  // Captured relay globalID of the `color` attribute (for the `ids` assertion).
  let colorAttrGlobalId: string

  beforeAll(async () => {
    h = await bootProductApp()

    const aUser = await h.signUp('a@x.io', 'AOwner', 'password1234')
    aToken = aUser.token
    const a = await h.createOrgWithProductAccess(aUser, 'Acme', 'acme')
    aOrgGlobalId = a.orgGlobalId
    const orgNumericId = a.orgNumericId

    // One org-A channel — capture the raw int id for publishing + the query.
    const seededChannel = await h.app.runEffect(
      Effect.gen(function* () {
        const chanSvc = yield* ChannelSvc.ChannelService
        const c = yield* chanSvc.create({ organizationId: orgNumericId, name: 'A Web', handle: 'a-web' })
        return { channelCId: c.id }
      }),
    )
    channelCId = seededChannel.channelCId

    // Three org-owned products (fresh type each) + one variant — via GraphQL.
    const prodRh = await createOrgProduct('prod-rh')
    const prodR = await createOrgProduct('prod-r')
    const prodB = await createOrgProduct('prod-b')

    // Publish each LIVE on channel C (own-channel default reviewState=approved).
    await publish(prodRh.productGlobalId)
    await publish(prodR.productGlobalId)
    await publish(prodB.productGlobalId)

    // Seed attributes + typed values + pivots directly (see file header).
    const colorAttrId = await h.app.runEffect(
      Effect.gen(function* () {
        const attrSvc = yield* AttributeSvc.AttributeService
        const valueSvc = yield* AttributeValueSvc.AttributeValueService
        const typedSvc = yield* TypedValueSvc.TypedValueService
        const db = yield* DrizzleDb

        // filterable `color` (DROPDOWN) with a select value `red`.
        const color = yield* attrSvc.create({ name: 'color', type: 'DROPDOWN', isFilterable: true, organizationId: orgNumericId })
        const red = yield* valueSvc.createValue({ attributeId: color.id, value: 'Red', slug: 'red', organizationId: orgNumericId })
        // filterable `finish` (SWATCH) with a swatch value `blue` — the kind now
        // derives from the attribute's type, so a swatch lives on a SWATCH attribute.
        const finish = yield* attrSvc.create({ name: 'finish', type: 'SWATCH', isFilterable: true, organizationId: orgNumericId })
        const blue = yield* valueSvc.createSwatch({ attributeId: finish.id, value: 'Blue', slug: 'blue', color: '#0000ff', organizationId: orgNumericId })

        // filterable `weight` (NUMERIC) with a numeric value 60.
        const weight = yield* attrSvc.create({ name: 'weight', type: 'NUMERIC', isFilterable: true, organizationId: orgNumericId })
        const weight60 = yield* typedSvc.createNumeric({ attributeId: weight.id, value: 60, organizationId: orgNumericId })

        // NON-filterable `internal` (DROPDOWN) with a value `x`.
        const internal = yield* attrSvc.create({ name: 'internal', type: 'DROPDOWN', isFilterable: false, organizationId: orgNumericId })
        const x = yield* valueSvc.createValue({ attributeId: internal.id, value: 'x', slug: 'x', organizationId: orgNumericId })

        // product_attribute_values pivots (mirrors the F2 spike seed layout).
        yield* db.insert(productAttributeValues).values([
          // prod-rh: color=red VALUE + weight=60 NUMERIC + internal=x VALUE
          { productId: prodRh.productNumericId, organizationId: orgNumericId, attributeId: color.id, valueId: red.id, position: 0 },
          { productId: prodRh.productNumericId, organizationId: orgNumericId, attributeId: weight.id, valueId: weight60.id, position: 0 },
          { productId: prodRh.productNumericId, organizationId: orgNumericId, attributeId: internal.id, valueId: x.id, position: 0 },
          // prod-r: color=red VALUE
          { productId: prodR.productNumericId, organizationId: orgNumericId, attributeId: color.id, valueId: red.id, position: 0 },
          // prod-b: finish=blue SWATCH
          { productId: prodB.productNumericId, organizationId: orgNumericId, attributeId: finish.id, valueId: blue.id, position: 0 },
        ])

        return color.id
      }),
    )
    colorAttrGlobalId = encodeGlobalID('Attribute', String(colorAttrId))
  }, 240_000)

  afterAll(async () => {
    await h.close()
  })

  // ── seed helpers ─────────────────────────────────────────────────────────────

  // Create an org-owned product (fresh type) + one variant. Returns ids.
  async function createOrgProduct(handle: string): Promise<{ productGlobalId: string, productNumericId: number }> {
    const type = await h.gql(
      `mutation($input:CreateOrganizationProductTypeInput!){ createOrganizationProductType(input:$input){ ... on CreateOrganizationProductTypeSuccess { data { productType { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, name: `${handle}-type`, slug: `${handle}-type`, isShippingRequired: true } },
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
    const productGlobalId: string = product.data.createOrganizationProduct.data.product.id
    const productNumericId = Number(decodeGlobalID(productGlobalId).id)

    const variant = await h.gql(
      `mutation($input:CreateVariantInput!){ createVariant(input:$input){ __typename ... on CreateVariantSuccess { data { variant { id } } } } }`,
      { input: { productId: productGlobalId, sku: `${handle}-SKU` } },
      aToken,
    )
    if (variant.errors)
      throw new Error(`createVariant failed: ${JSON.stringify(variant.errors)}`)

    return { productGlobalId, productNumericId }
  }

  // Publish a product on channel C → live listing (own-channel default approved).
  async function publish(productGlobalId: string): Promise<void> {
    const pub = await h.gql(
      `mutation($input:PublishProductInput!){ publishProduct(input:$input){ __typename ... on PublishProductSuccess { data { isPublished } } } }`,
      { input: { productId: productGlobalId, organizationId: aOrgGlobalId, channelId: channelCId, isPublished: true } },
      aToken,
    )
    if (pub.errors)
      throw new Error(`publishProduct failed: ${JSON.stringify(pub.errors)}`)
    if (pub.data.publishProduct.data?.isPublished !== true)
      throw new Error(`publishProduct did not publish: ${JSON.stringify(pub.data)}`)
  }

  // ── assertion helper ─────────────────────────────────────────────────────────

  async function handlesFor(where: Record<string, unknown>): Promise<string[]> {
    const res = await h.gql(
      `query($c:Int!,$w:ProductWhereInput){
        channelProducts(channel:$c, where:$w, first:50){ edges { node { handle } } }
      }`,
      { c: channelCId, w: where },
    )
    expect(res.errors).toBeUndefined()
    return res.data.channelProducts.edges.map((e: any) => e.node.handle).sort()
  }

  // ── facet assertions ──────────────────────────────────────────────────────────

  it('value.slug in [red] → products carrying the red value', async () => {
    expect(await handlesFor({ attributes: [{ slug: { eq: 'color' }, value: { slug: { in: ['red'] } } }] }))
      .toEqual(['prod-r', 'prod-rh'])
  })

  it('value.slug in [blue] → the swatch-valued product (select∪SWATCH OR)', async () => {
    expect(await handlesFor({ attributes: [{ slug: { eq: 'finish' }, value: { slug: { in: ['blue'] } } }] }))
      .toEqual(['prod-b'])
  })

  it('facet AND (color=red AND weight>=50) → only the product carrying both', async () => {
    expect(await handlesFor({
      attributes: [
        { slug: { eq: 'color' }, value: { slug: { in: ['red'] } } },
        { slug: { eq: 'weight' }, value: { numeric: { gte: 50 } } },
      ],
    })).toEqual(['prod-rh'])
  })

  it('numeric range miss (weight<50) → no product', async () => {
    expect(await handlesFor({ attributes: [{ slug: { eq: 'weight' }, value: { numeric: { lt: 50 } } }] }))
      .toEqual([])
  })

  it('attribute-only (color present) → every product carrying a color value (not the finish-only one)', async () => {
    expect(await handlesFor({ attributes: [{ slug: { eq: 'color' } }] }))
      .toEqual(['prod-r', 'prod-rh'])
  })

  it('by attribute id → same as attribute-only by slug', async () => {
    expect(await handlesFor({ attributes: [{ ids: { eq: colorAttrGlobalId } }] }))
      .toEqual(['prod-r', 'prod-rh'])
  })

  it('isFilterable gate: a non-filterable attribute matches nothing', async () => {
    expect(await handlesFor({ attributes: [{ slug: { eq: 'internal' } }] }))
      .toEqual([])
  })
})
