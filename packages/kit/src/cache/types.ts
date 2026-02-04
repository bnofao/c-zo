/**
 * CacheManager interface for cache invalidation and fallback operations
 *
 * Note: Primary caching should use Nitro's `defineCachedFunction` for reads.
 * CacheManager is primarily used for invalidation after mutations.
 */
export interface CacheManager {
  /**
   * Delete a single cache entry
   */
  delete: (key: string) => Promise<void>

  /**
   * Delete multiple cache entries
   */
  deleteMany: (keys: string[]) => Promise<void>

  /**
   * Invalidate cache entries matching a pattern (glob-style)
   * @returns Number of entries invalidated
   */
  invalidate: (pattern: string) => Promise<number>

  /**
   * Check if a key exists in cache
   */
  has: (key: string) => Promise<boolean>

  /**
   * Get a value from cache, or compute and store it if missing
   * Use this for cases where `defineCachedFunction` is not suitable
   */
  getOrSet: <T>(key: string, factory: () => Promise<T>, ttl?: number) => Promise<T>

  /**
   * Get a value from cache without fallback
   */
  get: <T>(key: string) => Promise<T | null>

  /**
   * Set a value in cache with optional TTL
   */
  set: <T>(key: string, value: T, ttl?: number) => Promise<void>
}

/**
 * Options for Nitro's defineCachedFunction
 * Reference: https://v3.nitro.build/docs/cache
 */
export interface NitroCacheOptions {
  /** TTL in seconds */
  maxAge: number
  /** Enable stale-while-revalidate (default: true) */
  swr?: boolean
  /** Max age for stale content (-1 = unlimited) */
  staleMaxAge?: number
  /** Cache entry name for debugging */
  name?: string
  /** Custom cache key generator */
  getKey?: (...args: unknown[]) => string
  /** Headers that vary the cache */
  varies?: string[]
}
