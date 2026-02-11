import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MockRedis = vi.hoisted(() =>
  vi.fn(() => ({
    disconnect: vi.fn(),
  })),
)

vi.mock('ioredis', () => ({ default: MockRedis }))

describe('useAuthRedis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(async () => {
    // Reset the singleton after each test
    vi.resetModules()
  })

  function mockConfig(redisUrl: string) {
    vi.doMock('@czo/kit/config', () => ({
      useCzoConfig: () => ({ redisUrl }),
    }))
  }

  it('should create a Redis instance with the configured URL', async () => {
    mockConfig('redis://localhost:6379')
    const { useAuthRedis } = await import('./redis')

    useAuthRedis()

    expect(MockRedis).toHaveBeenCalledWith('redis://localhost:6379', { maxRetriesPerRequest: null })
  })

  it('should return the same instance on subsequent calls (singleton)', async () => {
    mockConfig('redis://localhost:6379')
    const { useAuthRedis } = await import('./redis')

    const first = useAuthRedis()
    const second = useAuthRedis()

    expect(first).toBe(second)
    expect(MockRedis).toHaveBeenCalledTimes(1)
  })

  it('should throw when redisUrl is missing', async () => {
    mockConfig('')
    const { useAuthRedis } = await import('./redis')

    expect(() => useAuthRedis()).toThrow('Redis URL is required')
  })

  it('should disconnect and clear instance on reset', async () => {
    mockConfig('redis://localhost:6379')
    const { useAuthRedis, resetAuthRedis } = await import('./redis')

    const redis = useAuthRedis()
    resetAuthRedis()

    expect(redis.disconnect).toHaveBeenCalled()
  })
})
