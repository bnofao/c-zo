import type { Effect, Stream } from 'effect'
import { Context } from 'effect'

/**
 * Organization-domain events as a discriminated union on `_tag` (Effect
 * convention — works with `Match`, `Data.TaggedEnum`, etc.).
 *
 * Scope: organization lifecycle + membership management. Invitation lifecycle
 * events (created, cancelled, accepted, rejected) will land in a separate
 * `InvitationEvents` bus when invitation workflows are migrated.
 *
 * Payload fields are inlined per variant.
 */
export type OrganizationEvent
  = | {
    readonly _tag: 'OrganizationCreated'
    readonly orgId: number
    readonly ownerId: number
    readonly name: string
    readonly type: string | null
  }
  | {
    readonly _tag: 'OrganizationUpdated'
    readonly orgId: number
    readonly changes: Record<string, unknown>
  }
  | {
    readonly _tag: 'OrganizationDeleted'
    readonly orgId: number
  }
  | {
    readonly _tag: 'MemberAdded'
    readonly orgId: number
    readonly userId: number
    readonly role: string
  }
  | {
    readonly _tag: 'MemberRemoved'
    readonly orgId: number
    readonly userId: number
  }
  | {
    readonly _tag: 'MemberRoleChanged'
    readonly orgId: number
    readonly userId: number
    readonly previousRole: string
    readonly newRole: string
  }

/**
 * Effect Tag exposing the organization-domain event bus.
 *
 * - `publish(event)` — push a single event.
 * - `publishAll(events)` — push a batch in one underlying call.
 * - `subscribe` — `Stream<OrganizationEvent>` fanning out from the
 *   `PubSub.bounded` provided by `OrganizationEventsLive`.
 */
export class OrganizationEvents extends Context.Service<
  OrganizationEvents,
  {
    readonly publish: (event: OrganizationEvent) => Effect.Effect<void>
    readonly publishAll: (events: ReadonlyArray<OrganizationEvent>) => Effect.Effect<void>
    readonly subscribe: Stream.Stream<OrganizationEvent>
  }
>()('@czo/auth/OrganizationEvents') {}
