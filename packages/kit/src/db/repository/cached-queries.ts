import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { BaseConfig, BaseEntity, CacheConfig, FindByIdOptions } from './types'
import { useCacheManager } from '../../cache/manager'
import { createQueries } from './queries'

// Dynamic import for Nitro's defineCachedFunction
let _defineCachedFunction: typeof import('nitropack/runtime').defineCachedFunction | undefined

async function getCachedFunction() {
  if (!_defineCachedFunction) {
    try {
      const nitro = await import('nitropack/runtime')
      _defineCachedFunction = nitro.defineCachedFunction
    }
    catch {
      // Return undefined if not in Nitro context
      return undefined
    }
  }
  return _defineCachedFunction
}

/**
 * Configuration for cached queries
 */
export interface CachedQueriesConfig<TTable extends PgTable> extends BaseConfig<TTable> {
  cache: CacheConfig
}

/**
 * Create query functions with Nitro cache integration
 *
 * Uses Nitro's `defineCachedFunction` for automatic caching with SWR.
 * Falls back to regular queries if Nitro is not available.
 *
 * @example
 * ```ts
 * const queries = createCachedQueries<Product, typeof products>(db, {
 *   table: products,
 *   softDelete: true,
 *   cache: { prefix: 'product', ttl: 300 },
 * })
 *
 * // Cached with SWR
 * const product = await queries.findById('123')
 *
 * // Invalidate after mutation
 * await queries.invalidateCache('123')
 * ```
 */
export function createCachedQueries<
  T extends BaseEntity,
  TTable extends PgTable,
>(
  db: NodePgDatabase<Record<string, unknown>>,
  config: CachedQueriesConfig<TTable>,
) {
  const { cache, ...baseConfig } = config
  const { prefix, ttl = 300 } = cache

  // Create base queries
  const queries = createQueries<T, TTable>(db, baseConfig)

  // Cache manager for invalidation
  const cacheManager = useCacheManager(prefix)

  // Store original functions for wrapping
  const originalFindById = queries.findById
  const originalFindByIds = queries.findByIds

  /**
   * Cached version of findById using Nitro cache with SWR
   */
  const findById = async (id: string, options: FindByIdOptions = {}): Promise<T | null> => {
    // Skip cache for includeDeleted queries
    if (options.includeDeleted) {
      return originalFindById(id, options)
    }

    const defineCachedFunction = await getCachedFunction()

    if (defineCachedFunction) {
      // Use Nitro's defineCachedFunction for caching with SWR
      const cachedFn = defineCachedFunction(
        async (entityId: string) => originalFindById(entityId, options),
        {
          maxAge: ttl,
          swr: true,
          staleMaxAge: ttl * 12,
          getKey: (entityId: string) => `${prefix}:${entityId}`,
          name: `${prefix}:findById`,
        },
      )
      return cachedFn(id)
    }

    // Fallback to CacheManager for non-Nitro environments
    return cacheManager.getOrSet(
      id,
      () => originalFindById(id, options),
      ttl,
    )
  }

  /**
   * Cached version of findByIds
   */
  const findByIds = async (ids: string[], options: FindByIdOptions = {}): Promise<T[]> => {
    if (ids.length === 0)
      return []

    // Skip cache for includeDeleted queries
    if (options.includeDeleted) {
      return originalFindByIds(ids, options)
    }

    const defineCachedFunction = await getCachedFunction()

    if (defineCachedFunction) {
      // Use Nitro's defineCachedFunction for batch caching
      const cachedFn = defineCachedFunction(
        async (entityIds: string[]) => originalFindByIds(entityIds, options),
        {
          maxAge: ttl,
          swr: true,
          staleMaxAge: ttl * 12,
          getKey: (entityIds: string[]) => `${prefix}:batch:${[...entityIds].sort().join(',')}`,
          name: `${prefix}:findByIds`,
        },
      )
      return cachedFn(ids)
    }

    // Fallback to CacheManager
    const cacheKey = `batch:${[...ids].sort().join(',')}`
    return cacheManager.getOrSet(
      cacheKey,
      () => originalFindByIds(ids, options),
      ttl,
    )
  }

  /**
   * Invalidate cache for a specific entity
   */
  const invalidateCache = async (id: string): Promise<void> => {
    await cacheManager.delete(id)
    // Also invalidate any patterns that might include this ID
    await cacheManager.invalidate(`${id}:*`)
    await cacheManager.invalidate(`*:${id}:*`)
  }

  /**
   * Invalidate all cache entries for this repository
   */
  const invalidateAllCache = async (): Promise<number> => {
    return cacheManager.invalidate('*')
  }

  /**
   * Invalidate batch cache containing this ID
   */
  const invalidateBatchCache = async (id: string): Promise<number> => {
    return cacheManager.invalidate(`batch:*${id}*`)
  }

  return {
    // Override cached methods
    ...queries,
    findById,
    findByIds,

    // Cache management
    invalidateCache,
    invalidateAllCache,
    invalidateBatchCache,

    // Expose cache config
    _cache: { prefix, ttl },
    _cacheManager: cacheManager,
  }
}

/**
 * Type helper for CachedQueries return type
 */
export type CachedQueries<T extends BaseEntity> = ReturnType<typeof createCachedQueries<T, PgTable>>
