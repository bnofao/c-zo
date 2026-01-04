import type { GraphQLContext } from '../../../src/schema/context'
import { beforeEach, describe, expect, it } from 'vitest'
import { product } from '../../../src/schema/product/resolvers/Query/product'
import { products } from '../../../src/schema/product/resolvers/Query/products'
import { ProductService } from '../../../src/services/product.service'
import { testDb } from '../../setup'

describe('product Query Resolvers', () => {
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

  describe('product query', () => {
    it('should fetch product by ID', async () => {
      // Create test product
      const created = await context.services.product.createProduct({
        title: 'Test Product',
        status: 'draft',
      })

      const result = await product(null, { id: created.id }, context, {} as any)

      expect(result).toBeDefined()
      expect(result?.id).toBe(created.id)
      expect(result?.title).toBe('Test Product')
      expect(result?.status).toBe('draft')
    })

    it('should return null for non-existent product', async () => {
      const result = await product(null, { id: 'non-existent' }, context, {} as any)
      expect(result).toBeNull()
    })
  })

  describe('products query', () => {
    beforeEach(async () => {
      // Create test products
      await context.services.product.createProduct({
        title: 'Product 1',
        status: 'draft',
      })
      await context.services.product.createProduct({
        title: 'Product 2',
        status: 'published',
      })
    })

    it('should list all products', async () => {
      const result = await products(null, {}, context, {} as any)

      expect(result.nodes.length).toBe(2)
      expect(result.totalCount).toBe(2)
    })

    it('should filter products by status', async () => {
      const result = await products(
        null,
        { filter: { status: 'PUBLISHED' } },
        context,
        {} as any,
      )

      expect(result.nodes.length).toBe(1)
      expect(result.nodes[0].status).toBe('published')
    })

    it('should paginate results', async () => {
      const result = await products(
        null,
        { pagination: { limit: 1, offset: 0 } },
        context,
        {} as any,
      )

      expect(result.nodes.length).toBe(1)
      expect(result.pageInfo.hasNextPage).toBe(true)
      expect(result.totalCount).toBe(2)
    })
  })
})
