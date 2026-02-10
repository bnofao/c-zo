import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('graphql/resolvers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should return an empty array by default', async () => {
    const { registeredResolvers } = await import('./resolvers')
    expect(registeredResolvers()).toEqual([])
  })

  it('should accumulate resolvers via registerResolvers()', async () => {
    const { registerResolvers, registeredResolvers } = await import('./resolvers')

    const resolver1 = { Query: { hello: () => 'world' } }
    registerResolvers(resolver1)

    expect(registeredResolvers()).toHaveLength(1)
    expect(registeredResolvers()[0]).toBe(resolver1)
  })

  it('should accumulate multiple registrations', async () => {
    const { registerResolvers, registeredResolvers } = await import('./resolvers')

    registerResolvers({ Query: { a: () => 1 } })
    registerResolvers({ Mutation: { b: () => 2 } })
    registerResolvers({ Query: { c: () => 3 } })

    expect(registeredResolvers()).toHaveLength(3)
  })
})
