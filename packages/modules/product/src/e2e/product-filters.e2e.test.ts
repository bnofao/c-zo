// @czo/product `channelProducts` storefront FILTER E2E (T5) — proves each
// `ProductWhereInput` predicate narrows the anonymous channel catalog correctly
// through the GraphQL API, end-to-end over the real translator
// (`buildProductWhere`) + Drizzle relational `where`.
//
// Seed (one org A + one channel C; each product published LIVE on C):
//   • product types T1, T2
//   • prod-a: type T1, handle `prod-a`, name `Alpha Shirt`, placed in category
//     Cat1 + added to collection Col1
//   • prod-b: type T2, handle `prod-b`, name `Beta Shoe`, placed in category Cat2
//
// Then assert `channelProducts(channel:C, where:<W>){ edges{ node{ handle } } }`
// (anonymous) returns the expected handles for each filter dimension:
// productType / categories / collections / handle / name, plus a compound AND
// that no product satisfies.
//
// Mirrors `channel-products.e2e.test.ts`: org-A products on an org-A channel get
// a default-approved (live) listing on publish.

import type { ProductHarness } from './harness'
import { Channel as ChannelSvc } from '@czo/channel/services'
import { decodeGlobalID } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootProductApp } from './harness'

describe('product channelProducts storefront filter e2e', () => {
  let h: ProductHarness

  let aToken: string
  let aOrgGlobalId: string
  let channelCId: number

  // Captured relay globalIDs for the IDFilter args.
  let t1GlobalId: string
  let cat1GlobalId: string
  let col1GlobalId: string

  beforeAll(async () => {
    h = await bootProductApp()

    const aUser = await h.signUp('a@x.io', 'AOwner', 'password1234')
    aToken = aUser.token
    const a = await h.createOrgWithProductAccess(aUser, 'Acme', 'acme')
    aOrgGlobalId = a.orgGlobalId

    // One org-A channel — capture the raw int id for publishing + the query.
    const seeded = await h.app.runEffect(
      Effect.gen(function* () {
        const chanSvc = yield* ChannelSvc.ChannelService
        const c = yield* chanSvc.create({ organizationId: a.orgNumericId, name: 'A Web', handle: 'a-web' })
        return { channelCId: c.id }
      }),
    )
    channelCId = seeded.channelCId

    // Two categories + one collection (org-owned).
    cat1GlobalId = await createOrgCategory('Cat1', 'cat1')
    const cat2GlobalId = await createOrgCategory('Cat2', 'cat2')
    col1GlobalId = await createOrgCollection('Col1', 'col1')

    // prod-a: type T1, handle prod-a, name `Alpha Shirt`, in Cat1 + Col1.
    const a1 = await createOrgProduct('T1', 'prod-a', 'Alpha Shirt')
    t1GlobalId = a1.typeGlobalId
    await publish(a1.productGlobalId)
    await placeProduct(cat1GlobalId, a1.productNumericId)
    await addProductToCollection(col1GlobalId, a1.productNumericId)

    // prod-b: type T2, handle prod-b, name `Beta Shoe`, in Cat2.
    const b1 = await createOrgProduct('T2', 'prod-b', 'Beta Shoe')
    await publish(b1.productGlobalId)
    await placeProduct(cat2GlobalId, b1.productNumericId)
  }, 240_000)

  afterAll(async () => {
    await h.close()
  })

  // ── seed helpers ─────────────────────────────────────────────────────────────

  async function createOrgCategory(name: string, slug: string): Promise<string> {
    const res = await h.gql(
      `mutation($input:CreateOrganizationCategoryInput!){ createOrganizationCategory(input:$input){ ... on CreateOrganizationCategorySuccess { data { category { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, name, slug } },
      aToken,
    )
    if (res.errors)
      throw new Error(`createOrganizationCategory failed: ${JSON.stringify(res.errors)}`)
    return res.data.createOrganizationCategory.data.category.id
  }

  async function createOrgCollection(name: string, slug: string): Promise<string> {
    const res = await h.gql(
      `mutation($input:CreateCollectionInput!){ createCollection(input:$input){ ... on CreateCollectionSuccess { data { collection { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, name, slug } },
      aToken,
    )
    if (res.errors)
      throw new Error(`createCollection failed: ${JSON.stringify(res.errors)}`)
    return res.data.createCollection.data.collection.id
  }

  // Create an org-owned product (fresh type) + one variant. Returns ids.
  async function createOrgProduct(
    typeSlug: string,
    handle: string,
    name: string,
  ): Promise<{ typeGlobalId: string, productGlobalId: string, productNumericId: number }> {
    const type = await h.gql(
      `mutation($input:CreateOrganizationProductTypeInput!){ createOrganizationProductType(input:$input){ ... on CreateOrganizationProductTypeSuccess { data { productType { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, name: typeSlug, slug: typeSlug.toLowerCase(), isShippingRequired: true } },
      aToken,
    )
    if (type.errors)
      throw new Error(`createOrganizationProductType failed: ${JSON.stringify(type.errors)}`)
    const typeGlobalId: string = type.data.createOrganizationProductType.data.productType.id
    const typeNumericId = Number(decodeGlobalID(typeGlobalId).id)

    const product = await h.gql(
      `mutation($input:CreateOrganizationProductInput!){ createOrganizationProduct(input:$input){ ... on CreateOrganizationProductSuccess { data { product { id } } } } }`,
      { input: { organizationId: aOrgGlobalId, productTypeId: typeNumericId, handle, name } },
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

    return { typeGlobalId, productGlobalId, productNumericId }
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

  // Place a product into a category as an org graft (organizationId = org A).
  async function placeProduct(categoryGlobalId: string, productNumericId: number): Promise<void> {
    const res = await h.gql(
      `mutation($input:PlaceProductInput!){ placeProduct(input:$input){ __typename ... on PlaceProductSuccess { data { productId categoryId } } } }`,
      { input: { categoryId: categoryGlobalId, productId: productNumericId, organizationId: aOrgGlobalId } },
      aToken,
    )
    if (res.errors)
      throw new Error(`placeProduct failed: ${JSON.stringify(res.errors)}`)
  }

  // Add a product to a collection (collections are org-only).
  async function addProductToCollection(collectionGlobalId: string, productNumericId: number): Promise<void> {
    const res = await h.gql(
      `mutation($input:AddProductToCollectionInput!){ addProductToCollection(input:$input){ __typename ... on AddProductToCollectionSuccess { data { collection { id } } } } }`,
      { input: { collectionId: collectionGlobalId, productId: productNumericId } },
      aToken,
    )
    if (res.errors)
      throw new Error(`addProductToCollection failed: ${JSON.stringify(res.errors)}`)
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

  // ── filter assertions ────────────────────────────────────────────────────────

  it('productType eq → only the matching type', async () => {
    expect(await handlesFor({ productType: { eq: t1GlobalId } })).toEqual(['prod-a'])
  })

  it('categories in → only products in the given category', async () => {
    expect(await handlesFor({ categories: { in: [cat1GlobalId] } })).toEqual(['prod-a'])
  })

  it('collections eq → only products in the given collection', async () => {
    expect(await handlesFor({ collections: { eq: col1GlobalId } })).toEqual(['prod-a'])
  })

  it('handle eq → exact handle match', async () => {
    expect(await handlesFor({ handle: { eq: 'prod-b' } })).toEqual(['prod-b'])
  })

  it('name ilike → case-insensitive substring match', async () => {
    expect(await handlesFor({ name: { ilike: '%shirt%' } })).toEqual(['prod-a'])
  })

  it('compound AND (productType T1 AND handle prod-b) → no product satisfies both', async () => {
    expect(await handlesFor({ productType: { eq: t1GlobalId }, handle: { eq: 'prod-b' } })).toEqual([])
  })
})
