import { beforeEach, describe, expect, it, vi } from 'vitest'

function mockRequestFactory(ctx: Record<string, unknown>) {
  return (ctx.request ?? new Request('http://test')) as Request
}

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

    registerContextFactory('auth', () => ({ user: 'alice' }) as any)
    registerContextFactory('product', () => ({ catalog: 'main' }) as any)

    const factories = registeredContextFactories()
    expect(factories).toHaveLength(2)
    expect(factories[0]!.name).toBe('auth')
    expect(factories[1]!.name).toBe('product')
  })

  it('should build context from all registered factories', async () => {
    const { registerContextFactory, buildGraphQLContext } = await import('./context')

    registerContextFactory('auth', ctx => ({
      authUser: ctx.rawAuth,
    }) as any)
    registerContextFactory('product', () => ({
      productService: { find: () => [] },
    }) as any)

    const result = await buildGraphQLContext({ rawAuth: 'session-123' }, mockRequestFactory)

    expect(result).toMatchObject({
      authUser: 'session-123',
      productService: { find: expect.any(Function) },
    })
  })

  it('should support async factories', async () => {
    const { registerContextFactory, buildGraphQLContext } = await import('./context')

    registerContextFactory('async-module', (async () => {
      await new Promise(r => setTimeout(r, 1))
      return { asyncValue: 42 }
    }) as any)

    const result = await buildGraphQLContext({}, mockRequestFactory)
    expect(result).toMatchObject({ asyncValue: 42 })
  })

  it('should merge all factory results into a single context', async () => {
    const { registerContextFactory, buildGraphQLContext } = await import('./context')

    registerContextFactory('a', () => ({ x: 1 }) as any)
    registerContextFactory('b', () => ({ y: 2 }) as any)
    registerContextFactory('c', () => ({ z: 3 }) as any)

    const result = await buildGraphQLContext({}, mockRequestFactory)
    expect(result).toMatchObject({ x: 1, y: 2, z: 3 })
  })

  it('should let later factories override earlier ones for same key', async () => {
    const { registerContextFactory, buildGraphQLContext } = await import('./context')

    registerContextFactory('base', () => ({ value: 'original' }) as any)
    registerContextFactory('override', () => ({ value: 'overridden' }) as any)

    const result = await buildGraphQLContext({}, mockRequestFactory)
    expect(result).toMatchObject({ value: 'overridden' })
  })

  it('should include request from requestFactory in context', async () => {
    const { buildGraphQLContext } = await import('./context')

    const result = await buildGraphQLContext({}, mockRequestFactory)
    expect(result.request).toBeInstanceOf(Request)
  })
})
