import type { Database } from '@czo/product/database'
import type { Kysely } from 'kysely'

/**
 * Image service for managing product images
 */
export class ImageService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new image
   */
  async createImage(url: string, rank: number = 0) {
    const id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const image = await this.db
      .insertInto('images')
      .values({
        id,
        url,
        rank,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return image
  }

  /**
   * Get image by ID
   */
  async getImage(id: string) {
    const image = await this.db
      .selectFrom('images')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    return image || null
  }

  /**
   * Update image
   */
  async updateImage(
    id: string,
    url: string,
  ) {
    const image = await this.db
      .updateTable('images')
      .set({
        url,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst()

    if (!image) {
      throw new Error('Image not found')
    }

    return image
  }

  /**
   * Delete image (soft delete)
   */
  async deleteImage(id: string): Promise<{ success: boolean, deletedAt: Date }> {
    const deletedAt = new Date()

    const result = await this.db
      .updateTable('images')
      .set({ deleted_at: deletedAt })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (result.numUpdatedRows === 0n) {
      throw new Error('Image not found')
    }

    return { success: true, deletedAt }
  }

  /**
   * List all images
   */
  async listImages() {
    return this.db
      .selectFrom('images')
      .selectAll()
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute()
  }

  /**
   * Assign image to product (and optionally variant)
   */
  async assignImageToProduct(
    productId: string,
    imageId: string,
    variantId: string,
  ): Promise<void> {
    await this.db
      .insertInto('products_images')
      .values({
        product_id: productId,
        image_id: imageId,
        variant_id: variantId,
      })
      .execute()
  }

  /**
   * Remove image from product
   */
  async removeImageFromProduct(
    productId: string,
    imageId: string,
  ): Promise<void> {
    await this.db
      .deleteFrom('products_images')
      .where('product_id', '=', productId)
      .where('image_id', '=', imageId)
      .execute()
  }

  /**
   * Get images for a product
   */
  async getProductImages(productId: string) {
    return this.db
      .selectFrom('products_images')
      .innerJoin('images', 'images.id', 'products_images.image_id')
      .selectAll('images')
      .where('products_images.product_id', '=', productId)
      .where('images.deleted_at', 'is', null)
      .execute()
  }

  /**
   * Get images for a variant
   */
  async getVariantImages(variantId: string) {
    return this.db
      .selectFrom('products_images')
      .innerJoin('images', 'images.id', 'products_images.image_id')
      .selectAll('images')
      .where('products_images.variant_id', '=', variantId)
      .where('images.deleted_at', 'is', null)
      .execute()
  }

  /**
   * Set product thumbnail
   */
  async setProductThumbnail(
    productId: string,
    thumbnail: string,
  ): Promise<void> {
    await this.db
      .updateTable('products')
      .set({ thumbnail, updated_at: new Date() })
      .where('id', '=', productId)
      .execute()
  }

  /**
   * Set variant thumbnail
   */
  async setVariantThumbnail(
    variantId: string,
    thumbnail: string,
  ): Promise<void> {
    await this.db
      .updateTable('p_variants')
      .set({ thumbnail, updated_at: new Date() })
      .where('id', '=', variantId)
      .execute()
  }
}
