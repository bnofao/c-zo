import type { ApiRoute } from './route'
import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument, findDuplicateRoutes, toOpenApiPath } from './document'

const op = (summary: string) => ({ summary, responses: { 200: { description: 'OK' } } })

function route(method: ApiRoute['method'], path: string): ApiRoute {
  return {
    method,
    path,
    operation: op(`${method} ${path}`),
    handler: () => ({ ok: true }),
  }
}

describe('toOpenApiPath', () => {
  it('converts h3 :param segments to OpenAPI {param}', () => {
    expect(toOpenApiPath('/widgets/:id')).toBe('/widgets/{id}')
    expect(toOpenApiPath('/orgs/:orgId/members/:userId')).toBe('/orgs/{orgId}/members/{userId}')
  })

  it('leaves static paths unchanged', () => {
    expect(toOpenApiPath('/health')).toBe('/health')
  })
})

describe('buildOpenApiDocument', () => {
  it('nests operations under converted paths by method', () => {
    const doc = buildOpenApiDocument([route('get', '/widgets/:id')], { title: 'T', version: '1.0.0' })
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info).toEqual({ title: 'T', version: '1.0.0' })
    expect(doc.paths?.['/widgets/{id}']?.get?.summary).toBe('get /widgets/:id')
  })

  it('merges multiple methods on the same path', () => {
    const doc = buildOpenApiDocument(
      [route('get', '/widgets'), route('post', '/widgets')],
      { title: 'T', version: '1.0.0' },
    )
    const item = doc.paths?.['/widgets']
    expect(item?.get).toBeDefined()
    expect(item?.post).toBeDefined()
  })

  it('returns an empty paths object for no routes', () => {
    const doc = buildOpenApiDocument([], { title: 'T', version: '1.0.0' })
    expect(doc.paths).toEqual({})
  })
})

describe('findDuplicateRoutes', () => {
  it('reports each duplicated method+path once', () => {
    const dupes = findDuplicateRoutes([
      route('get', '/widgets'),
      route('get', '/widgets'),
      route('post', '/widgets'),
    ])
    expect(dupes).toEqual(['GET /widgets'])
  })

  it('returns an empty array when all routes are unique', () => {
    expect(findDuplicateRoutes([route('get', '/a'), route('post', '/a')])).toEqual([])
  })
})
