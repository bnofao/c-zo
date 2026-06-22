import { describe, expect, it } from 'vitest'
import { pickProduct } from './product-detail.server'

describe('pickProduct', () => {
  it('returns the product when present', () => {
    const p = { id: 'g1', name: 'W', handle: 'w', createdAt: '2026-06-22T00:00:00.000Z' }
    expect(pickProduct({ product: p })).toEqual(p)
  })
  it('returns null when absent', () => {
    expect(pickProduct({ product: null })).toBeNull()
  })
})
