import { Context, Effect, Layer, PubSub, Stream } from 'effect'

/**
 * API-key domain events. Secrets (plain key, hash) are never included —
 * subscribers get identity + ownership only.
 */
export type ApiKeyEvent
  = | {
    readonly _tag: 'ApiKeyCreated'
    readonly keyId: number
    readonly name: string
    readonly prefix: string
    readonly reference: string
    readonly referenceId: number
  }
  | {
    readonly _tag: 'ApiKeyUpdated'
    readonly keyId: number
    readonly reference: string
    readonly referenceId: number
    readonly changes: Record<string, unknown>
  }

export class ApiKeyEvents extends Context.Service<
  ApiKeyEvents,
  {
    readonly publish: (event: ApiKeyEvent) => Effect.Effect<void>
    readonly publishAll: (events: ReadonlyArray<ApiKeyEvent>) => Effect.Effect<void>
    readonly subscribe: Stream.Stream<ApiKeyEvent>
  }
>()('@czo/auth/ApiKeyEvents') {}

export const layer = Layer.effect(
  ApiKeyEvents,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.dropping<ApiKeyEvent>({ capacity: 256 })
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))

    const publish = Effect.fn('ApiKeyEvents.publish')(function* (event: ApiKeyEvent) {
      yield* PubSub.publish(pubsub, event)
    })

    const publishAll = Effect.fn('ApiKeyEvents.publishAll')(function* (events: ReadonlyArray<ApiKeyEvent>) {
      yield* PubSub.publishAll(pubsub, events)
    })

    return ApiKeyEvents.of({
      publish,
      publishAll,
      subscribe: Stream.fromPubSub(pubsub),
    })
  }),
)
