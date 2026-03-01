import { afterEach, describe, expect, it, vi } from 'vitest'

const mockMake = vi.hoisted(() => vi.fn())

vi.mock('@czo/kit/ioc', () => ({
  useContainer: vi.fn(() => ({
    make: mockMake,
  })),
}))

describe('useTelemetry', () => {
  afterEach(() => {
    vi.resetModules()
    mockMake.mockReset()
  })

  it('returns a telemetry instance on init', async () => {
    const { useTelemetry, resetTelemetry } = await import('./use-telemetry')
    resetTelemetry()

    const telemetry = await useTelemetry()
    expect(telemetry).toBeDefined()
    expect(typeof telemetry.tracer).toBe('function')
    expect(typeof telemetry.meter).toBe('function')
    expect(typeof telemetry.shutdown).toBe('function')

    await telemetry.shutdown()
    resetTelemetry()
  })

  it('returns NoopTelemetry when disabled via config', async () => {
    const { useTelemetry, resetTelemetry } = await import('./use-telemetry')
    resetTelemetry()

    const telemetry = await useTelemetry({ enabled: false } as any)
    expect(telemetry.isActive).toBe(false)

    resetTelemetry()
  })

  it('returns the same instance on subsequent calls', async () => {
    const { useTelemetry, resetTelemetry } = await import('./use-telemetry')
    resetTelemetry()

    const first = await useTelemetry()
    const second = await useTelemetry()
    expect(first).toBe(second)

    await first.shutdown()
    resetTelemetry()
  })

  it('useTelemetrySync returns a noop before async init', async () => {
    const { useTelemetrySync, resetTelemetry } = await import('./use-telemetry')
    resetTelemetry()

    const sync = useTelemetrySync()
    expect(sync.isActive).toBe(false)

    resetTelemetry()
  })

  it('shutdownTelemetry calls shutdown on active instance', async () => {
    const { useTelemetry, shutdownTelemetry, resetTelemetry } = await import('./use-telemetry')
    resetTelemetry()

    const telemetry = await useTelemetry({ enabled: false } as any)
    const shutdownSpy = vi.spyOn(telemetry, 'shutdown')

    await shutdownTelemetry()
    expect(shutdownSpy).toHaveBeenCalledOnce()

    resetTelemetry()
  })

  it('shutdownTelemetry is safe to call before init', async () => {
    const { shutdownTelemetry, resetTelemetry } = await import('./use-telemetry')
    resetTelemetry()

    await expect(shutdownTelemetry()).resolves.toBeUndefined()

    resetTelemetry()
  })

  it('resetTelemetry clears the singleton so next call re-initializes', async () => {
    const { useTelemetry, resetTelemetry } = await import('./use-telemetry')
    resetTelemetry()

    const first = await useTelemetry({ enabled: false } as any)
    resetTelemetry()
    const second = await useTelemetry({ enabled: false } as any)

    expect(first).not.toBe(second)
    expect(first.isActive).toBe(false)
    expect(second.isActive).toBe(false)

    resetTelemetry()
  })

  it('falls back to NoopTelemetry when SDK import fails', async () => {
    vi.doMock('./sdk', () => {
      throw new Error('Module not found')
    })

    const { useTelemetry, resetTelemetry } = await import('./use-telemetry')
    resetTelemetry()

    const telemetry = await useTelemetry({ enabled: true } as any)
    expect(telemetry.isActive).toBe(false)

    resetTelemetry()
  })

  describe('container config fallback', () => {
    it('should resolve telemetry config from the container when no config is passed', async () => {
      mockMake.mockResolvedValue({
        telemetry: {
          enabled: false,
          serviceName: 'test',
          serviceVersion: '1.0.0',
          endpoint: 'http://localhost:4318',
          protocol: 'http',
          samplingRatio: 1.0,
          logBridge: false,
        },
      })

      const { useTelemetry, resetTelemetry } = await import('./use-telemetry')
      resetTelemetry()

      const telemetry = await useTelemetry()

      expect(telemetry.isActive).toBe(false)
      expect(mockMake).toHaveBeenCalledWith('config')

      resetTelemetry()
    })

    it('should return NoopTelemetry when container has no telemetry config', async () => {
      mockMake.mockResolvedValue({})

      const { useTelemetry, resetTelemetry } = await import('./use-telemetry')
      resetTelemetry()

      const telemetry = await useTelemetry()

      expect(telemetry.isActive).toBe(false)

      resetTelemetry()
    })

    it('should return NoopTelemetry when container throws', async () => {
      mockMake.mockRejectedValue(new Error('Container not ready'))

      const { useTelemetry, resetTelemetry } = await import('./use-telemetry')
      resetTelemetry()

      const telemetry = await useTelemetry()

      expect(telemetry.isActive).toBe(false)

      resetTelemetry()
    })
  })
})
