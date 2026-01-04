/**
 * Product Tags Table Query Builders
 * Provides type-safe helpers for p_tags table operations
 */

import type { Insertable, Kysely, Selectable, Updateable   } from 'kysely'
import type { Database } from '../types'

export type ProductTag = Selectable<Database['p_tags']>
export type NewProductTag = Insertable<Database['p_tags']>
export type ProductTagUpdate = Updateable<Database['p_tags']>

/**
 * Find tag by ID
 */
export function findTagById(db: Kysely<Database>, id: string) {
  return db
    .selectFrom('p_tags')
    .selectAll()
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
}

/**
 * Find tag by value
 */
export function findTagByValue(db: Kysely<Database>, value: string) {
  return db
    .selectFrom('p_tags')
    .selectAll()
    .where('value', '=', value)
    .where('deleted_at', 'is', null)
}

/**
 * Check if tag value exists (excluding given ID)
 */
export async function tagValueExists(
  db: Kysely<Database>,
  value: string,
  excludeId?: string
): Promise<boolean> {
  let query = db
    .selectFrom('p_tags')
    .select('id')
    .where('value', '=', value)
    .where('deleted_at', 'is', null)

  if (excludeId) {
    query = query.where('id', '!=', excludeId)
  }

  const result = await query.executeTakeFirst()
  return !!result
}

/**
 * Get active tags (not deleted)
 */
export function activeTags(db: Kysely<Database>) {
  return db
    .selectFrom('p_tags')
    .selectAll()
    .where('deleted_at', 'is', null)
    .orderBy('value', 'asc')
}

/**
 * Find tags assigned to a product
 */
export function findProductTags(db: Kysely<Database>, productId: string) {
  return db
    .selectFrom('products_tags')
    .innerJoin('p_tags', 'p_tags.id', 'products_tags.product_tag_id')
    .selectAll('p_tags')
    .where('products_tags.product_id', '=', productId)
    .where('p_tags.deleted_at', 'is', null)
    .orderBy('p_tags.value', 'asc')
}

