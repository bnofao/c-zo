import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('useContainer', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should return a Container instance', async () => {
    const { useContainer } = await import('./ioc')
    const container = useContainer()
    expect(container).toBeDefined()
    expect(typeof container.bind).toBe('function')
    expect(typeof container.make).toBe('function')
  })

  it('should return the same instance on repeated calls (singleton)', async () => {
    const { useContainer } = await import('./ioc')
    const first = useContainer()
    const second = useContainer()
    expect(first).toBe(second)
  })

  it('should re-export Container class from @adonisjs/fold', async () => {
    const { Container } = await import('./ioc')
    expect(Container).toBeDefined()
    expect(typeof Container).toBe('function')
  })
})
