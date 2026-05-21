import type { Effect, Stream } from 'effect'
import { Context } from 'effect'

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
