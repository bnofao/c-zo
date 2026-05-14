import type { UserEvent } from '../../services/events/user'
import { Effect, Layer, PubSub, Stream } from 'effect'
import { UserEvents } from '../../services/events/user'

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
export const UserEventsLive = Layer.scoped(
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
