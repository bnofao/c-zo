/**
 * Product Options Table Query Builders
 * Provides type-safe helpers for p_options table operations
 */

import type { Insertable, Kysely, Selectable, Updateable } from 'kysely'
import type { Database } from '../types'

export type ProductOption = Selectable<Database['p_options']>
export type NewProductOption = Insertable<Database['p_options']>
export type ProductOptionUpdate = Updateable<Database['p_options']>

/**
 * Find option by ID
 */
export function findOptionById(db: Kysely<Database>, id: string) {
  return db
    .selectFrom('p_options')
    .selectAll()
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
}

/**
 * Find all options for a product
 */
export function findOptionsByProductId(db: Kysely<Database>, productId: string) {
  return db
    .selectFrom('p_options')
    .selectAll()
    .where('product_id', '=', productId)
    .where('deleted_at', 'is', null)
    .orderBy('title', 'asc')
}

/**
 * Check if option title exists for product (excluding given ID)
 */
export async function optionTitleExists(
  db: Kysely<Database>,
  productId: string,
  title: string,
  excludeId?: string
): Promise<boolean> {
  let query = db
    .selectFrom('p_options')
    .select('id')
    .where('product_id', '=', productId)
    .where('title', '=', title)
    .where('deleted_at', 'is', null)

  if (excludeId) {
    query = query.where('id', '!=', excludeId)
  }

  const result = await query.executeTakeFirst()
  return !!result
}

/**
 * Get active options (not deleted)
 */
export function activeOptions(db: Kysely<Database>) {
  return db
    .selectFrom('p_options')
    .selectAll()
    .where('deleted_at', 'is', null)
}

