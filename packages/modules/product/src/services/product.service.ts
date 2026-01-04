import type { Database, NewProduct, Product, ProductUpdate } from '@czo/product/database'
import type { Kysely } from 'kysely'
import { activeProducts, findProductByHandle, findProductById } from '@czo/product/database'
import { generateUniqueHandle, mapToDatabase, softDelete } from '@czo/product/utils'
import {

  sanitizeMetadata,

  validateCreateProduct,
  validateUpdateProduct,
} from '@czo/product/validators'

/**
 * Product service handling business logic for product management
 */
export class ProductService {
  constructor(private db: Kysely<Database>) {}

  /**
   * Create a new product
   */
  async createProduct(input: unknown): Promise<Product> {
    // Validate input with Zod
    const validatedInput = validateCreateProduct(input)

    // Generate unique handle
    const handle = await generateUniqueHandle(
      this.db,
      'products',
      validatedInput.title,
      validatedInput.handle,
    )

    // Generate ID (simple implementation - could use UUID library)
    const id = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Transform validated input to database format
    const productData: NewProduct = {
      id,
      ...mapToDatabase(validatedInput, {
        isGiftcard: false,
        status: 'draft',
        discountable: true,
      }),
      handle, // Override with generated handle
      metadata: sanitizeMetadata(validatedInput.metadata),
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    }

    // Insert product
    const product = await this.db
      .insertInto('products')
      .values(productData)
      .returningAll()
      .executeTakeFirstOrThrow()

    return product
  }

  /**
   * Update an existing product with optimistic locking
   */
  async updateProduct(
    id: string,
    input: unknown,
  ): Promise<Product> {
    // Validate input with Zod
    const validatedInput = validateUpdateProduct(input)

    // Transform to database format (filters out undefined, converts camelCase to snake_case)
    const updateData: ProductUpdate = {
      ...mapToDatabase(validatedInput),
      metadata: validatedInput.metadata !== undefined
        ? sanitizeMetadata(validatedInput.metadata)
        : undefined,
      updated_at: new Date(),
    }

    // Update with optimistic locking
    const result = await this.db
      .updateTable('products')
      .set(updateData)
      .where('id', '=', id)
      .where('updated_at', '=', validatedInput.expectedUpdatedAt)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst()

    if (!result) {
      throw new Error('Product was modified by another request or not found')
    }

    return result
  }

  /**
   * Get a single product by ID
   */
  async getProduct(id: string): Promise<Product | null> {
    const product = await findProductById(this.db, id)
    return product || null
  }

  /**
   * Get a product by handle
   */
  async getProductByHandle(handle: string): Promise<Product | null> {
    const product = await findProductByHandle(this.db, handle)
    return product || null
  }

  /**
   * List products with filtering, sorting, and pagination
   */
  async listProducts(options: {
    filter?: {
      status?: 'draft' | 'proposed' | 'published' | 'rejected'
      collectionId?: string
      typeId?: string
      isGiftcard?: boolean
      discountable?: boolean
      search?: string
    }
    sort?: {
      field: 'TITLE' | 'CREATED_AT' | 'UPDATED_AT' | 'STATUS'
      direction?: 'ASC' | 'DESC'
    }
    pagination?: {
      limit?: number
      offset?: number
    }
  } = {}): Promise<{
    nodes: Product[]
    totalCount: number
    pageInfo: {
      hasNextPage: boolean
      hasPreviousPage: boolean
    }
  }> {
    // Helper to apply filters to a query
    const applyFilters = (query: any) => {
      let filteredQuery = query

      if (options.filter) {
        if (options.filter.status) {
          filteredQuery = filteredQuery.where('status', '=', options.filter.status)
        }
        if (options.filter.collectionId) {
          filteredQuery = filteredQuery.where('collection_id', '=', options.filter.collectionId)
        }
        if (options.filter.typeId) {
          filteredQuery = filteredQuery.where('type_id', '=', options.filter.typeId)
        }
        if (options.filter.isGiftcard !== undefined) {
          filteredQuery = filteredQuery.where('is_giftcard', '=', options.filter.isGiftcard)
        }
        if (options.filter.discountable !== undefined) {
          filteredQuery = filteredQuery.where('discountable', '=', options.filter.discountable)
        }
        if (options.filter.search) {
          filteredQuery = filteredQuery.where((eb: any) =>
            eb.or([
              eb('title', 'ilike', `%${options.filter!.search}%`),
              eb('description', 'ilike', `%${options.filter!.search}%`),
              eb('handle', 'ilike', `%${options.filter!.search}%`),
            ]),
          )
        }
      }

      return filteredQuery
    }

    // Get total count with a separate query
    let countQuery = this.db
      .selectFrom('products')
      .where('deleted_at', 'is', null)

    countQuery = applyFilters(countQuery)

    const countResult = await countQuery
      .select(eb => eb.fn.countAll().as('count'))
      .executeTakeFirst()
    const totalCount = Number(countResult?.count || 0)

    // Build query for fetching results
    let query = activeProducts(this.db)
    query = applyFilters(query)

    // Apply sorting
    if (options.sort) {
      const sortField = options.sort.field.toLowerCase()
      const direction = options.sort.direction || 'ASC'

      if (sortField === 'title') {
        query = query.orderBy('title', direction.toLowerCase() as any)
      }
      else if (sortField === 'created_at') {
        query = query.orderBy('created_at', direction.toLowerCase() as any)
      }
      else if (sortField === 'updated_at') {
        query = query.orderBy('updated_at', direction.toLowerCase() as any)
      }
      else if (sortField === 'status') {
        query = query.orderBy('status', direction.toLowerCase() as any)
      }
    }
    else {
      // Default sort by created_at desc
      query = query.orderBy('created_at', 'desc')
    }

    // Apply pagination
    const limit = Math.min(options.pagination?.limit || 50, 100)
    const offset = options.pagination?.offset || 0

    const nodes = await query
      .limit(limit)
      .offset(offset)
      .execute()

    return {
      nodes,
      totalCount,
      pageInfo: {
        hasNextPage: offset + nodes.length < totalCount,
        hasPreviousPage: offset > 0,
      },
    }
  }

  /**
   * Soft-delete a product
   */
  async deleteProduct(id: string): Promise<{
    success: boolean
    deletedAt: Date
  }> {
    const result = await softDelete<Product>(this.db, 'products', id)

    if (!result) {
      throw new Error('Product not found or already deleted')
    }

    return {
      success: true,
      deletedAt: result.deleted_at!,
    }
  }
}
