import type { Database } from '@czo/product/database'
import type { Kysely } from 'kysely'

/**
 * Type service for managing product types
 */
export class TypeService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new type
   */
  async createType(value: string) {
    const id = `typ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const type = await this.db
      .insertInto('p_types')
      .values({
        id,
        value,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return type
  }

  /**
   * Get type by ID
   */
  async getType(id: string) {
    const type = await this.db
      .selectFrom('p_types')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    return type || null
  }

  /**
   * Get type by value
   */
  async getTypeByValue(value: string) {
    const type = await this.db
      .selectFrom('p_types')
      .selectAll()
      .where('value', '=', value)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    return type || null
  }

  /**
   * Update type
   */
  async updateType(
    id: string,
    value: string,
  ) {
    const type = await this.db
      .updateTable('p_types')
      .set({
        value,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst()

    if (!type) {
      throw new Error('Type not found')
    }

    return type
  }

  /**
   * Delete type (soft delete)
   */
  async deleteType(id: string): Promise<{ success: boolean, deletedAt: Date }> {
    const deletedAt = new Date()

    const result = await this.db
      .updateTable('p_types')
      .set({ deleted_at: deletedAt })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (result.numUpdatedRows === 0n) {
      throw new Error('Type not found')
    }

    return { success: true, deletedAt }
  }

  /**
   * List all types
   */
  async listTypes() {
    return this.db
      .selectFrom('p_types')
      .selectAll()
      .where('deleted_at', 'is', null)
      .orderBy('value', 'asc')
      .execute()
  }
}
