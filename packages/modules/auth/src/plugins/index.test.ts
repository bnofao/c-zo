import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = {
  handler: vi.fn(),
  api: {
    getSession: vi.fn(),
    generateOpenAPISchema: vi.fn(),
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

const mockDb = vi.hoisted(() => ({
  query: vi.fn(),
}))

const mockSecondaryStorage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}))
const mockCreateSecondaryStorage = vi.hoisted(() => vi.fn(() => mockSecondaryStorage))

const mockStorageInstance = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}))

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

const mockUserService = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  ban: vi.fn(),
  unban: vi.fn(),
  remove: vi.fn(),
  setRole: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeSessions: vi.fn(),
  impersonate: vi.fn(),
  stopImpersonating: vi.fn(),
}))
const mockCreateUserService = vi.hoisted(() => vi.fn(() => mockUserService))

vi.mock('../services/secondary-storage', () => ({
  createSecondaryStorage: mockCreateSecondaryStorage,
}))

vi.mock('../services/user.service', () => ({
  createUserService: mockCreateUserService,
}))

vi.mock('nitro', () => ({
  definePlugin: (fn: (app: unknown) => Promise<void>) => fn,
}))

vi.mock('nitro/storage', () => ({
  useStorage: () => mockStorageInstance,
}))

describe('auth plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockCreateAuth.mockReturnValue(mockAuth)
  })

  function mockKitModules(authConfig?: Record<string, string>) {
    vi.doMock('@czo/kit', () => ({
      useContainer: () => mockContainer,
      useLogger: () => mockLogger,
    }))

    vi.doMock('@czo/kit/db', () => ({
      useDatabase: () => mockDb,
    }))

    const runtimeAuth = {
      secret: 'test-secret-key-32-chars-minimum!',
      baseUrl: 'http://localhost:4000',
      ...authConfig,
    }

    vi.doMock('nitro/runtime-config', () => ({
      useRuntimeConfig: () => ({ auth: runtimeAuth }),
    }))
  }

  function createNitroApp() {
    const hookCallbacks = new Map<string, (...args: unknown[]) => void>()
    const nitroApp = {
      hooks: {
        hook: vi.fn((name: string, cb: (...args: unknown[]) => void) => {
          hookCallbacks.set(name, cb)
        }),
      },
    }
    const boot = () => hookCallbacks.get('czo:boot')!()
    const request = (event: { context: Record<string, unknown> }) =>
      hookCallbacks.get('request')!(event)
    return { nitroApp, hookCallbacks, boot, request }
  }

  it('should create auth instance and bind to container', async () => {
    mockKitModules()
    const { default: plugin } = await import('./index')

    const { nitroApp, boot } = createNitroApp()

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)
    boot()

    expect(mockCreateAuth).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      secret: 'test-secret-key-32-chars-minimum!',
      baseUrl: 'http://localhost:4000',
      emailService: expect.any(Object),
    }))

    expect(mockContainer.bind).toHaveBeenCalledWith('auth', expect.any(Function))
  })

  it('should bind userService to container', async () => {
    mockKitModules()
    const { default: plugin } = await import('./index')

    const { nitroApp, boot } = createNitroApp()

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)
    boot()

    expect(mockCreateUserService).toHaveBeenCalledWith(mockAuth)
    expect(mockContainer.bind).toHaveBeenCalledWith('auth:users', expect.any(Function))
  })

  it('should inject auth into request context', async () => {
    mockKitModules()
    const { default: plugin } = await import('./index')

    const { nitroApp, hookCallbacks, boot, request } = createNitroApp()

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)
    boot()

    expect(hookCallbacks.has('request')).toBe(true)

    const event = { context: {} as Record<string, unknown> }
    request(event)

    expect(event.context.auth).toBe(mockAuth)
  })

  it('should log initialization message', async () => {
    mockKitModules()
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
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockContainer.bind).toHaveBeenCalledWith('auth:email', expect.any(Function))
  })

  it('should bind auth events service to container', async () => {
    mockKitModules()
    const { default: plugin } = await import('./index')

    const nitroApp = {
      hooks: { hook: vi.fn() },
    }

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)

    expect(mockContainer.bind).toHaveBeenCalledWith('auth:events', expect.any(Function))
  })

  it('should pass events service to createAuth', async () => {
    mockKitModules()
    const { default: plugin } = await import('./index')

    const { nitroApp, boot } = createNitroApp()

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)
    boot()

    const createAuthCall = mockCreateAuth.mock.calls[0]!
    expect(createAuthCall[1]).toHaveProperty('events')
    expect(createAuthCall[1].events).toBeInstanceOf(mockAuthEventsService)
  })

  it('should pass email service to createAuth', async () => {
    mockKitModules()
    const { default: plugin } = await import('./index')

    const { nitroApp, boot } = createNitroApp()

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)
    boot()

    const createAuthCall = mockCreateAuth.mock.calls[0]!
    expect(createAuthCall[1]).toHaveProperty('emailService')
    expect(createAuthCall[1].emailService).toBeDefined()
  })

  it('should pass secondary storage to createAuth via useStorage', async () => {
    mockKitModules()
    const { default: plugin } = await import('./index')

    const { nitroApp, boot } = createNitroApp()

    await (plugin as (app: unknown) => Promise<void>)(nitroApp)
    boot()

    expect(mockCreateSecondaryStorage).toHaveBeenCalledWith(mockStorageInstance)
    expect(mockCreateAuth).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      redis: { storage: mockSecondaryStorage },
    }))
  })

  describe('request context injection', () => {
    it('should inject db into request context', async () => {
      mockKitModules()
      const { default: plugin } = await import('./index')

      const { nitroApp, boot, request } = createNitroApp()

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)
      boot()

      const event = { context: {} as Record<string, unknown> }
      request(event)

      expect(event.context.db).toBe(mockDb)
    })

    it('should inject authEvents into request context', async () => {
      mockKitModules()
      const { default: plugin } = await import('./index')

      const { nitroApp, boot, request } = createNitroApp()

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)
      boot()

      const event = { context: {} as Record<string, unknown> }
      request(event)

      expect(event.context.authEvents).toBeInstanceOf(mockAuthEventsService)
    })

    it('should inject userService into request context', async () => {
      mockKitModules()
      const { default: plugin } = await import('./index')

      const { nitroApp, boot, request } = createNitroApp()

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)
      boot()

      const event = { context: {} as Record<string, unknown> }
      request(event)

      expect(event.context.userService).toBe(mockUserService)
    })

    it('should not inject blocklist or rotation into request context', async () => {
      mockKitModules()
      const { default: plugin } = await import('./index')

      const { nitroApp, boot, request } = createNitroApp()

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)
      boot()

      const event = { context: {} as Record<string, unknown> }
      request(event)

      expect(event.context.blocklist).toBeUndefined()
      expect(event.context.rotation).toBeUndefined()
    })
  })

  describe('authSecret injection', () => {
    it('should inject authSecret into request context', async () => {
      mockKitModules()
      const { default: plugin } = await import('./index')

      const { nitroApp, boot, request } = createNitroApp()

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)
      boot()

      const event = { context: {} as Record<string, unknown> }
      request(event)

      expect(event.context.authSecret).toBe('test-secret-key-32-chars-minimum!')
    })
  })

  describe('oauth config wiring', () => {
    it('should pass google oauth config to createAuth when env vars are set', async () => {
      mockKitModules({
        secret: 'test-secret-key-32-chars-minimum!',
        baseUrl: 'http://localhost:4000',
        googleClientId: 'google-client-id',
        googleClientSecret: 'google-client-secret',
      })
      const { default: plugin } = await import('./index')

      const { nitroApp, boot } = createNitroApp()

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)
      boot()

      expect(mockCreateAuth).toHaveBeenCalledWith(mockDb, expect.objectContaining({
        oauth: {
          google: {
            clientId: 'google-client-id',
            clientSecret: 'google-client-secret',
          },
        },
      }))
      expect(mockLogger.info).toHaveBeenCalledWith('Google OAuth configured')
    })

    it('should pass github oauth config to createAuth when env vars are set', async () => {
      mockKitModules({
        secret: 'test-secret-key-32-chars-minimum!',
        baseUrl: 'http://localhost:4000',
        githubClientId: 'github-client-id',
        githubClientSecret: 'github-client-secret',
      })
      const { default: plugin } = await import('./index')

      const { nitroApp, boot } = createNitroApp()

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)
      boot()

      expect(mockCreateAuth).toHaveBeenCalledWith(mockDb, expect.objectContaining({
        oauth: {
          github: {
            clientId: 'github-client-id',
            clientSecret: 'github-client-secret',
          },
        },
      }))
      expect(mockLogger.info).toHaveBeenCalledWith('GitHub OAuth configured')
    })

    it('should pass both providers when both are configured', async () => {
      mockKitModules({
        secret: 'test-secret-key-32-chars-minimum!',
        baseUrl: 'http://localhost:4000',
        googleClientId: 'g-id',
        googleClientSecret: 'g-secret',
        githubClientId: 'gh-id',
        githubClientSecret: 'gh-secret',
      })
      const { default: plugin } = await import('./index')

      const { nitroApp, boot } = createNitroApp()

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)
      boot()

      expect(mockCreateAuth).toHaveBeenCalledWith(mockDb, expect.objectContaining({
        oauth: {
          google: { clientId: 'g-id', clientSecret: 'g-secret' },
          github: { clientId: 'gh-id', clientSecret: 'gh-secret' },
        },
      }))
    })

    it('should not pass oauth when no provider env vars are set', async () => {
      mockKitModules()
      const { default: plugin } = await import('./index')

      const { nitroApp, boot } = createNitroApp()

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)
      boot()

      const createAuthCall = mockCreateAuth.mock.calls[0]!
      expect(createAuthCall[1].oauth).toBeUndefined()
    })

    it('should not configure google when only clientId is set (no secret)', async () => {
      mockKitModules({
        secret: 'test-secret-key-32-chars-minimum!',
        baseUrl: 'http://localhost:4000',
        googleClientId: 'google-client-id',
      })
      const { default: plugin } = await import('./index')

      const { nitroApp, boot } = createNitroApp()

      await (plugin as (app: unknown) => Promise<void>)(nitroApp)
      boot()

      const createAuthCall = mockCreateAuth.mock.calls[0]!
      expect(createAuthCall[1].oauth).toBeUndefined()
    })
  })
})
