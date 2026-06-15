import type { ProductHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootProductApp } from './harness'

// Endpoint-level exposure isolation for the taxonomy-request surface. The org
// tier requests (createCategory / promote-to-platform) while the admin tier
// reviews (approve / reject); the two halves must land in disjoint sub-graphs,
// and the public storefront sees none of it. An under-tagged field/type
// VANISHES with no build error, so these presence/absence assertions are the
// guard for the tagging in this sprint.

const QUERY_FIELDS = `{ __type(name: "Query") { fields { name } } }`
const MUTATION_FIELDS = `{ __type(name: "Mutation") { fields { name } } }`
interface IntrospectResult { data?: { __type?: { fields?: { name: string }[] } | null }, errors?: { message: string }[] }

const ORG_MUTATIONS = ['requestCategoryCreation', 'requestCategoryPromotion', 'requestProductTypeCreation', 'requestProductTypePromotion'] as const
const ADMIN_MUTATIONS = ['approveTaxonomyRequest', 'rejectTaxonomyRequest'] as const

describe('product taxonomy-request sub-graph exposure', () => {
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

  it('/graphql/org: tier requests present, review absent', async () => {
    const q = await fieldNames('/graphql/org', QUERY_FIELDS)
    const m = await fieldNames('/graphql/org', MUTATION_FIELDS)
    for (const f of ORG_MUTATIONS) expect(m).toContain(f)
    for (const f of ADMIN_MUTATIONS) expect(m).not.toContain(f)
    expect(q).toContain('organizationTaxonomyRequests')
    expect(q).not.toContain('taxonomyRequests')
    expect(await typeExists('/graphql/org', 'TaxonomyRequest')).toBe(true)
  })

  it('/graphql/admin: review present, tier requests absent', async () => {
    const q = await fieldNames('/graphql/admin', QUERY_FIELDS)
    const m = await fieldNames('/graphql/admin', MUTATION_FIELDS)
    for (const f of ADMIN_MUTATIONS) expect(m).toContain(f)
    for (const f of ORG_MUTATIONS) expect(m).not.toContain(f)
    expect(q).toContain('taxonomyRequests')
    expect(q).not.toContain('organizationTaxonomyRequests')
    expect(await typeExists('/graphql/admin', 'TaxonomyRequest')).toBe(true)
  })

  it('/graphql/public: taxonomy-request surface fully absent', async () => {
    const q = await fieldNames('/graphql/public', QUERY_FIELDS)
    const m = await fieldNames('/graphql/public', MUTATION_FIELDS)
    for (const f of [...ORG_MUTATIONS, ...ADMIN_MUTATIONS]) expect(m).not.toContain(f)
    expect(q).not.toContain('taxonomyRequests')
    expect(q).not.toContain('organizationTaxonomyRequests')
    expect(await typeExists('/graphql/public', 'TaxonomyRequest')).toBe(false)
  })
})
