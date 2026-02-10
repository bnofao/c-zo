import { afterEach, describe, expect, it, vi } from 'vitest'

describe('useTelemetry', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('returns a telemetry instance on init', async () => {
    const { useTelemetry, resetTelemetry } = await import('./use-telemetry')
    resetTelemetry()

    const telemetry = await useTelemetry()
    // Returns either SdkTelemetry or NoopTelemetry depending on available packages
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

    const telemetry = await useTelemetry({ enabled: false })
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
    // Before init, always returns noop
    expect(sync.isActive).toBe(false)

    resetTelemetry()
  })

  it('shutdownTelemetry calls shutdown on active instance', async () => {
    const { useTelemetry, shutdownTelemetry, resetTelemetry } = await import('./use-telemetry')
    resetTelemetry()

    const telemetry = await useTelemetry({ enabled: false })
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

    const first = await useTelemetry({ enabled: false })
    resetTelemetry()
    const second = await useTelemetry({ enabled: false })

    // Different instances after reset
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

    const telemetry = await useTelemetry({ enabled: true })
    expect(telemetry.isActive).toBe(false)

    resetTelemetry()
  })
})
