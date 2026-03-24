import { describe, expect, it } from 'vitest'
import { applyGlobalIdFilter, applyStringFilter } from './filters'

// We test the filter builder functions by verifying they return
// SQL objects (non-undefined) for valid filters and undefined for empty filters.
// The actual SQL correctness is verified at the integration level.

describe('applyStringFilter', () => {
  // Use a mock column — the filter functions accept AnyColumn
  const mockColumn = { name: 'status' } as any

  it('should return undefined for empty filter', () => {
    expect(applyStringFilter(mockColumn, {})).toBeUndefined()
  })

  it('should handle eq filter', () => {
    const result = applyStringFilter(mockColumn, { eq: 'active' })
    expect(result).toBeDefined()
  })

  it('should handle ne filter', () => {
    const result = applyStringFilter(mockColumn, { ne: 'disabled' })
    expect(result).toBeDefined()
  })

  it('should handle contains filter', () => {
    const result = applyStringFilter(mockColumn, { contains: 'test' })
    expect(result).toBeDefined()
  })

  it('should handle startsWith filter', () => {
    const result = applyStringFilter(mockColumn, { startsWith: 'app-' })
    expect(result).toBeDefined()
  })

  it('should handle endsWith filter', () => {
    const result = applyStringFilter(mockColumn, { endsWith: '-prod' })
    expect(result).toBeDefined()
  })

  it('should handle in filter', () => {
    const result = applyStringFilter(mockColumn, { in: ['active', 'pending'] })
    expect(result).toBeDefined()
  })

  it('should handle empty in array', () => {
    const result = applyStringFilter(mockColumn, { in: [] })
    expect(result).toBeUndefined()
  })

  it('should combine multiple filters with AND', () => {
    const result = applyStringFilter(mockColumn, { eq: 'active', ne: 'disabled' })
    expect(result).toBeDefined()
  })

  it('should ignore null values', () => {
    const result = applyStringFilter(mockColumn, { eq: null, ne: null })
    expect(result).toBeUndefined()
  })
})

describe('applyGlobalIdFilter', () => {
  const mockColumn = { name: 'organization_id' } as any

  it('should return undefined for empty filter', () => {
    expect(applyGlobalIdFilter(mockColumn, {})).toBeUndefined()
  })

  it('should decode and apply eq filter', () => {
    const globalId = btoa('Organization:org-123')
    const result = applyGlobalIdFilter(mockColumn, { eq: globalId })
    expect(result).toBeDefined()
  })

  it('should decode and apply in filter', () => {
    const ids = [btoa('Organization:org-1'), btoa('Organization:org-2')]
    const result = applyGlobalIdFilter(mockColumn, { in: ids })
    expect(result).toBeDefined()
  })

  it('should handle empty in array', () => {
    const result = applyGlobalIdFilter(mockColumn, { in: [] })
    expect(result).toBeUndefined()
  })

  it('should throw on invalid global ID', () => {
    expect(() => applyGlobalIdFilter(mockColumn, { eq: 'not-a-valid-id!!!' })).toThrow()
  })

  it('should ignore null values', () => {
    const result = applyGlobalIdFilter(mockColumn, { eq: null, in: null })
    expect(result).toBeUndefined()
  })
})
