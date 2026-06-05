import type { CredentialResult } from './credential'
import { RateLimiter } from '@czo/kit/ratelimit'
import { Duration, Effect, Schema } from 'effect'
import { defineHandler, readBody } from 'h3'
import { errorResponseBody, httpStatusForError, InvalidRequestBody } from './error-map'
import { rateLimitCredentials, SIGNIN_LIMITS, SIGNUP_LIMITS } from './rate-limit'

/**
 * Build a credential h3 handler from a body `schema` + an `orchestrate` Effect.
 * The whole handler is ONE Effect, run once via `event.context.runEffect`:
 * decode the body (`errors: 'all'` so every bad field is reported at once; a
 * failure re-tags the `SchemaError`'s issue as `InvalidRequestBody`), apply the
 * per-IP / per-email rate-limit gate for `action` BEFORE `orchestrate` (so a
 * rate-limited request never hits the DB / bcrypt), run `orchestrate`, then
 * `Effect.match` both channels into the response. A `RateLimiterError` maps to
 * HTTP 429 with a `Retry-After` header; `errorResponseBody` shapes the failure
 * JSON. A genuine defect propagates to h3 as a 500.
 */
export function makeCredentialHandler<A extends { email: string }>(
  action: 'signin' | 'signup',
  schema: Schema.Codec<A>,
  orchestrate: (body: A) => Effect.Effect<CredentialResult, unknown, any>,
) {
  const limits = action === 'signin' ? SIGNIN_LIMITS : SIGNUP_LIMITS
  return defineHandler((event) => {
    // `clientIp` is resolved by kit's middleware under the trusted-proxy model
    // (`TRUSTED_PROXY_HOPS`); never trust `X-Forwarded-For` here directly.
    const ip = event.context.clientIp ?? 'unknown'
    return event.context.runEffect(
      Effect.promise(() => readBody(event)).pipe(
        Effect.flatMap(raw =>
          Schema.decodeUnknownEffect(schema)(raw, { errors: 'all' }).pipe(
            Effect.mapError(err => new InvalidRequestBody({ issue: err.issue })),
          )),
        Effect.tap(body => rateLimitCredentials(action, ip, body.email, limits)),
        Effect.flatMap(orchestrate),
        Effect.match({
          onSuccess: ({ user, cookie, token }) => {
            event.res.headers.append('set-cookie', cookie.serialize())
            event.res.status = 200
            return { user, token }
          },
          onFailure: (error) => {
            event.res.status = httpStatusForError(error)
            if (error instanceof RateLimiter.RateLimiterError && error.reason._tag === 'RateLimitExceeded') {
              const seconds = Math.ceil(Duration.toSeconds(error.reason.retryAfter))
              event.res.headers.append('retry-after', String(Math.max(1, seconds)))
            }
            return errorResponseBody(error)
          },
        }),
      ),
    )
  })
}
