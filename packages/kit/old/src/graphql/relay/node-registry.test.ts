import { describe, expect, it } from 'vitest'
import { registerNodeResolver, resolveNode } from './node-registry'

// The registry is a global module-level map, so we need a way to reset it between tests.
// For now, we register unique type names per test to avoid collisions.

describe('registerNodeResolver / resolveNode', () => {
  it('should register and resolve a type', async () => {
    registerNodeResolver('User', async id => ({ id, name: 'Alice' }))

    const globalId = btoa('User:abc-123')
    const result = await resolveNode(globalId, {} as any)

    expect(result).toEqual({ id: 'abc-123', name: 'Alice', __typename: 'User' })
  })

  it('should throw for unregistered type', async () => {
    const globalId = btoa('Unknown:123')

    await expect(resolveNode(globalId, {} as any)).rejects.toThrow('Unknown')
  })

  it('should return null when resolver returns null', async () => {
    registerNodeResolver('NullType', async () => null)

    const globalId = btoa('NullType:abc-123')
    const result = await resolveNode(globalId, {} as any)

    expect(result).toBeNull()
  })

  it('should pass context to resolver', async () => {
    const ctx = { auth: { session: { userId: 'u1' } } }

    registerNodeResolver('CtxType', async (_id, receivedCtx) => {
      expect(receivedCtx).toBe(ctx)
      return { id: _id }
    })

    const globalId = btoa('CtxType:abc')
    await resolveNode(globalId, ctx as any)
  })
})
