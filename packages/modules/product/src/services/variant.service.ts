import type { Database, NewVariant, Variant, VariantUpdate } from '@czo/product/database'
import type { Kysely } from 'kysely'
import { barcodeExists, eanExists, findVariantById, findVariantsByProductId, skuExists, upcExists } from '@czo/product/database'
import { mapToDatabase, softDelete } from '@czo/product/utils'
import {

  validateCreateVariant,
  validateUpdateVariant,
} from '@czo/product/validators'

/**
 * Variant service handling business logic for variant management
 */
export class VariantService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new product variant
   */
  async createVariant(
    productId: string,
    input: unknown,
  ): Promise<Variant> {
    // Validate input with Zod
    const validatedInput = validateCreateVariant(input)

    // Check for duplicate identifiers
    if (validatedInput.sku) {
      const exists = await skuExists(this.db, validatedInput.sku)
      if (exists) {
        throw new Error(`SKU "${validatedInput.sku}" already exists`)
      }
    }

    if (validatedInput.barcode) {
      const exists = await barcodeExists(this.db, validatedInput.barcode)
      if (exists) {
        throw new Error(`Barcode "${validatedInput.barcode}" already exists`)
      }
    }

    if (validatedInput.ean) {
      const exists = await eanExists(this.db, validatedInput.ean)
      if (exists) {
        throw new Error(`EAN "${validatedInput.ean}" already exists`)
      }
    }

    if (validatedInput.upc) {
      const exists = await upcExists(this.db, validatedInput.upc)
      if (exists) {
        throw new Error(`UPC "${validatedInput.upc}" already exists`)
      }
    }

    // Generate ID
    const id = `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Transform validated input to database format
    const variantData: NewVariant = {
      id,
      product_id: productId,
      ...mapToDatabase(validatedInput, {
        allowBackorder: false,
        manageInventory: true,
        variantRank: 0,
      }),
      metadata: validatedInput.metadata ? JSON.parse(JSON.stringify(validatedInput.metadata)) : null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    }

    // Insert variant
    const variant = await this.db
      .insertInto('p_variants')
      .values(variantData)
      .returningAll()
      .executeTakeFirstOrThrow()

    return variant
  }

  /**
   * Update an existing variant with optimistic locking
   */
  async updateVariant(
    id: string,
    input: unknown,
  ): Promise<Variant> {
    // Validate input with Zod
    const validatedInput = validateUpdateVariant(input)

    // Check for duplicate identifiers (excluding current variant)
    if (validatedInput.sku) {
      const exists = await skuExists(this.db, validatedInput.sku, id)
      if (exists) {
        throw new Error(`SKU "${validatedInput.sku}" already exists`)
      }
    }

    if (validatedInput.barcode) {
      const exists = await barcodeExists(this.db, validatedInput.barcode, id)
      if (exists) {
        throw new Error(`Barcode "${validatedInput.barcode}" already exists`)
      }
    }

    if (validatedInput.ean) {
      const exists = await eanExists(this.db, validatedInput.ean, id)
      if (exists) {
        throw new Error(`EAN "${validatedInput.ean}" already exists`)
      }
    }

    if (validatedInput.upc) {
      const exists = await upcExists(this.db, validatedInput.upc, id)
      if (exists) {
        throw new Error(`UPC "${validatedInput.upc}" already exists`)
      }
    }

    // Transform to database format
    const updateData: VariantUpdate = {
      ...mapToDatabase(validatedInput),
      metadata: validatedInput.metadata !== undefined
        ? JSON.parse(JSON.stringify(validatedInput.metadata))
        : undefined,
      updated_at: new Date(),
    }

    // Update with optimistic locking
    const result = await this.db
      .updateTable('p_variants')
      .set(updateData)
      .where('id', '=', id)
      .where('updated_at', '=', validatedInput.expectedUpdatedAt)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst()

    if (!result) {
      throw new Error('Variant was modified by another request or not found')
    }

    return result
  }

  /**
   * Get a single variant by ID
   */
  async getVariant(id: string): Promise<Variant | null> {
    const variant = await findVariantById(this.db, id)
    return variant || null
  }

  /**
   * Get all variants for a product
   */
  async getVariantsByProductId(productId: string): Promise<Variant[]> {
    return findVariantsByProductId(this.db, productId)
  }

  /**
   * Soft-delete a variant
   */
  async deleteVariant(id: string): Promise<{
    success: boolean
    deletedAt: Date
  }> {
    const result = await softDelete<Variant>(this.db, 'p_variants', id)

    if (!result) {
      throw new Error('Variant not found or already deleted')
    }

    return {
      success: true,
      deletedAt: result.deleted_at!,
    }
  }
}
