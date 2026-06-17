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
  it('builds a numeric-range facet with attribute.type + isFilterable injected', () => {
    expect(buildProductWhere({ attributes: [{ slug: { eq: 'weight' }, value: { numeric: { gte: 50 } } }] } as any))
      .toEqual({ attributeValues: { attribute: { isFilterable: true, slug: { eq: 'weight' }, type: 'NUMERIC' }, numericValue: { value: { gte: 50 } } } })
  })
  it('builds a slug facet as an OR across select (DROPDOWN/MULTISELECT) and SWATCH, disambiguated by attribute.type', () => {
    expect(buildProductWhere({ attributes: [{ value: { slug: { in: ['red'] } } }] } as any))
      .toEqual({ attributeValues: { OR: [
        { attribute: { isFilterable: true, type: { in: ['DROPDOWN', 'MULTISELECT'] } }, selectValue: { slug: { in: ['red'] } } },
        { attribute: { isFilterable: true, type: 'SWATCH' }, swatchValue: { slug: { in: ['red'] } } },
      ] } })
  })
  it('maps name to the value column, decodes attribute ids, and ANDs multiple facets', () => {
    const g = (n: number) => ({ typename: 'Attribute', id: String(n) })
    expect(buildProductWhere({ attributes: [
      { ids: { in: [g(7)] }, value: { boolean: { eq: true } } },
      { value: { name: { eq: 'Red' } } },
    ] } as any)).toEqual({ AND: [
      { attributeValues: { attribute: { isFilterable: true, id: { in: [7] }, type: 'BOOLEAN' }, booleanValue: { value: { eq: true } } } },
      { attributeValues: { OR: [
        { attribute: { isFilterable: true, type: { in: ['DROPDOWN', 'MULTISELECT'] } }, selectValue: { value: { eq: 'Red' } } },
        { attribute: { isFilterable: true, type: 'SWATCH' }, swatchValue: { value: { eq: 'Red' } } },
      ] } },
    ] })
  })
  it('builds an attribute-only facet (no value)', () => {
    expect(buildProductWhere({ attributes: [{ slug: { eq: 'color' } }] } as any))
      .toEqual({ attributeValues: { attribute: { isFilterable: true, slug: { eq: 'color' } } } })
  })
})
