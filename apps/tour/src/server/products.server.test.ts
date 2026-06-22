import { describe, expect, it } from 'vitest'
import { toProductPage } from './products.server'

describe('toProductPage', () => {
  it('flattens edges and pageInfo', () => {
    const page = toProductPage({
      edges: [{ node: { id: 'g1', name: 'Widget', handle: 'widget' } }],
      pageInfo: { endCursor: 'c1', hasNextPage: true },
    })
    expect(page).toEqual({ rows: [{ id: 'g1', name: 'Widget', handle: 'widget' }], endCursor: 'c1', hasNextPage: true })
  })

  it('handles an empty connection', () => {
    expect(toProductPage({ edges: [], pageInfo: { endCursor: null, hasNextPage: false } }))
      .toEqual({ rows: [], endCursor: null, hasNextPage: false })
  })
})
