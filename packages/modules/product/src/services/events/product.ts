import { Context, Effect, Layer, PubSub, Stream } from 'effect'

export interface ProductEvent {
  readonly _tag: 'ProductUnadopted'
  readonly productId: number
  readonly orgId: number
  readonly adoptionId: number
}

/**
 * Effect Tag exposing the product-domain event bus.
 *
 * - `publish(event)` — push a single event onto the PubSub.
 * - `subscribe` — a `Stream<ProductEvent>` that fans out from the underlying
 *   `PubSub.dropping`. Each subscriber gets every event published after it
 *   subscribes.
 */
export class ProductEvents extends Context.Service<ProductEvents, {
  readonly publish: (event: ProductEvent) => Effect.Effect<void>
  readonly subscribe: Stream.Stream<ProductEvent>
}>()('@czo/product/ProductEvents') {}

/**
 * `ProductEvents` Live layer — backed by `PubSub.dropping<ProductEvent>({ capacity: 256 })`.
 *
 * Dropping: a slow subscriber must NOT backpressure publishers because publishes
 * run inside the request fiber. With `dropping`, a full PubSub silently discards
 * new events instead of blocking — fire-and-forget at the cost of possible event
 * loss (the DB commit is the source of truth; the event is a notification).
 *
 * The finalizer shuts the PubSub down when the surrounding scope closes so any
 * background `Stream.runForEach` fiber exits cleanly.
 */
export const layer = Layer.effect(
  ProductEvents,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.dropping<ProductEvent>({ capacity: 256 })
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))

    const publish = Effect.fn('ProductEvents.publish')(function* (event: ProductEvent) {
      yield* PubSub.publish(pubsub, event)
    })

    return ProductEvents.of({ publish, subscribe: Stream.fromPubSub(pubsub) })
  }),
)
