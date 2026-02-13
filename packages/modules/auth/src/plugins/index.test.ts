import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = {
  handler: vi.fn(),
  api: {
    getSession: vi.fn(),
    getToken: vi.fn(),
  },
}

const mockCreateAuth = vi.hoisted(() => vi.fn(() => mockAuth))

const mockContainer = vi.hoisted(() => ({
  bind: vi.fn(),
}))

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

const mockDbInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }))
const mockDbSelect = vi.hoisted(() => vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue([]),
  }),
}))
const mockDb = vi.hoisted(() => ({
  query: vi.fn(),
  select: mockDbSelect,
  insert: mockDbInsert,
}))

const mockBlocklist = vi.hoisted(() => ({ add: vi.fn(), isBlocked: vi.fn() }))
const mockRotation = vi.hoisted(() => ({
  recordRotation: vi.fn(),
  wasAlreadyRotated: vi.fn(),
  generateToken: vi.fn(),
  hashToken: vi.fn(),
}))
const mockRedisStorage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}))
const mockCreateRedisStorage = vi.hoisted(() => vi.fn(() => mockRedisStorage))
const mockRandomUUID = vi.hoisted(() => vi.fn(() => 'test-uuid-jwks'))

const mockAuthEventsService = vi.hoisted(() => {
  class AuthEventsService {
    userRegistered = vi.fn()
    userUpdated = vi.fn()
    sessionCreated = vi.fn()
    sessionRevoked = vi.fn()
  }
  return AuthEventsService
})

vi.mock('../config/auth.config', () => ({
  createAuth: mockCreateAuth,
}))

vi.mock('../events/auth-events', () => ({
  AuthEventsService: mockAuthEventsService,
}))

vi.mock('../services/secondary-storage', () => ({
  createRedisStorage: mockCreateRedisStorage,
}))

vi.mock('../database/schema', () => ({
  jwks: { id: 'jwks_id_col' },
}))

vi.mock('node:crypto', () => ({
  randomUUID: mockRandomUUID,
}))

vi.mock('nitro', () => ({
  definePlugin: (fn: (app: unknown) => Promise<void>) => fn,
}))

describe('auth plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockCreateAuth.mockReturnValue(mockAuth)
  })

  function mockKitModules(authConfig?: { secret: string, baseUrl: string }) {
    vi.doMock('@czo/kit', () => ({
      useContainer: () => mockContainer,
      useLogger: () => mockLogger,
    }))

    vi.doMock('@czo/kit/config', () => ({
      useCzoConfig: () => ({
        databaseUrl: 'postgresql://test:test@localhost/test',
        redisUrl: 'redis://localhost:6379',
        auth: authConfig ?? {
          secret: 'test-secret-key-32-chars-minimum!',
          baseUrl: 'http://localhost:4000',
        },
      }),
    }))

    vi.doMock('@czo/kit/db', () => ({
      useDatabase: () => mockDb,
    }))
  }

  function mockRedisAvailable() {
    vi.doMock('../services/redis', () => ({
      useAuthRedis: () => ({ disconnect: vi.fn() }),
    }))
    vi.doMock('../services/jwt-blocklist', () => ({
      createJwtBlocklist: () => mockBlocklist,
    }))
    vi.doMock('../services/token-rotation', () => ({
      createTokenRotationService: () => mockRotation,
    }))
  }

  function mockRedisUnavailable() {
    vi.doMock('../services/redis', () => ({
      useAuthRedis: () => { throw new Error('Redis unavailable') },
    }))
    vi.doMock('../services/jwt-blocklist', () => ({
      createJwtBlocklist: vi.fn(),
    }))
    vi.doMock('../services/token-rotation', () => ({
      createTokenRotationService: vi.fn(),
    }))
  }

  it('should create auth instance and bind to container', async () => {
    mockKitModules()
    mockRedisAvailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: {
        hook: vi.fn(),
      },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockCreateAuth).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      secret: 'test-secret-key-32-chars-minimum!',
      baseUrl: 'http://localhost:4000',
      emailService: expect.any(Object),
    }))

    expect(mockContainer.bind).toHaveBeenCalledWith('auth', expect.any(Function))
  })

  it('should inject auth into request context', async () => {
    mockKitModules()
    mockRedisAvailable()
    const { default: plugin } = await import('./index')

    const hookCallbacks = new Map<string, (...args: unknown[]) => void>()
    const nitroApp = {
      hooks: {
        hook: vi.fn((name: string, cb: (...args: unknown[]) => void) => {
          hookCallbacks.set(name, cb)
        }),
      },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(hookCallbacks.has('request')).toBe(true)

    const event = { context: {} as Record<string, unknown> }
    hookCallbacks.get('request')!(event)

    expect(event.context.auth).toBe(mockAuth)
  })

  it('should log initialization message', async () => {
    mockKitModules()
    mockRedisAvailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Auth module initialized'),
    )
  })

  it('should warn and skip when auth secret is not configured', async () => {
    mockKitModules({ secret: '', baseUrl: '' })
    mockRedisAvailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Auth secret not configured'),
    )
    expect(mockCreateAuth).not.toHaveBeenCalled()
  })

  it('should error and skip when auth secret is too short', async () => {
    mockKitModules({ secret: 'too-short', baseUrl: 'http://localhost:4000' })
    mockRedisAvailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('at least 32 characters'),
    )
    expect(mockCreateAuth).not.toHaveBeenCalled()
  })

  it('should bind email service to container', async () => {
    mockKitModules()
    mockRedisAvailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockContainer.bind).toHaveBeenCalledWith('auth:email', expect.any(Function))
  })

  it('should bind auth events service to container', async () => {
    mockKitModules()
    mockRedisAvailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockContainer.bind).toHaveBeenCalledWith('auth:events', expect.any(Function))
  })

  it('should pass events service to createAuth', async () => {
    mockKitModules()
    mockRedisAvailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    const createAuthCall = mockCreateAuth.mock.calls[0]!
    expect(createAuthCall[1]).toHaveProperty('events')
    expect(createAuthCall[1].events).toBeInstanceOf(mockAuthEventsService)
  })

  it('should pass email service to createAuth', async () => {
    mockKitModules()
    mockRedisAvailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    const createAuthCall = mockCreateAuth.mock.calls[0]!
    expect(createAuthCall[1]).toHaveProperty('emailService')
    expect(createAuthCall[1].emailService).toBeDefined()
  })

  it('should bind blocklist when Redis is available', async () => {
    mockKitModules()
    mockRedisAvailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockContainer.bind).toHaveBeenCalledWith('auth:blocklist', expect.any(Function))
  })

  it('should bind rotation service when Redis is available', async () => {
    mockKitModules()
    mockRedisAvailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockContainer.bind).toHaveBeenCalledWith('auth:rotation', expect.any(Function))
  })

  it('should continue without Redis when unavailable', async () => {
    mockKitModules()
    mockRedisUnavailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis unavailable'),
      expect.any(String),
    )
    expect(mockCreateAuth).toHaveBeenCalled()
  })

  it('should log warning when Redis fails', async () => {
    mockKitModules()
    mockRedisUnavailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis unavailable'),
      'Redis unavailable',
    )
  })

  it('should pass redis storage to createAuth when Redis is available', async () => {
    mockKitModules()
    mockRedisAvailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockCreateRedisStorage).toHaveBeenCalled()
    expect(mockCreateAuth).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      redis: { storage: mockRedisStorage },
    }))
  })

  it('should not pass redis storage when Redis is unavailable', async () => {
    mockKitModules()
    mockRedisUnavailable()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockCreateAuth).toHaveBeenCalledWith(mockDb, expect.not.objectContaining({
      redis: expect.anything(),
    }))
  })

  describe('request context injection', () => {
    it('should inject db into request context', async () => {
      mockKitModules()
      mockRedisAvailable()
      const { default: plugin } = await import('./index')

      const hookCallbacks = new Map<string, (...args: unknown[]) => void>()
      const nitroApp = {
        hooks: {
          hook: vi.fn((name: string, cb: (...args: unknown[]) => void) => {
            hookCallbacks.set(name, cb)
          }),
        },
      }

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)

      const event = { context: {} as Record<string, unknown> }
      hookCallbacks.get('request')!(event)

      expect(event.context.db).toBe(mockDb)
    })

    it('should inject blocklist into request context when Redis is available', async () => {
      mockKitModules()
      mockRedisAvailable()
      const { default: plugin } = await import('./index')

      const hookCallbacks = new Map<string, (...args: unknown[]) => void>()
      const nitroApp = {
        hooks: {
          hook: vi.fn((name: string, cb: (...args: unknown[]) => void) => {
            hookCallbacks.set(name, cb)
          }),
        },
      }

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)

      const event = { context: {} as Record<string, unknown> }
      hookCallbacks.get('request')!(event)

      expect(event.context.blocklist).toBe(mockBlocklist)
    })

    it('should inject rotation into request context when Redis is available', async () => {
      mockKitModules()
      mockRedisAvailable()
      const { default: plugin } = await import('./index')

      const hookCallbacks = new Map<string, (...args: unknown[]) => void>()
      const nitroApp = {
        hooks: {
          hook: vi.fn((name: string, cb: (...args: unknown[]) => void) => {
            hookCallbacks.set(name, cb)
          }),
        },
      }

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)

      const event = { context: {} as Record<string, unknown> }
      hookCallbacks.get('request')!(event)

      expect(event.context.rotation).toBe(mockRotation)
    })

    it('should inject authEvents into request context', async () => {
      mockKitModules()
      mockRedisAvailable()
      const { default: plugin } = await import('./index')

      const hookCallbacks = new Map<string, (...args: unknown[]) => void>()
      const nitroApp = {
        hooks: {
          hook: vi.fn((name: string, cb: (...args: unknown[]) => void) => {
            hookCallbacks.set(name, cb)
          }),
        },
      }

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)

      const event = { context: {} as Record<string, unknown> }
      hookCallbacks.get('request')!(event)

      expect(event.context.authEvents).toBeInstanceOf(mockAuthEventsService)
    })

    it('should not inject blocklist or rotation when Redis is unavailable', async () => {
      mockKitModules()
      mockRedisUnavailable()
      const { default: plugin } = await import('./index')

      const hookCallbacks = new Map<string, (...args: unknown[]) => void>()
      const nitroApp = {
        hooks: {
          hook: vi.fn((name: string, cb: (...args: unknown[]) => void) => {
            hookCallbacks.set(name, cb)
          }),
        },
      }

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)

      const event = { context: {} as Record<string, unknown> }
      hookCallbacks.get('request')!(event)

      expect(event.context.blocklist).toBeUndefined()
      expect(event.context.rotation).toBeUndefined()
      expect(event.context.db).toBe(mockDb)
    })
  })

  describe('jwks seeding', () => {
    it('should seed JWKS table when env keys provided and table is empty', async () => {
      mockKitModules({
        secret: 'test-secret-key-32-chars-minimum!',
        baseUrl: 'http://localhost:4000',
        jwtPrivateKey: 'private-key-pem',
        jwtPublicKey: 'public-key-pem',
      } as any)
      mockRedisAvailable()
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      })
      const { default: plugin } = await import('./index')

      const nitroApp = {
        hooks: { hook: vi.fn() },
      }

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)

      expect(mockDbInsert).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('JWT keys seeded'),
      )
    })

    it('should skip JWKS seeding when keys already exist in table', async () => {
      mockKitModules({
        secret: 'test-secret-key-32-chars-minimum!',
        baseUrl: 'http://localhost:4000',
        jwtPrivateKey: 'private-key-pem',
        jwtPublicKey: 'public-key-pem',
      } as any)
      mockRedisAvailable()
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'existing' }]),
        }),
      })
      const { default: plugin } = await import('./index')

      const nitroApp = {
        hooks: { hook: vi.fn() },
      }

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)

      expect(mockDbInsert).not.toHaveBeenCalled()
    })

    it('should skip JWKS seeding when env keys are not provided', async () => {
      mockKitModules()
      mockRedisAvailable()
      const { default: plugin } = await import('./index')

      const nitroApp = {
        hooks: { hook: vi.fn() },
      }

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)

      expect(mockDbSelect).not.toHaveBeenCalled()
    })
  })
})
