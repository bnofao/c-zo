import type { Effect, Stream } from 'effect'
import { Context } from 'effect'

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
