import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = {
  handler: vi.fn(),
  api: {
    getSession: vi.fn(),
    generateOpenAPISchema: vi.fn(),
  },
}

const mockCreateAuth = vi.hoisted(() => vi.fn(() => mockAuth))

const mockSingletons = vi.hoisted(() => new Map<string, () => unknown>())
const mockContainer = vi.hoisted(() => ({
  singleton: vi.fn((name: string, factory: () => unknown) => {
    mockSingletons.set(name, factory)
  }),
  make: vi.fn(async (name: string) => {
    const factory = mockSingletons.get(name)
    return factory ? factory() : undefined
  }),
}))

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  start: vi.fn(),
  success: vi.fn(),
}))

const mockDb = vi.hoisted(() => ({
  query: vi.fn(),
}))

const mockStorageInstance = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}))

const mockActorService = vi.hoisted(() => ({
  registerActor: vi.fn(),
  freeze: vi.fn(),
}))

const mockAccessService = vi.hoisted(() => ({
  register: vi.fn(),
  buildRoles: vi.fn(() => ({ ac: {}, roles: {} })),
  freeze: vi.fn(),
}))

const mockUserService = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}))
const mockCreateUserService = vi.hoisted(() => vi.fn(() => mockUserService))

const mockAuthService = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasPermission: vi.fn(),
}))
const mockCreateAuthService = vi.hoisted(() => vi.fn(() => mockAuthService))

const mockApiKeyService = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
}))
const mockCreateApiKeyService = vi.hoisted(() => vi.fn(() => mockApiKeyService))

const mockAppService = vi.hoisted(() => ({
  install: vi.fn(),
  installFromUrl: vi.fn(),
  uninstall: vi.fn(),
  getApp: vi.fn(),
  listApps: vi.fn(),
  updateManifest: vi.fn(),
  setStatus: vi.fn(),
}))
const mockCreateAppService = vi.hoisted(() => vi.fn(() => mockAppService))
const mockRegisterAppConsumer = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../config/auth', () => ({
  createAuth: mockCreateAuth,
}))

vi.mock('../services/user.service', () => ({
  createUserService: mockCreateUserService,
}))

vi.mock('../services/auth.service', () => ({
  createAuthService: mockCreateAuthService,
}))

vi.mock('../services/apiKey.service', () => ({
  createApiKeyService: mockCreateApiKeyService,
}))

vi.mock('../services/app.service', () => ({
  createAppService: mockCreateAppService,
}))

vi.mock('../consumers/app-register.consumer', () => ({
  registerAppConsumer: mockRegisterAppConsumer,
}))

vi.mock('nitro', () => ({
  definePlugin: (fn: (app: unknown) => Promise<void>) => fn,
}))

vi.mock('nitro/storage', () => ({
  useStorage: () => mockStorageInstance,
}))

// Mock GraphQL module imports (called inside czo:boot)
vi.mock('../graphql/context-factory', () => ({}))
vi.mock('../graphql/typedefs', () => ({}))
vi.mock('../graphql/resolvers', () => ({}))
vi.mock('../graphql/directives', () => ({}))

describe('auth plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockSingletons.clear()
    mockCreateAuth.mockReturnValue(mockAuth)
    mockAccessService.buildRoles.mockReturnValue({ ac: {}, roles: {} })
  })

  function mockKitModules(authConfig?: Record<string, string>) {
    vi.doMock('@czo/kit', () => ({
      useLogger: () => mockLogger,
    }))

    vi.doMock('@czo/kit/db', () => ({
      useDatabase: () => mockDb,
    }))

    vi.doMock('@czo/kit/ioc', () => ({
      useContainer: () => mockContainer,
    }))

    const runtimeAuth = {
      secret: 'test-secret-key-32-chars-minimum!',
      baseUrl: 'http://localhost:4000',
      ...authConfig,
    }

    vi.doMock('nitro/runtime-config', () => ({
      useRuntimeConfig: () => ({
        app: 'czo-test',
        baseUrl: 'http://localhost:4000',
        auth: runtimeAuth,
      }),
    }))
  }

  function createNitroApp() {
    const hookCallbacks = new Map<string, (...args: unknown[]) => Promise<void>>()
    const nitroApp = {
      hooks: {
        hook: vi.fn((name: string, cb: (...args: unknown[]) => Promise<void>) => {
          hookCallbacks.set(name, cb)
        }),
      },
    }
    const register = async () => {
      const cb = hookCallbacks.get('czo:register')
      if (cb)
        await cb()
    }
    const boot = async () => {
      const cb = hookCallbacks.get('czo:boot')
      if (cb)
        await cb()
    }
    const request = async (event: { context: Record<string, unknown> }) => {
      const cb = hookCallbacks.get('request')
      if (cb)
        await cb(event)
    }
    return { nitroApp, hookCallbacks, register, boot, request }
  }

  async function setupPlugin(authConfig?: Record<string, string>) {
    mockKitModules(authConfig)

    // Pre-register the services that module.ts would normally bind
    mockSingletons.set('auth:actor', () => mockActorService)
    mockSingletons.set('auth:access', () => mockAccessService)

    const { default: plugin } = await import('./index')
    const app = createNitroApp()

    await (plugin as (app: unknown) => Promise<void>)(app.nitroApp)
    return { plugin, ...app }
  }

  // ─── Secret validation ──────────────────────────────────────────────

  it('should warn and skip when auth secret is not configured', async () => {
    const { hookCallbacks } = await setupPlugin({ secret: '', baseUrl: '' })

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Auth secret not configured'),
    )
    // No hooks registered because plugin returned early
    expect(hookCallbacks.has('czo:boot')).toBe(false)
  })

  it('should error and skip when auth secret is too short', async () => {
    const { hookCallbacks } = await setupPlugin({
      secret: 'too-short',
      baseUrl: 'http://localhost:4000',
    })

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('at least 32 characters'),
    )
    expect(hookCallbacks.has('czo:boot')).toBe(false)
  })

  // ─── Hook registration ─────────────────────────────────────────────

  it('should register czo:init, czo:register and czo:boot hooks', async () => {
    const { hookCallbacks } = await setupPlugin()

    expect(hookCallbacks.has('czo:init')).toBe(true)
    expect(hookCallbacks.has('czo:register')).toBe(true)
    expect(hookCallbacks.has('czo:boot')).toBe(true)
  })

  // ─── czo:register hook ─────────────────────────────────────────────

  it('should register default actor restrictions during czo:register', async () => {
    const { register } = await setupPlugin()

    await register()

    expect(mockActorService.registerActor).toHaveBeenCalledWith(
      'admin',
      expect.objectContaining({
        require2FA: true,
        sessionDuration: 28800,
      }),
    )
  })

  it('should register access statements and hierarchies during czo:register', async () => {
    const { register } = await setupPlugin()

    await register()

    expect(mockAccessService.register).toHaveBeenCalledTimes(3)
    expect(mockAccessService.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'organization' }),
    )
    expect(mockAccessService.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'admin' }),
    )
    expect(mockAccessService.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'api-key' }),
    )
  })

  // ─── czo:boot hook ────────────────────────────────────────────────

  it('should create auth instance and bind to container during czo:boot', async () => {
    const { boot } = await setupPlugin()

    await boot()

    expect(mockCreateAuth).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      secret: 'test-secret-key-32-chars-minimum!',
    }))
    expect(mockContainer.singleton).toHaveBeenCalledWith('auth', expect.any(Function))
  })

  it('should bind userService to container during czo:boot', async () => {
    const { boot } = await setupPlugin()

    await boot()

    expect(mockCreateUserService).toHaveBeenCalledWith(mockAuth)
    expect(mockContainer.singleton).toHaveBeenCalledWith('auth:users', expect.any(Function))
  })

  it('should bind authService to container during czo:boot', async () => {
    const { boot } = await setupPlugin()

    await boot()

    expect(mockCreateAuthService).toHaveBeenCalledWith(mockAuth)
    expect(mockContainer.singleton).toHaveBeenCalledWith('auth:service', expect.any(Function))
  })

  it('should bind apiKeyService to container during czo:boot', async () => {
    const { boot } = await setupPlugin()

    await boot()

    expect(mockCreateApiKeyService).toHaveBeenCalledWith(mockAuth)
    expect(mockContainer.singleton).toHaveBeenCalledWith('auth:apikeys', expect.any(Function))
  })

  it('should bind appService to container during czo:boot', async () => {
    const { boot } = await setupPlugin()

    await boot()

    expect(mockCreateAppService).toHaveBeenCalledWith(mockDb, mockApiKeyService, mockAuthService, expect.any(Set))
    expect(mockContainer.singleton).toHaveBeenCalledWith('auth:apps', expect.any(Function))
  })

  it('should freeze actor and access registries during czo:boot', async () => {
    const { boot } = await setupPlugin()

    await boot()

    expect(mockActorService.freeze).toHaveBeenCalled()
    expect(mockAccessService.freeze).toHaveBeenCalled()
  })

  it('should log success during czo:boot', async () => {
    const { boot } = await setupPlugin()

    await boot()

    expect(mockLogger.success).toHaveBeenCalledWith(
      expect.stringContaining('booted'),
    )
  })

  // ─── czo:boot — access service integration ────────────────────────

  it('should call accessService.buildRoles and pass ac/roles to createAuth', async () => {
    const mockAc = { check: vi.fn() }
    const mockRoles = { admin: { name: 'admin' } }
    mockAccessService.buildRoles.mockReturnValue({ ac: mockAc, roles: mockRoles })

    const { boot } = await setupPlugin()

    await boot()

    expect(mockAccessService.buildRoles).toHaveBeenCalled()
    expect(mockCreateAuth).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      ac: mockAc,
      roles: mockRoles,
    }))
  })

  it('should pass storage from useStorage to createAuth', async () => {
    const { boot } = await setupPlugin()

    await boot()

    expect(mockCreateAuth).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      storage: mockStorageInstance,
    }))
  })
})
