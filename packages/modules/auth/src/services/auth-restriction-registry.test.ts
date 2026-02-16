import type { ActorRestrictionConfig, ActorTypeProvider } from './auth-restriction-registry'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthRestrictionRegistry,
  DEFAULT_RESTRICTION_CONFIG,
} from './auth-restriction-registry'

describe('authRestrictionRegistry', () => {
  let registry: AuthRestrictionRegistry

  beforeEach(() => {
    registry = new AuthRestrictionRegistry()
  })

  describe('registerActorType', () => {
    it('should register a new actor type with config', () => {
      const config: ActorRestrictionConfig = {
        allowedMethods: ['email', 'oauth:google'],
        priority: 10,
      }

      registry.registerActorType('customer', config)

      expect(registry.getActorConfig('customer')).toBe(config)
    })

    it('should throw on duplicate actor type registration', () => {
      const config: ActorRestrictionConfig = {
        allowedMethods: ['email'],
        priority: 10,
      }

      registry.registerActorType('customer', config)

      expect(() => registry.registerActorType('customer', config)).toThrow(
        'Actor type "customer" is already registered',
      )
    })

    it('should throw when registry is frozen', () => {
      registry.freeze()

      expect(() =>
        registry.registerActorType('customer', {
          allowedMethods: ['email'],
          priority: 10,
        }),
      ).toThrow('registry is frozen')
    })
  })

  describe('registerActorProvider', () => {
    it('should register a provider', async () => {
      const provider: ActorTypeProvider = {
        actorType: 'customer',
        hasActorType: vi.fn().mockResolvedValue(true),
      }

      registry.registerActorProvider(provider)

      await expect(registry.hasActorType('u1', 'customer')).resolves.toBe(true)
    })

    it('should throw on duplicate provider registration', () => {
      const provider: ActorTypeProvider = {
        actorType: 'customer',
        hasActorType: vi.fn(),
      }

      registry.registerActorProvider(provider)

      expect(() => registry.registerActorProvider(provider)).toThrow(
        'Provider for actor type "customer" is already registered',
      )
    })

    it('should throw when registry is frozen', () => {
      registry.freeze()

      expect(() =>
        registry.registerActorProvider({
          actorType: 'customer',
          hasActorType: vi.fn(),
        }),
      ).toThrow('registry is frozen')
    })
  })

  describe('getActorConfig', () => {
    it('should return the registered config for known actor types', () => {
      const config: ActorRestrictionConfig = {
        allowedMethods: ['email', 'two-factor'],
        priority: 100,
        require2FA: true,
      }

      registry.registerActorType('admin', config)

      expect(registry.getActorConfig('admin')).toBe(config)
    })

    it('should return DEFAULT_RESTRICTION_CONFIG for unknown actor types', () => {
      expect(registry.getActorConfig('unknown')).toBe(DEFAULT_RESTRICTION_CONFIG)
    })
  })

  describe('isMethodAllowed', () => {
    it('should return true when method is in allowedMethods', () => {
      registry.registerActorType('customer', {
        allowedMethods: ['email', 'oauth:google'],
        priority: 10,
      })

      expect(registry.isMethodAllowed('customer', 'email')).toBe(true)
      expect(registry.isMethodAllowed('customer', 'oauth:google')).toBe(true)
    })

    it('should return false when method is not in allowedMethods', () => {
      registry.registerActorType('customer', {
        allowedMethods: ['email'],
        priority: 10,
      })

      expect(registry.isMethodAllowed('customer', 'oauth:github')).toBe(false)
      expect(registry.isMethodAllowed('customer', 'two-factor')).toBe(false)
    })

    it('should use default config for unknown actor types', () => {
      expect(registry.isMethodAllowed('unknown', 'email')).toBe(true)
      expect(registry.isMethodAllowed('unknown', 'oauth:google')).toBe(false)
    })
  })

  describe('hasActorType', () => {
    it('should delegate to the registered provider', async () => {
      const hasActorType = vi.fn().mockResolvedValue(true)
      registry.registerActorProvider({ actorType: 'admin', hasActorType })

      const result = await registry.hasActorType('u1', 'admin')

      expect(result).toBe(true)
      expect(hasActorType).toHaveBeenCalledWith('u1')
    })

    it('should return false when no provider is registered', async () => {
      const result = await registry.hasActorType('u1', 'nonexistent')

      expect(result).toBe(false)
    })
  })

  describe('getEffectiveConfig', () => {
    it('should return default config when no providers match', async () => {
      registry.registerActorProvider({
        actorType: 'admin',
        hasActorType: vi.fn().mockResolvedValue(false),
      })

      const config = await registry.getEffectiveConfig('u1')

      expect(config).toEqual({
        require2FA: false,
        sessionDuration: 604800,
        allowImpersonation: false,
        dominantActorType: 'unknown',
        allowedMethods: ['email'],
        actorTypes: [],
      })
    })

    it('should return config for a single matched actor type', async () => {
      registry.registerActorType('customer', {
        allowedMethods: ['email', 'oauth:google'],
        priority: 10,
        require2FA: false,
        sessionDuration: 604800,
        allowImpersonation: true,
      })
      registry.registerActorProvider({
        actorType: 'customer',
        hasActorType: vi.fn().mockResolvedValue(true),
      })

      const config = await registry.getEffectiveConfig('u1')

      expect(config).toEqual({
        require2FA: false,
        sessionDuration: 604800,
        allowImpersonation: true,
        dominantActorType: 'customer',
        allowedMethods: ['email', 'oauth:google'],
        actorTypes: ['customer'],
      })
    })

    it('should resolve multi-role with most-restrictive-wins', async () => {
      registry.registerActorType('customer', {
        allowedMethods: ['email', 'oauth:google'],
        priority: 10,
        require2FA: false,
        sessionDuration: 604800,
        allowImpersonation: true,
      })
      registry.registerActorType('admin', {
        allowedMethods: ['email', 'oauth:github', 'two-factor'],
        priority: 100,
        require2FA: true,
        sessionDuration: 28800,
        allowImpersonation: false,
      })
      registry.registerActorProvider({
        actorType: 'customer',
        hasActorType: vi.fn().mockResolvedValue(true),
      })
      registry.registerActorProvider({
        actorType: 'admin',
        hasActorType: vi.fn().mockResolvedValue(true),
      })

      const config = await registry.getEffectiveConfig('u1')

      // require2FA: OR'd → true (admin has it)
      expect(config.require2FA).toBe(true)
      // sessionDuration: MIN'd → 28800 (admin's shorter duration)
      expect(config.sessionDuration).toBe(28800)
      // allowImpersonation: AND'd → false (admin disallows)
      expect(config.allowImpersonation).toBe(false)
      // allowedMethods: intersected → only 'email' (common to both)
      expect(config.allowedMethods).toEqual(['email'])
      // dominantActorType: highest priority → admin (100 > 10)
      expect(config.dominantActorType).toBe('admin')
      expect(config.actorTypes).toEqual(['customer', 'admin'])
    })

    it('should handle missing optional fields with defaults', async () => {
      registry.registerActorType('basic', {
        allowedMethods: ['email'],
        priority: 1,
        // require2FA, sessionDuration, allowImpersonation all undefined
      })
      registry.registerActorProvider({
        actorType: 'basic',
        hasActorType: vi.fn().mockResolvedValue(true),
      })

      const config = await registry.getEffectiveConfig('u1')

      expect(config.require2FA).toBe(false)
      expect(config.sessionDuration).toBe(604800) // default
      expect(config.allowImpersonation).toBe(false) // undefined !== true
    })
  })

  describe('getRegisteredActorTypes', () => {
    it('should return empty array when no types registered', () => {
      expect(registry.getRegisteredActorTypes()).toEqual([])
    })

    it('should return all registered actor types', () => {
      registry.registerActorType('customer', { allowedMethods: ['email'], priority: 10 })
      registry.registerActorType('admin', { allowedMethods: ['email'], priority: 100 })

      const types = registry.getRegisteredActorTypes()

      expect(types).toEqual(['customer', 'admin'])
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

    it('should still allow reads after freeze', () => {
      registry.registerActorType('customer', {
        allowedMethods: ['email'],
        priority: 10,
      })
      registry.freeze()

      expect(registry.getActorConfig('customer')).toBeDefined()
      expect(registry.isMethodAllowed('customer', 'email')).toBe(true)
      expect(registry.getRegisteredActorTypes()).toEqual(['customer'])
    })
  })

  describe('singleton', () => {
    it('should return the same instance on repeated calls', async () => {
      vi.resetModules()
      const { useAuthRestrictionRegistry } = await import('./auth-restriction-registry')

      const a = useAuthRestrictionRegistry()
      const b = useAuthRestrictionRegistry()

      expect(a).toBe(b)
    })
  })
})
