import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('graphql/context', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should start with no factories', async () => {
    const { registeredContextFactories } = await import('./context')
    expect(registeredContextFactories()).toHaveLength(0)
  })

  it('should accumulate factories via registerContextFactory()', async () => {
    const { registerContextFactory, registeredContextFactories } = await import('./context')

    registerContextFactory('auth', () => ({ user: 'alice' }))
    registerContextFactory('product', () => ({ catalog: 'main' }))

    const factories = registeredContextFactories()
    expect(factories).toHaveLength(2)
    expect(factories[0].name).toBe('auth')
    expect(factories[1].name).toBe('product')
  })

  it('should build context from all registered factories', async () => {
    const { registerContextFactory, buildGraphQLContext } = await import('./context')

    registerContextFactory('auth', ctx => ({
      authUser: ctx.rawAuth,
    }))
    registerContextFactory('product', () => ({
      productService: { find: () => [] },
    }))

    const result = await buildGraphQLContext({ rawAuth: 'session-123' })

    expect(result).toEqual({
      authUser: 'session-123',
      productService: { find: expect.any(Function) },
    })
  })

  it('should support async factories', async () => {
    const { registerContextFactory, buildGraphQLContext } = await import('./context')

    registerContextFactory('async-module', async () => {
      await new Promise(r => setTimeout(r, 1))
      return { asyncValue: 42 }
    })

    const result = await buildGraphQLContext({})
    expect(result).toEqual({ asyncValue: 42 })
  })

  it('should merge all factory results into a single context', async () => {
    const { registerContextFactory, buildGraphQLContext } = await import('./context')

    registerContextFactory('a', () => ({ x: 1 }))
    registerContextFactory('b', () => ({ y: 2 }))
    registerContextFactory('c', () => ({ z: 3 }))

    const result = await buildGraphQLContext({})
    expect(result).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('should let later factories override earlier ones for same key', async () => {
    const { registerContextFactory, buildGraphQLContext } = await import('./context')

    registerContextFactory('base', () => ({ value: 'original' }))
    registerContextFactory('override', () => ({ value: 'overridden' }))

    const result = await buildGraphQLContext({})
    expect(result).toEqual({ value: 'overridden' })
  })

  it('should return empty context when no factories registered', async () => {
    const { buildGraphQLContext } = await import('./context')

    const result = await buildGraphQLContext({ anything: true })
    expect(result).toEqual({})
  })
})
