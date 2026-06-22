import { afterEach, describe, expect, it, vi } from 'vitest'
import { graphql } from './gen'
import { gqlAdmin, GraphqlAdminError } from './gql-admin.server'

const DOC = 'query { me { id } }'

afterEach(() => vi.restoreAllMocks())

describe('gqlAdmin', () => {
  it('forwards the cookie and returns data', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { me: { id: '1' } } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const data = await gqlAdmin<{ me: { id: string } }>(DOC, {}, { cookie: 'czo_session=abc' })

    expect(data.me.id).toBe('1')
    const init = fetchMock.mock.calls[0]?.[1]
    expect((init?.headers as Record<string, string>).cookie).toBe('czo_session=abc')
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json')
  })

  it('throws GraphqlAdminError on GraphQL errors', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ errors: [{ message: 'Forbidden' }] }), { status: 200 })))
    await expect(gqlAdmin(DOC, {}, { cookie: '' })).rejects.toThrow(GraphqlAdminError)
  })

  it('throws GraphqlAdminError on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('nope', { status: 502 })))
    await expect(gqlAdmin(DOC, {}, { cookie: '' })).rejects.toThrow(GraphqlAdminError)
  })

  // Regression guard: a codegen document must serialize to its raw query, not
  // "[object Object]". Requires `documentMode: 'string'` in codegen.ts — a
  // DocumentNode AST (the client-preset default) would break the fetch body.
  it('serializes a codegen document to the raw query string', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { me: null } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const doc = graphql(`query Me { me { id name email role } }`)
    await gqlAdmin(doc, {}, { cookie: '' })

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { query: string }
    expect(body.query).toContain('query Me')
    expect(body.query).not.toContain('[object Object]')
  })
})
