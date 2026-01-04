import type { Kysely } from 'kysely'
import type { Category } from '../tables/categories'
import type { Database } from '../types'

/**
 * Get category tree using recursive CTE
 */
export async function getCategoryTree(
  db: Kysely<Database>,
  rootCategoryId?: string,
): Promise<Category[]> {
  if (!rootCategoryId) {
    // Get all root categories and their descendants
    const roots = await db
      .selectFrom('p_categories')
      .selectAll()
      .where('parent_id', 'is', null)
      .where('deleted_at', 'is', null)
      .execute()

    // For each root, get full tree
    const allTrees: Category[] = []
    for (const root of roots) {
      const tree = await getCategoryTreeFromRoot(db, root.id)
      allTrees.push(...tree)
    }

    return allTrees
  }

  return getCategoryTreeFromRoot(db, rootCategoryId)
}

/**
 * Get category tree from a specific root
 */
async function getCategoryTreeFromRoot(
  db: Kysely<Database>,
  rootId: string,
): Promise<Category[]> {
  return db
    .withRecursive('category_tree', qb =>
      qb
        .selectFrom('p_categories')
        .selectAll()
        .where('id', '=', rootId)
        .where('deleted_at', 'is', null)
        .unionAll(
          qb
            .selectFrom('p_categories as c')
            .innerJoin('category_tree as ct', 'c.parent_id', 'ct.id')
            .selectAll('c')
            .where('c.deleted_at', 'is', null),
        ))
    .selectFrom('category_tree')
    .selectAll()
    .execute()
}

/**
 * Get all descendant categories of a category
 */
export async function getCategoryDescendants(
  db: Kysely<Database>,
  categoryId: string,
): Promise<Category[]> {
  return db
    .withRecursive('category_descendants', qb =>
      qb
        .selectFrom('p_categories')
        .selectAll()
        .where('parent_id', '=', categoryId)
        .where('deleted_at', 'is', null)
        .unionAll(
          qb
            .selectFrom('p_categories as c')
            .innerJoin('category_descendants as cd', 'c.parent_id', 'cd.id')
            .selectAll('c')
            .where('c.deleted_at', 'is', null),
        ))
    .selectFrom('category_descendants')
    .selectAll()
    .execute()
}

/**
 * Get path from root to category
 */
export async function getCategoryAncestors(
  db: Kysely<Database>,
  categoryId: string,
): Promise<Category[]> {
  const result = await db
    .withRecursive('category_path', qb =>
      qb
        .selectFrom('p_categories')
        .selectAll()
        .where('id', '=', categoryId)
        .where('deleted_at', 'is', null)
        .unionAll(
          qb
            .selectFrom('p_categories as c')
            .innerJoin('category_path as cp', 'c.id', 'cp.parent_id')
            .selectAll('c')
            .where('c.deleted_at', 'is', null),
        ))
    .selectFrom('category_path')
    .selectAll()
    .execute()

  return result.reverse() // Root to leaf order
}
