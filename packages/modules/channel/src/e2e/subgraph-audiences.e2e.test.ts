import type { ChannelHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootChannelApp } from './harness'

// Boots channel with ['public','org','admin'] SERVED so we can assert
// per-audience presence/isolation by introspecting each `/graphql/<name>`
// endpoint's root types. The introspection query needs no auth.

describe('channel sub-graph audiences', () => {
  let h: ChannelHarness
  beforeAll(async () => {
    h = await bootChannelApp({ subGraphs: ['public', 'org', 'admin'] })
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

  it('/graphql/org has the org surface + id-based ops, not the platform ops', async () => {
    const q = await fieldNames('/graphql/org', 'Query')
    const m = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['channels', 'channel']) expect(q).toContain(f)
    for (const f of ['createChannel', 'updateChannel', 'deleteChannel', 'addStockLocationsToChannel', 'removeStockLocationsFromChannel']) expect(m).toContain(f)
    expect(q).not.toContain('platformChannels')
    expect(m).not.toContain('createPlatformChannel')
  })

  it('/graphql/admin has the platform ops + id-based ops, not the org-only ops', async () => {
    const q = await fieldNames('/graphql/admin', 'Query')
    const m = await fieldNames('/graphql/admin', 'Mutation')
    for (const f of ['platformChannels', 'channel']) expect(q).toContain(f)
    for (const f of ['createPlatformChannel', 'updateChannel', 'deleteChannel']) expect(m).toContain(f)
    expect(q).not.toContain('channels')
    for (const f of ['createChannel', 'addStockLocationsToChannel']) expect(m).not.toContain(f)
  })
})
