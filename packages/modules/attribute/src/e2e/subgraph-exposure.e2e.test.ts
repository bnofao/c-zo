import type { AttributeHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAttributeApp } from './harness'

// Exposure isolation at the running-endpoint level. The kit mounts the full
// schema at `/graphql` and one filtered Yoga per served sub-graph at
// `/graphql/<name>`. A field is in a named sub-graph only when tagged with that
// audience; an under-tagged field VANISHES with no build error, so these
// presence/absence assertions are the guard for the tagging in this sprint.

const QUERY_FIELDS = `{ __type(name: "Query") { fields { name } } }`
const MUTATION_FIELDS = `{ __type(name: "Mutation") { fields { name } } }`
interface IntrospectResult { data?: { __type?: { fields?: { name: string }[] } | null }, errors?: { message: string }[] }

const VALUE_MUTATIONS = [
  'createAttributeValue',
  'updateAttributeValue',
  'deleteAttributeValue',
  'reorderAttributeValues',
  'createAttributeSwatch',
  'updateAttributeSwatch',
  'deleteAttributeSwatch',
  'reorderAttributeSwatches',
  'createAttributeReference',
  'updateAttributeReference',
  'deleteAttributeReference',
  'reorderAttributeReferences',
  'createAttributeTextValue',
  'updateAttributeTextValue',
  'deleteAttributeTextValue',
  'createAttributeNumericValue',
  'updateAttributeNumericValue',
  'deleteAttributeNumericValue',
  'createAttributeBooleanValue',
  'updateAttributeBooleanValue',
  'deleteAttributeBooleanValue',
  'createAttributeDateValue',
  'updateAttributeDateValue',
  'deleteAttributeDateValue',
  'createAttributeFileValue',
  'updateAttributeFileValue',
  'deleteAttributeFileValue',
] as const
const SHARED_MUTATIONS = ['updateAttribute', 'deleteAttribute', ...VALUE_MUTATIONS] as const

describe('attribute sub-graph exposure', () => {
  let h: AttributeHarness

  beforeAll(async () => {
    h = await bootAttributeApp({ subGraphs: ['org', 'admin'] })
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

  it('/graphql/org exposes org + shared ops, not platform ops', async () => {
    const q = await fieldNames('/graphql/org', QUERY_FIELDS)
    const m = await fieldNames('/graphql/org', MUTATION_FIELDS)
    expect(q).toContain('attribute')
    expect(q).toContain('organizationAttributes')
    expect(q).not.toContain('attributes')
    expect(m).toContain('createOrganizationAttribute')
    expect(m).not.toContain('createAttribute')
    for (const f of SHARED_MUTATIONS) expect(m).toContain(f)
  })

  it('/graphql/admin exposes platform + shared ops, not org ops', async () => {
    const q = await fieldNames('/graphql/admin', QUERY_FIELDS)
    const m = await fieldNames('/graphql/admin', MUTATION_FIELDS)
    expect(q).toContain('attribute')
    expect(q).toContain('attributes')
    expect(q).not.toContain('organizationAttributes')
    expect(m).toContain('createAttribute')
    expect(m).not.toContain('createOrganizationAttribute')
    for (const f of SHARED_MUTATIONS) expect(m).toContain(f)
  })
})
