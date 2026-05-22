import { Context, Effect, Layer, PubSub, Stream } from 'effect'

/**
 * Organization-domain events as a discriminated union on `_tag` (Effect
 * convention — works with `Match`, `Data.TaggedEnum`, etc.).
 *
 * Scope: organization lifecycle + membership management. Invitation lifecycle
 * events (created, accepted, rejected) are part of `OrganizationEvent` —
 * no separate bus is used.
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
  | {
    readonly _tag: 'InvitationCreated'
    readonly invitationId: number
    readonly orgId: number
    readonly email: string
    readonly role: string
    readonly inviterId: number
  }
  | {
    readonly _tag: 'InvitationAccepted'
    readonly invitationId: number
    readonly orgId: number
    readonly userId: number
  }
  | {
    readonly _tag: 'InvitationRejected'
    readonly invitationId: number
    readonly orgId: number
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

// ─── Layer ───────────────────────────────────────────────────────────────

/**
 * `OrganizationEvents` Live layer — backed by `PubSub.dropping({ capacity: 256 }).`
 * Same shape and rationale as `UserEvents.layer`: dropping (never blocks publishers)
 * + explicit finalizer + `Effect.fn` spans. See `UserEvents.layer` for the full
 * rationale on `dropping` vs `bounded`.
 */
export const layer = Layer.effect(
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
