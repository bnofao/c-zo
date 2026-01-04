import type { Insertable, Kysely, Selectable, Updateable } from 'kysely'
import type { Database } from '../types'

/**
 * Query builder utilities for products table
 */

export type Product = Selectable<Database['products']>
export type NewProduct = Insertable<Database['products']>
export type ProductUpdate = Updateable<Database['products']>

/**
 * Get all active products (not soft-deleted)
 */
export function activeProducts(db: Kysely<Database>) {
  return db
    .selectFrom('products')
    .selectAll()
    .where('deleted_at', 'is', null)
}

/**
 * Get product by ID (only if not deleted)
 */
export async function findProductById(
  db: Kysely<Database>,
  id: string,
): Promise<Product | undefined> {
  return db
    .selectFrom('products')
    .selectAll()
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
}

/**
 * Get product by handle (only if not deleted)
 */
export async function findProductByHandle(
  db: Kysely<Database>,
  handle: string,
): Promise<Product | undefined> {
  return db
    .selectFrom('products')
    .selectAll()
    .where('handle', '=', handle)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
}

/**
 * Check if handle exists (excluding soft-deleted)
 */
export async function handleExists(
  db: Kysely<Database>,
  handle: string,
  excludeId?: string,
): Promise<boolean> {
  let query = db
    .selectFrom('products')
    .select('id')
    .where('handle', '=', handle)
    .where('deleted_at', 'is', null)

  if (excludeId) {
    query = query.where('id', '!=', excludeId)
  }

  const result = await query.executeTakeFirst()
  return result !== undefined
}
