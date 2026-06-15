import type { TranslationHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootTranslationApp } from './harness'

// Endpoint-level exposure isolation. The kit mounts the full schema at
// `/graphql` and one filtered Yoga per served sub-graph at `/graphql/<name>`.
// A field is in a named sub-graph only when tagged with that audience; an
// under-tagged field VANISHES with no build error, so these presence/absence
// assertions are the guard for the tagging in this sprint.

const QUERY_FIELDS = `{ __type(name: "Query") { fields { name } } }`
const MUTATION_FIELDS = `{ __type(name: "Mutation") { fields { name } } }`
interface IntrospectResult { data?: { __type?: { fields?: { name: string }[] } | null }, errors?: { message: string }[] }

const READ_QUERIES = ['locales', 'locale', 'defaultLocale'] as const
const MUTATIONS = ['createLocale', 'updateLocale', 'deleteLocale'] as const

describe('translation sub-graph exposure', () => {
  let h: TranslationHarness

  beforeAll(async () => {
    h = await bootTranslationApp({ subGraphs: ['public', 'admin'] })
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

  it('/graphql/public exposes locale reads, not management mutations', async () => {
    const q = await fieldNames('/graphql/public', QUERY_FIELDS)
    const m = await fieldNames('/graphql/public', MUTATION_FIELDS)
    for (const f of READ_QUERIES) expect(q).toContain(f)
    for (const f of MUTATIONS) expect(m).not.toContain(f)
  })

  it('/graphql/admin exposes management mutations and the widened reads', async () => {
    const q = await fieldNames('/graphql/admin', QUERY_FIELDS)
    const m = await fieldNames('/graphql/admin', MUTATION_FIELDS)
    for (const f of READ_QUERIES) expect(q).toContain(f)
    for (const f of MUTATIONS) expect(m).toContain(f)
  })

  it('exposes the Locale node and a working locales connection on /graphql/public', async () => {
    const res = await h.app.fetch(new Request('http://localhost/graphql/public', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `query { locales { edges { node { code } } } defaultLocale { code } }` }),
    }))
    const body = (await res.json()) as { data?: any, errors?: { message: string }[] }
    expect(body.errors).toBeUndefined()
    expect(body.data.locales.edges.some((e: any) => e.node.code === 'en')).toBe(true)
    expect(body.data.defaultLocale.code).toBe('en')
  })
})
