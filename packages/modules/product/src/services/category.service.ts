import type { Category, CategoryUpdate, Database, NewCategory } from '@czo/product/database'
import type { Kysely } from 'kysely'
import {
  findCategoryById,
  findChildCategories,
  findRootCategories,
  getCategoryDescendants,
  getCategoryTree,
} from '@czo/product/database'
import { generateUniqueHandle, getCategoryDepth, mapToDatabase, softDelete, validateCategoryMove } from '@czo/product/utils'
import {

  MAX_CATEGORY_DEPTH,

  validateCreateCategory,
  validateUpdateCategory,
} from '@czo/product/validators'
import { ulid } from 'ulid'

/**
 * Category service handling business logic for category management
 */
export class CategoryService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new category
   */
  async createCategory(input: unknown): Promise<Category> {
    // Validate input with Zod
    const validatedInput = validateCreateCategory(input)

    // Validate parent exists if provided
    if (validatedInput.parentId) {
      const parent = await findCategoryById(this.db, validatedInput.parentId)
      if (!parent) {
        throw new Error('Parent category not found')
      }

      // Check depth limit
      const depth = await getCategoryDepth(this.db, validatedInput.parentId)
      if (depth >= MAX_CATEGORY_DEPTH - 1) {
        throw new Error(`Maximum category depth of ${MAX_CATEGORY_DEPTH} exceeded`)
      }
    }

    // Generate unique handle
    const handle = await generateUniqueHandle(
      this.db,
      'pCategories',
      validatedInput.name,
      validatedInput.handle,
    )

    console.log('handle generated', handle)

    // Generate ID
    const id = ulid()

    // Transform validated input to database format
    const categoryData: NewCategory = {
      id,
      handle,
      ...validatedInput,
    }

    // Insert category
    const category = await this.db
      .insertInto('pCategories')
      .values(categoryData)
      .returningAll()
      .executeTakeFirstOrThrow()

    return category
  }

  /**
   * Update an existing category
   */
  async updateCategory(
    id: string,
    input: unknown,
  ): Promise<Category> {
    // Validate input with Zod
    const validatedInput = validateUpdateCategory(input)

    // If changing parent, validate the move
    if (validatedInput.parentId !== undefined) {
      const isValid = await validateCategoryMove(
        this.db,
        id,
        validatedInput.parentId,
      )
      if (!isValid) {
        throw new Error('Cannot move category: would create circular reference')
      }

      // Check depth limit if moving
      if (validatedInput.parentId) {
        const newDepth = await getCategoryDepth(this.db, validatedInput.parentId)
        if (newDepth >= MAX_CATEGORY_DEPTH - 1) {
          throw new Error(`Maximum category depth of ${MAX_CATEGORY_DEPTH} exceeded`)
        }
      }
    }

    // Transform to database format
    const updateData: CategoryUpdate = {
      ...mapToDatabase(validatedInput),
      metadata: validatedInput.metadata !== undefined
        ? JSON.parse(JSON.stringify(validatedInput.metadata))
        : undefined,
      updatedAt: new Date(),
    }

    // Update with optimistic locking
    const result = await this.db
      .updateTable('pCategories')
      .set(updateData)
      .where('id', '=', id)
      .where('updatedAt', '=', validatedInput.expectedUpdatedAt)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst()

    if (!result) {
      throw new Error('Category was modified by another request or not found')
    }

    return result
  }

  /**
   * Get a single category by ID
   */
  async getCategory(id: string): Promise<Category | null> {
    const category = await findCategoryById(this.db, id)
    return category || null
  }

  /**
   * Get category tree
   */
  async getCategoryTree(rootId?: string): Promise<Category[]> {
    return getCategoryTree(this.db, rootId)
  }

  /**
   * Get direct children of a category
   */
  async getCategoryChildren(categoryId: string): Promise<Category[]> {
    return findChildCategories(this.db, categoryId)
  }

  /**
   * Alias for getCategoryChildren
   */
  async getChildren(categoryId: string): Promise<Category[]> {
    return this.getCategoryChildren(categoryId)
  }

  /**
   * Get path from category to root using recursive CTE
   */
  async getCategoryPath(categoryId: string): Promise<Category[]> {
    const result = await this.db
      .withRecursive('category_path', qb =>
        qb
          .selectFrom('pCategories')
          .selectAll()
          .where('id', '=', categoryId)
          .where('deletedAt', 'is', null)
          .unionAll(
            qb
              .selectFrom('pCategories as c')
              .innerJoin('category_path as cp', 'c.id', 'cp.parent_id')
              .selectAll('c')
              .where('c.deletedAt', 'is', null),
          ))
      .selectFrom('category_path')
      .selectAll()
      .execute()

    return result.reverse() // Root to current
  }

  /**
   * Get all root categories
   */
  async getRootCategories(): Promise<Category[]> {
    return findRootCategories(this.db)
  }

  /**
   * Soft-delete a category and optionally its descendants
   */
  async deleteCategory(
    id: string,
    cascadeDelete: boolean = false,
  ): Promise<{
    success: boolean
    deletedAt: Date
  }> {
    // Check if category has children
    const children = await findChildCategories(this.db, id)
    if (children.length > 0 && !cascadeDelete) {
      throw new Error(
        `Category has ${children.length} subcategories. Set cascadeDelete=true to delete them all.`,
      )
    }

    // If cascade, delete all descendants first
    if (cascadeDelete && children.length > 0) {
      const descendants = await getCategoryDescendants(this.db, id)
      for (const descendant of descendants) {
        await softDelete(this.db, 'pCategories', descendant.id)
      }
    }

    // Delete the category
    const result = await softDelete<Category>(this.db, 'pCategories', id)

    if (!result) {
      throw new Error('Category not found or already deleted')
    }

    return {
      success: true,
      deletedAt: result.deletedAt!,
    }
  }

  /**
   * Assign a product to multiple categories
   */
  async assignProductToCategories(
    productId: string,
    categoryIds: string[],
  ): Promise<void> {
    // Verify all categories exist
    for (const categoryId of categoryIds) {
      const category = await findCategoryById(this.db, categoryId)
      if (!category) {
        throw new Error(`Category ${categoryId} not found`)
      }
    }

    // Delete existing associations
    await this.db
      .deleteFrom('pCategoriesProducts')
      .where('productId', '=', productId)
      .execute()

    // Insert new associations
    if (categoryIds.length > 0) {
      const values = categoryIds.map(categoryId => ({
        productId,
        pCategoriesId: categoryId,
      }))

      await this.db
        .insertInto('pCategoriesProducts')
        .values(values)
        .execute()
    }
  }

  /**
   * Get categories for a product
   */
  async getProductCategories(productId: string): Promise<Category[]> {
    return this.db
      .selectFrom('pCategories as pc')
      .innerJoin(
        'pCategoriesProducts as pcp',
        'pc.id',
        'pcp.pCategoriesId',
      )
      .selectAll('pc')
      .where('pcp.productId', '=', productId)
      .where('pc.deletedAt', 'is', null)
      .execute()
  }
}
