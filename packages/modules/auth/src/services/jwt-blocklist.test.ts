import { describe, expect, it, vi } from 'vitest'
import { createJwtBlocklist } from './jwt-blocklist'

describe('createJwtBlocklist', () => {
  function createMockRedis() {
    return {
      setex: vi.fn().mockResolvedValue('OK'),
      exists: vi.fn().mockResolvedValue(0),
    }
  }

  it('should add a JTI with correct key prefix and TTL', async () => {
    const redis = createMockRedis()
    const blocklist = createJwtBlocklist(redis as any)

    await blocklist.add('jwt-123', 900)

    expect(redis.setex).toHaveBeenCalledWith('czo:blocklist:jwt-123', 900, '1')
  })

  it('should use correct key format for blocklist entries', async () => {
    const redis = createMockRedis()
    const blocklist = createJwtBlocklist(redis as any)

    await blocklist.add('abc-def', 600)

    const key = redis.setex.mock.calls[0]![0]
    expect(key).toBe('czo:blocklist:abc-def')
  })

  it('should return true when JTI is blocked', async () => {
    const redis = createMockRedis()
    redis.exists.mockResolvedValue(1)
    const blocklist = createJwtBlocklist(redis as any)

    const result = await blocklist.isBlocked('blocked-jti')

    expect(result).toBe(true)
    expect(redis.exists).toHaveBeenCalledWith('czo:blocklist:blocked-jti')
  })

  it('should return false when JTI is not blocked', async () => {
    const redis = createMockRedis()
    redis.exists.mockResolvedValue(0)
    const blocklist = createJwtBlocklist(redis as any)

    const result = await blocklist.isBlocked('clean-jti')

    expect(result).toBe(false)
  })

  it('should pass TTL in seconds to Redis setex', async () => {
    const redis = createMockRedis()
    const blocklist = createJwtBlocklist(redis as any)

    await blocklist.add('jti-ttl', 1800)

    const ttl = redis.setex.mock.calls[0]![1]
    expect(ttl).toBe(1800)
  })

  it('should handle different JTI formats', async () => {
    const redis = createMockRedis()
    const blocklist = createJwtBlocklist(redis as any)

    await blocklist.add('uuid-v4-format-1234-5678', 900)

    expect(redis.setex).toHaveBeenCalledWith(
      'czo:blocklist:uuid-v4-format-1234-5678',
      900,
      '1',
    )
  })
})
