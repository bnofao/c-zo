import { beforeEach, describe, expect, it } from 'vitest'
import { CategoryService } from '../../../src/services/category.service'
import { ProductService } from '../../../src/services/product.service'
import { testDb } from '../../setup'

describe('categoryService', () => {
  let categoryService: CategoryService
  let productService: ProductService

  beforeEach(async () => {
    categoryService = new CategoryService(testDb)
    productService = new ProductService(testDb)

    // Clean up test data
    if (testDb) {
      await testDb.deleteFrom('p_categories_products').execute()
      await testDb.deleteFrom('p_categories').execute()
      await testDb.deleteFrom('products').execute()
    }
  })

  describe('createCategory', () => {
    it('should create root category', async () => {
      const category = await categoryService.createCategory({
        name: 'Electronics',
        description: 'Electronic products',
      })

      expect(category.id).toBeDefined()
      expect(category.name).toBe('Electronics')
      expect(category.handle).toBe('electronics')
      expect(category.parent_id).toBeNull()
      expect(category.is_active).toBe(false)
    })

    it('should create child category', async () => {
      const parent = await categoryService.createCategory({
        name: 'Electronics',
      })

      const child = await categoryService.createCategory({
        name: 'Laptops',
        parentId: parent.id,
      })

      expect(child.parent_id).toBe(parent.id)
    })

    it('should throw error if parent not found', async () => {
      await expect(
        categoryService.createCategory({
          name: 'Category',
          parentId: 'non-existent',
        }),
      ).rejects.toThrow('Parent category not found')
    })

    it('should auto-generate handle from name', async () => {
      const category = await categoryService.createCategory({
        name: 'Gaming Laptops',
      })

      expect(category.handle).toBe('gaming-laptops')
    })

    it('should respect rank ordering', async () => {
      await categoryService.createCategory({
        name: 'Category 1',
        rank: 2,
      })
      await categoryService.createCategory({
        name: 'Category 2',
        rank: 1,
      })

      const roots = await categoryService.getRootCategories()
      expect(roots[0].rank).toBe(1)
      expect(roots[1].rank).toBe(2)
    })
  })

  describe('updateCategory', () => {
    it('should update category fields', async () => {
      const category = await categoryService.createCategory({
        name: 'Original Name',
      })

      const updated = await categoryService.updateCategory(category.id, {
        name: 'Updated Name',
        isActive: true,
        expectedUpdatedAt: category.updated_at,
      })

      expect(updated.name).toBe('Updated Name')
      expect(updated.is_active).toBe(true)
    })

    it('should prevent circular references when moving', async () => {
      const parent = await categoryService.createCategory({
        name: 'Parent',
      })

      const child = await categoryService.createCategory({
        name: 'Child',
        parentId: parent.id,
      })

      // Try to make parent a child of its own child
      await expect(
        categoryService.updateCategory(parent.id, {
          parentId: child.id,
          expectedUpdatedAt: parent.updated_at,
        }),
      ).rejects.toThrow('circular reference')
    })

    it('should implement optimistic locking', async () => {
      const category = await categoryService.createCategory({
        name: 'Category',
      })

      await categoryService.updateCategory(category.id, {
        name: 'First Update',
        expectedUpdatedAt: category.updated_at,
      })

      await expect(
        categoryService.updateCategory(category.id, {
          name: 'Second Update',
          expectedUpdatedAt: category.updated_at, // Stale
        }),
      ).rejects.toThrow('modified')
    })
  })

  describe('getCategoryTree', () => {
    it('should retrieve category tree with hierarchy', async () => {
      const root = await categoryService.createCategory({
        name: 'Electronics',
      })

      const child1 = await categoryService.createCategory({
        name: 'Computers',
        parentId: root.id,
      })

      const child2 = await categoryService.createCategory({
        name: 'Phones',
        parentId: root.id,
      })

      const grandchild = await categoryService.createCategory({
        name: 'Laptops',
        parentId: child1.id,
      })

      const tree = await categoryService.getCategoryTree(root.id)

      expect(tree.length).toBe(4) // root + 2 children + 1 grandchild
      expect(tree.find(c => c.id === root.id)).toBeDefined()
      expect(tree.find(c => c.id === grandchild.id)).toBeDefined()
    })
  })

  describe('deleteCategory', () => {
    it('should throw error when deleting category with children', async () => {
      const parent = await categoryService.createCategory({
        name: 'Parent',
      })

      await categoryService.createCategory({
        name: 'Child',
        parentId: parent.id,
      })

      await expect(
        categoryService.deleteCategory(parent.id, false),
      ).rejects.toThrow('subcategories')
    })

    it('should cascade delete when requested', async () => {
      const parent = await categoryService.createCategory({
        name: 'Parent',
      })

      const child = await categoryService.createCategory({
        name: 'Child',
        parentId: parent.id,
      })

      const result = await categoryService.deleteCategory(parent.id, true)

      expect(result.success).toBe(true)

      const parentRetrieved = await categoryService.getCategory(parent.id)
      const childRetrieved = await categoryService.getCategory(child.id)

      expect(parentRetrieved).toBeNull()
      expect(childRetrieved).toBeNull()
    })
  })

  describe('assignProductToCategories', () => {
    it('should assign product to multiple categories', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      const cat1 = await categoryService.createCategory({ name: 'Cat 1' })
      const cat2 = await categoryService.createCategory({ name: 'Cat 2' })

      await categoryService.assignProductToCategories(product.id, [cat1.id, cat2.id])

      const categories = await categoryService.getProductCategories(product.id)
      expect(categories.length).toBe(2)
      expect(categories.map(c => c.id)).toContain(cat1.id)
      expect(categories.map(c => c.id)).toContain(cat2.id)
    })

    it('should replace existing category assignments', async () => {
      const product = await productService.createProduct({
        title: 'Product',
        status: 'draft',
      })

      const cat1 = await categoryService.createCategory({ name: 'Cat 1' })
      const cat2 = await categoryService.createCategory({ name: 'Cat 2' })
      const cat3 = await categoryService.createCategory({ name: 'Cat 3' })

      await categoryService.assignProductToCategories(product.id, [cat1.id, cat2.id])
      await categoryService.assignProductToCategories(product.id, [cat3.id])

      const categories = await categoryService.getProductCategories(product.id)
      expect(categories.length).toBe(1)
      expect(categories[0].id).toBe(cat3.id)
    })
  })
})
