import type { CacheManager } from './types'

// Dynamic import to avoid build issues when not in Nitro context
let _useStorage: typeof import('nitropack/runtime').useStorage | undefined

async function getStorage(namespace: string = 'cache') {
  if (!_useStorage) {
    try {
      const nitro = await import('nitropack/runtime')
      _useStorage = nitro.useStorage
    }
    catch {
      // Fallback to in-memory storage for testing/non-Nitro environments
      return createMemoryStorage(namespace)
    }
  }
  return _useStorage(namespace)
}

/**
 * In-memory storage fallback for testing and non-Nitro environments
 */
function createMemoryStorage(namespace: string) {
  const store = new Map<string, { value: unknown, expiresAt?: number }>()
  const prefix = namespace ? `${namespace}:` : ''

  return {
    async getItem<T>(key: string): Promise<T | null> {
      const fullKey = `${prefix}${key}`
      const entry = store.get(fullKey)
      if (!entry)
        return null
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(fullKey)
        return null
      }
      return entry.value as T
    },

    async setItem<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
      const fullKey = `${prefix}${key}`
      store.set(fullKey, {
        value,
        expiresAt: options?.ttl ? Date.now() + options.ttl * 1000 : undefined,
      })
    },

    async removeItem(key: string): Promise<void> {
      const fullKey = `${prefix}${key}`
      store.delete(fullKey)
    },

    async hasItem(key: string): Promise<boolean> {
      const fullKey = `${prefix}${key}`
      const entry = store.get(fullKey)
      if (!entry)
        return false
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(fullKey)
        return false
      }
      return true
    },

    async getKeys(pattern?: string): Promise<string[]> {
      const allKeys = Array.from(store.keys())
      if (!pattern)
        return allKeys

      // Simple glob pattern matching (supports * wildcard)
      const regex = new RegExp(
        `^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
      )
      return allKeys.filter(key => regex.test(key))
    },

    // For testing: clear all entries
    async clear(): Promise<void> {
      store.clear()
    },
  }
}

/**
 * Create a CacheManager instance with optional namespace prefix
 *
 * @param namespace - Optional prefix for all cache keys
 * @returns CacheManager instance
 *
 * @example
 * ```ts
 * const cache = useCacheManager('product')
 *
 * // Delete a single entry
 * await cache.delete('123')
 *
 * // Invalidate all entries for a product
 * await cache.invalidate('123:*')
 *
 * // Get or compute a value
 * const product = await cache.getOrSet('123', async () => {
 *   return await db.query.products.findFirst({ where: eq(id, '123') })
 * }, 300)
 * ```
 */
export function useCacheManager(namespace?: string): CacheManager {
  const prefix = namespace ? `${namespace}:` : ''

  const prefixKey = (key: string) => `${prefix}${key}`

  return {
    async delete(key: string): Promise<void> {
      const storage = await getStorage()
      await storage.removeItem(prefixKey(key))
    },

    async deleteMany(keys: string[]): Promise<void> {
      const storage = await getStorage()
      await Promise.all(keys.map(k => storage.removeItem(prefixKey(k))))
    },

    async invalidate(pattern: string): Promise<number> {
      const storage = await getStorage()
      const fullPattern = prefixKey(pattern)
      const keys = await storage.getKeys(fullPattern)
      await Promise.all(keys.map(k => storage.removeItem(k)))
      return keys.length
    },

    async has(key: string): Promise<boolean> {
      const storage = await getStorage()
      return storage.hasItem(prefixKey(key))
    },

    async get<T>(key: string): Promise<T | null> {
      const storage = await getStorage()
      return storage.getItem<T>(prefixKey(key))
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      const storage = await getStorage()
      await storage.setItem(prefixKey(key), value, ttl ? { ttl } : undefined)
    },

    async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
      const storage = await getStorage()
      const fullKey = prefixKey(key)

      const cached = await storage.getItem<T>(fullKey)
      if (cached !== null)
        return cached

      const value = await factory()
      await storage.setItem(fullKey, value, ttl ? { ttl } : undefined)
      return value
    },
  }
}

/**
 * Create an in-memory CacheManager for testing
 * Uses a simple memory store without double-prefixing
 */
export function createTestCacheManager(namespace?: string): CacheManager & { clear: () => Promise<void> } {
  const store = new Map<string, { value: unknown, expiresAt?: number }>()
  const prefix = namespace ? `${namespace}:` : ''

  const prefixKey = (key: string) => `${prefix}${key}`

  const getItem = <T>(key: string): T | null => {
    const fullKey = prefixKey(key)
    const entry = store.get(fullKey)
    if (!entry)
      return null
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      store.delete(fullKey)
      return null
    }
    return entry.value as T
  }

  const setItem = <T>(key: string, value: T, ttl?: number): void => {
    const fullKey = prefixKey(key)
    store.set(fullKey, {
      value,
      expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
    })
  }

  const removeItem = (key: string): void => {
    const fullKey = prefixKey(key)
    store.delete(fullKey)
  }

  const hasItem = (key: string): boolean => {
    const fullKey = prefixKey(key)
    const entry = store.get(fullKey)
    if (!entry)
      return false
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      store.delete(fullKey)
      return false
    }
    return true
  }

  const getKeys = (pattern?: string): string[] => {
    const allKeys = Array.from(store.keys())
    if (!pattern)
      return allKeys

    // Simple glob pattern matching (supports * wildcard)
    const regex = new RegExp(
      `^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
    )
    return allKeys.filter(key => regex.test(key))
  }

  return {
    async delete(key: string): Promise<void> {
      removeItem(key)
    },

    async deleteMany(keys: string[]): Promise<void> {
      keys.forEach(k => removeItem(k))
    },

    async invalidate(pattern: string): Promise<number> {
      const fullPattern = prefixKey(pattern)
      const keys = getKeys(fullPattern)
      // Keys returned are already full keys, delete directly from store
      keys.forEach(k => store.delete(k))
      return keys.length
    },

    async has(key: string): Promise<boolean> {
      return hasItem(key)
    },

    async get<T>(key: string): Promise<T | null> {
      return getItem<T>(key)
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      setItem(key, value, ttl)
    },

    async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
      const cached = getItem<T>(key)
      if (cached !== null)
        return cached

      const value = await factory()
      setItem(key, value, ttl)
      return value
    },

    async clear(): Promise<void> {
      store.clear()
    },
  }
}
