import type { SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

/**
 * Base entity interface with optimistic locking and soft delete support
 */
export interface BaseEntity {
  id: string
  version: number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/**
 * Where clause - can be a partial entity or Drizzle SQL
 */
export type WhereClause<T> = Partial<T> | SQL

/**
 * Order by direction
 */
export type OrderDirection = 'asc' | 'desc'

/**
 * Order by clause
 */
export type OrderByClause<T> = {
  [K in keyof T]?: OrderDirection
}

/**
 * Options for findMany queries
 */
export interface FindManyOptions<T> {
  where?: WhereClause<T>
  orderBy?: OrderByClause<T>
  limit?: number
  offset?: number
  cursor?: string
  includeDeleted?: boolean
}

/**
 * Options for findById queries
 */
export interface FindByIdOptions {
  includeDeleted?: boolean
}

/**
 * Paginated result for list queries
 */
export interface PaginatedResult<T> {
  nodes: T[]
  totalCount: number
  pageInfo: {
    hasNextPage: boolean
    hasPreviousPage: boolean
    startCursor?: string
    endCursor?: string
  }
}

/**
 * Base configuration for repository builders
 */
export interface BaseConfig<TTable extends PgTable> {
  table: TTable
  softDelete?: boolean
  idColumn?: PgColumn
}

/**
 * Cache configuration for cached queries
 */
export interface CacheConfig {
  prefix: string
  ttl?: number
}

/**
 * Full repository configuration
 */
export interface RepositoryConfig<TTable extends PgTable> extends BaseConfig<TTable> {
  cache?: CacheConfig
}

/**
 * Default pagination limits
 */
export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 100
