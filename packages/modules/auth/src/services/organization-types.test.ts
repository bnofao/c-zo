import { describe, expect, it } from 'vitest'
import { isValidOrgType, ORG_TYPES, validateOrgType } from './organization-types'

describe('organization types', () => {
  describe('orgTypes', () => {
    it('should contain all expected types', () => {
      expect(ORG_TYPES).toEqual(['merchant', 'delivery', 'warehouse', 'supplier'])
    })

    it('should have 4 entries', () => {
      expect(ORG_TYPES).toHaveLength(4)
    })
  })

  describe('isValidOrgType', () => {
    it.each(ORG_TYPES)('should return true for valid type: %s', (type) => {
      expect(isValidOrgType(type)).toBe(true)
    })

    it('should return false for invalid type', () => {
      expect(isValidOrgType('invalid')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isValidOrgType('')).toBe(false)
    })
  })

  describe('validateOrgType', () => {
    it.each(ORG_TYPES)('should return the type for valid input: %s', (type) => {
      expect(validateOrgType(type)).toBe(type)
    })

    it('should return null for null input', () => {
      expect(validateOrgType(null)).toBeNull()
    })

    it('should return null for undefined input', () => {
      expect(validateOrgType(undefined)).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(validateOrgType('')).toBeNull()
    })

    it('should throw for invalid type', () => {
      expect(() => validateOrgType('invalid')).toThrow(
        'Invalid organization type: "invalid". Must be one of: merchant, delivery, warehouse, supplier',
      )
    })
  })
})
