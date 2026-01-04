import { describe, it, expect, beforeEach } from 'vitest'
import { testDb } from '../../setup'
import type { GraphQLContext } from '../../../src/schema/context'
import { VariantService } from '../../../src/services/variant.service'
import { ProductService } from '../../../src/services/product.service'
import { variant } from '../../../src/schema/variant/resolvers/Query/variant'
import { createProductVariant } from '../../../src/schema/variant/resolvers/Mutation/createProductVariant'
import { updateProductVariant } from '../../../src/schema/variant/resolvers/Mutation/updateProductVariant'
import { deleteProductVariant } from '../../../src/schema/variant/resolvers/Mutation/deleteProductVariant'

describe('Variant Resolver Integration Tests', () => {
  let context: GraphQLContext
  let testProductId: string

  beforeEach(async () => {
    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('p_variants_options').execute()
      await testDb.deleteFrom('p_variants').execute()
      await testDb.deleteFrom('products').execute()
    }

    // Setup context
    const variantService = new VariantService(testDb)
    const productService = new ProductService(testDb)

    context = {
      db: testDb,
      user: {
        id: 'admin-1',
        role: 'admin',
      },
      services: {
        variant: variantService,
        product: productService,
      },
    } as any

    // Create test product
    const product = await productService.createProduct({
      title: 'Test Product',
      status: 'draft',
    })
    testProductId = product.id
  })

  describe('variant query', () => {
    it('should fetch variant by ID', async () => {
      const created = await context.services.variant.createVariant(testProductId, {
        title: 'Medium - Blue',
        sku: 'TEST-M-BL',
      })

      const result = await variant(
        null,
        { id: created.id },
        context,
        {} as any,
      )

      expect(result).toBeDefined()
      expect(result?.id).toBe(created.id)
      expect(result?.title).toBe('Medium - Blue')
      expect(result?.sku).toBe('TEST-M-BL')
    })

    it('should return null for non-existent variant', async () => {
      const result = await variant(
        null,
        { id: 'non-existent' },
        context,
        {} as any,
      )

      expect(result).toBeNull()
    })
  })

  describe('createProductVariant mutation', () => {
    it('should create a new variant', async () => {
      const result = await createProductVariant(
        null,
        {
          productId: testProductId,
          input: {
            title: 'Large - Red',
            sku: 'TEST-L-R',
            manageInventory: true,
            allowBackorder: false,
          },
        },
        context,
        {} as any,
      )

      expect(result.variant).toBeDefined()
      expect(result.variant?.title).toBe('Large - Red')
      expect(result.variant?.sku).toBe('TEST-L-R')
    })
  })

  describe('updateProductVariant mutation', () => {
    it('should update variant', async () => {
      const created = await context.services.variant.createVariant(testProductId, {
        title: 'Old Title',
        sku: 'OLD-SKU',
      })

      const result = await updateProductVariant(
        null,
        {
          id: created.id,
          input: {
            title: 'New Title',
            sku: 'NEW-SKU',
            expectedUpdatedAt: created.updated_at,
          },
        },
        context,
        {} as any,
      )

      expect(result.variant).toBeDefined()
      expect(result.variant?.title).toBe('New Title')
      expect(result.variant?.sku).toBe('NEW-SKU')
    })
  })

  describe('deleteProductVariant mutation', () => {
    it('should soft delete variant', async () => {
      const created = await context.services.variant.createVariant(testProductId, {
        title: 'To Delete',
        sku: 'DELETE-SKU',
      })

      const result = await deleteProductVariant(
        null,
        { id: created.id },
        context,
        {} as any,
      )

      expect(result.success).toBe(true)

      // Verify deletion
      const retrieved = await context.services.variant.getVariant(created.id)
      expect(retrieved).toBeNull()
    })
  })
})

