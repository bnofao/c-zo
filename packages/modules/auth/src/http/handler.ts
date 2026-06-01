import type { CredentialResult } from './credential'
import { Effect, Schema } from 'effect'
import { defineHandler, readBody } from 'h3'
import { errorResponseBody, httpStatusForError, InvalidRequestBody } from './error-map'

/**
 * Build a credential h3 handler from a body `schema` + an `orchestrate` Effect.
 * The whole handler is ONE Effect, run once via `event.context.runEffect`:
 * decode the body (`errors: 'all'` so every bad field is reported at once; a
 * failure re-tags the `SchemaError`'s issue as `InvalidRequestBody`), run
 * `orchestrate`, then `Effect.match` both channels into the response.
 * `errorResponseBody` shapes the failure JSON. A genuine defect propagates to
 * h3 as a 500.
 */
export function makeCredentialHandler<A>(
  schema: Schema.Codec<A>,
  orchestrate: (body: A) => Effect.Effect<CredentialResult, unknown, any>,
) {
  return defineHandler(event =>
    event.context.runEffect(
      Effect.promise(() => readBody(event)).pipe(
        Effect.flatMap(raw =>
          Schema.decodeUnknownEffect(schema)(raw, { errors: 'all' }).pipe(
            Effect.mapError(err => new InvalidRequestBody({ issue: err.issue })),
          )),
        Effect.flatMap(orchestrate),
        Effect.match({
          onSuccess: ({ user, cookie, token }) => {
            event.res.headers.append('set-cookie', cookie.serialize())
            event.res.status = 200
            return { user, token }
          },
          onFailure: (error) => {
            event.res.status = httpStatusForError(error)
            return errorResponseBody(error)
          },
        }),
      ),
    ),
  )
}
