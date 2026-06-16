import { describe, expect, it } from 'vitest'
import { buildProductWhere } from './where'

const gid = (id: number) => ({ typename: 'X', id: String(id) })

describe('buildProductWhere', () => {
  it('passes StringFilters through unchanged', () => {
    expect(buildProductWhere({ name: { ilike: '%shirt%' } } as any)).toEqual({ name: { ilike: '%shirt%' } })
  })
  it('decodes productType IDFilter to an int filter on productTypeId', () => {
    expect(buildProductWhere({ productType: { in: [gid(5), gid(6)] } } as any))
      .toEqual({ productTypeId: { in: [5, 6] } })
  })
  it('maps categories/collections to relational exists with decoded ints', () => {
    expect(buildProductWhere({ categories: { eq: gid(9) } } as any))
      .toEqual({ categories: { categoryId: { eq: 9 } } })
    expect(buildProductWhere({ collections: { in: [gid(1)] } } as any))
      .toEqual({ collections: { collectionId: { in: [1] } } })
  })
  it('and-combines multiple top-level fields', () => {
    expect(buildProductWhere({ name: { eq: 'a' }, productType: { eq: gid(3) } } as any))
      .toEqual({ AND: [{ name: { eq: 'a' } }, { productTypeId: { eq: 3 } }] })
  })
  it('recurses AND/OR/NOT', () => {
    expect(buildProductWhere({ OR: [{ handle: { eq: 'a' } }, { handle: { eq: 'b' } }] } as any))
      .toEqual({ OR: [{ handle: { eq: 'a' } }, { handle: { eq: 'b' } }] })
  })
  it('returns {} for an empty predicate', () => {
    expect(buildProductWhere({} as any)).toEqual({})
  })
  it('emits a benign empty operator for an IDFilter with no eq/in/notIn', () => {
    // RQBv2 treats {} as match-all; harmless inside the connection's outer AND[base, …].
    expect(buildProductWhere({ productType: {} } as any)).toEqual({ productTypeId: {} })
  })
})
