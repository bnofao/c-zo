/**
 * Category tree utilities for hierarchical operations
 */

import type { Database } from '@czo/product/database'
import type { Kysely } from 'kysely'

/**
 * Calculate the depth of a category in the hierarchy
 */
export async function getCategoryDepth(
  db: Kysely<Database>,
  categoryId: string | null
): Promise<number> {
  if (!categoryId) return 0

  const result = await db
    .withRecursive('category_path', (qb) =>
      qb
        .selectFrom('p_categories')
        .select(['id', 'parent_id'])
        .select(({ eb }) => eb.lit(1).as('depth'))
        .where('id', '=', categoryId)
        .where('deleted_at', 'is', null)
        .unionAll(
          qb
            .selectFrom('p_categories')
            .innerJoin('category_path', 'category_path.parent_id', 'p_categories.id')
            .select(['p_categories.id', 'p_categories.parent_id'])
            .select(({ eb }) =>
              eb('category_path.depth', '+', 1).as('depth')
            )
            .where('p_categories.deleted_at', 'is', null)
        )
    )
    .selectFrom('category_path')
    .select(({ fn }) => fn.max('depth').as('max_depth'))
    .executeTakeFirst()

  return Number(result?.max_depth || 0)
}

/**
 * Validate if a category can be moved to a new parent
 * Prevents circular references
 */
export async function validateCategoryMove(
  db: Kysely<Database>,
  categoryId: string,
  newParentId: string | null
): Promise<boolean> {
  // Cannot be its own parent
  if (categoryId === newParentId) {
    return false
  }

  // Moving to root is always valid
  if (!newParentId) {
    return true
  }

  // Check if newParentId is a descendant of categoryId
  // If so, moving would create a circular reference
  const descendants = await getCategoryDescendantIds(db, categoryId)
  return !descendants.includes(newParentId)
}

/**
 * Get all descendant IDs of a category
 */
export async function getCategoryDescendantIds(
  db: Kysely<Database>,
  categoryId: string
): Promise<string[]> {
  const descendants = await db
    .withRecursive('category_descendants', (qb) =>
      qb
        .selectFrom('p_categories')
        .select('id')
        .where('parent_id', '=', categoryId)
        .where('deleted_at', 'is', null)
        .unionAll(
          qb
            .selectFrom('p_categories')
            .innerJoin('category_descendants', 'category_descendants.id', 'p_categories.parent_id')
            .select('p_categories.id')
            .where('p_categories.deleted_at', 'is', null)
        )
    )
    .selectFrom('category_descendants')
    .select('id')
    .execute()

  return descendants.map(d => d.id)
}

/**
 * Get the full path of ancestor IDs from a category to root
 */
export async function getCategoryPath(
  db: Kysely<Database>,
  categoryId: string
): Promise<string[]> {
  const path = await db
    .withRecursive('category_path', (qb) =>
      qb
        .selectFrom('p_categories')
        .select(['id', 'parent_id'])
        .where('id', '=', categoryId)
        .where('deleted_at', 'is', null)
        .unionAll(
          qb
            .selectFrom('p_categories')
            .innerJoin('category_path', 'category_path.parent_id', 'p_categories.id')
            .select(['p_categories.id', 'p_categories.parent_id'])
            .where('p_categories.deleted_at', 'is', null)
        )
    )
    .selectFrom('category_path')
    .select('id')
    .execute()

  return path.map(p => p.id)
}

/**
 * Build a tree structure from flat category data
 */
interface CategoryTreeNode {
  id: string
  name: string
  parent_id: string | null
  children: CategoryTreeNode[]
  [key: string]: any
}

export function buildCategoryTree<T extends { id: string; parent_id: string | null }>(
  categories: T[]
): (T & { children: any[] })[] {
  const categoryMap = new Map<string, T & { children: any[] }>()
  const roots: (T & { children: any[] })[] = []

  // First pass: create all nodes with children arrays
  for (const category of categories) {
    categoryMap.set(category.id, { ...category, children: [] })
  }

  // Second pass: build the tree
  for (const category of categories) {
    const node = categoryMap.get(category.id)!
    
    if (category.parent_id === null) {
      roots.push(node)
    } else {
      const parent = categoryMap.get(category.parent_id)
      if (parent) {
        parent.children.push(node)
      }
    }
  }

  return roots
}
