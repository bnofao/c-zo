/**
 * Product Types Table Query Builders
 * Provides type-safe helpers for p_types table operations
 */

import type { Insertable, Kysely, Selectable, Updateable } from 'kysely'
import type { Database } from '../types'

export type ProductType = Selectable<Database['p_types']>
export type NewProductType = Insertable<Database['p_types']>
export type ProductTypeUpdate = Updateable<Database['p_types']>

/**
 * Find type by ID
 */
export function findTypeById(db: Kysely<Database>, id: string) {
  return db
    .selectFrom('p_types')
    .selectAll()
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
}

/**
 * Find type by value
 */
export function findTypeByValue(db: Kysely<Database>, value: string) {
  return db
    .selectFrom('p_types')
    .selectAll()
    .where('value', '=', value)
    .where('deleted_at', 'is', null)
}

/**
 * Check if type value exists (excluding given ID)
 */
export async function typeValueExists(
  db: Kysely<Database>,
  value: string,
  excludeId?: string
): Promise<boolean> {
  let query = db
    .selectFrom('p_types')
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
 * Get active types (not deleted)
 */
export function activeTypes(db: Kysely<Database>) {
  return db
    .selectFrom('p_types')
    .selectAll()
    .where('deleted_at', 'is', null)
    .orderBy('value', 'asc')
}

/**
 * Find products by type
 */
export function findProductsByType(db: Kysely<Database>, typeId: string) {
  return db
    .selectFrom('products')
    .selectAll()
    .where('type_id', '=', typeId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'desc')
}

/**
 * Count products using this type
 */
export async function countProductsByType(
  db: Kysely<Database>,
  typeId: string
): Promise<number> {
  const result = await db
    .selectFrom('products')
    .select(({ fn }) => fn.countAll().as('count'))
    .where('type_id', '=', typeId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()

  return Number(result?.count || 0)
}

