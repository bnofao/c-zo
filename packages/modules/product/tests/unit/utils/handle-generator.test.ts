import { describe, it, expect, beforeEach } from 'vitest'
import { slugify, generateUniqueHandle } from '../../../src/utils/handle-generator'
import { testDb } from '../../setup'

describe('Handle Generator', () => {
  describe('slugify', () => {
    it('should convert text to lowercase', () => {
      expect(slugify('Hello World')).toBe('hello-world')
    })

    it('should replace spaces with hyphens', () => {
      expect(slugify('My Product Name')).toBe('my-product-name')
    })

    it('should remove special characters', () => {
      expect(slugify('Product @ 2025!')).toBe('product-2025')
    })

    it('should handle multiple consecutive hyphens', () => {
      expect(slugify('Product  -  Name')).toBe('product-name')
    })

    it('should trim leading and trailing hyphens', () => {
      expect(slugify('  -Product-  ')).toBe('product')
    })

    it('should handle accented characters', () => {
      expect(slugify('Café Crème')).toBe('caf-crme')
    })
  })

  describe('generateUniqueHandle', () => {
    beforeEach(async () => {
      // Clean up test data
      if (testDb) {
        await testDb.deleteFrom('products').execute()
      }
    })

    it('should generate handle from title when no custom handle provided', async () => {
      const handle = await generateUniqueHandle(testDb, 'products', 'Test Product')
      expect(handle).toBe('test-product')
    })

    it('should use custom handle when provided', async () => {
      const handle = await generateUniqueHandle(
        testDb, 
        'products', 
        'Test Product', 
        'custom-handle'
      )
      expect(handle).toBe('custom-handle')
    })

    it('should add numeric suffix when handle already exists', async () => {
      // Insert existing product
      await testDb
        .insertInto('products')
        .values({
          id: 'prod-1',
          title: 'Product',
          handle: 'test-product',
          status: 'draft',
          is_giftcard: false,
          discountable: true,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        })
        .execute()

      const handle = await generateUniqueHandle(testDb, 'products', 'Test Product')
      expect(handle).toBe('test-product-1')
    })

    it('should handle multiple duplicates', async () => {
      // Insert multiple existing products
      await testDb
        .insertInto('products')
        .values([
          {
            id: 'prod-1',
            title: 'Product',
            handle: 'test-product',
            status: 'draft',
            is_giftcard: false,
            discountable: true,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          },
          {
            id: 'prod-2',
            title: 'Product 2',
            handle: 'test-product-1',
            status: 'draft',
            is_giftcard: false,
            discountable: true,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          },
        ])
        .execute()

      const handle = await generateUniqueHandle(testDb, 'products', 'Test Product')
      expect(handle).toBe('test-product-2')
    })

    it('should throw error if handle exceeds 255 characters', async () => {
      const longTitle = 'a'.repeat(300)
      
      await expect(
        generateUniqueHandle(testDb, 'products', longTitle)
      ).rejects.toThrow('Handle exceeds maximum length')
    })

    it('should ignore soft-deleted records for uniqueness check', async () => {
      // Insert soft-deleted product
      await testDb
        .insertInto('products')
        .values({
          id: 'prod-deleted',
          title: 'Product',
          handle: 'test-product',
          status: 'draft',
          is_giftcard: false,
          discountable: true,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: new Date(), // Soft deleted
        })
        .execute()

      const handle = await generateUniqueHandle(testDb, 'products', 'Test Product')
      expect(handle).toBe('test-product') // Can reuse handle
    })
  })
})

