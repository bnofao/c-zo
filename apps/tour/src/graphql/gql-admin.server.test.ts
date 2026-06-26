import { afterEach, describe, expect, it, vi } from 'vitest'
import { graphql } from './gen'
import { errorCode, gqlAdmin, GraphqlAdminError, isForbiddenError, isUnauthenticatedError } from './gql-admin.server'

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

    const doc = graphql(`query MeProbe { me { id name email role } }`)
    await gqlAdmin(doc, {}, { cookie: '' })

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { query: string }
    expect(body.query).toContain('query MeProbe')
    expect(body.query).not.toContain('[object Object]')
  })
})

describe('error code detection', () => {
  it('reads a live GraphqlAdminError.code', () => {
    expect(errorCode(new GraphqlAdminError('[FORBIDDEN] Not authorized', undefined, 'FORBIDDEN'))).toBe('FORBIDDEN')
  })
  it('reads the serialized plain-object shape (prototype lost over RPC)', () => {
    expect(errorCode({ name: 'GraphqlAdminError', message: '[FORBIDDEN] x', code: 'FORBIDDEN' })).toBe('FORBIDDEN')
  })
  it('falls back to a [CODE] message prefix when no code field survives', () => {
    expect(errorCode({ message: '[UNAUTHENTICATED] Not authorized' })).toBe('UNAUTHENTICATED')
  })
  it('is undefined for an uncoded error', () => {
    expect(errorCode(new Error('network down'))).toBeUndefined()
  })
  it('isForbiddenError / isUnauthenticatedError', () => {
    expect(isForbiddenError({ code: 'FORBIDDEN' })).toBe(true)
    expect(isForbiddenError({ code: 'UNAUTHENTICATED' })).toBe(false)
    expect(isUnauthenticatedError({ code: 'UNAUTHENTICATED' })).toBe(true)
    expect(isUnauthenticatedError(new Error('x'))).toBe(false)
  })
})
