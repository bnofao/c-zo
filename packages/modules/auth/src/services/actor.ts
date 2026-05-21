import type { Effect } from 'effect'
import { Context, Data } from 'effect'

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
