import type { Kysely } from 'kysely'
import type { Database } from '../types'

/**
 * Query composition for loading variants with their option values
 * This will be fully implemented in User Story 4 (Product Options)
 */

export async function getVariantWithOptions(
  db: Kysely<Database>,
  variantId: string,
) {
  // Placeholder - will be implemented in US4
  const variant = await db
    .selectFrom('p_variants')
    .selectAll()
    .where('id', '=', variantId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()

  return variant
}

export async function getVariantsWithOptions(
  db: Kysely<Database>,
  productId: string,
) {
  // Placeholder - will be implemented in US4
  const variants = await db
    .selectFrom('p_variants')
    .selectAll()
    .where('product_id', '=', productId)
    .where('deleted_at', 'is', null)
    .orderBy('variant_rank', 'asc')
    .execute()

  return variants
}
