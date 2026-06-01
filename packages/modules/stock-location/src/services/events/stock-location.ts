import { Context, Effect, Layer, PubSub, Stream } from 'effect'

/**
 * Stock-location domain events as a discriminated union on `_tag` (Effect
 * convention — works out of the box with `Match`, `Data.TaggedEnum`, etc.).
 *
 * Scope: stock-location lifecycle. Payload fields are inlined per variant — no
 * external `StockLocation*Payload` types — to keep this file the single source
 * of truth for the event surface.
 */
export type StockLocationEvent
  = | {
    readonly _tag: 'StockLocationCreated'
    readonly id: number
    readonly organizationId: number
    readonly handle: string
    readonly name: string
  }
  | {
    readonly _tag: 'StockLocationUpdated'
    readonly id: number
    readonly organizationId: number
    readonly changes: ReadonlyArray<string>
  }
  | {
    readonly _tag: 'StockLocationDeleted'
    readonly id: number
    readonly organizationId: number
    readonly handle: string
    /** `true` for hard delete (purge), `false` for soft delete. */
    readonly hard: boolean
  }
  | {
    readonly _tag: 'StockLocationStatusChanged'
    readonly id: number
    readonly organizationId: number
    readonly isActive: boolean
  }
  | {
    readonly _tag: 'StockLocationDefaultChanged'
    readonly id: number
    readonly organizationId: number
    readonly previousDefaultId: number | null
  }

/**
 * Effect Tag exposing the stock-location-domain event bus.
 *
 * - `publish(event)` — push a single event.
 * - `publishAll(events)` — push a batch (`PubSub.publishAll` does it in one call).
 * - `subscribe` — a `Stream<StockLocationEvent>` that fans out from the
 *   underlying `PubSub`. Each subscriber receives every event.
 */
export class StockLocationEvents extends Context.Service<
  StockLocationEvents,
  {
    readonly publish: (event: StockLocationEvent) => Effect.Effect<void>
    readonly publishAll: (events: ReadonlyArray<StockLocationEvent>) => Effect.Effect<void>
    readonly subscribe: Stream.Stream<StockLocationEvent>
  }
>()('@czo/stock-location/StockLocationEvents') {}

// ─── Layer ───────────────────────────────────────────────────────────────

/**
 * Event-bus layer.
 *
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
export const layer = Layer.effect(
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
