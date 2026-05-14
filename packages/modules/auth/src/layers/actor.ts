import type { ActorConfig, ActorProvider } from '../services'
import { Effect, Layer } from 'effect'
import {
  ActorProviderAlreadyRegistered,
  ActorProviderFailed,
  ActorRegistryFrozen,
  ActorTypeAlreadyRegistered,
  AuthActorService,
  DEFAULT_RESTRICTION_CONFIG,
} from '../services'

/** Initial actor-type configs the registry is seeded with at construction. */
export type InitialActors = Readonly<Record<string, ActorConfig>>

/**
 * Build the `AuthActorService` Live layer, seeded with `initialActors`.
 *
 * Holds the actor-type registry as closure-local mutable `Map`s — the layer is
 * built once per runtime, so the state is effectively a per-runtime singleton
 * (mirroring the old module-level `useAuthActorService()` singleton). Registry
 * mutations (`registerActor`, `registerProvider`) fail with tagged errors once
 * `freeze` has been called; reads always succeed.
 *
 * @param initialActors - actor types pre-registered before the layer is handed out
 * @param freezeOnInit  - when true, the registry is frozen immediately after seeding
 */
export function makeAuthActorServiceLive(
  initialActors: InitialActors = {},
  freezeOnInit = false,
) {
  return Layer.sync(AuthActorService, () => {
    const configs = new Map<string, ActorConfig>(Object.entries(initialActors))
    const providers = new Map<string, ActorProvider>()
    let frozen = freezeOnInit

    return AuthActorService.of({
      registerActor: (type, config) =>
        Effect.gen(function* () {
          if (frozen)
            return yield* Effect.fail(new ActorRegistryFrozen({ subject: `actor type "${type}"` }))
          if (configs.has(type))
            return yield* Effect.fail(new ActorTypeAlreadyRegistered({ actorType: type }))
          configs.set(type, config)
        }),

      registerProvider: provider =>
        Effect.gen(function* () {
          if (frozen)
            return yield* Effect.fail(new ActorRegistryFrozen({ subject: `provider for "${provider.type}"` }))
          if (providers.has(provider.type))
            return yield* Effect.fail(new ActorProviderAlreadyRegistered({ actorType: provider.type }))
          providers.set(provider.type, provider)
        }),

      actorRestrictionConfig: type =>
        Effect.sync(() => configs.get(type) ?? DEFAULT_RESTRICTION_CONFIG),

      isMethodAllowedForActor: (type, method) =>
        Effect.sync(() => (configs.get(type) ?? DEFAULT_RESTRICTION_CONFIG).allowedMethods.includes(method)),

      hasActorType: (userId, type) =>
        Effect.suspend(() => {
          const provider = providers.get(type)
          if (!provider)
            return Effect.succeed(false)
          return Effect.tryPromise({
            try: () => provider.hasActorType(userId),
            catch: cause => new ActorProviderFailed({ actorType: type, cause }),
          })
        }),

      registeredActors: Effect.sync(() => [...configs.keys()]),

      freeze: Effect.sync(() => {
        frozen = true
      }),

      isFrozen: Effect.sync(() => frozen),
    })
  })
}

/** Convenience: empty, unfrozen registry (handy in tests). */
export const AuthActorServiceLive = makeAuthActorServiceLive()
