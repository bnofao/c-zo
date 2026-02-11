import { describe, expect, it, vi } from 'vitest'
import { createTokenRotationService, REFRESH_TOKEN_PREFIX } from './token-rotation'

describe('createTokenRotationService', () => {
  function createMockRedis() {
    return {
      setex: vi.fn().mockResolvedValue('OK'),
      exists: vi.fn().mockResolvedValue(0),
    }
  }

  it('should record rotation with correct key and TTL', async () => {
    const redis = createMockRedis()
    const service = createTokenRotationService(redis as any)

    await service.recordRotation('sess-1', 'hash-abc')

    expect(redis.setex).toHaveBeenCalledWith('czo:rotated:sess-1:hash-abc', 60, '1')
  })

  it('should detect already-rotated tokens', async () => {
    const redis = createMockRedis()
    redis.exists.mockResolvedValue(1)
    const service = createTokenRotationService(redis as any)

    const result = await service.wasAlreadyRotated('sess-1', 'hash-abc')

    expect(result).toBe(true)
    expect(redis.exists).toHaveBeenCalledWith('czo:rotated:sess-1:hash-abc')
  })

  it('should return false for tokens not yet rotated', async () => {
    const redis = createMockRedis()
    redis.exists.mockResolvedValue(0)
    const service = createTokenRotationService(redis as any)

    const result = await service.wasAlreadyRotated('sess-2', 'hash-xyz')

    expect(result).toBe(false)
  })

  it('should generate unique tokens', () => {
    const redis = createMockRedis()
    const service = createTokenRotationService(redis as any)

    const token1 = service.generateToken()
    const token2 = service.generateToken()

    expect(token1).not.toBe(token2)
    expect(token1.length).toBeGreaterThan(0)
  })

  it('should generate tokens with czo_rt_ prefix', () => {
    const redis = createMockRedis()
    const service = createTokenRotationService(redis as any)

    const token = service.generateToken()

    expect(token).toMatch(new RegExp(`^${REFRESH_TOKEN_PREFIX}`))
  })

  it('should export REFRESH_TOKEN_PREFIX constant', () => {
    expect(REFRESH_TOKEN_PREFIX).toBe('czo_rt_')
  })

  it('should generate base64url-encoded tokens after prefix', () => {
    const redis = createMockRedis()
    const service = createTokenRotationService(redis as any)

    const token = service.generateToken()
    const afterPrefix = token.slice(REFRESH_TOKEN_PREFIX.length)

    // base64url chars: A-Z, a-z, 0-9, -, _
    expect(afterPrefix).toMatch(/^[\w-]+$/)
  })

  it('should produce consistent hashes for the same token', () => {
    const redis = createMockRedis()
    const service = createTokenRotationService(redis as any)

    const hash1 = service.hashToken('my-token')
    const hash2 = service.hashToken('my-token')

    expect(hash1).toBe(hash2)
  })

  it('should produce different hashes for different tokens', () => {
    const redis = createMockRedis()
    const service = createTokenRotationService(redis as any)

    const hash1 = service.hashToken('token-a')
    const hash2 = service.hashToken('token-b')

    expect(hash1).not.toBe(hash2)
  })

  it('should produce hex-encoded SHA-256 hashes', () => {
    const redis = createMockRedis()
    const service = createTokenRotationService(redis as any)

    const hash = service.hashToken('test')

    // SHA-256 hex is 64 chars
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
