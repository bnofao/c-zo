import { describe, expect, it } from 'vitest'
import { mergePermissions } from './merge-permissions'

describe('mergePermissions', () => {
  it('should merge two disjoint permission sets', () => {
    const base = { product: ['read'] }
    const additions = { order: ['read', 'cancel'] }

    const result = mergePermissions(base, additions)

    expect(result).toEqual({
      product: ['read'],
      order: ['read', 'cancel'],
    })
  })

  it('should deduplicate overlapping actions', () => {
    const base = { product: ['read', 'create'] }
    const additions = { product: ['read', 'update'] }

    const result = mergePermissions(base, additions)

    expect(result.product).toEqual(expect.arrayContaining(['read', 'create', 'update']))
    expect(result.product).toHaveLength(3)
  })

  it('should handle empty base', () => {
    const base = {}
    const additions = { product: ['read'] }

    const result = mergePermissions(base, additions)

    expect(result).toEqual({ product: ['read'] })
  })

  it('should handle empty additions', () => {
    const base = { product: ['read'] }
    const additions = {}

    const result = mergePermissions(base, additions)

    expect(result).toEqual({ product: ['read'] })
  })

  it('should handle both empty', () => {
    const result = mergePermissions({}, {})

    expect(result).toEqual({})
  })

  it('should not mutate the input objects', () => {
    const base = { product: ['read'] }
    const additions = { product: ['create'] }
    const baseCopy = { ...base, product: [...base.product] }
    const additionsCopy = { ...additions, product: [...additions.product] }

    mergePermissions(base, additions)

    expect(base).toEqual(baseCopy)
    expect(additions).toEqual(additionsCopy)
  })

  it('should merge multiple resources correctly', () => {
    const base = {
      product: ['read', 'create'],
      order: ['read'],
    }
    const additions = {
      product: ['update'],
      order: ['cancel'],
      user: ['read'],
    }

    const result = mergePermissions(base, additions)

    expect(result).toEqual({
      product: expect.arrayContaining(['read', 'create', 'update']),
      order: expect.arrayContaining(['read', 'cancel']),
      user: ['read'],
    })
  })
})
