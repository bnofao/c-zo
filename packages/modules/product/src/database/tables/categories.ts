import type { Insertable, Kysely, Selectable, Updateable } from 'kysely'
import type { Database } from '../types'

/**
 * Query builder utilities for p_categories table
 */

export type Category = Selectable<Database['pCategories']>
export type NewCategory = Insertable<Database['pCategories']>
export type CategoryUpdate = Updateable<Database['pCategories']>

/**
 * Get all active categories (not soft-deleted)
 */
export function activeCategories(db: Kysely<Database>) {
  return db
    .selectFrom('pCategories')
    .selectAll()
    .where('deletedAt', 'is', null)
}

/**
 * Get category by ID (only if not deleted)
 */
export async function findCategoryById(
  db: Kysely<Database>,
  id: string,
): Promise<Category | undefined> {
  return db
    .selectFrom('pCategories')
    .selectAll()
    .where('id', '=', id)
    .where('deletedAt', 'is', null)
    .executeTakeFirst()
}

/**
 * Get category by handle (only if not deleted)
 */
export async function findCategoryByHandle(
  db: Kysely<Database>,
  handle: string,
): Promise<Category | undefined> {
  return db
    .selectFrom('pCategories')
    .selectAll()
    .where('handle', '=', handle)
    .where('deletedAt', 'is', null)
    .executeTakeFirst()
}

/**
 * Get direct children of a category
 */
export async function findChildCategories(
  db: Kysely<Database>,
  parentId: string,
): Promise<Category[]> {
  return db
    .selectFrom('pCategories')
    .selectAll()
    .where('parentId', '=', parentId)
    .where('deletedAt', 'is', null)
    .orderBy('rank', 'asc')
    .execute()
}

/**
 * Get all root categories (no parent)
 */
export async function findRootCategories(
  db: Kysely<Database>,
): Promise<Category[]> {
  return db
    .selectFrom('pCategories')
    .selectAll()
    .where('parentId', 'is', null)
    .where('deletedAt', 'is', null)
    .orderBy('rank', 'asc')
    .execute()
}

/**
 * Check if handle exists (excluding soft-deleted)
 */
export async function categoryHandleExists(
  db: Kysely<Database>,
  handle: string,
  excludeId?: string,
): Promise<boolean> {
  let query = db
    .selectFrom('pCategories')
    .select('id')
    .where('handle', '=', handle)
    .where('deletedAt', 'is', null)

  if (excludeId) {
    query = query.where('id', '!=', excludeId)
  }

  const result = await query.executeTakeFirst()
  return result !== undefined
}
