import type { Database } from '@czo/product/database'
import type { Kysely } from 'kysely'

/**
 * Tag service for managing product tags
 */
export class TagService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new tag
   */
  async createTag(value: string) {
    const id = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const tag = await this.db
      .insertInto('p_tags')
      .values({
        id,
        value,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return tag
  }

  /**
   * Get tag by ID
   */
  async getTag(id: string) {
    const tag = await this.db
      .selectFrom('p_tags')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    return tag || null
  }

  /**
   * Get tag by value
   */
  async getTagByValue(value: string) {
    const tag = await this.db
      .selectFrom('p_tags')
      .selectAll()
      .where('value', '=', value)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    return tag || null
  }

  /**
   * Update tag
   */
  async updateTag(
    id: string,
    value: string,
  ) {
    const tag = await this.db
      .updateTable('p_tags')
      .set({
        value,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst()

    if (!tag) {
      throw new Error('Tag not found')
    }

    return tag
  }

  /**
   * Delete tag (soft delete)
   */
  async deleteTag(id: string): Promise<{ success: boolean, deletedAt: Date }> {
    const deletedAt = new Date()

    const result = await this.db
      .updateTable('p_tags')
      .set({ deleted_at: deletedAt })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (result.numUpdatedRows === 0n) {
      throw new Error('Tag not found')
    }

    return { success: true, deletedAt }
  }

  /**
   * List all tags
   */
  async listTags() {
    return this.db
      .selectFrom('p_tags')
      .selectAll()
      .where('deleted_at', 'is', null)
      .orderBy('value', 'asc')
      .execute()
  }

  /**
   * Assign tags to a product
   */
  async assignTagsToProduct(
    productId: string,
    tagIds: string[],
  ): Promise<void> {
    // Remove existing associations
    await this.db
      .deleteFrom('products_tags')
      .where('product_id', '=', productId)
      .execute()

    // Add new associations
    if (tagIds.length > 0) {
      await this.db
        .insertInto('products_tags')
        .values(
          tagIds.map(tagId => ({
            product_id: productId,
            product_tag_id: tagId,
          })),
        )
        .execute()
    }
  }

  /**
   * Get tags for a product
   */
  async getProductTags(productId: string) {
    return this.db
      .selectFrom('products_tags')
      .innerJoin('p_tags', 'p_tags.id', 'products_tags.product_tag_id')
      .selectAll('p_tags')
      .where('products_tags.product_id', '=', productId)
      .where('p_tags.deleted_at', 'is', null)
      .execute()
  }
}
