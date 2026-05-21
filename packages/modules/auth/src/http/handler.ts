import type { CredentialResult } from './credential'
import { Effect, Schema } from 'effect'
import { defineHandler, readBody } from 'h3'
import { httpStatusForError, InvalidRequestBody } from './error-map'

/**
 * Build a credential h3 handler from a body `schema` + an `orchestrate` Effect.
 * The whole handler is ONE Effect, run once via `event.context.runEffect`:
 * decode the body (a decode failure → `InvalidRequestBody`), run `orchestrate`,
 * then `Effect.match` both channels into the response. No JS `try/catch`; a
 * genuine defect propagates to h3 as a 500.
 */
export function makeCredentialHandler<A>(
  schema: Schema.Codec<A>,
  orchestrate: (body: A) => Effect.Effect<CredentialResult, unknown, any>,
) {
  return defineHandler(event =>
    event.context.runEffect(
      Effect.promise(() => readBody(event)).pipe(
        Effect.flatMap(raw =>
          Effect.try({
            try: () => Schema.decodeUnknownSync(schema)(raw),
            catch: cause => new InvalidRequestBody({ cause }),
          })),
        Effect.flatMap(orchestrate),
        Effect.match({
          onSuccess: ({ user, cookie }) => {
            event.res.headers.append('set-cookie', cookie.serialize())
            event.res.status = 200
            return { user }
          },
          onFailure: (error) => {
            event.res.status = httpStatusForError(error)
            return { error: (error as { code?: string })?.code ?? 'ERROR' }
          },
        }),
      ),
    ),
  )
}
