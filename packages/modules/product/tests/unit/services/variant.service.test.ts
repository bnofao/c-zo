import { beforeEach, describe, expect, it } from 'vitest'
import { ProductService } from '../../../src/services/product.service'
import { VariantService } from '../../../src/services/variant.service'
import { testDb } from '../../setup'

describe('variantService', () => {
  let variantService: VariantService
  let productService: ProductService
  let testProductId: string

  beforeEach(async () => {
    variantService = new VariantService(testDb)
    productService = new ProductService(testDb)

    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('p_variants').execute()
      await testDb.deleteFrom('products').execute()
    }

    // Create a test product
    const product = await productService.createProduct({
      title: 'Test Product',
      status: 'draft',
    })
    testProductId = product.id
  })

  describe('createVariant', () => {
    it('should create variant with basic information', async () => {
      const variant = await variantService.createVariant(testProductId, {
        title: 'Medium - Blue',
        sku: 'SHIRT-M-BL',
      })

      expect(variant.id).toBeDefined()
      expect(variant.title).toBe('Medium - Blue')
      expect(variant.sku).toBe('SHIRT-M-BL')
      expect(variant.product_id).toBe(testProductId)
      expect(variant.manage_inventory).toBe(true)
      expect(variant.allow_backorder).toBe(false)
    })

    it('should enforce unique SKU', async () => {
      await variantService.createVariant(testProductId, {
        title: 'Variant 1',
        sku: 'UNIQUE-SKU',
      })

      await expect(
        variantService.createVariant(testProductId, {
          title: 'Variant 2',
          sku: 'UNIQUE-SKU',
        }),
      ).rejects.toThrow('SKU "UNIQUE-SKU" already exists')
    })

    it('should enforce unique barcode', async () => {
      await variantService.createVariant(testProductId, {
        title: 'Variant 1',
        barcode: '123456789',
      })

      await expect(
        variantService.createVariant(testProductId, {
          title: 'Variant 2',
          barcode: '123456789',
        }),
      ).rejects.toThrow('Barcode "123456789" already exists')
    })

    it('should enforce unique EAN', async () => {
      await variantService.createVariant(testProductId, {
        title: 'Variant 1',
        ean: '1234567890123',
      })

      await expect(
        variantService.createVariant(testProductId, {
          title: 'Variant 2',
          ean: '1234567890123',
        }),
      ).rejects.toThrow('EAN "1234567890123" already exists')
    })

    it('should enforce unique UPC', async () => {
      await variantService.createVariant(testProductId, {
        title: 'Variant 1',
        upc: '123456789012',
      })

      await expect(
        variantService.createVariant(testProductId, {
          title: 'Variant 2',
          upc: '123456789012',
        }),
      ).rejects.toThrow('UPC "123456789012" already exists')
    })

    it('should store dimensions correctly', async () => {
      const variant = await variantService.createVariant(testProductId, {
        title: 'Variant',
        weight: 1500,
        length: 300,
        height: 200,
        width: 100,
      })

      expect(variant.weight).toBe(1500)
      expect(variant.length).toBe(300)
      expect(variant.height).toBe(200)
      expect(variant.width).toBe(100)
    })

    it('should set inventory management settings', async () => {
      const variant = await variantService.createVariant(testProductId, {
        title: 'Variant',
        manageInventory: false,
        allowBackorder: true,
      })

      expect(variant.manage_inventory).toBe(false)
      expect(variant.allow_backorder).toBe(true)
    })
  })

  describe('updateVariant', () => {
    it('should update variant fields', async () => {
      const variant = await variantService.createVariant(testProductId, {
        title: 'Original',
        sku: 'ORIGINAL-SKU',
      })

      const updated = await variantService.updateVariant(variant.id, {
        title: 'Updated',
        sku: 'UPDATED-SKU',
        expectedUpdatedAt: variant.updated_at,
      })

      expect(updated.title).toBe('Updated')
      expect(updated.sku).toBe('UPDATED-SKU')
      expect(updated.updated_at.getTime()).toBeGreaterThan(variant.updated_at.getTime())
    })

    it('should implement optimistic locking', async () => {
      const variant = await variantService.createVariant(testProductId, {
        title: 'Variant',
      })

      await variantService.updateVariant(variant.id, {
        title: 'First Update',
        expectedUpdatedAt: variant.updated_at,
      })

      await expect(
        variantService.updateVariant(variant.id, {
          title: 'Second Update',
          expectedUpdatedAt: variant.updated_at, // Stale
        }),
      ).rejects.toThrow('modified')
    })

    it('should validate unique SKU on update', async () => {
      await variantService.createVariant(testProductId, {
        title: 'Variant 1',
        sku: 'SKU-1',
      })

      const variant2 = await variantService.createVariant(testProductId, {
        title: 'Variant 2',
        sku: 'SKU-2',
      })

      await expect(
        variantService.updateVariant(variant2.id, {
          sku: 'SKU-1', // Already exists
          expectedUpdatedAt: variant2.updated_at,
        }),
      ).rejects.toThrow('SKU "SKU-1" already exists')
    })
  })

  describe('deleteVariant', () => {
    it('should soft-delete variant', async () => {
      const variant = await variantService.createVariant(testProductId, {
        title: 'Variant to Delete',
      })

      const result = await variantService.deleteVariant(variant.id)

      expect(result.success).toBe(true)
      expect(result.deletedAt).toBeInstanceOf(Date)

      const retrieved = await variantService.getVariant(variant.id)
      expect(retrieved).toBeNull()
    })
  })

  describe('getVariantsByProductId', () => {
    it('should return all variants for a product ordered by rank', async () => {
      await variantService.createVariant(testProductId, {
        title: 'Variant 1',
        variantRank: 2,
      })
      await variantService.createVariant(testProductId, {
        title: 'Variant 2',
        variantRank: 1,
      })
      await variantService.createVariant(testProductId, {
        title: 'Variant 3',
        variantRank: 0,
      })

      const variants = await variantService.getVariantsByProductId(testProductId)

      expect(variants.length).toBe(3)
      expect(variants[0].variant_rank).toBe(0)
      expect(variants[1].variant_rank).toBe(1)
      expect(variants[2].variant_rank).toBe(2)
    })
  })
})
