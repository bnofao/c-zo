import type { PriceHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootPriceApp } from './harness'

// Exposure isolation at the running-endpoint level. The kit mounts the full
// schema at `/graphql` and one filtered Yoga per served sub-graph at
// `/graphql/<name>` (default served set `['public']`). A field is in `public`
// only when tagged `subGraphs: ['public']`; untagged fields are absent from the
// named sub-graph. `bootPriceApp`'s `app.fetch(Request)` lets us POST to either
// path, so these assert the SCHEMA shape served at each endpoint — `priceSets`
// (an untagged connection) is absent from `/graphql/public` (a "Cannot query
// field" VALIDATION error, distinct from an authz denial) but present on the
// full `/graphql`, while the tagged `resolvePrice`/`resolvePrices` are public.

const INTROSPECT_QUERY = `{ __type(name: "Query") { fields { name } } }`

interface IntrospectResult {
  data?: { __type?: { fields?: { name: string }[] } | null }
  errors?: { message: string }[]
}
interface GqlBody { data?: unknown, errors?: { message: string }[] }

describe('graphql public sub-graph endpoint', () => {
  let h: PriceHarness

  beforeAll(async () => {
    h = await bootPriceApp()
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

  const queryFieldNames = async (path: string): Promise<string[]> => {
    const res = await post(path, INTROSPECT_QUERY)
    const body = (await res.json()) as IntrospectResult
    expect(body.errors).toBeUndefined()
    return (body.data?.__type?.fields ?? []).map(f => f.name)
  }

  it('/graphql/public serves resolvePrice and resolvePrices', async () => {
    const names = await queryFieldNames('/graphql/public')
    expect(names).toContain('resolvePrice')
    expect(names).toContain('resolvePrices')
  })

  it('/graphql/public OMITS the untagged priceSets field (exposure isolation)', async () => {
    const res = await post('/graphql/public', `{ priceSets(organizationId: "x", first: 1) { edges { node { id } } } }`)
    const body = (await res.json()) as GqlBody
    // SCHEMA validation error — the field is absent from the public schema,
    // distinct from an authz denial (which would surface during execution).
    expect(body.data).toBeUndefined()
    expect(body.errors).toBeTruthy()
    expect((body.errors ?? []).some(e => /Cannot query field "priceSets"/.test(e.message))).toBe(true)
  })

  it('/graphql still exposes priceSets AND resolvePrice', async () => {
    const names = await queryFieldNames('/graphql')
    expect(names).toContain('priceSets')
    expect(names).toContain('resolvePrice')
  })
})
