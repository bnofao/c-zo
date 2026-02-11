import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAddScanDir = vi.hoisted(() => vi.fn())
const mockAddPlugin = vi.hoisted(() => vi.fn())
const mockResolver = vi.hoisted(() => ({
  resolve: vi.fn((...paths: string[]) => `/resolved/${paths.join('/')}`),
}))
const mockCreateResolver = vi.hoisted(() => vi.fn(() => mockResolver))
const mockDefineNitroModule = vi.hoisted(() => vi.fn((def: { setup: (...args: unknown[]) => void }) => def))

vi.mock('@czo/kit/author', () => ({
  defineNitroModule: mockDefineNitroModule,
  addPlugin: mockAddPlugin,
  addScanDir: mockAddScanDir,
  createResolver: mockCreateResolver,
}))

describe('auth module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  async function importAndGetSetup() {
    const mod = await import('./module')
    const call = mockDefineNitroModule.mock.calls[0]
    return { mod, setup: call![0].setup }
  }

  it('should define a NitroModule with a setup function', async () => {
    const { mod } = await importAndGetSetup()
    expect(mockDefineNitroModule).toHaveBeenCalledWith(
      expect.objectContaining({
        setup: expect.any(Function),
      }),
    )
    expect(mod.default).toBeDefined()
  })

  it('should register scan dir and plugin during setup', async () => {
    const { setup } = await importAndGetSetup()

    const nitro = {
      options: {
        runtimeConfig: { czo: {} } as Record<string, any>,
      },
    }

    setup(nitro)

    expect(mockCreateResolver).toHaveBeenCalled()
    expect(mockAddScanDir).toHaveBeenCalledWith(
      expect.any(String),
      nitro,
    )
    expect(mockAddPlugin).toHaveBeenCalledWith(
      expect.any(String),
      nitro,
    )
  })

  it('should inject auth config defaults into runtimeConfig', async () => {
    const { setup } = await importAndGetSetup()

    const nitro = {
      options: {
        runtimeConfig: { czo: {} } as Record<string, any>,
      },
    }

    setup(nitro)

    const czo = nitro.options.runtimeConfig.czo
    expect(czo.auth).toEqual({
      secret: '',
      baseUrl: '',
    })
  })

  it('should preserve existing auth config values', async () => {
    const { setup } = await importAndGetSetup()

    const nitro = {
      options: {
        runtimeConfig: {
          czo: {
            auth: {
              secret: 'existing-secret',
              baseUrl: 'http://example.com',
            },
          },
        } as Record<string, any>,
      },
    }

    setup(nitro)

    const czo = nitro.options.runtimeConfig.czo
    expect(czo.auth.secret).toBe('existing-secret')
    expect(czo.auth.baseUrl).toBe('http://example.com')
  })
})
