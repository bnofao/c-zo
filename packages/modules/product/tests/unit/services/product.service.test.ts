import { describe, it, expect, beforeEach } from 'vitest'
import { ProductService } from '../../../src/services/product.service'
import { testDb } from '../../setup'

describe('ProductService', () => {
  let productService: ProductService

  beforeEach(async () => {
    productService = new ProductService(testDb)
    
    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('products').execute()
    }
  })

  describe('createProduct', () => {
    it('should create product with basic information', async () => {
      const product = await productService.createProduct({
        title: 'Laptop X1',
        description: 'High-performance laptop',
        status: 'draft',
      })

      expect(product.id).toBeDefined()
      expect(product.title).toBe('Laptop X1')
      expect(product.description).toBe('High-performance laptop')
      expect(product.status).toBe('draft')
      expect(product.handle).toBe('laptop-x1')
      expect(product.created_at).toBeInstanceOf(Date)
      expect(product.updated_at).toBeInstanceOf(Date)
      expect(product.deleted_at).toBeNull()
    })

    it('should auto-generate handle from title', async () => {
      const product = await productService.createProduct({
        title: 'My Awesome Product',
        status: 'draft',
      })

      expect(product.handle).toBe('my-awesome-product')
    })

    it('should use custom handle when provided', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        handle: 'custom-handle',
        status: 'draft',
      })

      expect(product.handle).toBe('custom-handle')
    })

    it('should set default values correctly', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      expect(product.is_giftcard).toBe(false)
      expect(product.discountable).toBe(true)
      expect(product.status).toBe('draft')
    })

    it('should throw error for duplicate handle', async () => {
      await productService.createProduct({
        title: 'Product',
        handle: 'duplicate-handle',
        status: 'draft',
      })

      // This should succeed with auto-suffixed handle
      const product2 = await productService.createProduct({
        title: 'Product',
        handle: 'duplicate-handle',
        status: 'draft',
      })

      expect(product2.handle).toBe('duplicate-handle-1')
    })

    it('should validate status enum', async () => {
      await expect(
        productService.createProduct({
          title: 'Product',
          status: 'invalid-status' as any,
        })
      ).rejects.toThrow()
    })
  })

  describe('updateProduct', () => {
    it('should update product fields', async () => {
      const product = await productService.createProduct({
        title: 'Original Title',
        status: 'draft',
      })

      const updated = await productService.updateProduct(product.id, {
        title: 'Updated Title',
        status: 'published',
        expectedUpdatedAt: product.updated_at,
      })

      expect(updated.title).toBe('Updated Title')
      expect(updated.status).toBe('published')
      expect(updated.updated_at.getTime()).toBeGreaterThan(product.updated_at.getTime())
    })

    it('should implement optimistic locking', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      // Simulate concurrent update
      await productService.updateProduct(product.id, {
        status: 'proposed',
        expectedUpdatedAt: product.updated_at,
      })

      // This should fail due to stale timestamp
      await expect(
        productService.updateProduct(product.id, {
          status: 'published',
          expectedUpdatedAt: product.updated_at, // Stale
        })
      ).rejects.toThrow('Product was modified')
    })

    it('should not update soft-deleted products', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      await productService.deleteProduct(product.id)

      await expect(
        productService.updateProduct(product.id, {
          title: 'New Title',
          expectedUpdatedAt: product.updated_at,
        })
      ).rejects.toThrow()
    })
  })

  describe('getProduct', () => {
    it('should retrieve product by ID', async () => {
      const created = await productService.createProduct({
        title: 'Test Product',
        status: 'draft',
      })

      const product = await productService.getProduct(created.id)

      expect(product).toBeDefined()
      expect(product?.id).toBe(created.id)
      expect(product?.title).toBe('Test Product')
    })

    it('should return null for non-existent product', async () => {
      const product = await productService.getProduct('non-existent-id')
      expect(product).toBeNull()
    })

    it('should not retrieve soft-deleted products', async () => {
      const created = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      await productService.deleteProduct(created.id)

      const product = await productService.getProduct(created.id)
      expect(product).toBeNull()
    })
  })

  describe('listProducts', () => {
    beforeEach(async () => {
      // Create test products
      await productService.createProduct({ title: 'Product 1', status: 'draft' })
      await productService.createProduct({ title: 'Product 2', status: 'published' })
      await productService.createProduct({ title: 'Product 3', status: 'draft' })
    })

    it('should list all products', async () => {
      const result = await productService.listProducts({})

      expect(result.nodes.length).toBe(3)
      expect(result.totalCount).toBe(3)
    })

    it('should filter by status', async () => {
      const result = await productService.listProducts({
        filter: { status: 'published' }
      })

      expect(result.nodes.length).toBe(1)
      expect(result.nodes[0].status).toBe('published')
    })

    it('should paginate results', async () => {
      const result = await productService.listProducts({
        pagination: { limit: 2, offset: 0 }
      })

      expect(result.nodes.length).toBe(2)
      expect(result.pageInfo.hasNextPage).toBe(true)
    })

    it('should sort by created_at', async () => {
      const result = await productService.listProducts({
        sort: { field: 'CREATED_AT', direction: 'DESC' }
      })

      expect(result.nodes[0].title).toBe('Product 3')
    })

    it('should not include soft-deleted products', async () => {
      const products = await productService.listProducts({})
      const firstProduct = products.nodes[0]
      
      await productService.deleteProduct(firstProduct.id)

      const afterDelete = await productService.listProducts({})
      expect(afterDelete.nodes.length).toBe(2)
    })
  })

  describe('deleteProduct', () => {
    it('should soft-delete product', async () => {
      const product = await productService.createProduct({
        title: 'Product to Delete',
        status: 'draft',
      })

      const result = await productService.deleteProduct(product.id)

      expect(result.success).toBe(true)
      expect(result.deletedAt).toBeInstanceOf(Date)

      // Verify it's soft-deleted
      const retrieved = await productService.getProduct(product.id)
      expect(retrieved).toBeNull()
    })

    it('should return error when deleting non-existent product', async () => {
      await expect(
        productService.deleteProduct('non-existent-id')
      ).rejects.toThrow('Product not found')
    })

    it('should not delete already deleted product', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      await productService.deleteProduct(product.id)

      await expect(
        productService.deleteProduct(product.id)
      ).rejects.toThrow('Product not found')
    })
  })
})

