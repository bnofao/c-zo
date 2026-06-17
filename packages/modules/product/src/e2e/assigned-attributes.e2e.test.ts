// @czo/product typed `assignedAttributes` E2E (A6) — proves the typed
// `assignedAttributes` / `assignedAttribute` reads on Product AND ProductVariant
// resolve each grafted attribute into its concrete `AssignedAttribute` impl
// (a cross-module @czo/attribute interface) through the anonymous, publication-
// gated `channelProducts(channel: C)` storefront path.
//
// Seed (org A owns product `pa`, grafts every value kind onto it, publishes LIVE
// on its own channel C):
//   • org A + two org-A channels C (pa is live) and C2 (pa is NOT live).
//   • product `pa` (org A) on a fresh type + one variant.
//   • PRODUCT grafts — one assignment of every kind: dropdown (VALUE), swatch
//     (SWATCH), reference (REFERENCE), numeric (NUMERIC), boolean (BOOLEAN),
//     date (DATE), text (TEXT), file (FILE).
//   • VARIANT graft — a dropdown (VALUE) assignment (proves the newly added
//     variant value relations load at runtime).
//   • publishProduct `pa` LIVE on C (own-channel default reviewState=approved).
//
// Attributes, typed values, and the `*_attribute_values` pivots are seeded
// directly via `runEffect` against @czo/attribute services + DrizzleDb — the
// GraphQL `assignProductValue` surface derives valueKind from the attribute TYPE
// (one attribute = one kind) so it cannot express the typed kinds. This mirrors
// the attribute-facets / channel-grafts seed layout. The product, its variant,
// and publication are driven through the real GraphQL mutations.

import type { ProductHarness } from './harness'
import { Attribute as AttributeSvc, AttributeValue as AttributeValueSvc, TypedValue as TypedValueSvc } from '@czo/attribute/services'
import { Channel as ChannelSvc } from '@czo/channel/services'
import { DrizzleDb } from '@czo/kit/db'
import { decodeGlobalID } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { productAttributeValues, variantAttributeValues } from '../database/schema'
import { bootProductApp } from './harness'

describe('product typed assignedAttributes e2e', () => {
  let h: ProductHarness

  let aToken: string
  let aOrgGlobalId: string
  let aOrgNumericId: number

  // Org-A channels: C (pa is live on it) and C2 (pa is NOT live on it).
  let channelCId: number
  let channelC2Id: number

  // The product under test + its captured ids.
  const paHandle = 'pa-assigned'
  let paGlobalId: string
  let paNumericId: number
  let variantGlobalId: string
  let variantNumericId: number

  // The reference id used for the reference value (cross-module, no FK).
  const referenceTargetId = 4242

  beforeAll(async () => {
    h = await bootProductApp()

    const aUser = await h.signUp('a@x.io', 'AOwner', 'password1234')
    aToken = aUser.token
    const a = await h.createOrgWithProductAccess(aUser, 'Acme', 'acme')
    aOrgGlobalId = a.orgGlobalId
    aOrgNumericId = a.orgNumericId

    // Two org-A channels (capture raw int ids for publishing + the query).
    const seededChannels = await h.app.runEffect(
      Effect.gen(function* () {
        const chanSvc = yield* ChannelSvc.ChannelService
        const c = yield* chanSvc.create({ organizationId: aOrgNumericId, name: 'A Web', handle: 'a-web' })
        const c2 = yield* chanSvc.create({ organizationId: aOrgNumericId, name: 'A Wholesale', handle: 'a-wholesale' })
        return { channelCId: c.id, channelC2Id: c2.id }
      }),
    )
    channelCId = seededChannels.channelCId
    channelC2Id = seededChannels.channelC2Id

    // ── product `pa` (org A) on a fresh type + one variant — via GraphQL ────────
    const type = await h.gql(
      `mutation($input:CreateOrganizationProductTypeInput!){ createOrganizationProductType(input:$input){ ... on CreateOrganizationProductTypeSuccess { data { productType { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, name: 'pa-type', slug: 'pa-type', isShippingRequired: true } },
      aToken,
    )
    if (type.errors)
      throw new Error(`createOrganizationProductType failed: ${JSON.stringify(type.errors)}`)
    const typeNumericId = Number(decodeGlobalID(type.data.createOrganizationProductType.data.productType.id).id)

    const product = await h.gql(
      `mutation($input:CreateOrganizationProductInput!){ createOrganizationProduct(input:$input){ ... on CreateOrganizationProductSuccess { data { product { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, productTypeId: typeNumericId, handle: paHandle, name: 'Acme Assigned Product' } },
      aToken,
    )
    if (product.errors)
      throw new Error(`createOrganizationProduct failed: ${JSON.stringify(product.errors)}`)
    paGlobalId = product.data.createOrganizationProduct.data.product.id
    paNumericId = Number(decodeGlobalID(paGlobalId).id)

    const variant = await h.gql(
      `mutation($input:CreateVariantInput!){ createVariant(input:$input){ __typename ... on CreateVariantSuccess { data { variant { id } } } } }`,
      { input: { productId: paGlobalId, sku: `${paHandle}-SKU` } },
      aToken,
    )
    if (variant.errors)
      throw new Error(`createVariant failed: ${JSON.stringify(variant.errors)}`)
    variantGlobalId = variant.data.createVariant.data.variant.id
    variantNumericId = Number(decodeGlobalID(variantGlobalId).id)

    // ── seed every value kind + the pivots directly (see file header) ──────────
    await h.app.runEffect(
      Effect.gen(function* () {
        const attrSvc = yield* AttributeSvc.AttributeService
        const valueSvc = yield* AttributeValueSvc.AttributeValueService
        const typedSvc = yield* TypedValueSvc.TypedValueService
        const db = yield* DrizzleDb

        const org = aOrgNumericId

        // dropdown (VALUE) — also reused as the VARIANT graft.
        const material = yield* attrSvc.create({ name: 'Material', type: 'DROPDOWN', organizationId: org })
        const cotton = yield* valueSvc.createValue({ attributeId: material.id, value: 'Cotton', slug: 'cotton', organizationId: org })

        // swatch (SWATCH).
        const colour = yield* attrSvc.create({ name: 'Colour', type: 'SWATCH', organizationId: org })
        const blue = yield* valueSvc.createSwatch({ attributeId: colour.id, value: 'Blue', slug: 'blue', color: '#0000ff', organizationId: org })

        // reference (REFERENCE).
        const brand = yield* attrSvc.create({ name: 'Brand', type: 'REFERENCE', referenceEntity: 'Brand', organizationId: org })
        const acmeBrand = yield* valueSvc.createReference({ attributeId: brand.id, value: 'Acme', slug: 'acme-brand', referenceId: referenceTargetId, organizationId: org })

        // numeric (NUMERIC).
        const weight = yield* attrSvc.create({ name: 'Weight', type: 'NUMERIC', organizationId: org })
        const weight60 = yield* typedSvc.createNumeric({ attributeId: weight.id, value: 60, organizationId: org })

        // boolean (BOOLEAN).
        const featured = yield* attrSvc.create({ name: 'Featured', type: 'BOOLEAN', organizationId: org })
        const featuredTrue = yield* typedSvc.createBoolean({ attributeId: featured.id, value: true, organizationId: org })

        // date (DATE).
        const releaseDate = new Date('2026-01-15T00:00:00.000Z')
        const released = yield* attrSvc.create({ name: 'Released', type: 'DATE', organizationId: org })
        const releasedVal = yield* typedSvc.createDate({ attributeId: released.id, value: releaseDate, organizationId: org })

        // text (TEXT).
        const care = yield* attrSvc.create({ name: 'Care', type: 'RICH_TEXT', organizationId: org })
        const careVal = yield* typedSvc.createText({ attributeId: care.id, plain: 'Machine wash cold', rich: null, organizationId: org })

        // file (FILE).
        const manual = yield* attrSvc.create({ name: 'Manual', type: 'FILE', organizationId: org })
        const manualVal = yield* typedSvc.createFile({ attributeId: manual.id, fileUrl: 'https://cdn.example/manual.pdf', mimetype: 'application/pdf', organizationId: org })

        // PRODUCT pivots — one assignment of each kind (org graft).
        yield* db.insert(productAttributeValues).values([
          { productId: paNumericId, organizationId: org, attributeId: material.id, valueId: cotton.id, position: 0 },
          { productId: paNumericId, organizationId: org, attributeId: colour.id, valueId: blue.id, position: 0 },
          { productId: paNumericId, organizationId: org, attributeId: brand.id, valueId: acmeBrand.id, position: 0 },
          { productId: paNumericId, organizationId: org, attributeId: weight.id, valueId: weight60.id, position: 0 },
          { productId: paNumericId, organizationId: org, attributeId: featured.id, valueId: featuredTrue.id, position: 0 },
          { productId: paNumericId, organizationId: org, attributeId: released.id, valueId: releasedVal.id, position: 0 },
          { productId: paNumericId, organizationId: org, attributeId: care.id, valueId: careVal.id, position: 0 },
          { productId: paNumericId, organizationId: org, attributeId: manual.id, valueId: manualVal.id, position: 0 },
        ])

        // VARIANT pivot — a dropdown (VALUE) graft (proves variant value relations
        // load at runtime).
        yield* db.insert(variantAttributeValues).values([
          { variantId: variantNumericId, organizationId: org, attributeId: material.id, valueId: cotton.id, position: 0 },
        ])
      }),
    )

    // publish LIVE on channel C (own-channel default reviewState=approved).
    const pub = await h.gql(
      `mutation($input:PublishProductInput!){ publishProduct(input:$input){ __typename ... on PublishProductSuccess { data { isPublished } } } }`,
      { input: { productId: paGlobalId, organizationId: aOrgGlobalId, channelId: channelCId, isPublished: true } },
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

  // ── helper: find pa's node in an anonymous channelProducts(channel: C) read ──
  async function fetchPaNode(selection: string, channel: number): Promise<any> {
    const res = await h.gql(
      `query($c:Int!){
        channelProducts(channel:$c, first:50){
          edges { node { handle ${selection} } }
        }
      }`,
      { c: channel },
    )
    expect(res.errors).toBeUndefined()
    const node = res.data.channelProducts.edges
      .map((e: any) => e.node)
      .find((n: any) => n.handle === paHandle)
    expect(node).toBeTruthy()
    return node
  }

  // ── 1. Product: every grafted kind resolves to its concrete impl ─────────────

  it('product assignedAttributes(channel: C) resolves every kind to its concrete typename + value', async () => {
    const node = await fetchPaNode(
      `assignedAttributes(channel:$c){
        __typename
        attribute { name slug type }
        ... on AssignedDropdownAttribute { values { slug value } }
        ... on AssignedSwatchAttribute { values { slug color } }
        ... on AssignedReferenceAttribute { values { slug referenceId } }
        ... on AssignedNumericAttribute { numericValue: value }
        ... on AssignedBooleanAttribute { booleanValue: value }
        ... on AssignedDateAttribute { dateValue: value }
        ... on AssignedTextAttribute { plain rich }
        ... on AssignedFileAttribute { url mimetype }
      }`,
      channelCId,
    )

    const assigned: any[] = node.assignedAttributes
    expect(assigned.length).toBe(8)

    // `attribute { name slug }` resolves on every impl (proves the cross-module
    // public `Attribute`).
    for (const a of assigned) {
      expect(a.attribute?.name).toBeTruthy()
      expect(a.attribute?.slug).toBeTruthy()
    }

    const byType = new Map<string, any>(assigned.map((a: any) => [a.__typename, a]))

    const dropdown = byType.get('AssignedDropdownAttribute')
    expect(dropdown).toBeTruthy()
    expect(dropdown.values.map((v: any) => v.slug)).toEqual(['cotton'])
    expect(dropdown.values[0].value).toBe('Cotton')

    const swatch = byType.get('AssignedSwatchAttribute')
    expect(swatch).toBeTruthy()
    expect(swatch.values.map((v: any) => v.slug)).toEqual(['blue'])
    expect(swatch.values[0].color).toBe('#0000ff')

    const reference = byType.get('AssignedReferenceAttribute')
    expect(reference).toBeTruthy()
    expect(reference.values.map((v: any) => v.slug)).toEqual(['acme-brand'])
    expect(reference.values[0].referenceId).toBe(referenceTargetId)

    const numeric = byType.get('AssignedNumericAttribute')
    expect(numeric).toBeTruthy()
    expect(numeric.numericValue).toBe(60)

    const boolean = byType.get('AssignedBooleanAttribute')
    expect(boolean).toBeTruthy()
    expect(boolean.booleanValue).toBe(true)

    const date = byType.get('AssignedDateAttribute')
    expect(date).toBeTruthy()
    expect(new Date(date.dateValue).toISOString()).toBe('2026-01-15T00:00:00.000Z')

    const text = byType.get('AssignedTextAttribute')
    expect(text).toBeTruthy()
    expect(text.plain).toBe('Machine wash cold')

    const file = byType.get('AssignedFileAttribute')
    expect(file).toBeTruthy()
    expect(file.url).toBe('https://cdn.example/manual.pdf')
    expect(file.mimetype).toBe('application/pdf')
  })

  // ── 2. Single accessor by slug + non-existent slug → null ────────────────────

  it('assignedAttribute(slug) returns the one attribute; a non-existent slug → null', async () => {
    const node = await fetchPaNode(
      `hit: assignedAttribute(slug:"weight", channel:$c){ __typename ... on AssignedNumericAttribute { value attribute { slug } } }
       miss: assignedAttribute(slug:"does-not-exist", channel:$c){ __typename }`,
      channelCId,
    )
    expect(node.hit.__typename).toBe('AssignedNumericAttribute')
    expect(node.hit.value).toBe(60)
    expect(node.hit.attribute.slug).toBe('weight')
    expect(node.miss).toBeNull()
  })

  // ── 3. Variant: the grafted assigned attribute resolves at runtime ───────────

  it('variant assignedAttributes(channel: C) resolves the variant graft', async () => {
    const node = await fetchPaNode(
      `variants{ edges { node {
        assignedAttributes(channel:$c){
          __typename
          attribute { slug }
          ... on AssignedDropdownAttribute { values { slug } }
        }
      } } }`,
      channelCId,
    )
    const variantNodes: any[] = node.variants.edges.map((e: any) => e.node)
    const withAssigned = variantNodes.find((v: any) => v.assignedAttributes.length > 0)
    expect(withAssigned).toBeTruthy()
    const assigned: any[] = withAssigned.assignedAttributes
    expect(assigned).toHaveLength(1)
    expect(assigned[0].__typename).toBe('AssignedDropdownAttribute')
    expect(assigned[0].attribute.slug).toBe('material')
    expect(assigned[0].values.map((v: any) => v.slug)).toEqual(['cotton'])
  })

  // ── 4. No-leak: a channel pa is NOT live on surfaces NONE of A's grafts ──────

  it('assignedAttributes(channel: C2) (pa not live there) → base-only/empty (no org grafts)', async () => {
    // List pa from C (the channel it IS live on), then pass the BOGUS channel C2
    // into the field args: a channel pa isn't live on resolves to no org →
    // base-only. All of pa's attribute grafts are org-scoped (no base rows), so
    // none surface.
    const res = await h.gql(
      `query($c:Int!,$c2:Int!){
        channelProducts(channel:$c, first:50){
          edges { node {
            handle
            assignedAttributes(channel:$c2){ __typename }
            variants{ edges { node { assignedAttributes(channel:$c2){ __typename } } } }
          } }
        }
      }`,
      { c: channelCId, c2: channelC2Id },
    )
    expect(res.errors).toBeUndefined()
    const node = res.data.channelProducts.edges
      .map((e: any) => e.node)
      .find((n: any) => n.handle === paHandle)
    expect(node).toBeTruthy()
    expect(node.assignedAttributes).toHaveLength(0)
    for (const v of node.variants.edges.map((e: any) => e.node))
      expect(v.assignedAttributes).toHaveLength(0)
  })

  // ── 5. C1: anonymous viewerOrg path stays gated ──────────────────────────────

  it('c1: anonymously passing viewerOrg: A into assignedAttributes is DENIED', async () => {
    // pa is org-owned; the public `productByHandle(handle)` (no viewerOrg) scopes
    // to base and returns null. Reaching pa requires viewerOrg=A, which gates the
    // graft field on `product:read` in A — an anonymous caller is denied.
    const res = await h.gql(
      `query($handle:String!,$org:ID!){
        productByHandle(handle:$handle, viewerOrg:$org){
          handle
          assignedAttributes(viewerOrg:$org){ __typename }
        }
      }`,
      { handle: paHandle, org: aOrgGlobalId },
    )
    expect(res.errors).toBeDefined()
    expect(res.errors!.length).toBeGreaterThan(0)
    expect(res.data?.productByHandle?.assignedAttributes ?? null).toBeNull()
  })
})
