import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('nitro/runtime-config', () => ({
  useRuntimeConfig: vi.fn(),
}))

describe('useCzoConfig', () => {
  let useCzoConfig: typeof import('./config').useCzoConfig
  let czoConfigDefaults: typeof import('./config').czoConfigDefaults
  let mockUseRuntimeConfig: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    const nitroMod = await import('nitro/runtime-config')
    mockUseRuntimeConfig = nitroMod.useRuntimeConfig as ReturnType<typeof vi.fn>

    const mod = await import('./config')
    useCzoConfig = mod.useCzoConfig
    czoConfigDefaults = mod.czoConfigDefaults
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('should return values from runtimeConfig.czo when available', () => {
    mockUseRuntimeConfig.mockReturnValue({
      czo: {
        databaseUrl: 'postgresql://config-host/db',
        redisUrl: 'redis://config-host:6379',
        queue: { prefix: 'myapp', defaultAttempts: 5 },
      },
    })

    const config = useCzoConfig()

    expect(config.databaseUrl).toBe('postgresql://config-host/db')
    expect(config.redisUrl).toBe('redis://config-host:6379')
    expect(config.queue.prefix).toBe('myapp')
    expect(config.queue.defaultAttempts).toBe(5)
  })

  it('should fall back to process.env when runtimeConfig.czo is empty', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://env-host/db')
    vi.stubEnv('REDIS_URL', 'redis://env-host:6379')
    mockUseRuntimeConfig.mockReturnValue({ czo: {} })

    const config = useCzoConfig()

    expect(config.databaseUrl).toBe('postgresql://env-host/db')
    expect(config.redisUrl).toBe('redis://env-host:6379')
  })

  it('should fall back to process.env when runtimeConfig has no czo key', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://env-host/db')
    vi.stubEnv('REDIS_URL', 'redis://env-host:6379')
    mockUseRuntimeConfig.mockReturnValue({})

    const config = useCzoConfig()

    expect(config.databaseUrl).toBe('postgresql://env-host/db')
    expect(config.redisUrl).toBe('redis://env-host:6379')
  })

  it('should fall back to process.env when useRuntimeConfig throws', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://fallback/db')
    vi.stubEnv('REDIS_URL', 'redis://fallback:6379')
    mockUseRuntimeConfig.mockImplementation(() => {
      throw new Error('Nitro runtime not available')
    })

    const config = useCzoConfig()

    expect(config.databaseUrl).toBe('postgresql://fallback/db')
    expect(config.redisUrl).toBe('redis://fallback:6379')
    expect(config.queue).toEqual(czoConfigDefaults.queue)
  })

  it('should use queue defaults when queue config is missing', () => {
    mockUseRuntimeConfig.mockReturnValue({
      czo: {
        databaseUrl: 'postgresql://host/db',
        redisUrl: 'redis://host:6379',
      },
    })

    const config = useCzoConfig()

    expect(config.queue.prefix).toBe('czo')
    expect(config.queue.defaultAttempts).toBe(3)
  })

  it('should prefer runtimeConfig values over process.env', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://env-host/db')
    vi.stubEnv('REDIS_URL', 'redis://env-host:6379')
    mockUseRuntimeConfig.mockReturnValue({
      czo: {
        databaseUrl: 'postgresql://config-host/db',
        redisUrl: 'redis://config-host:6379',
      },
    })

    const config = useCzoConfig()

    expect(config.databaseUrl).toBe('postgresql://config-host/db')
    expect(config.redisUrl).toBe('redis://config-host:6379')
  })

  it('should return empty strings when no config or env vars exist', () => {
    mockUseRuntimeConfig.mockReturnValue({})

    const config = useCzoConfig()

    expect(config.databaseUrl).toBe('')
    expect(config.redisUrl).toBe('')
  })
})
