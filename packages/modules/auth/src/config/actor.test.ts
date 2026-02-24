import type { ActorConfig, ActorProvider, AuthActorService } from './actor'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAuthActorService,
  DEFAULT_RESTRICTION_CONFIG,
} from './actor'

describe('authRestrictionRegistry', () => {
  let registry: AuthActorService

  beforeEach(() => {
    registry = createAuthActorService()
  })

  describe('registerActorType', () => {
    it('should register a new actor type with config', () => {
      const config: ActorConfig = {
        allowedMethods: ['email', 'oauth:google'],
      }

      registry.registerActor('customer', config)

      expect(registry.actorRestrictionConfig('customer')).toBe(config)
    })

    it('should throw on duplicate actor type registration', () => {
      const config: ActorConfig = {
        allowedMethods: ['email'],
      }

      registry.registerActor('customer', config)

      expect(() => registry.registerActor('customer', config)).toThrow(
        'Actor type "customer" is already registered',
      )
    })

    it('should throw when registry is frozen', () => {
      registry.freeze()

      expect(() =>
        registry.registerActor('customer', {
          allowedMethods: ['email'],
        }),
      ).toThrow('registry is frozen')
    })
  })

  describe('registerActorProvider', () => {
    it('should register a provider', async () => {
      const provider: ActorProvider = {
        type: 'customer',
        hasActorType: vi.fn().mockResolvedValue(true),
      }

      registry.registerProvider(provider)

      await expect(registry.hasActorType('u1', 'customer')).resolves.toBe(true)
    })

    it('should throw on duplicate provider registration', () => {
      const provider: ActorProvider = {
        type: 'customer',
        hasActorType: vi.fn(),
      }

      registry.registerProvider(provider)

      expect(() => registry.registerProvider(provider)).toThrow(
        'Provider for actor type "customer" is already registered',
      )
    })

    it('should throw when registry is frozen', () => {
      registry.freeze()

      expect(() =>
        registry.registerProvider({
          type: 'customer',
          hasActorType: vi.fn(),
        }),
      ).toThrow('registry is frozen')
    })
  })

  describe('getActorConfig', () => {
    it('should return the registered config for known actor types', () => {
      const config: ActorConfig = {
        allowedMethods: ['email', 'two-factor'],
        require2FA: true,
      }

      registry.registerActor('admin', config)

      expect(registry.actorRestrictionConfig('admin')).toBe(config)
    })

    it('should return DEFAULT_RESTRICTION_CONFIG for unknown actor types', () => {
      expect(registry.actorRestrictionConfig('unknown')).toBe(DEFAULT_RESTRICTION_CONFIG)
    })
  })

  describe('isMethodAllowed', () => {
    it('should return true when method is in allowedMethods', () => {
      registry.registerActor('customer', {
        allowedMethods: ['email', 'oauth:google'],
      })

      expect(registry.isMethodAllowedForActor('customer', 'email')).toBe(true)
      expect(registry.isMethodAllowedForActor('customer', 'oauth:google')).toBe(true)
    })

    it('should return false when method is not in allowedMethods', () => {
      registry.registerActor('customer', {
        allowedMethods: ['email'],
      })

      expect(registry.isMethodAllowedForActor('customer', 'oauth:github')).toBe(false)
      expect(registry.isMethodAllowedForActor('customer', 'two-factor')).toBe(false)
    })

    it('should use default config for unknown actor types', () => {
      expect(registry.isMethodAllowedForActor('unknown', 'email')).toBe(true)
      expect(registry.isMethodAllowedForActor('unknown', 'oauth:google')).toBe(false)
    })
  })

  describe('hasActorType', () => {
    it('should delegate to the registered provider', async () => {
      const hasActorType = vi.fn().mockResolvedValue(true)
      registry.registerProvider({ type: 'admin', hasActorType })

      const result = await registry.hasActorType('u1', 'admin')

      expect(result).toBe(true)
      expect(hasActorType).toHaveBeenCalledWith('u1')
    })

    it('should return false when no provider is registered', async () => {
      const result = await registry.hasActorType('u1', 'nonexistent')

      expect(result).toBe(false)
    })
  })

  describe('getRegisteredActorTypes', () => {
    it('should return empty array when no types registered', () => {
      expect(registry.registeredActors()).toEqual([])
    })

    it('should return all registered actor types', () => {
      registry.registerActor('customer', { allowedMethods: ['email'] })
      registry.registerActor('admin', { allowedMethods: ['email'] })

      const types = registry.registeredActors()

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
      registry.registerActor('customer', {
        allowedMethods: ['email'],
      })
      registry.freeze()

      expect(registry.actorRestrictionConfig('customer')).toBeDefined()
      expect(registry.isMethodAllowedForActor('customer', 'email')).toBe(true)
      expect(registry.registeredActors()).toEqual(['customer'])
    })
  })

  describe('singleton', () => {
    it('should return the same instance on repeated calls', async () => {
      vi.resetModules()
      const { useAuthActorService: useAuthRestrictionRegistry } = await import('./actor')

      const a = useAuthRestrictionRegistry()
      const b = useAuthRestrictionRegistry()

      expect(a).toBe(b)
    })
  })
})
