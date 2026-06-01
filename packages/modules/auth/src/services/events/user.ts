import { Context, Effect, Layer, PubSub, Stream } from 'effect'

/**
 * User-domain events as a discriminated union on `_tag` (Effect convention —
 * works out of the box with `Match`, `Data.TaggedEnum`, etc.).
 *
 * Scope: user lifecycle (created, updated, role changed, banned, unbanned,
 * deleted). Password / session / 2FA events live in their own domain bus.
 *
 * Payload fields are inlined per variant — no external `Auth*Payload` types.
 */
export type UserEvent
  = | {
    readonly _tag: 'UserCreated'
    readonly userId: number
    readonly email: string
    readonly actorType?: string
  }
  | {
    readonly _tag: 'UserUpdated'
    readonly userId: number
    readonly changes: Record<string, unknown>
  }
  | {
    readonly _tag: 'UserBanned'
    readonly userId: number
    /** Actor who issued the ban — `null` for system / unattended actions. */
    readonly bannedBy: number | null
    readonly reason: string | null
    readonly expires: Date | null
  }
  | {
    readonly _tag: 'UserUnbanned'
    readonly userId: number
    /** Actor who lifted the ban — `null` for system / unattended actions. */
    readonly unbannedBy: number | null
  }
  | {
    readonly _tag: 'UserRoleChanged'
    readonly userId: number
    readonly previousRole: string | null
    readonly newRole: string
    /** Actor who changed the role — `null` for system / unattended actions. */
    readonly changedBy: number | null
  }
  | {
    readonly _tag: 'UserDeleted'
    readonly userId: number
    readonly email: string
  }

/**
 * Effect Tag exposing the user-domain event bus.
 *
 * - `publish(event)` — push a single event.
 * - `publishAll(events)` — push a batch atomically (best-effort, the
 *   underlying `PubSub.publishAll` does it in one call).
 * - `subscribe` — a `Stream<UserEvent>` that fans out from the underlying
 *   `PubSub.unbounded`. Subscribers acquire their own queue via the stream
 *   operator; multiple subscribers each get every event.
 */
export class UserEvents extends Context.Service<
  UserEvents,
  {
    readonly publish: (event: UserEvent) => Effect.Effect<void>
    readonly publishAll: (events: ReadonlyArray<UserEvent>) => Effect.Effect<void>
    readonly subscribe: Stream.Stream<UserEvent>
  }
>()('@czo/auth/UserEvents') {}

// ─── Layer ───────────────────────────────────────────────────────────────

/**
 * `UserEvents` Live layer — backed by `PubSub.dropping<UserEvent>({ capacity }).`
 *
 * **Dropping**, not bounded: a slow subscriber must NOT be able to backpressure
 * publishers because publishes run inside the request-handling fiber of the
 * mutating service method (`UserService.create`, `.update`, …). With `dropping`,
 * a full PubSub silently discards new events instead of blocking the publisher
 * — fire-and-forget delivery, at the cost of possible event loss. This is the
 * correct trade-off for domain events: the DB commit is the source of truth;
 * the event is a notification.
 *
 * The finalizer explicitly shuts the PubSub down when the surrounding scope
 * closes (i.e. when the kit's `ManagedRuntime` is disposed on Nitro `close`),
 * so any background `Stream.runForEach(events.subscribe, …)` fiber exits its
 * loop cleanly instead of being orphaned.
 *
 * `Effect.fn` wraps the publish methods with named spans for tracing —
 * `UserEvents.publish` / `UserEvents.publishAll` show up in any active
 * observability backend.
 */
export const layer = Layer.effect(
  UserEvents,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.dropping<UserEvent>({ capacity: 256 })
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))

    const publish = Effect.fn('UserEvents.publish')(function* (event: UserEvent) {
      yield* PubSub.publish(pubsub, event)
    })

    const publishAll = Effect.fn('UserEvents.publishAll')(function* (events: ReadonlyArray<UserEvent>) {
      yield* PubSub.publishAll(pubsub, events)
    })

    return UserEvents.of({
      publish,
      publishAll,
      subscribe: Stream.fromPubSub(pubsub),
    })
  }),
)
