import type { AccessStatementProvider } from './types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccessStatementRegistry } from './registry'

function makeProvider(name: string): AccessStatementProvider {
  return {
    name,
    statements: { [name]: ['read', 'create'] },
    roles: {
      [`${name}:viewer`]: {
        authorize: vi.fn().mockReturnValue({ success: true }),
        statements: { [name]: ['read'] },
      },
    },
  }
}

describe('accessStatementRegistry', () => {
  let registry: AccessStatementRegistry

  beforeEach(() => {
    registry = new AccessStatementRegistry()
  })

  describe('registerStatements', () => {
    it('should register a new statement provider', () => {
      const provider = makeProvider('product')

      registry.registerStatements(provider)

      expect(registry.getProviders()).toHaveLength(1)
      expect(registry.getProviders()[0]!.name).toBe('product')
    })

    it('should throw on duplicate provider name', () => {
      registry.registerStatements(makeProvider('product'))

      expect(() => registry.registerStatements(makeProvider('product'))).toThrow(
        'Statement provider "product" is already registered',
      )
    })

    it('should throw when registry is frozen', () => {
      registry.freeze()

      expect(() => registry.registerStatements(makeProvider('product'))).toThrow(
        'registry is frozen',
      )
    })
  })

  describe('getProviders', () => {
    it('should return empty array when no providers registered', () => {
      expect(registry.getProviders()).toEqual([])
    })

    it('should return a copy of providers', () => {
      registry.registerStatements(makeProvider('product'))

      const providers1 = registry.getProviders()
      const providers2 = registry.getProviders()

      expect(providers1).not.toBe(providers2)
      expect(providers1).toEqual(providers2)
    })
  })

  describe('getRoleMap', () => {
    it('should return empty map when no providers registered', () => {
      expect(registry.getRoleMap()).toEqual({})
    })

    it('should flatten all provider roles into a single map', () => {
      registry.registerStatements(makeProvider('product'))
      registry.registerStatements(makeProvider('order'))

      const roleMap = registry.getRoleMap()

      expect(Object.keys(roleMap)).toEqual(['product:viewer', 'order:viewer'])
    })

    it('should return roles with working authorize method', () => {
      registry.registerStatements(makeProvider('product'))

      const roleMap = registry.getRoleMap()

      expect(roleMap['product:viewer']!.authorize({ product: ['read'] })).toEqual({
        success: true,
      })
    })
  })

  describe('freeze / isFrozen', () => {
    it('should start unfrozen', () => {
      expect(registry.isFrozen()).toBe(false)
    })

    it('should be frozen after freeze()', () => {
      registry.freeze()

      expect(registry.isFrozen()).toBe(true)
    })

    it('should allow reads after freeze', () => {
      registry.registerStatements(makeProvider('product'))
      registry.freeze()

      expect(registry.getProviders()).toHaveLength(1)
      expect(registry.getRoleMap()).toHaveProperty('product:viewer')
    })
  })

  describe('singleton', () => {
    it('should return the same instance on repeated calls', async () => {
      vi.resetModules()
      const { useAccessStatementRegistry } = await import('./registry')

      const a = useAccessStatementRegistry()
      const b = useAccessStatementRegistry()

      expect(a).toBe(b)
    })
  })
})
