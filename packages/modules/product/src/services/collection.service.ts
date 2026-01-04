import type { Database, ProductCollection, ProductCollectionUpdate } from '@czo/product/database'
import type { Kysely } from 'kysely'
import { generateUniqueHandle } from '@czo/product/utils'

/**
 * Collection service for managing product collections
 */
export class CollectionService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new collection
   */
  async createCollection(
    title: string,
    handle?: string,
  ): Promise<ProductCollection> {
    const generatedHandle = await generateUniqueHandle(
      this.db,
      'p_collections',
      title,
      handle,
    )

    const id = `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const collection = await this.db
      .insertInto('p_collections')
      .values({
        id,
        title,
        handle: generatedHandle,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return collection
  }

  /**
   * Get collection by ID
   */
  async getCollection(id: string): Promise<ProductCollection | null> {
    const collection = await this.db
      .selectFrom('p_collections')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    return collection || null
  }

  /**
   * Get collection by handle
   */
  async getCollectionByHandle(handle: string): Promise<ProductCollection | null> {
    const collection = await this.db
      .selectFrom('p_collections')
      .selectAll()
      .where('handle', '=', handle)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    return collection || null
  }

  /**
   * Update collection
   */
  async updateCollection(
    id: string,
    title?: string,
    handle?: string,
  ): Promise<ProductCollection> {
    const updateData: ProductCollectionUpdate = {
      updated_at: new Date(),
    }

    if (title !== undefined)
      updateData.title = title
    if (handle !== undefined)
      updateData.handle = handle

    const collection = await this.db
      .updateTable('p_collections')
      .set(updateData)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst()

    if (!collection) {
      throw new Error('Collection not found')
    }

    return collection
  }

  /**
   * Delete collection (soft delete)
   */
  async deleteCollection(id: string): Promise<{ success: boolean, deletedAt: Date }> {
    const deletedAt = new Date()

    const result = await this.db
      .updateTable('p_collections')
      .set({ deleted_at: deletedAt })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (result.numUpdatedRows === 0n) {
      throw new Error('Collection not found')
    }

    return { success: true, deletedAt }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<ProductCollection[]> {
    return this.db
      .selectFrom('p_collections')
      .selectAll()
      .where('deleted_at', 'is', null)
      .orderBy('title', 'asc')
      .execute()
  }
}
