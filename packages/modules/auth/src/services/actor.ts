import { Context, Data, Effect, Layer } from 'effect'

// ─── Types ────────────────────────────────────────────────────────────

export type AuthMethod = 'email' | `oauth:${string}`

export interface ActorConfig {
  allowedMethods: readonly AuthMethod[]
  enableRegistration?: boolean
  sessionDuration?: number
  allowImpersonation?: boolean
}

export interface ActorProvider {
  type: string
  hasActorType: (userId: string) => Promise<boolean>
}

// ─── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_SESSION_DURATION = 604800 // 7 days

export const DEFAULT_RESTRICTION_CONFIG: ActorConfig = {
  allowedMethods: ['email'],
  enableRegistration: true,
  sessionDuration: DEFAULT_SESSION_DURATION,
  allowImpersonation: false,
}

// ─── Tagged errors (also serve as Pothos GraphQL errors via registerError) ───

export class ActorRegistryFrozen extends Data.TaggedError('ActorRegistryFrozen')<{
  readonly subject: string
}> {
  readonly code = 'ACTOR_REGISTRY_FROZEN'
  get message() {
    return `Cannot register ${this.subject} — registry is frozen`
  }
}

export class ActorTypeAlreadyRegistered extends Data.TaggedError('ActorTypeAlreadyRegistered')<{
  readonly actorType: string
}> {
  readonly code = 'ACTOR_TYPE_ALREADY_REGISTERED'
  get message() {
    return `Actor type "${this.actorType}" is already registered`
  }
}

export class ActorProviderAlreadyRegistered extends Data.TaggedError('ActorProviderAlreadyRegistered')<{
  readonly actorType: string
}> {
  readonly code = 'ACTOR_PROVIDER_ALREADY_REGISTERED'
  get message() {
    return `Provider for actor type "${this.actorType}" is already registered`
  }
}

export class ActorProviderFailed extends Data.TaggedError('ActorProviderFailed')<{
  readonly actorType: string
  readonly cause: unknown
}> {
  readonly code = 'ACTOR_PROVIDER_FAILED'
  get message() {
    return `Actor provider for "${this.actorType}" failed`
  }
}

export type ActorError
  = | ActorRegistryFrozen
    | ActorTypeAlreadyRegistered
    | ActorProviderAlreadyRegistered
    | ActorProviderFailed

// ─── Service contract (Effect Tag) ───────────────────────────────────

export class AuthActorService extends Context.Service<
  AuthActorService,
  {
    readonly registerActor: (
      type: string,
      config: ActorConfig,
    ) => Effect.Effect<void, ActorRegistryFrozen | ActorTypeAlreadyRegistered>

    readonly registerProvider: (
      provider: ActorProvider,
    ) => Effect.Effect<void, ActorRegistryFrozen | ActorProviderAlreadyRegistered>

    readonly actorRestrictionConfig: (type: string) => Effect.Effect<ActorConfig>

    readonly isMethodAllowedForActor: (type: string, method: AuthMethod) => Effect.Effect<boolean>

    readonly hasActorType: (userId: string, type: string) => Effect.Effect<boolean, ActorProviderFailed>

    readonly registeredActors: Effect.Effect<readonly string[]>

    readonly freeze: Effect.Effect<void>

    readonly isFrozen: Effect.Effect<boolean>
  }
>()('@czo/auth/AuthActorService') {}

// ─── Layer ───────────────────────────────────────────────────────────────

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
export function makeLayer(
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

/** Default layer — empty, unfrozen registry. */
export const layer = makeLayer()
