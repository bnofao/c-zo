import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { BaseConfig, BaseEntity } from './types'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { NotFoundError, OptimisticLockError } from './errors'
import { generateId } from './utils'

/**
 * Input type for update operations requiring optimistic locking
 */
export interface UpdateWithVersion<T> {
  data: Partial<T>
  expectedVersion: number
}

/**
 * Result of a delete operation
 */
export interface DeleteResult {
  success: boolean
  deletedAt: Date
}

/**
 * Create mutation functions for a repository
 *
 * @example
 * ```ts
 * const mutations = createMutations<Product, CreateProductInput, UpdateProductInput, typeof products>(
 *   db,
 *   { table: products, softDelete: true }
 * )
 *
 * const product = await mutations.create({ title: 'New Product' })
 * await mutations.delete(product.id)
 * ```
 */
export function createMutations<
  T extends BaseEntity,
  CreateInput,
  UpdateInput,
  TTable extends PgTable,
>(
  db: NodePgDatabase<Record<string, unknown>>,
  config: BaseConfig<TTable>,
) {
  const { table, softDelete = true } = config

  // Get column references from table
  const tableColumns = table as unknown as Record<string, { name: string }>
  const deletedAtColumn = tableColumns.deletedAt

  /**
   * Create a new entity
   */
  const create = async (input: CreateInput): Promise<T> => {
    const now = new Date()
    const id = generateId()

    const result = await db
      .insert(table)
      .values({
        ...(input as Record<string, unknown>),
        id,
        version: 1,
        createdAt: now,
        updatedAt: now,
        ...(softDelete && { deletedAt: null }),
      } as Record<string, unknown>)
      .returning()

    return result[0] as T
  }

  /**
   * Create multiple entities in a single batch
   */
  const createMany = async (inputs: CreateInput[]): Promise<T[]> => {
    if (inputs.length === 0)
      return []

    const now = new Date()

    const values = inputs.map(input => ({
      ...(input as Record<string, unknown>),
      id: generateId(),
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...(softDelete && { deletedAt: null }),
    }))

    const result = await db
      .insert(table)
      .values(values as Record<string, unknown>[])
      .returning()

    return result as T[]
  }

  /**
   * Update an entity with optimistic locking
   */
  const update = async (
    id: string,
    input: UpdateInput,
    expectedVersion: number,
  ): Promise<T> => {
    const now = new Date()

    // Build conditions for optimistic locking
    const conditions = [
      eq((table as any).id, id),
      eq((table as any).version, expectedVersion),
    ]

    // Exclude soft-deleted entities
    if (softDelete && deletedAtColumn) {
      conditions.push(isNull((table as any).deletedAt))
    }

    const result = await db
      .update(table)
      .set({
        ...(input as Record<string, unknown>),
        version: sql`${(table as any).version} + 1`,
        updatedAt: now,
      } as Record<string, unknown>)
      .where(and(...conditions))
      .returning()

    if (result.length === 0) {
      throw new OptimisticLockError(id, expectedVersion)
    }

    return result[0] as T
  }

  /**
   * Soft delete an entity (or hard delete if softDelete is disabled)
   */
  const remove = async (id: string): Promise<DeleteResult> => {
    const deletedAt = new Date()

    if (softDelete) {
      const result = await db
        .update(table)
        .set({
          deletedAt,
          updatedAt: deletedAt,
        } as Record<string, unknown>)
        .where(and(
          eq((table as any).id, id),
          isNull((table as any).deletedAt),
        ))
        .returning()

      if (result.length === 0) {
        throw new NotFoundError(id)
      }

      return { success: true, deletedAt }
    }

    // Hard delete if softDelete is disabled
    const result = await db
      .delete(table)
      .where(eq((table as any).id, id))
      .returning()

    if (result.length === 0) {
      throw new NotFoundError(id)
    }

    return { success: true, deletedAt }
  }

  /**
   * Permanently delete an entity (bypasses soft delete)
   */
  const hardDelete = async (id: string): Promise<boolean> => {
    const result = await db
      .delete(table)
      .where(eq((table as any).id, id))
      .returning()

    return result.length > 0
  }

  /**
   * Restore a soft-deleted entity
   * Only available when softDelete is enabled
   */
  const restore = softDelete
    ? async (id: string): Promise<T> => {
      const now = new Date()

      const result = await db
        .update(table)
        .set({
          deletedAt: null,
          updatedAt: now,
        } as Record<string, unknown>)
        .where(eq((table as any).id, id))
        .returning()

      if (result.length === 0) {
        throw new NotFoundError(id)
      }

      return result[0] as T
    }
    : undefined

  // Build the return object conditionally
  const mutations = {
    create,
    createMany,
    update,
    delete: remove,
    hardDelete,
    // Expose internals for extensions
    _db: db,
    _table: table,
    _config: config,
  }

  // Add restore only if soft delete is enabled
  if (restore) {
    return { ...mutations, restore }
  }

  return mutations
}

/**
 * Type helper for Mutations return type
 */
export type Mutations<
  T extends BaseEntity,
  CreateInput,
  UpdateInput,
> = ReturnType<typeof createMutations<T, CreateInput, UpdateInput, PgTable>>
