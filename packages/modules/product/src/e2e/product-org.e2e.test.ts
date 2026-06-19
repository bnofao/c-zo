// @czo/product org-owned-flow E2E (catalog §3.5) — the FIRST runtime build of
// the whole product GraphQL schema.
//
// An org admin (with `product:admin` in their org) drives the full catalog
// flow end-to-end through GraphQL:
//   • create an org product TYPE + declare a variant-selection DROPDOWN attr;
//   • create an org-owned PRODUCT on that type;
//   • create two VARIANTs with DISTINCT selections (persisted via
//     assignVariantValue so siblingSelections sees them) — a 3rd with a
//     DUPLICATE selection fails DuplicateVariantMatrix;
//   • assign a PRODUCT attribute value;
//   • bind a price set, link an inventory item, publish on a channel;
//   • upsert a localized translation;
//   • storefront read by handle → LOCALIZED name + MERGED graft fields.
//
// The attribute + catalog values, price set, inventory item, and channel are
// seeded directly through their services via `runEffect` (simpler than driving
// each upstream module's own GraphQL).

import type { ProductHarness } from './harness'
import { Attribute as AttributeSvc, AttributeValue as AttributeValueSvc } from '@czo/attribute/services'
import { Channel as ChannelSvc } from '@czo/channel/services'
import { Inventory as InventorySvc } from '@czo/inventory/services'
import { decodeGlobalID } from '@czo/kit/graphql'
import { Price as PriceSvc } from '@czo/price/services'
import { Locale as LocaleSvc } from '@czo/translation/services'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootProductApp } from './harness'

describe('product org-owned flow e2e', () => {
  let h: ProductHarness
  let token: string
  let orgGlobalId: string
  let orgNumericId: number

  // Seeded upstream ids (numeric — passed as raw Int into product mutations).
  let dropdownAttrId: number
  let valueRedId: number
  let valueBlueId: number
  let productAttrId: number
  let cottonValueId: number
  let priceSetId: number
  let inventoryItemId: number
  let channelId: number

  // Created product ids.
  let typeGlobalId: string
  let productGlobalId: string
  let productHandle: string
  let boundVariantId: string

  beforeAll(async () => {
    h = await bootProductApp()
    const u = await h.signUp('owner@x.io', 'Owner', 'password1234')
    token = u.token
    const org = await h.createOrgWithProductAccess(u, 'Acme', 'acme')
    orgGlobalId = org.orgGlobalId
    orgNumericId = org.orgNumericId

    // Seed the upstream rows the product flow references, directly via services.
    const seeded = await h.app.runEffect(
      Effect.gen(function* () {
        // A locale so the localized read has a translation row to overlay.
        const locale = yield* LocaleSvc.LocaleService
        yield* locale.createLocale({ code: 'fr', name: 'Francais' })

        // A variant-selection DROPDOWN attribute (org-owned) + two catalog values.
        const attrSvc = yield* AttributeSvc.AttributeService
        const colour = yield* attrSvc.create({
          name: 'Colour',
          type: 'DROPDOWN',
          organizationId: orgNumericId,
        })
        const productMaterial = yield* attrSvc.create({
          name: 'Material',
          type: 'DROPDOWN',
          organizationId: orgNumericId,
        })
        const valueSvc = yield* AttributeValueSvc.AttributeValueService
        const red = yield* valueSvc.createValue({ attributeId: colour.id, value: 'Red', organizationId: orgNumericId })
        const blue = yield* valueSvc.createValue({ attributeId: colour.id, value: 'Blue', organizationId: orgNumericId })
        const cotton = yield* valueSvc.createValue({ attributeId: productMaterial.id, value: 'Cotton', organizationId: orgNumericId })

        // A price set, inventory item, and channel — all owned by the org.
        const priceSvc = yield* PriceSvc.PriceService
        const set = yield* priceSvc.createPriceSet({ organizationId: orgNumericId })
        const invSvc = yield* InventorySvc.InventoryService
        const item = yield* invSvc.createItem({ organizationId: orgNumericId, sku: 'SKU-1' })
        const chanSvc = yield* ChannelSvc.ChannelService
        const channel = yield* chanSvc.create({ organizationId: orgNumericId, name: 'Web', handle: 'web' })

        return {
          dropdownAttrId: colour.id,
          productAttrId: productMaterial.id,
          valueRedId: red.id,
          valueBlueId: blue.id,
          valueCottonId: cotton.id,
          priceSetId: set.id,
          inventoryItemId: item.id,
          channelId: channel.id,
        }
      }),
    )
    dropdownAttrId = seeded.dropdownAttrId
    productAttrId = seeded.productAttrId
    valueRedId = seeded.valueRedId
    valueBlueId = seeded.valueBlueId
    priceSetId = seeded.priceSetId
    inventoryItemId = seeded.inventoryItemId
    channelId = seeded.channelId
    cottonValueId = seeded.valueCottonId
  }, 240_000)

  afterAll(async () => {
    await h.close()
  })

  it('creates an org product type and declares a variant-selection DROPDOWN attribute', async () => {
    const created = await h.gql(
      `mutation($input:CreateOrganizationProductTypeInput!){ createOrganizationProductType(input:$input){ ... on CreateOrganizationProductTypeSuccess { data { productType { id } } } } }`,
      { input: { organizationId: orgGlobalId, name: 'Shirt', slug: 'shirt', isShippingRequired: true } },
      token,
    )
    expect(created.errors).toBeUndefined()
    typeGlobalId = created.data.createOrganizationProductType.data.productType.id
    expect(typeGlobalId).toBeTruthy()

    // variant-selection attribute (assignment VARIANT + variantSelection true).
    const declVariant = await h.gql(
      `mutation($input:DeclareAttributeInput!){ declareAttribute(input:$input){ ... on DeclareAttributeSuccess { data { attribute { id } } } } }`,
      { input: { productTypeId: typeGlobalId, attributeId: dropdownAttrId, assignment: 'VARIANT', variantSelection: true, position: 0 } },
      token,
    )
    expect(declVariant.errors).toBeUndefined()
    expect(declVariant.data.declareAttribute.data.attribute.id).toBeTruthy()

    // a product-level attribute (assignment PRODUCT) for assignProductValue.
    const declProduct = await h.gql(
      `mutation($input:DeclareAttributeInput!){ declareAttribute(input:$input){ ... on DeclareAttributeSuccess { data { attribute { id } } } } }`,
      { input: { productTypeId: typeGlobalId, attributeId: productAttrId, assignment: 'PRODUCT', variantSelection: false, position: 1 } },
      token,
    )
    expect(declProduct.errors).toBeUndefined()
  })

  it('creates an org-owned product on that type', async () => {
    productHandle = 'acme-shirt'
    const created = await h.gql(
      `mutation($input:CreateOrganizationProductInput!){ createOrganizationProduct(input:$input){ ... on CreateOrganizationProductSuccess { data { product { id handle } } } } }`,
      { input: { organizationId: orgGlobalId, productTypeId: Number(decodeGlobalID(typeGlobalId).id), handle: productHandle, name: 'Acme Shirt' } },
      token,
    )
    expect(created.errors).toBeUndefined()
    productGlobalId = created.data.createOrganizationProduct.data.product.id
    expect(created.data.createOrganizationProduct.data.product.handle).toBe(productHandle)
  })

  it('creates two variants with distinct selection; a 3rd duplicate fails DuplicateVariantMatrix', async () => {
    const createVariant = async (valueId: number) =>
      h.gql(
        `mutation($input:CreateVariantInput!){ createVariant(input:$input){ __typename ... on CreateVariantSuccess { data { variant { id } } } } }`,
        { input: { productId: productGlobalId, selection: [{ attributeId: dropdownAttrId, valueId }] } },
        token,
      )

    // Variant 1 (Red) — persist its selection so the matrix check sees it.
    const v1 = await createVariant(valueRedId)
    expect(v1.errors).toBeUndefined()
    const v1Id: string = v1.data.createVariant.data.variant.id
    boundVariantId = v1Id
    await assignVariantSelection(v1Id, valueRedId)

    // Variant 2 (Blue) — distinct, succeeds.
    const v2 = await createVariant(valueBlueId)
    expect(v2.errors).toBeUndefined()
    const v2Id: string = v2.data.createVariant.data.variant.id
    await assignVariantSelection(v2Id, valueBlueId)

    // Variant 3 (Red again) — DUPLICATE selection → DuplicateVariantMatrix
    // (surfaced as the registered `DuplicateVariantMatrixError` union member).
    const v3 = await createVariant(valueRedId)
    expect(v3.errors).toBeUndefined()
    expect(v3.data.createVariant.__typename).toBe('DuplicateVariantMatrixError')
  })

  async function assignVariantSelection(variantId: string, valueId: number): Promise<void> {
    const res = await h.gql(
      `mutation($input:AssignVariantValueInput!){ assignVariantValue(input:$input){ __typename ... on AssignVariantValueSuccess { data { pivotIds } } } }`,
      { input: { variantId, organizationId: orgGlobalId, attributeId: dropdownAttrId, value: { valueIds: [valueId] } } },
      token,
    )
    if (res.errors)
      throw new Error(`assignVariantValue failed: ${JSON.stringify(res.errors)}`)
  }

  it('assigns a product attribute value', async () => {
    const res = await h.gql(
      `mutation($input:AssignProductValueInput!){ assignProductValue(input:$input){ __typename ... on AssignProductValueSuccess { data { pivotIds } } } }`,
      { input: { productId: productGlobalId, organizationId: orgGlobalId, attributeId: productAttrId, value: { valueIds: [cottonValueId] } } },
      token,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.assignProductValue.data.pivotIds.length).toBeGreaterThan(0)
  })

  it('binds a price set to a variant', async () => {
    const res = await h.gql(
      `mutation($input:BindPriceSetInput!){ bindPriceSet(input:$input){ __typename ... on BindPriceSetSuccess { data { priceSetId } } } }`,
      { input: { variantId: boundVariantId, organizationId: orgGlobalId, priceSetId } },
      token,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.bindPriceSet.data.priceSetId).toBe(priceSetId)
  })

  it('links an inventory item to a variant', async () => {
    const res = await h.gql(
      `mutation($input:LinkInventoryItemInput!){ linkInventoryItem(input:$input){ __typename ... on LinkInventoryItemSuccess { data { inventoryItemId } } } }`,
      { input: { variantId: boundVariantId, organizationId: orgGlobalId, inventoryItemId } },
      token,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.linkInventoryItem.data.inventoryItemId).toBe(inventoryItemId)
  })

  it('publishes the product on a channel', async () => {
    const res = await h.gql(
      `mutation($input:PublishProductInput!){ publishProduct(input:$input){ __typename ... on PublishProductSuccess { data { isPublished } } } }`,
      { input: { productId: productGlobalId, organizationId: orgGlobalId, channelId, isPublished: true } },
      token,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.publishProduct.data.isPublished).toBe(true)
  })

  it('upserts a localized product translation', async () => {
    const res = await h.gql(
      `mutation($input:UpsertProductTranslationInput!){ upsertProductTranslation(input:$input){ __typename ... on UpsertProductTranslationSuccess { data { success } } } }`,
      { input: { productId: productGlobalId, localeCode: 'fr', name: 'Chemise Acme' } },
      token,
    )
    expect(res.errors).toBeUndefined()
    expect(res.data.upsertProductTranslation.data.success).toBe(true)
  })

  it('storefront read: localized name + merged graft fields for the viewer org', async () => {
    const res = await h.gql(
      `query($handle:String!,$org:ID!){
        productByHandle(handle:$handle, viewerOrg:$org){
          id
          handle
          base: name
          fr: name(locale:"fr")
          assignedAttributes(viewerOrg:$org){ __typename attribute { slug } ... on AssignedDropdownAttribute { values { slug value } } }
          oneMaterial: assignedAttribute(slug:"material", viewerOrg:$org){ __typename attribute { slug } ... on AssignedDropdownAttribute { values { value } } }
          oneMissing: assignedAttribute(slug:"does-not-exist", viewerOrg:$org){ __typename }
          channelListings { edges { node { id } } }
          variants{
            edges { node {
              id
              priceSet(viewerOrg:$org){ priceSetId organizationId }
              inventoryItems(viewerOrg:$org){ edges { node { id } } }
            } }
          }
        }
      }`,
      { handle: productHandle, org: orgGlobalId },
      token,
    )
    expect(res.errors).toBeUndefined()
    const product = res.data.productByHandle
    expect(product).not.toBeNull()
    expect(product.handle).toBe(productHandle)
    // LOCALIZED: default name is the base, the fr alias overlays the translation.
    expect(product.base).toBe('Acme Shirt')
    expect(product.fr).toBe('Chemise Acme')
    // MERGED GRAFTS: the product attribute value, the bound price set, the
    // linked inventory item — all reflect the viewer org. The grafted Material
    // (DROPDOWN) value resolves into its typed AssignedDropdownAttribute.
    expect(product.assignedAttributes.length).toBeGreaterThan(0)
    const material = product.assignedAttributes.find((a: any) => a.attribute.slug === 'material')
    expect(material).toBeTruthy()
    expect(material.__typename).toBe('AssignedDropdownAttribute')
    expect(material.values.map((v: any) => v.value)).toContain('Cotton')
    // Singular accessor (assignedAttribute(slug)) on the org-owned product: a
    // known slug returns the one typed attribute; an unknown slug → null.
    expect(product.oneMaterial.__typename).toBe('AssignedDropdownAttribute')
    expect(product.oneMaterial.attribute.slug).toBe('material')
    expect(product.oneMaterial.values.map((v: any) => v.value)).toContain('Cotton')
    expect(product.oneMissing).toBeNull()
    expect(product.channelListings.edges.length).toBeGreaterThan(0)
    const boundEdge = product.variants.edges.find(
      (e: any) => e.node.priceSet != null,
    )
    expect(boundEdge).toBeTruthy()
    expect(boundEdge.node.priceSet.priceSetId).toBe(priceSetId)
    expect(boundEdge.node.priceSet.organizationId).toBe(orgNumericId)
    expect(boundEdge.node.inventoryItems.edges.length).toBeGreaterThan(0)
  })

  it('storefront read with NO viewer org: base-only, graft fields empty', async () => {
    const res = await h.gql(
      `query($handle:String!){
        productByHandle(handle:$handle){
          id
          base: name
          fr: name(locale:"fr")
          variants{ edges { node { id priceSet{ priceSetId } } } }
        }
      }`,
      { handle: productHandle },
    )
    // Org-owned product is still resolvable by handle ONLY for its owner org —
    // with no viewerOrg the service scopes to base (org IS NULL) rows, so this
    // org-owned product is not visible: productByHandle is null.
    expect(res.errors).toBeUndefined()
    expect(res.data.productByHandle).toBeNull()
  })
})
