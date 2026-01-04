import type { GraphQLContext } from '../../../src/schema/context'
import { beforeEach, describe, expect, it } from 'vitest'
import { createProduct } from '../../../src/schema/product/resolvers/Mutation/createProduct'
import { deleteProduct } from '../../../src/schema/product/resolvers/Mutation/deleteProduct'
import { updateProduct } from '../../../src/schema/product/resolvers/Mutation/updateProduct'
import { ProductService } from '../../../src/services/product.service'
import { testDb } from '../../setup'

describe('product Mutation Resolvers', () => {
  let context: GraphQLContext

  beforeEach(async () => {
    // Clean up
    if (testDb) {
      await testDb.deleteFrom('products').execute()
    }

    // Setup context
    context = {
      db: testDb,
      user: {
        id: 'admin-1',
        role: 'admin',
      },
      services: {
        product: new ProductService(testDb),
      },
    } as any
  })

  describe('createProduct mutation', () => {
    it('should create a new product', async () => {
      const result = await createProduct(
        null,
        {
          input: {
            title: 'New Product',
            description: 'Product description',
            status: 'DRAFT',
          },
        },
        context,
        {} as any,
      )

      expect(result.product).toBeDefined()
      expect(result.product?.title).toBe('New Product')
      expect(result.product?.description).toBe('Product description')
      expect(result.product?.status).toBe('draft')
      expect(result.errors).toBeUndefined()
    })

    it('should generate unique handle from title', async () => {
      const result = await createProduct(
        null,
        {
          input: {
            title: 'Awesome Product',
            status: 'DRAFT',
          },
        },
        context,
        {} as any,
      )

      expect(result.product).toBeDefined()
      expect(result.product?.handle).toBe('awesome-product')
    })

    it('should handle errors gracefully', async () => {
      const result = await createProduct(
        null,
        {
          input: {
            title: '', // Invalid: empty title
            status: 'DRAFT',
          },
        },
        context,
        {} as any,
      )

      expect(result.errors).toBeDefined()
      expect(result.errors?.[0].code).toBe('VALIDATION_ERROR')
    })
  })

  describe('updateProduct mutation', () => {
    it('should update an existing product', async () => {
      const product = await context.services.product.createProduct({
        title: 'Product',
        status: 'draft',
      })

      const result = await updateProduct(
        null,
        {
          id: product.id,
          input: {
            status: 'PUBLISHED',
            expectedUpdatedAt: product.updated_at.toISOString(),
          },
        },
        context,
        {} as any,
      )

      expect(result.product).toBeDefined()
      expect(result.product?.status).toBe('published')
    })

    it('should handle optimistic locking conflicts', async () => {
      const product = await context.services.product.createProduct({
        title: 'Product',
        status: 'draft',
      })

      // First update
      await context.services.product.updateProduct(product.id, {
        status: 'proposed',
        expectedUpdatedAt: product.updated_at,
      })

      // Try to update with stale timestamp
      const result = await updateProduct(
        null,
        {
          id: product.id,
          input: {
            status: 'PUBLISHED',
            expectedUpdatedAt: product.updated_at.toISOString(), // Stale timestamp
          },
        },
        context,
        {} as any,
      )

      expect(result.errors).toBeDefined()
      expect(result.errors?.[0].code).toBe('CONFLICT')
    })

    it('should update product title and description', async () => {
      const product = await context.services.product.createProduct({
        title: 'Original Title',
        status: 'draft',
      })

      const result = await updateProduct(
        null,
        {
          id: product.id,
          input: {
            title: 'Updated Title',
            description: 'Updated description',
            expectedUpdatedAt: product.updated_at.toISOString(),
          },
        },
        context,
        {} as any,
      )

      expect(result.product).toBeDefined()
      expect(result.product?.title).toBe('Updated Title')
      expect(result.product?.description).toBe('Updated description')
    })
  })

  describe('deleteProduct mutation', () => {
    it('should soft-delete a product', async () => {
      const product = await context.services.product.createProduct({
        title: 'Product to Delete',
        status: 'draft',
      })

      const result = await deleteProduct(
        null,
        { id: product.id },
        context,
        {} as any,
      )

      expect(result.success).toBe(true)

      // Verify it's deleted
      const retrieved = await context.services.product.getProduct(product.id)
      expect(retrieved).toBeNull()
    })

    it('should return error for non-existent product', async () => {
      const result = await deleteProduct(
        null,
        { id: 'non-existent' },
        context,
        {} as any,
      )

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })
  })
})
