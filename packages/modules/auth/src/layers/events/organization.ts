import type { OrganizationEvent } from '../../services/events/organization'
import { Effect, Layer, PubSub, Stream } from 'effect'
import { OrganizationEvents } from '../../services/events/organization'

/**
 * `OrganizationEvents` Live layer — backed by `PubSub.dropping({ capacity: 256 }).`
 * Same shape and rationale as `UserEventsLive`: dropping (never blocks publishers)
 * + explicit finalizer + `Effect.fn` spans. See `UserEventsLive` for the full
 * rationale on `dropping` vs `bounded`.
 */
export const OrganizationEventsLive = Layer.scoped(
  OrganizationEvents,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.dropping<OrganizationEvent>({ capacity: 256 })
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))

    const publish = Effect.fn('OrganizationEvents.publish')(function* (event: OrganizationEvent) {
      yield* PubSub.publish(pubsub, event)
    })

    const publishAll = Effect.fn('OrganizationEvents.publishAll')(function* (events: ReadonlyArray<OrganizationEvent>) {
      yield* PubSub.publishAll(pubsub, events)
    })

    return OrganizationEvents.of({
      publish,
      publishAll,
      subscribe: Stream.fromPubSub(pubsub),
    })
  }),
)
