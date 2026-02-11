import { describe, expect, it, vi } from 'vitest'
import { createRedisStorage } from './secondary-storage'

describe('createRedisStorage', () => {
  function createMockRedis() {
    return {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    }
  }

  it('should get a value from Redis', async () => {
    const redis = createMockRedis()
    redis.get.mockResolvedValue('{"session":"data"}')
    const storage = createRedisStorage(redis as any)

    const result = await storage.get('session:abc')

    expect(result).toBe('{"session":"data"}')
    expect(redis.get).toHaveBeenCalledWith('session:abc')
  })

  it('should return null for missing keys', async () => {
    const redis = createMockRedis()
    redis.get.mockResolvedValue(null)
    const storage = createRedisStorage(redis as any)

    const result = await storage.get('missing-key')

    expect(result).toBeNull()
  })

  it('should set a value without TTL', async () => {
    const redis = createMockRedis()
    const storage = createRedisStorage(redis as any)

    await storage.set('key1', '{"data":"value"}')

    expect(redis.set).toHaveBeenCalledWith('key1', '{"data":"value"}')
    expect(redis.setex).not.toHaveBeenCalled()
  })

  it('should set a value with TTL using setex', async () => {
    const redis = createMockRedis()
    const storage = createRedisStorage(redis as any)

    await storage.set('key1', '{"data":"value"}', 3600)

    expect(redis.setex).toHaveBeenCalledWith('key1', 3600, '{"data":"value"}')
    expect(redis.set).not.toHaveBeenCalled()
  })

  it('should delete a key', async () => {
    const redis = createMockRedis()
    const storage = createRedisStorage(redis as any)

    await storage.delete('key1')

    expect(redis.del).toHaveBeenCalledWith('key1')
  })

  it('should use set when TTL is 0 (falsy)', async () => {
    const redis = createMockRedis()
    const storage = createRedisStorage(redis as any)

    await storage.set('key1', 'value', 0)

    expect(redis.set).toHaveBeenCalledWith('key1', 'value')
    expect(redis.setex).not.toHaveBeenCalled()
  })
})
