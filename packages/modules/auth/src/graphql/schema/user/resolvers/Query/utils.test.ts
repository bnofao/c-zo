import { describe, expect, it } from 'vitest'
import { translateUserWhereInput } from './utils'

describe('translateUserWhereInput', () => {
  it('should return empty object for undefined input', () => {
    expect(translateUserWhereInput(undefined, undefined)).toEqual({})
  })

  it('should return empty object for null input', () => {
    expect(translateUserWhereInput(null, null)).toEqual({})
  })

  it('should return empty object for empty where', () => {
    expect(translateUserWhereInput({}, undefined)).toEqual({})
  })

  describe('filter fields', () => {
    it('should translate emailVerified.eq true to filter params', () => {
      const result = translateUserWhereInput(
        { emailVerified: { eq: true } },
        undefined,
      )

      expect(result).toEqual({
        filterField: 'emailVerified',
        filterValue: 'true',
        filterOperator: 'eq',
      })
    })

    it('should translate emailVerified.eq false to filter params', () => {
      const result = translateUserWhereInput(
        { emailVerified: { eq: false } },
        undefined,
      )

      expect(result).toEqual({
        filterField: 'emailVerified',
        filterValue: 'false',
        filterOperator: 'eq',
      })
    })

    it('should translate createdAt.gte to filter params', () => {
      const result = translateUserWhereInput(
        { createdAt: { gte: '2026-01-01T00:00:00Z' } },
        undefined,
      )

      expect(result).toEqual({
        filterField: 'createdAt',
        filterValue: '2026-01-01T00:00:00Z',
        filterOperator: 'gte',
      })
    })

    it('should translate createdAt.lt to filter params', () => {
      const result = translateUserWhereInput(
        { createdAt: { lt: '2026-06-01T00:00:00Z' } },
        undefined,
      )

      expect(result).toEqual({
        filterField: 'createdAt',
        filterValue: '2026-06-01T00:00:00Z',
        filterOperator: 'lt',
      })
    })

    it('should take the first filter when multiple are present', () => {
      const result = translateUserWhereInput(
        {
          emailVerified: { eq: true },
          createdAt: { gte: '2026-01-01T00:00:00Z' },
        },
        undefined,
      )

      expect(result).toEqual({
        filterField: 'emailVerified',
        filterValue: 'true',
        filterOperator: 'eq',
      })
    })
  })

  describe('and composite', () => {
    it('should extract filter from AND clauses', () => {
      const result = translateUserWhereInput(
        {
          AND: [
            { emailVerified: { eq: true } },
            { createdAt: { gte: '2026-01-01T00:00:00Z' } },
          ],
        },
        undefined,
      )

      expect(result).toEqual({
        filterField: 'emailVerified',
        filterValue: 'true',
        filterOperator: 'eq',
      })
    })
  })

  describe('or composite', () => {
    it('should extract filter from OR clauses', () => {
      const result = translateUserWhereInput(
        {
          OR: [
            { createdAt: { gt: '2026-01-01T00:00:00Z' } },
          ],
        },
        undefined,
      )

      expect(result).toEqual({
        filterField: 'createdAt',
        filterValue: '2026-01-01T00:00:00Z',
        filterOperator: 'gt',
      })
    })
  })

  describe('orderBy', () => {
    it('should translate orderBy to sortBy and sortDirection', () => {
      const result = translateUserWhereInput(
        undefined,
        { field: 'createdAt', direction: 'ASC' },
      )

      expect(result).toEqual({
        sortBy: 'createdAt',
        sortDirection: 'asc',
      })
    })

    it('should translate DESC direction', () => {
      const result = translateUserWhereInput(
        undefined,
        { field: 'name', direction: 'DESC' },
      )

      expect(result).toEqual({
        sortBy: 'name',
        sortDirection: 'desc',
      })
    })

    it('should combine where filter and orderBy', () => {
      const result = translateUserWhereInput(
        { emailVerified: { eq: true } },
        { field: 'email', direction: 'ASC' },
      )

      expect(result).toEqual({
        filterField: 'emailVerified',
        filterValue: 'true',
        filterOperator: 'eq',
        sortBy: 'email',
        sortDirection: 'asc',
      })
    })
  })
})
