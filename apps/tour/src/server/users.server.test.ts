import { describe, expect, it } from 'vitest'
import { toUserPage } from './users.server'

const node = {
  id: 'u1',
  name: 'Camille Lefebvre',
  email: 'camille@czo.com',
  role: 'admin',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('toUserPage', () => {
  it('flattens edges and pageInfo', () => {
    const page = toUserPage({
      edges: [{ node: { ...node, banned: true } }],
      pageInfo: { endCursor: 'c1', hasNextPage: true },
    })
    expect(page).toEqual({
      rows: [{ ...node, banned: true }],
      endCursor: 'c1',
      hasNextPage: true,
    })
  })

  it('coerces a null banned flag to false', () => {
    const page = toUserPage({
      edges: [{ node: { ...node, banned: null } }],
      pageInfo: { endCursor: null, hasNextPage: false },
    })
    expect(page.rows[0]?.banned).toBe(false)
  })

  it('handles an empty connection', () => {
    expect(toUserPage({ edges: [], pageInfo: { endCursor: null, hasNextPage: false } }))
      .toEqual({ rows: [], endCursor: null, hasNextPage: false })
  })
})
