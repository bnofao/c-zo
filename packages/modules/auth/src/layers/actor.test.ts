import type { Effect as EffectT } from 'effect'
import { expectFailure, expectSuccess } from '@czo/kit/effect'
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import {
  ActorProviderAlreadyRegistered,
  ActorRegistryFrozen,
  ActorTypeAlreadyRegistered,
  AuthActorService,
  DEFAULT_RESTRICTION_CONFIG,
} from '../services/actor'
import { AuthActorServiceLive } from './actor'

// Each `run*` call builds a fresh `AuthActorServiceLive` (Layer.sync), giving
// every test an isolated registry — equivalent to the old
// `createAuthActorService()` per `beforeEach`.

function runSuccess<A>(fn: (svc: typeof AuthActorService.Service) => EffectT.Effect<A, any>) {
  return expectSuccess(
    Effect.gen(function* () {
      const svc = yield* AuthActorService
      return yield* fn(svc)
    }).pipe(Effect.provide(AuthActorServiceLive)),
  )
}

function runFailure<T>(
  fn: (svc: typeof AuthActorService.Service) => EffectT.Effect<unknown, any>,
  Tag: { new (...args: any[]): T },
) {
  return expectFailure(
    Effect.gen(function* () {
      const svc = yield* AuthActorService
      return yield* fn(svc)
    }).pipe(Effect.provide(AuthActorServiceLive)),
    Tag,
  )
}

describe('authActorService layer', () => {
  describe('registerActor', () => {
    it('registers a new actor type with config', async () => {
      const config = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('customer', { allowedMethods: ['email', 'oauth:google'] })
          return yield* svc.actorRestrictionConfig('customer')
        }),
      )
      expect(config).toEqual({ allowedMethods: ['email', 'oauth:google'] })
    })

    it('fails on duplicate actor type registration', async () => {
      const err = await runFailure(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('customer', { allowedMethods: ['email'] })
          yield* svc.registerActor('customer', { allowedMethods: ['email'] })
        }), ActorTypeAlreadyRegistered)
      expect(err.message).toContain('"customer" is already registered')
    })

    it('fails when registry is frozen', async () => {
      const err = await runFailure(svc =>
        Effect.gen(function* () {
          yield* svc.freeze
          yield* svc.registerActor('customer', { allowedMethods: ['email'] })
        }), ActorRegistryFrozen)
      expect(err.message).toContain('registry is frozen')
    })
  })

  describe('registerProvider', () => {
    it('registers a provider used by hasActorType', async () => {
      const result = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.registerProvider({ type: 'customer', hasActorType: vi.fn().mockResolvedValue(true) })
          return yield* svc.hasActorType('u1', 'customer')
        }),
      )
      expect(result).toBe(true)
    })

    it('fails on duplicate provider registration', async () => {
      const err = await runFailure(svc =>
        Effect.gen(function* () {
          yield* svc.registerProvider({ type: 'customer', hasActorType: vi.fn() })
          yield* svc.registerProvider({ type: 'customer', hasActorType: vi.fn() })
        }), ActorProviderAlreadyRegistered)
      expect(err.message).toContain('Provider for actor type "customer"')
    })

    it('fails when registry is frozen', async () => {
      await runFailure(svc =>
        Effect.gen(function* () {
          yield* svc.freeze
          yield* svc.registerProvider({ type: 'customer', hasActorType: vi.fn() })
        }), ActorRegistryFrozen)
    })
  })

  describe('actorRestrictionConfig', () => {
    it('returns the registered config for known actor types', async () => {
      const config = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('admin', { allowedMethods: ['email', 'oauth:github'] })
          return yield* svc.actorRestrictionConfig('admin')
        }),
      )
      expect(config).toEqual({ allowedMethods: ['email', 'oauth:github'] })
    })

    it('returns DEFAULT_RESTRICTION_CONFIG for unknown actor types', async () => {
      const config = await runSuccess(svc => svc.actorRestrictionConfig('unknown'))
      expect(config).toBe(DEFAULT_RESTRICTION_CONFIG)
    })
  })

  describe('isMethodAllowedForActor', () => {
    it('returns true when method is in allowedMethods', async () => {
      const [a, b] = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('customer', { allowedMethods: ['email', 'oauth:google'] })
          return [
            yield* svc.isMethodAllowedForActor('customer', 'email'),
            yield* svc.isMethodAllowedForActor('customer', 'oauth:google'),
          ] as const
        }),
      )
      expect(a).toBe(true)
      expect(b).toBe(true)
    })

    it('returns false when method is not in allowedMethods', async () => {
      const allowed = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('customer', { allowedMethods: ['email'] })
          return yield* svc.isMethodAllowedForActor('customer', 'oauth:github')
        }),
      )
      expect(allowed).toBe(false)
    })

    it('uses the default config for unknown actor types', async () => {
      const [a, b] = await runSuccess(svc =>
        Effect.gen(function* () {
          return [
            yield* svc.isMethodAllowedForActor('unknown', 'email'),
            yield* svc.isMethodAllowedForActor('unknown', 'oauth:google'),
          ] as const
        }),
      )
      expect(a).toBe(true)
      expect(b).toBe(false)
    })
  })

  describe('hasActorType', () => {
    it('delegates to the registered provider', async () => {
      const hasActorType = vi.fn().mockResolvedValue(true)
      const result = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.registerProvider({ type: 'admin', hasActorType })
          return yield* svc.hasActorType('u1', 'admin')
        }),
      )
      expect(result).toBe(true)
      expect(hasActorType).toHaveBeenCalledWith('u1')
    })

    it('returns false when no provider is registered', async () => {
      const result = await runSuccess(svc => svc.hasActorType('u1', 'nonexistent'))
      expect(result).toBe(false)
    })
  })

  describe('registeredActors', () => {
    it('returns an empty array when no types are registered', async () => {
      const types = await runSuccess(svc => svc.registeredActors)
      expect(types).toEqual([])
    })

    it('returns all registered actor types', async () => {
      const types = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('customer', { allowedMethods: ['email'] })
          yield* svc.registerActor('admin', { allowedMethods: ['email'] })
          return yield* svc.registeredActors
        }),
      )
      expect(types).toEqual(['customer', 'admin'])
    })
  })

  describe('freeze / isFrozen', () => {
    it('starts unfrozen', async () => {
      expect(await runSuccess(svc => svc.isFrozen)).toBe(false)
    })

    it('is frozen after freeze', async () => {
      const frozen = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.freeze
          return yield* svc.isFrozen
        }),
      )
      expect(frozen).toBe(true)
    })

    it('still allows reads after freeze', async () => {
      const [config, allowed, types] = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('customer', { allowedMethods: ['email'] })
          yield* svc.freeze
          return [
            yield* svc.actorRestrictionConfig('customer'),
            yield* svc.isMethodAllowedForActor('customer', 'email'),
            yield* svc.registeredActors,
          ] as const
        }),
      )
      expect(config).toBeDefined()
      expect(allowed).toBe(true)
      expect(types).toEqual(['customer'])
    })
  })
})
