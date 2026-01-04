import type { Database } from '@czo/product/database'
import type { Kysely } from 'kysely'

/**
 * Option service for managing product options and their values
 */
export class OptionService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new product option
   */
  async createOption(productId: string, title: string) {
    const id = `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const option = await this.db
      .insertInto('p_options')
      .values({
        id,
        title,
        product_id: productId,
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return option
  }

  /**
   * Get option by ID
   */
  async getOption(id: string) {
    const option = await this.db
      .selectFrom('p_options')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    return option || null
  }

  /**
   * Update option
   */
  async updateOption(
    id: string,
    title: string,
  ) {
    const option = await this.db
      .updateTable('p_options')
      .set({
        title,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst()

    if (!option) {
      throw new Error('Option not found')
    }

    return option
  }

  /**
   * Delete option (soft delete)
   */
  async deleteOption(id: string): Promise<{ success: boolean, deletedAt: Date }> {
    const deletedAt = new Date()

    const result = await this.db
      .updateTable('p_options')
      .set({ deleted_at: deletedAt })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (result.numUpdatedRows === 0n) {
      throw new Error('Option not found')
    }

    return { success: true, deletedAt }
  }

  /**
   * List options for a product
   */
  async listProductOptions(productId: string) {
    return this.db
      .selectFrom('p_options')
      .selectAll()
      .where('product_id', '=', productId)
      .where('deleted_at', 'is', null)
      .orderBy('title', 'asc')
      .execute()
  }

  /**
   * List all options
   */
  async listOptions() {
    return this.db
      .selectFrom('p_options')
      .selectAll()
      .where('deleted_at', 'is', null)
      .orderBy('product_id', 'asc')
      .orderBy('title', 'asc')
      .execute()
  }

  /**
   * Create an option value
   */
  async createOptionValue(
    optionId: string,
    value: string,
  ) {
    const id = `optval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const optionValue = await this.db
      .insertInto('p_option_values')
      .values({
        id,
        value,
        option_id: optionId,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return optionValue
  }

  /**
   * Get option value by ID
   */
  async getOptionValue(id: string) {
    const value = await this.db
      .selectFrom('p_option_values')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    return value || null
  }

  /**
   * Get all values for an option
   */
  async getOptionValues(optionId: string) {
    return this.db
      .selectFrom('p_option_values')
      .selectAll()
      .where('option_id', '=', optionId)
      .where('deleted_at', 'is', null)
      .orderBy('value', 'asc')
      .execute()
  }

  /**
   * Update option value
   */
  async updateOptionValue(
    id: string,
    value: string,
  ) {
    const optionValue = await this.db
      .updateTable('p_option_values')
      .set({
        value,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst()

    if (!optionValue) {
      throw new Error('Option value not found')
    }

    return optionValue
  }

  /**
   * Delete option value (soft delete)
   */
  async deleteOptionValue(id: string): Promise<{ success: boolean, deletedAt: Date }> {
    const deletedAt = new Date()

    const result = await this.db
      .updateTable('p_option_values')
      .set({ deleted_at: deletedAt })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (result.numUpdatedRows === 0n) {
      throw new Error('Option value not found')
    }

    return { success: true, deletedAt }
  }

  /**
   * Assign option values to a variant
   */
  async assignOptionsToVariant(
    variantId: string,
    optionValueIds: string[],
  ): Promise<void> {
    // Remove existing associations
    await this.db
      .deleteFrom('p_variants_options')
      .where('variant_id', '=', variantId)
      .execute()

    // Add new associations
    if (optionValueIds.length > 0) {
      await this.db
        .insertInto('p_variants_options')
        .values(
          optionValueIds.map(optionValueId => ({
            variant_id: variantId,
            option_value_id: optionValueId,
          })),
        )
        .execute()
    }
  }

  /**
   * Get option values assigned to a variant
   */
  async getVariantOptions(variantId: string) {
    return this.db
      .selectFrom('p_variants_options')
      .innerJoin('p_option_values', 'p_option_values.id', 'p_variants_options.option_value_id')
      .selectAll('p_option_values')
      .where('p_variants_options.variant_id', '=', variantId)
      .where('p_option_values.deleted_at', 'is', null)
      .execute()
  }
}
