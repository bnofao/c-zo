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

const mockDb = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('../config/auth.config', () => ({
  createAuth: mockCreateAuth,
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

  it('should create auth instance and bind to container', async () => {
    mockKitModules()
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

    expect(mockCreateAuth).toHaveBeenCalledWith(mockDb, {
      secret: 'test-secret-key-32-chars-minimum!',
      baseUrl: 'http://localhost:4000',
    })

    expect(mockContainer.bind).toHaveBeenCalledWith('auth', expect.any(Function))
  })

  it('should inject auth into request context', async () => {
    mockKitModules()
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
})
