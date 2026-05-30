import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { vi } from 'vitest'
import * as Actor from './actor'

// Each test gets a fresh `Actor.layer` (Layer.sync) → isolated registry.
function withSvc<A, E>(fn: (svc: typeof Actor.AuthActorService.Service) => Effect.Effect<A, E>) {
  return Effect.gen(function* () {
    const svc = yield* Actor.AuthActorService
    return yield* fn(svc)
  }).pipe(Effect.provide(Actor.layer))
}

describe('authActorService layer', () => {
  describe('registerActor', () => {
    it.effect('registers a new actor type with config', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('customer', { allowedMethods: ['email', 'oauth:google'] })
          const config = yield* svc.actorRestrictionConfig('customer')
          expect(config).toEqual({ allowedMethods: ['email', 'oauth:google'] })
        })))

    it.effect('fails on duplicate actor type registration', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('customer', { allowedMethods: ['email'] })
          const err = yield* svc.registerActor('customer', { allowedMethods: ['email'] }).pipe(Effect.flip)
          expect(err).toBeInstanceOf(Actor.ActorTypeAlreadyRegistered)
          expect(err.message).toContain('"customer" is already registered')
        })))

    it.effect('fails when registry is frozen', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          yield* svc.freeze
          const err = yield* svc.registerActor('customer', { allowedMethods: ['email'] }).pipe(Effect.flip)
          expect(err).toBeInstanceOf(Actor.ActorRegistryFrozen)
          expect(err.message).toContain('registry is frozen')
        })))
  })

  describe('registerProvider', () => {
    it.effect('registers a provider used by hasActorType', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          yield* svc.registerProvider({ type: 'customer', hasActorType: vi.fn().mockResolvedValue(true) })
          const result = yield* svc.hasActorType('u1', 'customer')
          expect(result).toBe(true)
        })))

    it.effect('fails on duplicate provider registration', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          yield* svc.registerProvider({ type: 'customer', hasActorType: vi.fn() })
          const err = yield* svc.registerProvider({ type: 'customer', hasActorType: vi.fn() }).pipe(Effect.flip)
          expect(err).toBeInstanceOf(Actor.ActorProviderAlreadyRegistered)
          expect(err.message).toContain('Provider for actor type "customer"')
        })))

    it.effect('fails when registry is frozen', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          yield* svc.freeze
          const err = yield* svc.registerProvider({ type: 'customer', hasActorType: vi.fn() }).pipe(Effect.flip)
          expect(err).toBeInstanceOf(Actor.ActorRegistryFrozen)
        })))
  })

  describe('actorRestrictionConfig', () => {
    it.effect('returns the registered config for known actor types', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('admin', { allowedMethods: ['email', 'oauth:github'] })
          const config = yield* svc.actorRestrictionConfig('admin')
          expect(config).toEqual({ allowedMethods: ['email', 'oauth:github'] })
        })))

    it.effect('returns DEFAULT_RESTRICTION_CONFIG for unknown actor types', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          const config = yield* svc.actorRestrictionConfig('unknown')
          expect(config).toBe(Actor.DEFAULT_RESTRICTION_CONFIG)
        })))
  })

  describe('isMethodAllowedForActor', () => {
    it.effect('returns true when method is in allowedMethods', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('customer', { allowedMethods: ['email', 'oauth:google'] })
          expect(yield* svc.isMethodAllowedForActor('customer', 'email')).toBe(true)
          expect(yield* svc.isMethodAllowedForActor('customer', 'oauth:google')).toBe(true)
        })))

    it.effect('returns false when method is not in allowedMethods', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('customer', { allowedMethods: ['email'] })
          expect(yield* svc.isMethodAllowedForActor('customer', 'oauth:github')).toBe(false)
        })))

    it.effect('uses the default config for unknown actor types', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          expect(yield* svc.isMethodAllowedForActor('unknown', 'email')).toBe(true)
          expect(yield* svc.isMethodAllowedForActor('unknown', 'oauth:google')).toBe(false)
        })))
  })

  describe('hasActorType', () => {
    it.effect('delegates to the registered provider', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          const hasActorType = vi.fn().mockResolvedValue(true)
          yield* svc.registerProvider({ type: 'admin', hasActorType })
          const result = yield* svc.hasActorType('u1', 'admin')
          expect(result).toBe(true)
          expect(hasActorType).toHaveBeenCalledWith('u1')
        })))

    it.effect('returns false when no provider is registered', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          const result = yield* svc.hasActorType('u1', 'nonexistent')
          expect(result).toBe(false)
        })))
  })

  describe('registeredActors', () => {
    it.effect('returns an empty array when no types are registered', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          const types = yield* svc.registeredActors
          expect(types).toEqual([])
        })))

    it.effect('returns all registered actor types', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('customer', { allowedMethods: ['email'] })
          yield* svc.registerActor('admin', { allowedMethods: ['email'] })
          const types = yield* svc.registeredActors
          expect(types).toEqual(['customer', 'admin'])
        })))
  })

  describe('freeze / isFrozen', () => {
    it.effect('starts unfrozen', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          expect(yield* svc.isFrozen).toBe(false)
        })))

    it.effect('is frozen after freeze', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          yield* svc.freeze
          expect(yield* svc.isFrozen).toBe(true)
        })))

    it.effect('still allows reads after freeze', () =>
      withSvc(svc =>
        Effect.gen(function* () {
          yield* svc.registerActor('customer', { allowedMethods: ['email'] })
          yield* svc.freeze
          expect(yield* svc.actorRestrictionConfig('customer')).toBeDefined()
          expect(yield* svc.isMethodAllowedForActor('customer', 'email')).toBe(true)
          expect(yield* svc.registeredActors).toEqual(['customer'])
        })))
  })
})
