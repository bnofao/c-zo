import { describe, it, expect } from 'vitest'
import { validateCreateVariant, validateUpdateVariant } from '../../../src/validators/variant.validator'

describe('VariantValidator', () => {
  describe('validateCreateVariant', () => {
    it('should validate valid variant creation input', () => {
      const input = {
        title: 'Medium - Blue',
        sku: 'SHIRT-M-BL',
        barcode: '1234567890',
        allowBackorder: false,
        manageInventory: true,
        weight: 500,
        length: 300,
        height: 50,
        width: 200,
      }

      const result = validateCreateVariant(input)
      expect(result.title).toBe('Medium - Blue')
      expect(result.sku).toBe('SHIRT-M-BL')
    })

    it('should require title', () => {
      const input = {
        sku: 'TEST-SKU',
      }

      expect(() => validateCreateVariant(input)).toThrow()
    })

    it('should validate EAN format (8 or 13 digits)', () => {
      const validInput8 = {
        title: 'Test',
        ean: '12345678',
      }
      expect(() => validateCreateVariant(validInput8)).not.toThrow()

      const validInput13 = {
        title: 'Test',
        ean: '1234567890123',
      }
      expect(() => validateCreateVariant(validInput13)).not.toThrow()

      const invalidInput = {
        title: 'Test',
        ean: '123', // Wrong length
      }
      expect(() => validateCreateVariant(invalidInput)).toThrow()
    })

    it('should validate UPC format (12 digits)', () => {
      const validInput = {
        title: 'Test',
        upc: '123456789012',
      }
      expect(() => validateCreateVariant(validInput)).not.toThrow()

      const invalidInput = {
        title: 'Test',
        upc: '123', // Wrong length
      }
      expect(() => validateCreateVariant(invalidInput)).toThrow()
    })

    it('should validate EAN contains only digits', () => {
      const input = {
        title: 'Test',
        ean: '1234567A', // Contains letter
      }

      expect(() => validateCreateVariant(input)).toThrow('EAN must contain only digits')
    })

    it('should validate UPC contains only digits', () => {
      const input = {
        title: 'Test',
        upc: '12345678901A', // Contains letter
      }

      expect(() => validateCreateVariant(input)).toThrow('UPC must contain only digits')
    })

    it('should validate dimensions are non-negative', () => {
      const input = {
        title: 'Test',
        weight: -100,
      }

      expect(() => validateCreateVariant(input)).toThrow('Weight must be positive')
    })

    it('should validate metadata size limit', () => {
      const largeMetadata = {
        title: 'Test',
        metadata: { data: 'x'.repeat(11000) },
      }

      expect(() => validateCreateVariant(largeMetadata)).toThrow('Metadata exceeds maximum size')
    })
  })

  describe('validateUpdateVariant', () => {
    it('should validate valid variant update input', () => {
      const input = {
        title: 'Updated Title',
        sku: 'NEW-SKU',
        expectedUpdatedAt: new Date(),
      }

      const result = validateUpdateVariant(input)
      expect(result.title).toBe('Updated Title')
      expect(result.sku).toBe('NEW-SKU')
    })

    it('should require expectedUpdatedAt for optimistic locking', () => {
      const input = {
        title: 'Updated Title',
      }

      expect(() => validateUpdateVariant(input)).toThrow('expectedUpdatedAt is required')
    })

    it('should validate partial updates', () => {
      const input = {
        sku: 'PARTIAL-UPDATE',
        expectedUpdatedAt: new Date(),
      }

      const result = validateUpdateVariant(input)
      expect(result.sku).toBe('PARTIAL-UPDATE')
      expect(result.title).toBeUndefined() // Partial update
    })
  })
})

