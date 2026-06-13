import type { SlHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootStockLocationApp } from './harness'

// Boots stock-location with `public` + `org` audiences SERVED so we can assert
// per-audience presence/isolation by introspecting each `/graphql/<name>`
// endpoint's root types. The introspection query needs no auth — schema
// introspection is allowed on any mounted endpoint.

describe('stock-location org sub-graph', () => {
  let h: SlHarness
  beforeAll(async () => {
    h = await bootStockLocationApp({ subGraphs: ['public', 'org'] })
  }, 120_000)
  afterAll(() => h.close())

  const fieldNames = async (path: string, root: 'Query' | 'Mutation') => {
    const res = await h.app.fetch(new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `query { __type(name: "${root}") { fields { name } } }` }),
    }))
    const body = (await res.json()) as { data?: { __type?: { fields?: { name: string }[] } } }
    return (body.data?.__type?.fields ?? []).map(f => f.name)
  }

  it('/graphql/org exposes all stock-location ops (silent-drop guard)', async () => {
    const q = await fieldNames('/graphql/org', 'Query')
    const m = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['stockLocation', 'stockLocations']) expect(q).toContain(f)
    for (const f of ['createStockLocation', 'updateStockLocation', 'deleteStockLocation', 'forceDeleteStockLocation', 'setStockLocationStatus', 'setDefaultStockLocation'])
      expect(m).toContain(f)
  })

  it('omits stock-location ops from the public sub-graph (isolation)', async () => {
    const q = await fieldNames('/graphql/public', 'Query')
    expect(q).not.toContain('stockLocations')
    expect(q).not.toContain('stockLocation')
  })
})
