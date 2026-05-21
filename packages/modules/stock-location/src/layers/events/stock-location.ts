import type { StockLocationEvent } from '../../services/events/stock-location'
import { Effect, Layer, PubSub, Stream } from 'effect'
import { StockLocationEvents } from '../../services/events/stock-location'

/**
 * `StockLocationEvents` Live layer — backed by
 * `PubSub.dropping<StockLocationEvent>({ capacity })`.
 *
 * **Dropping**, not bounded: a slow subscriber must NOT backpressure publishers
 * because publishes run inside the request-handling fiber of the mutating
 * service methods. With `dropping`, a full PubSub silently discards new events
 * instead of blocking the publisher — fire-and-forget delivery at the cost of
 * possible event loss. The DB commit is the source of truth; the event is a
 * notification.
 *
 * The finalizer explicitly shuts the PubSub down when the surrounding scope
 * closes (i.e. when the kit's `ManagedRuntime` is disposed on Nitro `close`),
 * so any background `Stream.runForEach(events.subscribe, …)` fiber exits
 * cleanly instead of being orphaned.
 */
export const StockLocationEventsLive = Layer.effect(
  StockLocationEvents,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.dropping<StockLocationEvent>({ capacity: 256 })
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))

    const publish = Effect.fn('StockLocationEvents.publish')(function* (event: StockLocationEvent) {
      yield* PubSub.publish(pubsub, event)
    })

    const publishAll = Effect.fn('StockLocationEvents.publishAll')(function* (events: ReadonlyArray<StockLocationEvent>) {
      yield* PubSub.publishAll(pubsub, events)
    })

    return StockLocationEvents.of({
      publish,
      publishAll,
      subscribe: Stream.fromPubSub(pubsub),
    })
  }),
)
