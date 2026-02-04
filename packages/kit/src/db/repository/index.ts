export { createCachedQueries } from './cached-queries'
export type { CachedQueries, CachedQueriesConfig } from './cached-queries'

export { createRepository } from './create-repository'
export type { Repository } from './create-repository'

// Errors
export { NotFoundError, OptimisticLockError, ValidationError } from './errors'
export { createMutations } from './mutations'

export type { DeleteResult, Mutations, UpdateWithVersion } from './mutations'
// Repository builders
export { createQueries } from './queries'

export type { Queries } from './queries'
// Types
export type {
  BaseConfig,
  BaseEntity,
  CacheConfig,
  FindByIdOptions,
  FindManyOptions,
  OrderByClause,
  OrderDirection,
  PaginatedResult,
  RepositoryConfig,
  WhereClause,
} from './types'

export { DEFAULT_LIMIT, MAX_LIMIT } from './types'

// Utilities
export { decodeCursor, encodeCursor, generateId } from './utils'
