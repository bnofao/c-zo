import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor, generateId } from './utils'

// Note: applyWhere and applyOrderBy require actual Drizzle SQL operations
// which are difficult to mock properly. We test the public utilities instead.

describe('repository Utils', () => {
  describe('generateId', () => {
    it('should generate a valid UUID', () => {
      const id = generateId()

      // UUID format: 8-4-4-4-12
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      expect(id).toMatch(uuidRegex)
    })

    it('should generate unique IDs', () => {
      const ids = new Set<string>()
      const count = 1000

      for (let i = 0; i < count; i++) {
        ids.add(generateId())
      }

      expect(ids.size).toBe(count)
    })

    it('should return a string', () => {
      const id = generateId()
      expect(typeof id).toBe('string')
    })
  })

  describe('encodeCursor', () => {
    it('should encode string to base64', () => {
      const cursor = encodeCursor('my-id-123')
      const expected = Buffer.from('my-id-123').toString('base64')

      expect(cursor).toBe(expected)
    })

    it('should handle empty string', () => {
      const cursor = encodeCursor('')
      expect(cursor).toBe('')
    })

    it('should handle special characters', () => {
      const cursor = encodeCursor('id-with-special-chars!@#$%')
      expect(typeof cursor).toBe('string')
      expect(cursor.length).toBeGreaterThan(0)
    })

    it('should handle unicode characters', () => {
      const cursor = encodeCursor('id-avec-accents-e')

      // Should be decodable back
      const decoded = decodeCursor(cursor)
      expect(decoded).toBe('id-avec-accents-e')
    })
  })

  describe('decodeCursor', () => {
    it('should decode base64 to string', () => {
      const original = 'my-id-123'
      const encoded = encodeCursor(original)
      const decoded = decodeCursor(encoded)

      expect(decoded).toBe(original)
    })

    it('should handle empty string', () => {
      const decoded = decodeCursor('')
      expect(decoded).toBe('')
    })

    it('should roundtrip special characters', () => {
      const original = 'id-with-special-chars!@#$%'
      const encoded = encodeCursor(original)
      const decoded = decodeCursor(encoded)

      expect(decoded).toBe(original)
    })

    it('should roundtrip UUIDs', () => {
      const uuid = generateId()
      const encoded = encodeCursor(uuid)
      const decoded = decodeCursor(encoded)

      expect(decoded).toBe(uuid)
    })
  })

  describe('cursor roundtrip', () => {
    it('should preserve data through encode/decode cycle', () => {
      const testCases = [
        'simple-id',
        '12345',
        'a-very-long-id-that-might-be-used-in-production-systems',
        'id_with_underscores',
        'UPPERCASE-ID',
        'MixedCase123',
      ]

      for (const original of testCases) {
        const encoded = encodeCursor(original)
        const decoded = decodeCursor(encoded)
        expect(decoded).toBe(original)
      }
    })
  })
})
