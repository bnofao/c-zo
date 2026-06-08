import { Context, Effect, Layer, PubSub, Stream } from 'effect'

/**
 * Inventory domain events as a discriminated union on `_tag` (Effect
 * convention — works out of the box with `Match`, `Data.TaggedEnum`, etc.).
 *
 * Scope: inventory item lifecycle, level changes, reservation lifecycle.
 * Payload fields are inlined per variant — no external `Inventory*Payload`
 * types — to keep this file the single source of truth for the event surface.
 */
export type InventoryEvent
  = | {
    readonly _tag: 'InventoryItemCreated'
    readonly id: number
    readonly organizationId: number
    readonly sku: string
  }
  | {
    readonly _tag: 'InventoryItemUpdated'
    readonly id: number
    readonly organizationId: number
    readonly changes: ReadonlyArray<string>
  }
  | {
    readonly _tag: 'InventoryItemDeleted'
    readonly id: number
    readonly organizationId: number
    readonly sku: string
  }
  | {
    readonly _tag: 'InventoryLevelChanged'
    readonly id: number
    readonly organizationId: number
    readonly inventoryItemId: number
    readonly stockLocationId: number
  }
  | {
    readonly _tag: 'ReservationCreated'
    readonly id: number
    readonly organizationId: number
    readonly inventoryItemId: number
    readonly quantity: number
  }
  | {
    readonly _tag: 'ReservationReleased'
    readonly id: number
    readonly organizationId: number
    readonly inventoryItemId: number
    readonly quantity: number
  }

/**
 * Effect Tag exposing the inventory-domain event bus.
 *
 * - `publish(event)` — push a single event.
 * - `publishAll(events)` — push a batch (`PubSub.publishAll` does it in one call).
 * - `subscribe` — a `Stream<InventoryEvent>` that fans out from the
 *   underlying `PubSub`. Each subscriber receives every event.
 */
export class InventoryEvents extends Context.Service<
  InventoryEvents,
  {
    readonly publish: (event: InventoryEvent) => Effect.Effect<void>
    readonly publishAll: (events: ReadonlyArray<InventoryEvent>) => Effect.Effect<void>
    readonly subscribe: Stream.Stream<InventoryEvent>
  }
>()('@czo/inventory/InventoryEvents') {}

// ─── Layer ───────────────────────────────────────────────────────────────

/**
 * Event-bus layer.
 *
 * `InventoryEvents` Live layer — backed by
 * `PubSub.dropping<InventoryEvent>({ capacity })`.
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
  InventoryEvents,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.dropping<InventoryEvent>({ capacity: 256 })
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))

    const publish = Effect.fn('InventoryEvents.publish')(function* (event: InventoryEvent) {
      yield* PubSub.publish(pubsub, event)
    })

    const publishAll = Effect.fn('InventoryEvents.publishAll')(function* (events: ReadonlyArray<InventoryEvent>) {
      yield* PubSub.publishAll(pubsub, events)
    })

    return InventoryEvents.of({
      publish,
      publishAll,
      subscribe: Stream.fromPubSub(pubsub),
    })
  }),
)
