import type { Insertable, Kysely, Selectable, Updateable } from 'kysely'
import type { Database } from '../types'

/**
 * Query builder utilities for p_variants table
 */

export type Variant = Selectable<Database['p_variants']>
export type NewVariant = Insertable<Database['p_variants']>
export type VariantUpdate = Updateable<Database['p_variants']>

/**
 * Get all active variants (not soft-deleted)
 */
export function activeVariants(db: Kysely<Database>) {
  return db
    .selectFrom('p_variants')
    .selectAll()
    .where('deleted_at', 'is', null)
}

/**
 * Get variant by ID (only if not deleted)
 */
export async function findVariantById(
  db: Kysely<Database>,
  id: string,
): Promise<Variant | undefined> {
  return db
    .selectFrom('p_variants')
    .selectAll()
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
}

/**
 * Get all variants for a product
 */
export async function findVariantsByProductId(
  db: Kysely<Database>,
  productId: string,
): Promise<Variant[]> {
  return db
    .selectFrom('p_variants')
    .selectAll()
    .where('product_id', '=', productId)
    .where('deleted_at', 'is', null)
    .orderBy('variant_rank', 'asc')
    .execute()
}

/**
 * Check if SKU exists (excluding soft-deleted)
 */
export async function skuExists(
  db: Kysely<Database>,
  sku: string,
  excludeId?: string,
): Promise<boolean> {
  let query = db
    .selectFrom('p_variants')
    .select('id')
    .where('sku', '=', sku)
    .where('deleted_at', 'is', null)

  if (excludeId) {
    query = query.where('id', '!=', excludeId)
  }

  const result = await query.executeTakeFirst()
  return result !== undefined
}

/**
 * Check if barcode exists (excluding soft-deleted)
 */
export async function barcodeExists(
  db: Kysely<Database>,
  barcode: string,
  excludeId?: string,
): Promise<boolean> {
  let query = db
    .selectFrom('p_variants')
    .select('id')
    .where('barcode', '=', barcode)
    .where('deleted_at', 'is', null)

  if (excludeId) {
    query = query.where('id', '!=', excludeId)
  }

  const result = await query.executeTakeFirst()
  return result !== undefined
}

/**
 * Check if EAN exists (excluding soft-deleted)
 */
export async function eanExists(
  db: Kysely<Database>,
  ean: string,
  excludeId?: string,
): Promise<boolean> {
  let query = db
    .selectFrom('p_variants')
    .select('id')
    .where('ean', '=', ean)
    .where('deleted_at', 'is', null)

  if (excludeId) {
    query = query.where('id', '!=', excludeId)
  }

  const result = await query.executeTakeFirst()
  return result !== undefined
}

/**
 * Check if UPC exists (excluding soft-deleted)
 */
export async function upcExists(
  db: Kysely<Database>,
  upc: string,
  excludeId?: string,
): Promise<boolean> {
  let query = db
    .selectFrom('p_variants')
    .select('id')
    .where('upc', '=', upc)
    .where('deleted_at', 'is', null)

  if (excludeId) {
    query = query.where('id', '!=', excludeId)
  }

  const result = await query.executeTakeFirst()
  return result !== undefined
}
