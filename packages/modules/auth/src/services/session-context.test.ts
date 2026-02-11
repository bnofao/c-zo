import { describe, expect, it } from 'vitest'
import { getSessionContext, runWithSessionContext } from './session-context'

describe('session context', () => {
  it('should return undefined when called outside runWithSessionContext', () => {
    expect(getSessionContext()).toBeUndefined()
  })

  it('should return the context data inside runWithSessionContext', () => {
    const data = { actorType: 'customer', authMethod: 'email' }
    runWithSessionContext(data, () => {
      expect(getSessionContext()).toEqual(data)
    })
  })

  it('should propagate organizationId when provided', () => {
    const data = { actorType: 'admin', authMethod: 'email', organizationId: 'org-123' }
    runWithSessionContext(data, () => {
      const ctx = getSessionContext()
      expect(ctx?.organizationId).toBe('org-123')
    })
  })

  it('should support nested contexts with inner overriding outer', () => {
    const outer = { actorType: 'customer', authMethod: 'email' }
    const inner = { actorType: 'admin', authMethod: 'oauth' }

    runWithSessionContext(outer, () => {
      expect(getSessionContext()?.actorType).toBe('customer')

      runWithSessionContext(inner, () => {
        expect(getSessionContext()?.actorType).toBe('admin')
        expect(getSessionContext()?.authMethod).toBe('oauth')
      })

      expect(getSessionContext()?.actorType).toBe('customer')
    })
  })

  it('should return undefined after runWithSessionContext completes', () => {
    runWithSessionContext({ actorType: 'customer', authMethod: 'email' }, () => {
      // context is set
    })
    expect(getSessionContext()).toBeUndefined()
  })

  it('should work with async functions', async () => {
    const data = { actorType: 'admin', authMethod: 'email', organizationId: 'org-1' }
    const result = await runWithSessionContext(data, async () => {
      await new Promise(resolve => setTimeout(resolve, 1))
      return getSessionContext()
    })
    expect(result).toEqual(data)
  })
})
