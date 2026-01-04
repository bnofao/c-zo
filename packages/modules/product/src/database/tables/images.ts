/**
 * Product Images Table Query Builders
 * Provides type-safe helpers for images table operations
 */

import type { Insertable, Kysely, Selectable, Updateable } from 'kysely'
import type { Database } from '../types'

export type ProductImage = Selectable<Database['images']>
export type NewProductImage = Insertable<Database['images']>
export type ProductImageUpdate = Updateable<Database['images']>

/**
 * Find image by ID
 */
export function findImageById(db: Kysely<Database>, id: string) {
  return db
    .selectFrom('images')
    .selectAll()
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
}

/**
 * Get active images (not deleted)
 */
export function activeImages(db: Kysely<Database>) {
  return db
    .selectFrom('images')
    .selectAll()
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'desc')
}

/**
 * Find images assigned to a product
 */
export function findProductImages(db: Kysely<Database>, productId: string) {
  return db
    .selectFrom('products_images')
    .innerJoin('images', 'images.id', 'products_images.image_id')
    .selectAll('images')
    .where('products_images.product_id', '=', productId)
    .where('images.deleted_at', 'is', null)
    .orderBy('images.created_at', 'asc')
}

/**
 * Find images assigned to a variant
 */
export function findVariantImages(db: Kysely<Database>, variantId: string) {
  return db
    .selectFrom('products_images')
    .innerJoin('images', 'images.id', 'products_images.image_id')
    .selectAll('images')
    .where('products_images.variant_id', '=', variantId)
    .where('images.deleted_at', 'is', null)
    .orderBy('images.created_at', 'asc')
}

/**
 * Check if image is assigned to a product
 */
export async function isImageAssignedToProduct(
  db: Kysely<Database>,
  imageId: string,
  productId: string,
): Promise<boolean> {
  const result = await db
    .selectFrom('products_images')
    .select('image_id')
    .where('image_id', '=', imageId)
    .where('product_id', '=', productId)
    .executeTakeFirst()

  return !!result
}

/**
 * Check if image is assigned to a variant
 */
export async function isImageAssignedToVariant(
  db: Kysely<Database>,
  imageId: string,
  variantId: string,
): Promise<boolean> {
  const result = await db
    .selectFrom('products_images')
    .select('image_id')
    .where('image_id', '=', imageId)
    .where('variant_id', '=', variantId)
    .executeTakeFirst()

  return !!result
}
