import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('graphql/resolvers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should include scalar resolvers by default', async () => {
    const { registeredResolvers } = await import('./resolvers')
    const resolvers = registeredResolvers()

    expect(resolvers.length).toBeGreaterThanOrEqual(1)
    const scalars = resolvers[0] as Record<string, unknown>
    expect(scalars.DateTime).toBeDefined()
    expect(scalars.EmailAddress).toBeDefined()
  })

  it('should accumulate resolvers via registerResolvers()', async () => {
    const { registerResolvers, registeredResolvers } = await import('./resolvers')
    const before = registeredResolvers().length

    const resolver1 = { Query: { hello: () => 'world' } }
    registerResolvers(resolver1)

    expect(registeredResolvers()).toHaveLength(before + 1)
    expect(registeredResolvers()[registeredResolvers().length - 1]).toBe(resolver1)
  })

  it('should accumulate multiple registrations', async () => {
    const { registerResolvers, registeredResolvers } = await import('./resolvers')
    const before = registeredResolvers().length

    registerResolvers({ Query: { a: () => 1 } })
    registerResolvers({ Mutation: { b: () => 2 } })
    registerResolvers({ Query: { c: () => 3 } })

    expect(registeredResolvers()).toHaveLength(before + 3)
  })
})
