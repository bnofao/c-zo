/**
 * Product Option Values Table Query Builders
 * Provides type-safe helpers for p_option_values table operations
 */

import type { Insertable, Kysely, Selectable, Updateable } from 'kysely'
import type { Database } from '../types'

export type OptionValue = Selectable<Database['p_option_values']>
export type NewOptionValue = Insertable<Database['p_option_values']>
export type OptionValueUpdate = Updateable<Database['p_option_values']>

/**
 * Find option value by ID
 */
export function findOptionValueById(db: Kysely<Database>, id: string) {
  return db
    .selectFrom('p_option_values')
    .selectAll()
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
}

/**
 * Find all values for an option
 */
export function findValuesByOptionId(db: Kysely<Database>, optionId: string) {
  return db
    .selectFrom('p_option_values')
    .selectAll()
    .where('option_id', '=', optionId)
    .where('deleted_at', 'is', null)
    .orderBy('value', 'asc')
}

/**
 * Check if option value exists for option (excluding given ID)
 */
export async function optionValueExists(
  db: Kysely<Database>,
  optionId: string,
  value: string,
  excludeId?: string
): Promise<boolean> {
  let query = db
    .selectFrom('p_option_values')
    .select('id')
    .where('option_id', '=', optionId)
    .where('value', '=', value)
    .where('deleted_at', 'is', null)

  if (excludeId) {
    query = query.where('id', '!=', excludeId)
  }

  const result = await query.executeTakeFirst()
  return !!result
}

/**
 * Get active option values (not deleted)
 */
export function activeOptionValues(db: Kysely<Database>) {
  return db
    .selectFrom('p_option_values')
    .selectAll()
    .where('deleted_at', 'is', null)
}

/**
 * Find option values assigned to a variant
 */
export function findVariantOptionValues(db: Kysely<Database>, variantId: string) {
  return db
    .selectFrom('p_variants_options')
    .innerJoin('p_option_values', 'p_option_values.id', 'p_variants_options.option_value_id')
    .selectAll('p_option_values')
    .where('p_variants_options.variant_id', '=', variantId)
    .where('p_option_values.deleted_at', 'is', null)
}

