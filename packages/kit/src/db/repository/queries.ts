import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core'
import type {
  BaseConfig,
  BaseEntity,
  FindByIdOptions,
  FindManyOptions,
  PaginatedResult,
  WhereClause,
} from './types'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { applyOrderBy, applyWhere, encodeCursor } from './utils'

/**
 * Create read-only query functions for a repository
 *
 * @example
 * ```ts
 * const queries = createQueries<Product, typeof products>(db, {
 *   table: products,
 *   softDelete: true,
 * })
 *
 * const product = await queries.findById('123')
 * const products = await queries.findMany({ limit: 10 })
 * ```
 */
export function createQueries<
  T extends BaseEntity,
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
   * Find a single entity by ID
   */
  const findById = async (
    id: string,
    options: FindByIdOptions = {},
  ): Promise<T | null> => {
    const { includeDeleted = false } = options

    const conditions = [eq((table as any).id, id)]

    if (softDelete && !includeDeleted && deletedAtColumn) {
      conditions.push(isNull((table as any).deletedAt))
    }

    const result = await db
      .select()
      .from(table)
      .where(and(...conditions))
      .limit(1)

    return (result[0] as T) ?? null
  }

  /**
   * Find multiple entities by their IDs
   */
  const findByIds = async (
    ids: string[],
    options: FindByIdOptions = {},
  ): Promise<T[]> => {
    if (ids.length === 0)
      return []

    const { includeDeleted = false } = options
    const conditions = [inArray((table as any).id, ids)]

    if (softDelete && !includeDeleted && deletedAtColumn) {
      conditions.push(isNull((table as any).deletedAt))
    }

    const result = await db
      .select()
      .from(table)
      .where(and(...conditions))

    return result as T[]
  }

  /**
   * Find a single entity matching the where clause
   */
  const findOne = async (
    where: WhereClause<T>,
    options: FindByIdOptions = {},
  ): Promise<T | null> => {
    const { includeDeleted = false } = options

    const whereCondition = applyWhere(table, where)
    const conditions = whereCondition ? [whereCondition] : []

    if (softDelete && !includeDeleted && deletedAtColumn) {
      conditions.push(isNull((table as any).deletedAt))
    }

    const query = db.select().from(table)
    const result = conditions.length > 0
      ? await query.where(and(...conditions)).limit(1)
      : await query.limit(1)

    return (result[0] as T) ?? null
  }

  /**
   * Find multiple entities with pagination
   */
  const findMany = async (
    options: FindManyOptions<T> = {},
  ): Promise<PaginatedResult<T>> => {
    const {
      where,
      orderBy,
      limit = 50,
      offset = 0,
      includeDeleted = false,
    } = options

    const effectiveLimit = Math.min(limit, 100)

    // Build conditions
    const conditions: ReturnType<typeof and>[] = []
    if (where) {
      const whereCondition = applyWhere(table, where)
      if (whereCondition)
        conditions.push(whereCondition)
    }
    if (softDelete && !includeDeleted && deletedAtColumn) {
      conditions.push(isNull((table as any).deletedAt))
    }

    // Build base query
    let query = db.select().from(table)
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query
    }

    // Apply ordering
    if (orderBy) {
      const orderExpressions = applyOrderBy(table, orderBy)
      if (orderExpressions.length > 0) {
        query = query.orderBy(...orderExpressions) as typeof query
      }
    }

    // Execute queries in parallel
    const [nodes, countResult] = await Promise.all([
      query.limit(effectiveLimit).offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(table)
        .where(conditions.length > 0 ? and(...conditions) : undefined),
    ])

    const totalCount = countResult[0]?.count ?? 0

    return {
      nodes: nodes as T[],
      totalCount,
      pageInfo: {
        hasNextPage: offset + nodes.length < totalCount,
        hasPreviousPage: offset > 0,
        startCursor: nodes.length > 0 ? encodeCursor((nodes[0] as T).id) : undefined,
        endCursor: nodes.length > 0 ? encodeCursor((nodes[nodes.length - 1] as T).id) : undefined,
      },
    }
  }

  /**
   * Count entities matching the where clause
   */
  const count = async (
    where?: WhereClause<T>,
    options: FindByIdOptions = {},
  ): Promise<number> => {
    const { includeDeleted = false } = options

    const conditions: ReturnType<typeof and>[] = []
    if (where) {
      const whereCondition = applyWhere(table, where)
      if (whereCondition)
        conditions.push(whereCondition)
    }
    if (softDelete && !includeDeleted && deletedAtColumn) {
      conditions.push(isNull((table as any).deletedAt))
    }

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(table)
      .where(conditions.length > 0 ? and(...conditions) : undefined)

    return result[0]?.count ?? 0
  }

  /**
   * Check if an entity matching the where clause exists
   */
  const exists = async (
    where: WhereClause<T>,
    options: FindByIdOptions = {},
  ): Promise<boolean> => {
    const result = await findOne(where, options)
    return result !== null
  }

  return {
    findById,
    findByIds,
    findOne,
    findMany,
    count,
    exists,
    // Expose internals for extensions
    _db: db,
    _table: table,
    _config: config,
  }
}

/**
 * Type helper for Queries return type
 */
export type Queries<T extends BaseEntity> = ReturnType<typeof createQueries<T, PgTable>>
