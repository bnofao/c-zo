// @czo/product global-catalog + two-org-graft E2E (catalog §3.6) — the core
// overlay design exercised end-to-end through GraphQL.
//
// A PLATFORM admin (granted the GLOBAL `product` role) builds a global catalog
// (type + variant-selection attribute + product + variants, all org NULL). Two
// orgs A and B each hold an org-scoped `product` role.
//
//   • Adoption gate: org A's graft (bindPriceSet) BEFORE adopting fails with
//     ProductNotAdopted; after `adoptProduct` it succeeds. isAdopted is true for
//     A, false for B; adoptedProducts(A) lists the global product.
//   • Org A grafts: an org-A type attribute + an org-A product attribute value +
//     an org-A price binding + an org-A inventory link + an org-A channel listing.
//   • Overlay isolation: the global product read with viewerOrg A shows base ∪ A
//     grafts; with viewerOrg B shows base only (no A grafts). Publication exists
//     on A's channel, not B's.
//   • Unadopt: org A's grafts are purged; base data is intact.
//   • Denial: org A (no global role) cannot create a GLOBAL product; an org-C
//     user with no access reading an org-owned product node resolves to null.
//
// Upstream rows (attributes, values, price sets, inventory items, channels) are
// seeded directly through their services via `runEffect`, as in the org-owned
// E2E.

import type { ProductHarness } from './harness'
import { Attribute as AttributeSvc, AttributeValue as AttributeValueSvc } from '@czo/attribute/services'
import { Channel as ChannelSvc } from '@czo/channel/services'
import { Inventory as InventorySvc } from '@czo/inventory/services'
import { decodeGlobalID } from '@czo/kit/graphql'
import { Price as PriceSvc } from '@czo/price/services'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ProductService } from '../services'
import { bootProductApp } from './harness'

describe('product global-catalog + two-org-graft e2e', () => {
  let h: ProductHarness

  // Platform admin (global `product` role) + two orgs.
  let adminToken: string
  let aToken: string
  let aOrgGlobalId: string
  let aOrgNumericId: number
  let bToken: string
  let bOrgGlobalId: string
  let bOrgNumericId: number
  // Org C — a member of nothing relevant (no product access at all).
  let cToken: string

  // Seeded upstream ids.
  let baseDropdownAttrId: number
  let baseRedValueId: number
  let baseBlueValueId: number
  // Org-A-owned upstream rows (for A's grafts).
  let aProductAttrId: number
  let aMaterialValueId: number
  let aPriceSetId: number
  let aInventoryItemId: number
  let aChannelId: number
  // Org-B-owned channel (B never publishes — used only to prove isolation).
  let bChannelId: number

  // Global catalog ids.
  let globalTypeGlobalId: string
  let globalTypeNumericId: number
  let globalProductGlobalId: string
  let globalProductNumericId: number
  let globalVariantId: string

  // An org-A-owned product (for the node-guard deny-as-null assertion).
  let aOwnedProductGlobalId: string

  beforeAll(async () => {
    h = await bootProductApp()

    // Platform admin — granted the GLOBAL `product:admin` role (cumulative
    // hierarchy → create/read/update/delete on the `product` resource).
    const admin = await h.signUp('admin@x.io', 'Admin', 'password1234')
    adminToken = admin.token
    await h.grantGlobalRole(admin.userId, 'product:admin')

    // Org A + org B, each holding the org-scoped product role.
    const aUser = await h.signUp('a@x.io', 'AOwner', 'password1234')
    aToken = aUser.token
    const a = await h.createOrgWithProductAccess(aUser, 'Acme', 'acme')
    aOrgGlobalId = a.orgGlobalId
    aOrgNumericId = a.orgNumericId

    const bUser = await h.signUp('b@x.io', 'BOwner', 'password1234')
    bToken = bUser.token
    const b = await h.createOrgWithProductAccess(bUser, 'Bravo', 'bravo')
    bOrgGlobalId = b.orgGlobalId
    bOrgNumericId = b.orgNumericId

    // Org C — signed up, no product access anywhere.
    const cUser = await h.signUp('c@x.io', 'COwner', 'password1234')
    cToken = cUser.token

    // Seed upstream rows: a GLOBAL (org null) variant-selection dropdown + two
    // base values, plus org-A-owned attribute/value/price-set/inventory/channels.
    const seeded = await h.app.runEffect(
      Effect.gen(function* () {
        const attrSvc = yield* AttributeSvc.AttributeService
        const valueSvc = yield* AttributeValueSvc.AttributeValueService

        // GLOBAL variant-selection dropdown + two base values (org null).
        const baseColour = yield* attrSvc.create({ name: 'Colour', type: 'DROPDOWN', organizationId: null })
        const red = yield* valueSvc.createValue({ attributeId: baseColour.id, value: 'Red', organizationId: null })
        const blue = yield* valueSvc.createValue({ attributeId: baseColour.id, value: 'Blue', organizationId: null })

        // Org-A product-level attribute + value (for A's graft).
        const aMaterial = yield* attrSvc.create({ name: 'Material', type: 'DROPDOWN', organizationId: aOrgNumericId })
        const aCotton = yield* valueSvc.createValue({ attributeId: aMaterial.id, value: 'Cotton', organizationId: aOrgNumericId })

        // Org-A price set, inventory item, channel; org-B channel.
        const priceSvc = yield* PriceSvc.PriceService
        const aSet = yield* priceSvc.createPriceSet({ organizationId: aOrgNumericId })
        const invSvc = yield* InventorySvc.InventoryService
        const aItem = yield* invSvc.createItem({ organizationId: aOrgNumericId, sku: 'A-SKU-1' })
        const chanSvc = yield* ChannelSvc.ChannelService
        const aChan = yield* chanSvc.create({ organizationId: aOrgNumericId, name: 'A Web', handle: 'a-web' })
        const bChan = yield* chanSvc.create({ organizationId: bOrgNumericId, name: 'B Web', handle: 'b-web' })

        return {
          baseDropdownAttrId: baseColour.id,
          baseRedValueId: red.id,
          baseBlueValueId: blue.id,
          aProductAttrId: aMaterial.id,
          aMaterialValueId: aCotton.id,
          aPriceSetId: aSet.id,
          aInventoryItemId: aItem.id,
          aChannelId: aChan.id,
          bChannelId: bChan.id,
        }
      }),
    )
    baseDropdownAttrId = seeded.baseDropdownAttrId
    baseRedValueId = seeded.baseRedValueId
    baseBlueValueId = seeded.baseBlueValueId
    aProductAttrId = seeded.aProductAttrId
    aMaterialValueId = seeded.aMaterialValueId
    aPriceSetId = seeded.aPriceSetId
    aInventoryItemId = seeded.aInventoryItemId
    aChannelId = seeded.aChannelId
    bChannelId = seeded.bChannelId
  }, 240_000)

  afterAll(async () => {
    await h.close()
  })

  // ── 1. Admin builds the GLOBAL catalog ───────────────────────────────────────

  it('platform admin builds the global catalog (type + variant attr + product + variants), all org null', async () => {
    // GLOBAL product type (organizationId omitted → org null).
    const type = await h.gql(
      `mutation($input:CreateProductTypeInput!){ createProductType(input:$input){ ... on CreateProductTypeSuccess { data { productType { id organizationId } } } } }`,
      { input: { name: 'Shirt', slug: 'global-shirt', isShippingRequired: true } },
      adminToken,
    )
    expect(type.errors).toBeUndefined()
    globalTypeGlobalId = type.data.createProductType.data.productType.id
    globalTypeNumericId = Number(decodeGlobalID(globalTypeGlobalId).id)
    expect(type.data.createProductType.data.productType.organizationId).toBeNull()

    // Declare the GLOBAL variant-selection dropdown on the global type.
    const declVariant = await h.gql(
      `mutation($input:DeclareAttributeInput!){ declareAttribute(input:$input){ ... on DeclareAttributeSuccess { data { attribute { id } } } } }`,
      { input: { productTypeId: globalTypeGlobalId, attributeId: baseDropdownAttrId, assignment: 'VARIANT', variantSelection: true, position: 0 } },
      adminToken,
    )
    expect(declVariant.errors).toBeUndefined()

    // GLOBAL product on the global type (organizationId omitted → org null).
    const product = await h.gql(
      `mutation($input:CreateProductInput!){ createProduct(input:$input){ ... on CreateProductSuccess { data { product { id organizationId handle } } } } }`,
      { input: { productTypeId: globalTypeNumericId, handle: 'global-shirt', name: 'Global Shirt' } },
      adminToken,
    )
    expect(product.errors).toBeUndefined()
    globalProductGlobalId = product.data.createProduct.data.product.id
    globalProductNumericId = Number(decodeGlobalID(globalProductGlobalId).id)
    expect(product.data.createProduct.data.product.organizationId).toBeNull()

    // Two GLOBAL variants with distinct selections, seeded at the base level
    // (assignVariantValue with organizationId omitted → org null).
    globalVariantId = await createGlobalVariant(baseRedValueId)
    await createGlobalVariant(baseBlueValueId)

    // The product row is global (org null) — confirmed via the service.
    const productOrg = await h.app.runEffect(
      Effect.gen(function* () {
        const svc = yield* ProductService
        const p = yield* svc.findProductById(globalProductNumericId)
        return p.organizationId
      }),
    )
    expect(productOrg).toBeNull()
  })

  async function createGlobalVariant(valueId: number): Promise<string> {
    const created = await h.gql(
      `mutation($input:CreateVariantInput!){ createVariant(input:$input){ __typename ... on CreateVariantSuccess { data { variant { id } } } } }`,
      { input: { productId: globalProductGlobalId, selection: [{ attributeId: baseDropdownAttrId, valueId }] } },
      adminToken,
    )
    if (created.errors)
      throw new Error(`createVariant failed: ${JSON.stringify(created.errors)}`)
    const id: string = created.data.createVariant.data.variant.id
    // Persist the base selection (org null) so the matrix check sees it.
    const assigned = await h.gql(
      `mutation($input:AssignVariantValueInput!){ assignVariantValue(input:$input){ __typename ... on AssignVariantValueSuccess { data { pivotIds } } } }`,
      { input: { variantId: id, attributeId: baseDropdownAttrId, value: { valueIds: [valueId] } } },
      adminToken,
    )
    if (assigned.errors)
      throw new Error(`assignVariantValue (base) failed: ${JSON.stringify(assigned.errors)}`)
    return id
  }

  // ── 2. Adoption gate ─────────────────────────────────────────────────────────

  it('org A graft BEFORE adoption fails ProductNotAdopted; after adoptProduct it succeeds', async () => {
    // Pre-adoption graft attempt → ProductNotAdopted.
    const early = await h.gql(
      `mutation($input:BindPriceSetInput!){ bindPriceSet(input:$input){ __typename ... on BindPriceSetSuccess { data { priceSetId } } } }`,
      { input: { variantId: globalVariantId, organizationId: aOrgGlobalId, priceSetId: aPriceSetId } },
      aToken,
    )
    expect(early.errors).toBeUndefined()
    expect(early.data.bindPriceSet.__typename).toBe('ProductNotAdoptedError')

    // Adopt as org A.
    const adopt = await h.gql(
      `mutation($input:AdoptProductInput!){ adoptProduct(input:$input){ __typename ... on AdoptProductSuccess { data { productId organizationId } } } }`,
      { input: { productId: globalProductGlobalId, organization: aOrgGlobalId } },
      aToken,
    )
    expect(adopt.errors).toBeUndefined()
    expect(adopt.data.adoptProduct.data.productId).toBe(globalProductNumericId)
    expect(adopt.data.adoptProduct.data.organizationId).toBe(aOrgNumericId)
  })

  it('isAdopted is true for org A, false for org B; adoptedProducts(A) lists the global product', async () => {
    // `isAdopted(viewerOrg:X)` is gated on `product:read` in X (C1), so each org
    // reads its OWN flag with its own token (admin is a member of neither).
    const readA = await h.gql(
      `query($id:ID!,$a:ID!){ product(id:$id){ id forA: isAdopted(viewerOrg:$a) } }`,
      { id: globalProductGlobalId, a: aOrgGlobalId },
      aToken,
    )
    expect(readA.errors).toBeUndefined()
    expect(readA.data.product.forA).toBe(true)

    const readB = await h.gql(
      `query($id:ID!,$b:ID!){ product(id:$id){ id forB: isAdopted(viewerOrg:$b) } }`,
      { id: globalProductGlobalId, b: bOrgGlobalId },
      bToken,
    )
    expect(readB.errors).toBeUndefined()
    expect(readB.data.product.forB).toBe(false)

    const adopted = await h.gql(
      `query($org:ID!){ adoptedProducts(organization:$org){ edges { node { id } } } }`,
      { org: aOrgGlobalId },
      aToken,
    )
    expect(adopted.errors).toBeUndefined()
    const ids: string[] = adopted.data.adoptedProducts.edges.map((e: any) => e.node.id)
    expect(ids).toContain(globalProductGlobalId)
  })

  // ── 3. Org A grafts ──────────────────────────────────────────────────────────

  it('org A grafts: type attr, product value, price binding, inventory link, channel listing', async () => {
    // Extend the GLOBAL type with an org-A product-level attribute (org graft:
    // explicit organizationId scopes the declaration to org A).
    const decl = await h.gql(
      `mutation($input:DeclareAttributeInput!){ declareAttribute(input:$input){ ... on DeclareAttributeSuccess { data { attribute { id } } } } }`,
      { input: { productTypeId: globalTypeGlobalId, organizationId: aOrgGlobalId, attributeId: aProductAttrId, assignment: 'PRODUCT', variantSelection: false, position: 1 } },
      aToken,
    )
    expect(decl.errors).toBeUndefined()

    // Graft an org-A product attribute VALUE.
    const assign = await h.gql(
      `mutation($input:AssignProductValueInput!){ assignProductValue(input:$input){ __typename ... on AssignProductValueSuccess { data { pivotIds } } } }`,
      { input: { productId: globalProductGlobalId, organizationId: aOrgGlobalId, attributeId: aProductAttrId, value: { valueIds: [aMaterialValueId] } } },
      aToken,
    )
    expect(assign.errors).toBeUndefined()
    expect(assign.data.assignProductValue.data.pivotIds.length).toBeGreaterThan(0)

    // Price binding (now adopted → succeeds).
    const price = await h.gql(
      `mutation($input:BindPriceSetInput!){ bindPriceSet(input:$input){ __typename ... on BindPriceSetSuccess { data { priceSetId } } } }`,
      { input: { variantId: globalVariantId, organizationId: aOrgGlobalId, priceSetId: aPriceSetId } },
      aToken,
    )
    expect(price.errors).toBeUndefined()
    expect(price.data.bindPriceSet.data.priceSetId).toBe(aPriceSetId)

    // Inventory link.
    const inv = await h.gql(
      `mutation($input:LinkInventoryItemInput!){ linkInventoryItem(input:$input){ __typename ... on LinkInventoryItemSuccess { data { inventoryItemId } } } }`,
      { input: { variantId: globalVariantId, organizationId: aOrgGlobalId, inventoryItemId: aInventoryItemId } },
      aToken,
    )
    expect(inv.errors).toBeUndefined()
    expect(inv.data.linkInventoryItem.data.inventoryItemId).toBe(aInventoryItemId)

    // Channel listing on A's channel.
    const pub = await h.gql(
      `mutation($input:PublishProductInput!){ publishProduct(input:$input){ __typename ... on PublishProductSuccess { data { isPublished channelId } } } }`,
      { input: { productId: globalProductGlobalId, organizationId: aOrgGlobalId, channelId: aChannelId, isPublished: true } },
      aToken,
    )
    expect(pub.errors).toBeUndefined()
    expect(pub.data.publishProduct.data.isPublished).toBe(true)
    expect(pub.data.publishProduct.data.channelId).toBe(aChannelId)
  })

  // ── 4. Overlay isolation: A sees base ∪ A grafts; B sees base only ───────────

  it('overlay read with viewerOrg A shows base ∪ A grafts', async () => {
    // Graft fields are gated on `product:read` in the viewer org (C1) — A reads
    // its own grafts with its own token.
    const res = await readOverlay(aOrgGlobalId, aToken)
    const product = res.data.product
    expect(product).not.toBeNull()
    expect(product.organizationId).toBeNull() // still global

    // base attribute (org null) is absent — only A grafted a PRODUCT value here.
    // A's grafted product attribute value (organizationId === A) is present.
    const attrOrgs: (number | null)[] = product.attributeValues.edges.map((e: any) => e.node.organizationId)
    expect(attrOrgs).toContain(aOrgNumericId)

    // A's bound price set + inventory link are visible on the variant.
    const bound = product.variants.edges.find((e: any) => e.node.priceSet != null)
    expect(bound).toBeTruthy()
    expect(bound.node.priceSet.priceSetId).toBe(aPriceSetId)
    expect(bound.node.priceSet.organizationId).toBe(aOrgNumericId)
    expect(bound.node.inventoryItems.edges.length).toBeGreaterThan(0)

    // Publication exists on A's channel.
    const chans: number[] = product.channelListings.edges.map((e: any) => e.node.channelId)
    expect(chans).toContain(aChannelId)
    expect(chans).not.toContain(bChannelId)
  })

  it('overlay read with viewerOrg B shows base only — NO A grafts; isAdopted false', async () => {
    const res = await readOverlay(bOrgGlobalId, bToken)
    const product = res.data.product
    expect(product).not.toBeNull()
    expect(product.forB).toBe(false)

    // None of A's attribute grafts leak to B.
    const attrOrgs: (number | null)[] = product.attributeValues.edges.map((e: any) => e.node.organizationId)
    expect(attrOrgs).not.toContain(aOrgNumericId)

    // No price binding visible for B (priceSet is per-viewer-org).
    const anyBound = product.variants.edges.some((e: any) => e.node.priceSet != null)
    expect(anyBound).toBe(false)
    // No inventory grafts visible for B.
    const anyInv = product.variants.edges.some((e: any) => e.node.inventoryItems.edges.length > 0)
    expect(anyInv).toBe(false)

    // B never published → no listing on B's channel.
    const chans: number[] = product.channelListings.edges.map((e: any) => e.node.channelId)
    expect(chans).not.toContain(bChannelId)
  })

  // ── 4b. C1 leak prevention: graft fields are gated on product:read in the ────
  //        supplied viewerOrg. An org-B user (no perm in A) passing viewerOrg=A
  //        is DENIED — they cannot read A's private grafts. Anonymous/base read
  //        (no viewerOrg) stays public.

  // Read the GLOBAL product's graft fields via the PUBLIC `productByHandle`
  // entry, supplying viewerOrg=A, with the given token. Using the public field
  // isolates the GRAFT gate from the `product(id:)` query's own auth gate.
  async function readAGrafts(token?: string) {
    return h.gql(
      `query($handle:String!,$a:ID!){
        productByHandle(handle:$handle){
          id
          attributeValues(viewerOrg:$a){ edges { node { id organizationId } } }
          variants(viewerOrg:$a){
            edges { node {
              id
              priceSet(viewerOrg:$a){ priceSetId organizationId }
              inventoryItems(viewerOrg:$a){ edges { node { id organizationId } } }
            } }
          }
        }
      }`,
      { handle: 'global-shirt', a: aOrgGlobalId },
      token,
    )
  }

  it('c1: org-B user passing viewerOrg=A is DENIED — no leak of A grafts', async () => {
    const res = await readAGrafts(bToken)
    // Scope-auth denies the gated graft fields → GraphQL error, and NO A data.
    expect(res.errors).toBeDefined()
    expect(res.errors!.length).toBeGreaterThan(0)
    expect(res.data?.productByHandle?.attributeValues ?? null).toBeNull()
    expect(res.data?.productByHandle?.variants ?? null).toBeNull()
  })

  it('c1: an UNAUTHENTICATED caller passing viewerOrg=A is DENIED', async () => {
    const res = await readAGrafts(undefined)
    expect(res.errors).toBeDefined()
    expect(res.errors!.length).toBeGreaterThan(0)
    expect(res.data?.productByHandle?.attributeValues ?? null).toBeNull()
    expect(res.data?.productByHandle?.variants ?? null).toBeNull()
  })

  it('c1: viewerOrg OMITTED → public base read succeeds (no auth, no A grafts)', async () => {
    // No token, no viewerOrg → the graft gate's public branch (authScopes →
    // true). Only base (org IS NULL) rows surface; none of A's grafts leak.
    const res = await h.gql(
      `query($handle:String!){
        productByHandle(handle:$handle){
          id
          attributeValues{ edges { node { id organizationId } } }
          variants{ edges { node { id organizationId } } }
        }
      }`,
      { handle: 'global-shirt' },
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.productByHandle).not.toBeNull()
    const attrOrgs: (number | null)[] = res.data.productByHandle.attributeValues.edges.map((e: any) => e.node.organizationId)
    expect(attrOrgs).not.toContain(aOrgNumericId)
    expect(attrOrgs.every((o: number | null) => o === null)).toBe(true)
  })

  it('c1: org A passing viewerOrg=A → grafts visible (no regression)', async () => {
    const res = await readAGrafts(aToken)
    expect(res.errors).toBeUndefined()
    const attrOrgs: (number | null)[] = res.data.productByHandle.attributeValues.edges.map((e: any) => e.node.organizationId)
    expect(attrOrgs).toContain(aOrgNumericId)
    const bound = res.data.productByHandle.variants.edges.find((e: any) => e.node.priceSet != null)
    expect(bound).toBeTruthy()
    expect(bound.node.priceSet.organizationId).toBe(aOrgNumericId)
  })

  async function readOverlay(orgGlobalId: string, token: string) {
    const res = await h.gql(
      `query($id:ID!,$org:ID!){
        product(id:$id){
          id
          organizationId
          forB: isAdopted(viewerOrg:$org)
          attributeValues(viewerOrg:$org){ edges { node { id organizationId attributeId } } }
          channelListings{ edges { node { id channelId isPublished } } }
          variants(viewerOrg:$org){
            edges { node {
              id
              priceSet(viewerOrg:$org){ priceSetId organizationId }
              inventoryItems(viewerOrg:$org){ edges { node { id organizationId } } }
            } }
          }
        }
      }`,
      { id: globalProductGlobalId, org: orgGlobalId },
      token,
    )
    expect(res.errors).toBeUndefined()
    return res
  }

  // ── 5. Unadopt purges A's grafts, base intact ────────────────────────────────

  it('org A unadoptProduct purges A grafts; base data intact, product still global', async () => {
    const unadopt = await h.gql(
      `mutation($input:UnadoptProductInput!){ unadoptProduct(input:$input){ __typename ... on UnadoptProductSuccess { data { success } } } }`,
      { input: { productId: globalProductGlobalId, organization: aOrgGlobalId } },
      aToken,
    )
    expect(unadopt.errors).toBeUndefined()
    expect(unadopt.data.unadoptProduct.data.success).toBe(true)

    const res = await readOverlay(aOrgGlobalId, aToken)
    const product = res.data.product
    // Product still global.
    expect(product.organizationId).toBeNull()
    // A's attribute graft gone.
    const attrOrgs: (number | null)[] = product.attributeValues.edges.map((e: any) => e.node.organizationId)
    expect(attrOrgs).not.toContain(aOrgNumericId)
    // A's price binding gone.
    const anyBound = product.variants.edges.some((e: any) => e.node.priceSet != null)
    expect(anyBound).toBe(false)
    // A's channel listing gone.
    const chans: number[] = product.channelListings.edges.map((e: any) => e.node.channelId)
    expect(chans).not.toContain(aChannelId)

    // isAdopted now false for A.
    const adoptedCheck = await h.gql(
      `query($id:ID!,$a:ID!){ product(id:$id){ forA: isAdopted(viewerOrg:$a) } }`,
      { id: globalProductGlobalId, a: aOrgGlobalId },
      aToken,
    )
    expect(adoptedCheck.data.product.forA).toBe(false)

    // The base variant selections are still present (read with no viewer org).
    const base = await h.gql(
      `query($id:ID!){
        product(id:$id){
          variants{ edges { node { attributeValues{ edges { node { organizationId } } } } } }
        }
      }`,
      { id: globalProductGlobalId },
      adminToken,
    )
    const baseValueOrgs = base.data.product.variants.edges
      .flatMap((e: any) => e.node.attributeValues.edges.map((v: any) => v.node.organizationId))
    expect(baseValueOrgs.length).toBeGreaterThan(0)
    expect(baseValueOrgs.every((o: number | null) => o === null)).toBe(true)
  })

  // ── 6. Denial: global-create without global role; node-guard deny-as-null ─────

  it('org A (no global role) cannot create a GLOBAL product', async () => {
    const res = await h.gql(
      `mutation($input:CreateProductInput!){ createProduct(input:$input){ __typename ... on CreateProductSuccess { data { product { id } } } } }`,
      { input: { productTypeId: globalTypeNumericId, handle: 'a-sneaky-global', name: 'Sneaky' } },
      aToken,
    )
    expect(res.errors).toBeDefined()
    expect(res.errors!.length).toBeGreaterThan(0)
    expect(res.data?.createProduct ?? null).toBeNull()
  })

  it('node-guard: org C reading an org-A-owned product node resolves to null (deny-as-null)', async () => {
    // Org A creates an ORG-OWNED product (not global) on a fresh org-A type.
    const aType = await h.gql(
      `mutation($input:CreateOrganizationProductTypeInput!){ createOrganizationProductType(input:$input){ ... on CreateOrganizationProductTypeSuccess { data { productType { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, name: 'A Shirt', slug: 'a-shirt', isShippingRequired: true } },
      aToken,
    )
    expect(aType.errors).toBeUndefined()
    const aTypeNumericId = Number(decodeGlobalID(aType.data.createOrganizationProductType.data.productType.id).id)

    const aProduct = await h.gql(
      `mutation($input:CreateOrganizationProductInput!){ createOrganizationProduct(input:$input){ ... on CreateOrganizationProductSuccess { data { product { id organizationId } } } } }`,
      { input: { organizationId: aOrgGlobalId, productTypeId: aTypeNumericId, handle: 'a-owned-shirt', name: 'A Owned Shirt' } },
      aToken,
    )
    expect(aProduct.errors).toBeUndefined()
    aOwnedProductGlobalId = aProduct.data.createOrganizationProduct.data.product.id
    expect(aProduct.data.createOrganizationProduct.data.product.organizationId).toBe(aOrgNumericId)

    // Org C reads that org-A node via `node(id:)` → denied as null (no leak).
    const cRead = await h.gql(
      `query($id:ID!){ node(id:$id){ id __typename } }`,
      { id: aOwnedProductGlobalId },
      cToken,
    )
    expect(cRead.errors).toBeUndefined()
    expect(cRead.data.node).toBeNull()

    // Sanity: org A itself CAN read its own product node.
    const aRead = await h.gql(
      `query($id:ID!){ node(id:$id){ id __typename } }`,
      { id: aOwnedProductGlobalId },
      aToken,
    )
    expect(aRead.errors).toBeUndefined()
    expect(aRead.data.node?.id).toBe(aOwnedProductGlobalId)
  })
})
