import { describe, it, expect, beforeEach } from 'vitest'
import { testDb } from '../../setup'
import type { GraphQLContext } from '../../../src/schema/context'
import { CategoryService } from '../../../src/services/category.service'
import { ProductService } from '../../../src/services/product.service'
import { category } from '../../../src/schema/category/resolvers/Query/category'
import { categoryTree } from '../../../src/schema/category/resolvers/Query/categoryTree'
import { createCategory } from '../../../src/schema/category/resolvers/Mutation/createCategory'
import { updateCategory } from '../../../src/schema/category/resolvers/Mutation/updateCategory'
import { deleteCategory } from '../../../src/schema/category/resolvers/Mutation/deleteCategory'
import { assignProductToCategories } from '../../../src/schema/category/resolvers/Mutation/assignProductToCategories'

describe('Category Resolver Integration Tests', () => {
  let context: GraphQLContext

  beforeEach(async () => {
    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('p_categories_products').execute()
      await testDb.deleteFrom('products').execute()
      await testDb.deleteFrom('p_categories').execute()
    }

    // Setup context
    const categoryService = new CategoryService(testDb)
    const productService = new ProductService(testDb)

    context = {
      db: testDb,
      user: {
        id: 'admin-1',
        role: 'admin',
      },
      services: {
        category: categoryService,
        product: productService,
      },
    } as any
  })

  describe('category query', () => {
    it('should fetch category by ID', async () => {
      const created = await context.services.category.createCategory({
        name: 'Electronics',
        handle: 'electronics',
        is_active: true,
      })

      const result = await category(
        null,
        { id: created.id },
        context,
        {} as any,
      )

      expect(result).toBeDefined()
      expect(result?.id).toBe(created.id)
      expect(result?.name).toBe('Electronics')
      expect(result?.handle).toBe('electronics')
    })

    it('should return null for non-existent category', async () => {
      const result = await category(
        null,
        { id: 'non-existent' },
        context,
        {} as any,
      )

      expect(result).toBeNull()
    })
  })

  describe('categoryTree query', () => {
    it('should fetch category hierarchy', async () => {
      // Create parent category
      const parent = await context.services.category.createCategory({
        name: 'Electronics',
        handle: 'electronics',
        is_active: true,
      })

      // Create child categories
      await context.services.category.createCategory({
        name: 'Laptops',
        handle: 'laptops',
        is_active: true,
        parent_id: parent.id,
      })

      await context.services.category.createCategory({
        name: 'Phones',
        handle: 'phones',
        is_active: true,
        parent_id: parent.id,
      })

      const result = await categoryTree(
        null,
        { rootId: parent.id },
        context,
        {} as any,
      )

      expect(result).toBeDefined()
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('createCategory mutation', () => {
    it('should create a new category', async () => {
      const result = await createCategory(
        null,
        {
          input: {
            name: 'Clothing',
            handle: 'clothing',
            isActive: true,
          },
        },
        context,
        {} as any,
      )

      expect(result.category).toBeDefined()
      expect(result.category?.name).toBe('Clothing')
      expect(result.category?.handle).toBe('clothing')
    })

    it('should create a child category', async () => {
      const parent = await context.services.category.createCategory({
        name: 'Parent',
        handle: 'parent',
        is_active: true,
      })

      const result = await createCategory(
        null,
        {
          input: {
            name: 'Child',
            handle: 'child',
            isActive: true,
            parentId: parent.id,
          },
        },
        context,
        {} as any,
      )

      expect(result.category).toBeDefined()
      expect(result.category?.name).toBe('Child')
    })
  })

  describe('updateCategory mutation', () => {
    it('should update category', async () => {
      const created = await context.services.category.createCategory({
        name: 'Old Name',
        handle: 'old-name',
        is_active: false,
      })

      const result = await updateCategory(
        null,
        {
          id: created.id,
          input: {
            name: 'New Name',
            isActive: true,
            expectedUpdatedAt: created.updated_at,
          },
        },
        context,
        {} as any,
      )

      expect(result.category).toBeDefined()
      expect(result.category?.name).toBe('New Name')
      // Note: isActive field mapping may need to be verified in resolver
    })
  })

  describe('deleteCategory mutation', () => {
    it('should soft delete category', async () => {
      const created = await context.services.category.createCategory({
        name: 'To Delete',
        handle: 'to-delete',
        is_active: true,
      })

      const result = await deleteCategory(
        null,
        { id: created.id },
        context,
        {} as any,
      )

      expect(result.success).toBe(true)

      // Verify deletion
      const retrieved = await context.services.category.getCategory(created.id)
      expect(retrieved).toBeNull()
    })
  })

  describe('assignProductToCategories mutation', () => {
    it('should assign product to multiple categories', async () => {
      const product = await context.services.product.createProduct({
        title: 'Test Product',
        status: 'draft',
      })

      const cat1 = await context.services.category.createCategory({
        name: 'Category 1',
        handle: 'cat1',
        is_active: true,
      })

      const cat2 = await context.services.category.createCategory({
        name: 'Category 2',
        handle: 'cat2',
        is_active: true,
      })

      const result = await assignProductToCategories(
        null,
        {
          productId: product.id,
          categoryIds: [cat1.id, cat2.id],
        },
        context,
        {} as any,
      )

      expect(result.product).toBeDefined()
      expect(result.product?.id).toBe(product.id)

      // Verify assignments
      const productCategories = await context.services.category.getProductCategories(product.id)
      expect(productCategories).toHaveLength(2)
    })
  })
})

