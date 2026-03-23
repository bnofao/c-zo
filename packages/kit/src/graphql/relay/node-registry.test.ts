// packages/kit/src/graphql/relay/node-registry.test.ts
import { describe, expect, it } from 'vitest'
import { createNodeRegistry } from './node-registry'

describe('createNodeRegistry', () => {
  it('should register and resolve a type', async () => {
    const registry = createNodeRegistry()
    registry.register('User', async id => ({ id, name: 'Alice' }))

    const globalId = btoa('User:abc-123')
    const result = await registry.resolve(globalId, {} as any)

    expect(result).toEqual({ id: 'abc-123', name: 'Alice', __typename: 'User' })
  })

  it('should throw for unregistered type', async () => {
    const registry = createNodeRegistry()
    const globalId = btoa('Unknown:123')

    await expect(registry.resolve(globalId, {} as any)).rejects.toThrow('Unknown')
  })

  it('should return null when resolver returns null', async () => {
    const registry = createNodeRegistry()
    registry.register('User', async () => null)

    const globalId = btoa('User:abc-123')
    const result = await registry.resolve(globalId, {} as any)

    expect(result).toBeNull()
  })

  it('should pass context to resolver', async () => {
    const registry = createNodeRegistry()
    const ctx = { auth: { session: { userId: 'u1' } } }

    registry.register('User', async (_id, receivedCtx) => {
      expect(receivedCtx).toBe(ctx)
      return { id: _id }
    })

    const globalId = btoa('User:abc')
    await registry.resolve(globalId, ctx as any)
  })
})
