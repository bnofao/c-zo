/**
 * Product Collections Table Query Builders
 * Provides type-safe helpers for p_collections table operations
 */

import type { Insertable, Kysely, Selectable, Updateable } from 'kysely'
import type { Database } from '../types'

export type ProductCollection = Selectable<Database['p_collections']>
export type NewProductCollection = Insertable<Database['p_collections']>
export type ProductCollectionUpdate = Updateable<Database['p_collections']>

/**
 * Find collection by ID
 */
export function findCollectionById(db: Kysely<Database>, id: string) {
  return db
    .selectFrom('p_collections')
    .selectAll()
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
}

/**
 * Find collection by handle
 */
export function findCollectionByHandle(db: Kysely<Database>, handle: string) {
  return db
    .selectFrom('p_collections')
    .selectAll()
    .where('handle', '=', handle)
    .where('deleted_at', 'is', null)
}

/**
 * Check if collection handle exists (excluding given ID)
 */
export async function collectionHandleExists(
  db: Kysely<Database>,
  handle: string,
  excludeId?: string
): Promise<boolean> {
  let query = db
    .selectFrom('p_collections')
    .select('id')
    .where('handle', '=', handle)
    .where('deleted_at', 'is', null)

  if (excludeId) {
    query = query.where('id', '!=', excludeId)
  }

  const result = await query.executeTakeFirst()
  return !!result
}

/**
 * Get active collections (not deleted)
 */
export function activeCollections(db: Kysely<Database>) {
  return db
    .selectFrom('p_collections')
    .selectAll()
    .where('deleted_at', 'is', null)
    .orderBy('title', 'asc')
}

/**
 * Find products in a collection
 */
export function findProductsByCollectionId(db: Kysely<Database>, collectionId: string) {
  return db
    .selectFrom('products')
    .selectAll()
    .where('collection_id', '=', collectionId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'desc')
}

