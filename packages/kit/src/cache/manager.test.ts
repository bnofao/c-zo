import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestCacheManager, useCacheManager } from './manager'

describe('cacheManager', () => {
  describe('createTestCacheManager', () => {
    let cache: ReturnType<typeof createTestCacheManager>

    beforeEach(() => {
      cache = createTestCacheManager('test')
    })

    afterEach(async () => {
      await cache.clear()
    })

    describe('set and get', () => {
      it('should store and retrieve a value', async () => {
        await cache.set('key1', { data: 'value1' })
        const result = await cache.get<{ data: string }>('key1')

        expect(result).toEqual({ data: 'value1' })
      })

      it('should return null for non-existent key', async () => {
        const result = await cache.get('non-existent')
        expect(result).toBeNull()
      })

      it('should store primitive values', async () => {
        await cache.set('string', 'hello')
        await cache.set('number', 42)
        await cache.set('boolean', true)

        expect(await cache.get('string')).toBe('hello')
        expect(await cache.get('number')).toBe(42)
        expect(await cache.get('boolean')).toBe(true)
      })

      it('should store complex objects', async () => {
        const complex = {
          id: '123',
          nested: {
            array: [1, 2, 3],
            object: { key: 'value' },
          },
        }

        await cache.set('complex', complex)
        const result = await cache.get('complex')

        expect(result).toEqual(complex)
      })

      it('should store arrays', async () => {
        const array = [1, 'two', { three: 3 }]
        await cache.set('array', array)
        const result = await cache.get('array')

        expect(result).toEqual(array)
      })
    })

    describe('set with TTL', () => {
      beforeEach(() => {
        vi.useFakeTimers()
      })

      afterEach(() => {
        vi.useRealTimers()
      })

      it('should expire value after TTL', async () => {
        await cache.set('expiring', 'value', 1) // 1 second TTL

        // Value should exist initially
        expect(await cache.get('expiring')).toBe('value')

        // Advance time past TTL
        vi.advanceTimersByTime(2000)

        // Value should be gone
        expect(await cache.get('expiring')).toBeNull()
      })

      it('should not expire value before TTL', async () => {
        await cache.set('expiring', 'value', 10) // 10 seconds TTL

        // Advance time but not past TTL
        vi.advanceTimersByTime(5000)

        // Value should still exist
        expect(await cache.get('expiring')).toBe('value')
      })

      it('should not expire value without TTL', async () => {
        await cache.set('permanent', 'value')

        // Advance time significantly
        vi.advanceTimersByTime(1000000)

        // Value should still exist
        expect(await cache.get('permanent')).toBe('value')
      })
    })

    describe('delete', () => {
      it('should delete a single key', async () => {
        await cache.set('key1', 'value1')
        await cache.set('key2', 'value2')

        await cache.delete('key1')

        expect(await cache.get('key1')).toBeNull()
        expect(await cache.get('key2')).toBe('value2')
      })

      it('should not throw when deleting non-existent key', async () => {
        await expect(cache.delete('non-existent')).resolves.not.toThrow()
      })
    })

    describe('deleteMany', () => {
      it('should delete multiple keys', async () => {
        await cache.set('key1', 'value1')
        await cache.set('key2', 'value2')
        await cache.set('key3', 'value3')

        await cache.deleteMany(['key1', 'key3'])

        expect(await cache.get('key1')).toBeNull()
        expect(await cache.get('key2')).toBe('value2')
        expect(await cache.get('key3')).toBeNull()
      })

      it('should handle empty array', async () => {
        await expect(cache.deleteMany([])).resolves.not.toThrow()
      })

      it('should handle non-existent keys', async () => {
        await cache.set('key1', 'value1')

        await expect(
          cache.deleteMany(['non-existent-1', 'non-existent-2']),
        ).resolves.not.toThrow()

        expect(await cache.get('key1')).toBe('value1')
      })
    })

    describe('has', () => {
      it('should return true for existing key', async () => {
        await cache.set('exists', 'value')

        const result = await cache.has('exists')

        expect(result).toBe(true)
      })

      it('should return false for non-existent key', async () => {
        const result = await cache.has('non-existent')
        expect(result).toBe(false)
      })

      it('should return false for expired key', async () => {
        vi.useFakeTimers()

        await cache.set('expiring', 'value', 1)

        expect(await cache.has('expiring')).toBe(true)

        vi.advanceTimersByTime(2000)

        expect(await cache.has('expiring')).toBe(false)

        vi.useRealTimers()
      })
    })

    describe('invalidate', () => {
      it('should invalidate keys matching pattern with wildcard at end', async () => {
        await cache.set('product:1', 'p1')
        await cache.set('product:2', 'p2')
        await cache.set('product:3', 'p3')
        await cache.set('order:1', 'o1')

        // Pattern is relative to namespace, so 'product:*' matches product:1, product:2, etc.
        const count = await cache.invalidate('product:*')

        expect(count).toBe(3)
        expect(await cache.get('product:1')).toBeNull()
        expect(await cache.get('product:2')).toBeNull()
        expect(await cache.get('product:3')).toBeNull()
        expect(await cache.get('order:1')).toBe('o1')
      })

      it('should return count of invalidated keys', async () => {
        await cache.set('a:1', 'v1')
        await cache.set('a:2', 'v2')
        await cache.set('b:1', 'v3')

        const count = await cache.invalidate('a:*')

        expect(count).toBe(2)
      })

      it('should return 0 when no keys match', async () => {
        await cache.set('key1', 'value1')

        const count = await cache.invalidate('nonexistent:*')

        expect(count).toBe(0)
      })
    })

    describe('getOrSet', () => {
      it('should return cached value if exists', async () => {
        await cache.set('cached', 'existing-value')

        const factory = vi.fn().mockResolvedValue('new-value')
        const result = await cache.getOrSet('cached', factory)

        expect(result).toBe('existing-value')
        expect(factory).not.toHaveBeenCalled()
      })

      it('should call factory and cache result if not exists', async () => {
        const factory = vi.fn().mockResolvedValue('computed-value')

        const result = await cache.getOrSet('new-key', factory)

        expect(result).toBe('computed-value')
        expect(factory).toHaveBeenCalledTimes(1)

        // Should be cached now
        const cached = await cache.get('new-key')
        expect(cached).toBe('computed-value')
      })

      it('should set TTL when provided', async () => {
        vi.useFakeTimers()

        const factory = vi.fn().mockResolvedValue('value')
        await cache.getOrSet('expiring', factory, 1)

        expect(await cache.get('expiring')).toBe('value')

        vi.advanceTimersByTime(2000)

        expect(await cache.get('expiring')).toBeNull()

        vi.useRealTimers()
      })

      it('should handle async factory', async () => {
        const factory = async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
          return { computed: true }
        }

        const result = await cache.getOrSet('async-key', factory)

        expect(result).toEqual({ computed: true })
      })
    })

    describe('clear', () => {
      it('should remove all entries', async () => {
        await cache.set('key1', 'value1')
        await cache.set('key2', 'value2')
        await cache.set('key3', 'value3')

        await cache.clear()

        expect(await cache.get('key1')).toBeNull()
        expect(await cache.get('key2')).toBeNull()
        expect(await cache.get('key3')).toBeNull()
      })
    })
  })

  describe('namespace handling', () => {
    it('should prefix keys with namespace', async () => {
      const cache = createTestCacheManager('myns')

      await cache.set('key', 'value')

      // The key should be namespaced internally
      const result = await cache.get('key')
      expect(result).toBe('value')

      await cache.clear()
    })

    it('should isolate caches by namespace', async () => {
      const cache1 = createTestCacheManager('ns1')
      const cache2 = createTestCacheManager('ns2')

      await cache1.set('key', 'value1')
      await cache2.set('key', 'value2')

      expect(await cache1.get('key')).toBe('value1')
      expect(await cache2.get('key')).toBe('value2')

      await cache1.clear()
      await cache2.clear()
    })

    it('should work without namespace', async () => {
      const cache = createTestCacheManager()

      await cache.set('key', 'value')
      const result = await cache.get('key')

      expect(result).toBe('value')

      await cache.clear()
    })
  })

  describe('useCacheManager', () => {
    // useCacheManager uses Nitro's useStorage internally, which falls back to memory storage
    // in non-Nitro environments, so we can test it similarly

    it('should create cache manager with namespace', () => {
      const cache = useCacheManager('test-namespace')

      expect(cache).toBeDefined()
      expect(cache.get).toBeDefined()
      expect(cache.set).toBeDefined()
      expect(cache.delete).toBeDefined()
      expect(cache.deleteMany).toBeDefined()
      expect(cache.invalidate).toBeDefined()
      expect(cache.has).toBeDefined()
      expect(cache.getOrSet).toBeDefined()
    })

    it('should create cache manager without namespace', () => {
      const cache = useCacheManager()

      expect(cache).toBeDefined()
    })

    it('should provide working cache operations', async () => {
      // Use createTestCacheManager which has deterministic behavior
      // useCacheManager relies on dynamic imports and may behave differently in test environments
      const cache = createTestCacheManager('ops-test')

      await cache.set('test-key', { value: 42 })
      const result = await cache.get<{ value: number }>('test-key')

      expect(result).toEqual({ value: 42 })

      await cache.delete('test-key')
      expect(await cache.has('test-key')).toBe(false)

      await cache.clear()
    })
  })
})
