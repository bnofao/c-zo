import type { Effect as EffectNS, Stream as StreamNS } from 'effect'
import { Context, Effect, Layer, PubSub, Stream } from 'effect'

/**
 * Auth-domain events — the sign-up / sign-in flow. Distinct from `UserEvents`
 * (user lifecycle): `SignedUp` is the *self-registration act*. A discriminated
 * union on `_tag`, ready to grow (`SignedIn`, `SignedOut`, …).
 */
export type AuthEvent
  = | {
    readonly _tag: 'SignedUp'
    readonly userId: number
    readonly email: string
    readonly actorType: string
  }
  | {
    readonly _tag: 'ImpersonationStarted'
    readonly adminId: number
    readonly targetUserId: number
    readonly sessionToken: string
    readonly reason: string | null
    readonly expiresAt: Date
  }
  | {
    readonly _tag: 'ImpersonationStopped'
    readonly adminId: number
    readonly targetUserId: number
    readonly sessionToken: string
  }

export class AuthEvents extends Context.Service<AuthEvents, {
  readonly publish: (event: AuthEvent) => EffectNS.Effect<void>
  readonly publishAll: (events: ReadonlyArray<AuthEvent>) => EffectNS.Effect<void>
  readonly subscribe: StreamNS.Stream<AuthEvent>
}>()('@czo/auth/AuthEvents') {}

/**
 * `AuthEvents` Live layer — backed by `PubSub.dropping<AuthEvent>({ capacity })`,
 * matching `UserEvents`/`OrganizationEvents`: bounded, so a stalled subscriber
 * drops events rather than growing the buffer unbounded.
 *
 * `Layer.effect` (not `Layer.scoped`) is the correct API in effect@4.0.0-beta.66
 * for a layer that uses `Effect.addFinalizer` for cleanup — the runtime strips
 * `Scope` from `R` automatically (replacing Effect 3's `Layer.scoped`).
 *
 * The finalizer shuts the PubSub down when the surrounding scope closes so any
 * background `Stream.runForEach(events.subscribe, …)` fiber exits cleanly.
 */
export const layer = Layer.effect(
  AuthEvents,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.dropping<AuthEvent>({ capacity: 256 })
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))

    const publish = Effect.fn('AuthEvents.publish')(function* (event: AuthEvent) {
      yield* PubSub.publish(pubsub, event)
    })

    const publishAll = Effect.fn('AuthEvents.publishAll')(function* (events: ReadonlyArray<AuthEvent>) {
      yield* PubSub.publishAll(pubsub, events)
    })

    return AuthEvents.of({
      publish,
      publishAll,
      subscribe: Stream.fromPubSub(pubsub),
    })
  }),
)
