import type { PriceHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootPriceApp } from './harness'

// Boots price with `public` + `org` SERVED so we can assert per-audience
// presence/isolation by introspecting each `/graphql/<name>` endpoint's root
// types. An under-tagged `relayMutationField` is silently dropped, so these
// presence assertions are the guard. The resolve surface is widened to
// `['public', 'org']`; the management surface is tagged `['org']` only. The
// introspection query needs no auth.

describe('price org sub-graph', () => {
  let h: PriceHarness
  beforeAll(async () => {
    h = await bootPriceApp({ subGraphs: ['public', 'org'] })
  }, 180_000)
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

  it('/graphql/org exposes the management surface + resolve (silent-drop guard)', async () => {
    const q = await fieldNames('/graphql/org', 'Query')
    const m = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['priceSet', 'priceSets', 'priceList', 'priceLists', 'resolvePrice', 'resolvePrices'])
      expect(q).toContain(f)
    for (const f of ['createPrice', 'updatePrice', 'deletePrice', 'createPriceList', 'updatePriceList', 'deletePriceList', 'createPriceSet', 'deletePriceSet'])
      expect(m).toContain(f)
  })

  it('/graphql/public keeps resolve but omits the management surface', async () => {
    const q = await fieldNames('/graphql/public', 'Query')
    expect(q).toContain('resolvePrice')
    expect(q).toContain('resolvePrices')
    expect(q).not.toContain('priceSets')
    expect(q).not.toContain('priceList')
  })
})
