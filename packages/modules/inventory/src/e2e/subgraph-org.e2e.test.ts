import type { InventoryHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootInventoryApp } from './harness'

// Exposure isolation at the running-endpoint level. The kit mounts the full
// schema at `/graphql` and one filtered Yoga per served sub-graph at
// `/graphql/<name>`. Inventory is uniformly org-scoped, so its entire surface is
// tagged `subGraphs: ['org']`; a field is present at `/graphql/org` only when it
// (and every type it references) is tagged into `org`. These assertions are the
// silent-drop guard: a mutation whose payload/result type is under-tagged simply
// vanishes from the sub-graph with no build error, so we assert presence of all
// 10 mutations + 2 queries at `/graphql/org`, and absence from `/graphql/public`
// (inventory tags nothing into `public`). Introspection needs no auth.

const QUERY_FIELDS = `{ __type(name: "Query") { fields { name } } }`
const MUTATION_FIELDS = `{ __type(name: "Mutation") { fields { name } } }`

interface IntrospectResult {
  data?: { __type?: { fields?: { name: string }[] } | null }
  errors?: { message: string }[]
}

const MUTATIONS = [
  'createInventoryItem',
  'updateInventoryItem',
  'deleteInventoryItem',
  'createInventoryLevel',
  'setInventoryLevel',
  'adjustInventoryStock',
  'deleteInventoryLevel',
  'createReservation',
  'updateReservation',
  'deleteReservation',
] as const

const QUERIES = ['inventoryItem', 'inventoryItems'] as const

describe('inventory org sub-graph', () => {
  let h: InventoryHarness

  beforeAll(async () => {
    h = await bootInventoryApp({ subGraphs: ['public', 'org'] })
  }, 180_000)
  afterAll(async () => {
    await h.close()
  })

  const post = (path: string, query: string): Promise<Response> =>
    h.app.fetch(new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    }))

  const fieldNames = async (path: string, query: string): Promise<string[]> => {
    const res = await post(path, query)
    const body = (await res.json()) as IntrospectResult
    expect(body.errors).toBeUndefined()
    return (body.data?.__type?.fields ?? []).map(f => f.name)
  }

  it('/graphql/org exposes all inventory ops (silent-drop guard)', async () => {
    const queries = await fieldNames('/graphql/org', QUERY_FIELDS)
    for (const f of QUERIES)
      expect(queries).toContain(f)

    const mutations = await fieldNames('/graphql/org', MUTATION_FIELDS)
    for (const f of MUTATIONS)
      expect(mutations).toContain(f)
  })

  it('omits inventory ops from the public sub-graph (exposure isolation)', async () => {
    const queries = await fieldNames('/graphql/public', QUERY_FIELDS)
    for (const f of QUERIES)
      expect(queries).not.toContain(f)

    // `/graphql/public` may drop the Mutation root entirely (nothing tags into
    // it); `fieldNames` then yields [] and the absence assertions still hold.
    const mutations = await fieldNames('/graphql/public', MUTATION_FIELDS)
    for (const f of MUTATIONS)
      expect(mutations).not.toContain(f)
  })
})
