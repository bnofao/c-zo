import type { ProductHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootProductApp } from './harness'

// Endpoint-level exposure isolation. The kit mounts the full schema at
// `/graphql` and one filtered Yoga per served sub-graph at `/graphql/<name>`.
// An under-tagged field/type VANISHES with no build error, so these
// presence/absence assertions are the guard for the tagging in this sprint.

const QUERY_FIELDS = `{ __type(name: "Query") { fields { name } } }`
const MUTATION_FIELDS = `{ __type(name: "Mutation") { fields { name } } }`
interface IntrospectResult { data?: { __type?: { fields?: { name: string }[] } | null }, errors?: { message: string }[] }

// Present on BOTH org + admin (single-row lookups + org-only-tier lists, tags unchanged).
const SHARED_READS = ['productType', 'product', 'category', 'collection', 'collections', 'adoptedProducts'] as const
// Admin global-only catalog reads (split — platform tier).
const ADMIN_ONLY_READS = ['productTypes', 'products', 'categories'] as const
// Org merged catalog reads (split — org tier).
const ORG_ONLY_READS = ['organizationProductTypes', 'organizationProducts', 'organizationCategories'] as const
// Shared tier-conditional ops (org derived from the existing row / optional graft
// input) → present on BOTH org and admin.
const TIER_MUTATIONS = [
  'assignProductValue',
  'assignVariantValue',
  'unassignProductValue',
  'unassignVariantValue',
  'updateCategory',
  'deleteCategory',
  'setCategoryParent',
  'placeProduct',
  'removePlacement',
  'addMedia',
  'updateMedia',
  'removeMedia',
  'linkVariantMedia',
  'unlinkVariantMedia',
  'updateProduct',
  'deleteProduct',
  'updateProductType',
  'deleteProductType',
  'declareAttribute',
  'undeclareAttribute',
  'createVariant',
  'updateVariant',
  'deleteVariant',
  'upsertProductTranslation',
  'removeProductTranslation',
  'upsertCategoryTranslation',
  'removeCategoryTranslation',
  'upsertVariantTranslation',
  'removeVariantTranslation',
] as const
// Platform-tier entity creates (split per tier) → admin ONLY, absent from org.
const ADMIN_ONLY_MUTATIONS = [
  'createProduct',
  'createProductType',
  'createCategory',
  'approveListing',
  'rejectListing',
  'suspendListing',
] as const
// Org-only ops, including the org halves of the split entity creates → org ONLY,
// absent from admin.
const ORG_MUTATIONS = [
  'createOrganizationProduct',
  'createOrganizationProductType',
  'createOrganizationCategory',
  'adoptProduct',
  'unadoptProduct',
  'publishProduct',
  'unpublishProduct',
  'createCollection',
  'updateCollection',
  'deleteCollection',
  'addProductToCollection',
  'removeProductFromCollection',
  'linkInventoryItem',
  'unlinkInventoryItem',
  'bindPriceSet',
  'unbindPriceSet',
  'upsertCollectionTranslation',
  'removeCollectionTranslation',
] as const
const ALL_MUTATIONS = [...TIER_MUTATIONS, ...ORG_MUTATIONS, ...ADMIN_ONLY_MUTATIONS]

describe('product sub-graph exposure', () => {
  let h: ProductHarness

  beforeAll(async () => {
    h = await bootProductApp({ subGraphs: ['public', 'org', 'admin'] })
  }, 180_000)
  afterAll(async () => {
    await h.close()
  })

  const fieldNames = async (path: string, query: string): Promise<string[]> => {
    const res = await h.app.fetch(new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    }))
    const body = (await res.json()) as IntrospectResult
    expect(body.errors).toBeUndefined()
    return (body.data?.__type?.fields ?? []).map(f => f.name)
  }

  const typeExists = async (path: string, name: string): Promise<boolean> => {
    const res = await h.app.fetch(new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `{ __type(name: "${name}") { name } }` }),
    }))
    const body = (await res.json()) as { data?: { __type?: { name: string } | null } }
    return body.data?.__type != null
  }

  it('/graphql/public: storefront read present, management absent', async () => {
    const q = await fieldNames('/graphql/public', QUERY_FIELDS)
    const m = await fieldNames('/graphql/public', MUTATION_FIELDS)
    expect(q).toContain('productByHandle')
    expect(q).toContain('channelProducts')
    for (const f of SHARED_READS) expect(q).not.toContain(f)
    for (const f of ADMIN_ONLY_READS) expect(q).not.toContain(f)
    for (const f of ORG_ONLY_READS) expect(q).not.toContain(f)
    for (const f of ALL_MUTATIONS) expect(m).not.toContain(f)
    expect(await typeExists('/graphql/public', 'Product')).toBe(true)
    expect(await typeExists('/graphql/public', 'Category')).toBe(false)
    expect(await typeExists('/graphql/public', 'Collection')).toBe(false)
    const listingFields = async (path: string): Promise<string[]> => {
      const res = await h.app.fetch(new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: `{ __type(name: "ProductChannelListing") { fields { name } } }` }),
      }))
      const body = (await res.json()) as IntrospectResult
      return (body.data?.__type?.fields ?? []).map(f => f.name)
    }
    const publicListing = await listingFields('/graphql/public')
    expect(publicListing).toContain('isPublished')
    expect(publicListing).not.toContain('reviewState')
    expect(publicListing).not.toContain('reviewReason')
    expect(publicListing).not.toContain('reviewedAt')
  })

  it('/graphql/public: anonymous productByHandle traverses the catalog graph', async () => {
    const res = await h.app.fetch(new Request('http://localhost/graphql/public', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `{ productByHandle(handle: "nope") { id handle variants { edges { node { sku } } } media { edges { node { url } } } } }` }),
    }))
    const body = (await res.json()) as { data?: any, errors?: { message: string }[] }
    expect(body.errors).toBeUndefined()
    expect(body.data.productByHandle).toBeNull()
  })

  it('/graphql/org: shared + org reads + tier + org mutations present, admin-only reads + platform creates absent, no storefront read', async () => {
    const q = await fieldNames('/graphql/org', QUERY_FIELDS)
    const m = await fieldNames('/graphql/org', MUTATION_FIELDS)
    for (const f of SHARED_READS) expect(q).toContain(f)
    for (const f of ORG_ONLY_READS) expect(q).toContain(f)
    for (const f of ADMIN_ONLY_READS) expect(q).not.toContain(f)
    expect(q).not.toContain('productByHandle')
    expect(q).not.toContain('channelProducts')
    for (const f of TIER_MUTATIONS) expect(m).toContain(f)
    for (const f of ORG_MUTATIONS) expect(m).toContain(f)
    for (const f of ADMIN_ONLY_MUTATIONS) expect(m).not.toContain(f)
  })

  it('/graphql/admin: shared + admin-only reads + tier + platform creates present, org-only reads + mutations absent', async () => {
    const q = await fieldNames('/graphql/admin', QUERY_FIELDS)
    const m = await fieldNames('/graphql/admin', MUTATION_FIELDS)
    for (const f of SHARED_READS) expect(q).toContain(f)
    for (const f of ADMIN_ONLY_READS) expect(q).toContain(f)
    for (const f of ORG_ONLY_READS) expect(q).not.toContain(f)
    expect(q).not.toContain('channelProducts')
    for (const f of TIER_MUTATIONS) expect(m).toContain(f)
    for (const f of ADMIN_ONLY_MUTATIONS) expect(m).toContain(f)
    for (const f of ORG_MUTATIONS) expect(m).not.toContain(f)
  })
})
