import { Context, Effect, Layer, PubSub, Stream } from 'effect'

/**
 * Channel domain events as a discriminated union on `_tag` (Effect
 * convention — works out of the box with `Match`, `Data.TaggedEnum`, etc.).
 *
 * Scope: channel lifecycle. Payload fields are inlined per variant — no
 * external `Channel*Payload` types — to keep this file the single source
 * of truth for the event surface.
 */
export type ChannelEvent
  = | {
    readonly _tag: 'ChannelCreated'
    readonly id: number
    readonly organizationId: number
    readonly handle: string
    readonly name: string
  }
  | {
    readonly _tag: 'ChannelUpdated'
    readonly id: number
    readonly organizationId: number
    readonly changes: ReadonlyArray<string>
  }
  | {
    readonly _tag: 'ChannelDeleted'
    readonly id: number
    readonly organizationId: number
    readonly handle: string
  }
  | {
    readonly _tag: 'ChannelStockLocationsChanged'
    readonly id: number
    readonly organizationId: number
    readonly added: ReadonlyArray<number>
    readonly removed: ReadonlyArray<number>
  }

/**
 * Effect Tag exposing the channel-domain event bus.
 *
 * - `publish(event)` — push a single event.
 * - `publishAll(events)` — push a batch (`PubSub.publishAll` does it in one call).
 * - `subscribe` — a `Stream<ChannelEvent>` that fans out from the
 *   underlying `PubSub`. Each subscriber receives every event.
 */
export class ChannelEvents extends Context.Service<
  ChannelEvents,
  {
    readonly publish: (event: ChannelEvent) => Effect.Effect<void>
    readonly publishAll: (events: ReadonlyArray<ChannelEvent>) => Effect.Effect<void>
    readonly subscribe: Stream.Stream<ChannelEvent>
  }
>()('@czo/channel/ChannelEvents') {}

// ─── Layer ───────────────────────────────────────────────────────────────

/**
 * Event-bus layer.
 *
 * `ChannelEvents` Live layer — backed by
 * `PubSub.dropping<ChannelEvent>({ capacity })`.
 *
 * **Dropping**, not bounded: a slow subscriber must NOT backpressure publishers
 * because publishes run inside the request-handling fiber of the mutating
 * service methods. With `dropping`, a full PubSub silently discards new events
 * instead of blocking the publisher — fire-and-forget delivery at the cost of
 * possible event loss. The DB commit is the source of truth; the event is a
 * notification.
 *
 * The finalizer explicitly shuts the PubSub down when the surrounding scope
 * closes so any background `Stream.runForEach(events.subscribe, …)` fiber exits
 * cleanly instead of being orphaned.
 */
export const layer = Layer.effect(
  ChannelEvents,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.dropping<ChannelEvent>({ capacity: 256 })
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))

    const publish = Effect.fn('ChannelEvents.publish')(function* (event: ChannelEvent) {
      yield* PubSub.publish(pubsub, event)
    })

    const publishAll = Effect.fn('ChannelEvents.publishAll')(function* (events: ReadonlyArray<ChannelEvent>) {
      yield* PubSub.publishAll(pubsub, events)
    })

    return ChannelEvents.of({
      publish,
      publishAll,
      subscribe: Stream.fromPubSub(pubsub),
    })
  }),
)
