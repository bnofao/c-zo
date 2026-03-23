import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAddHandler = vi.hoisted(() => vi.fn())
const mockAddScanDir = vi.hoisted(() => vi.fn())
const mockAddPlugin = vi.hoisted(() => vi.fn())
const mockResolver = vi.hoisted(() => ({
  resolve: vi.fn((...paths: string[]) => `/resolved/${paths.join('/')}`),
}))
const mockCreateResolver = vi.hoisted(() => vi.fn(() => mockResolver))
const mockDefineNitroModule = vi.hoisted(() => vi.fn((def: { setup: (...args: unknown[]) => void }) => def))

vi.mock('@czo/kit/nitro', () => ({
  defineNitroModule: mockDefineNitroModule,
  addHandler: mockAddHandler,
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

  it('should register plugin during setup', async () => {
    const { setup } = await importAndGetSetup()

    const nitro = {
      options: {
        runtimeConfig: {} as Record<string, any>,
      },
    }

    await setup(nitro)

    expect(mockCreateResolver).toHaveBeenCalled()
    expect(mockAddHandler).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/api/auth/**' }),
      nitro,
    )
    expect(mockAddPlugin).toHaveBeenCalledWith(
      expect.any(String),
      nitro,
    )
  })
})
