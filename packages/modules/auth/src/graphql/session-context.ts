import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { ApiKeyService } from '../services/api-key'
import * as Session from '../services/session'

/**
 * The `graphql.contexts` contributor: resolve the request into `ctx.auth`.
 *
 * 1. Session token (`Authorization: Bearer` header, else session cookie) →
 *    `{ session, user }`. Rotation (impersonation walk-up) rewrites the cookie
 *    and, for Bearer clients, the `X-Session-Token` response header. An infra
 *    failure (`SessionStoreFailed`) propagates — the request fails.
 * 2. No authenticated session AND an `x-api-key` header → `ApiKeyService.verify`
 *    → `{ session: null, apiKey }`. A bad key (invalid/disabled/expired/…) is
 *    treated as anonymous, mirroring the session path; a `DbFailed` propagates.
 * 3. Otherwise → anonymous (`{ session: null }`).
 *
 * Session always wins: the api-key header is consulted only when no session
 * resolves, so an authenticated actor is never downgraded to a key's grid.
 */
export function makeAuthContextContributor() {
  return (
    systemContext: unknown,
  ): Effect.Effect<Partial<GraphQLContextMap>, unknown, Session.SessionService | ApiKeyService> =>
    Effect.gen(function* () {
      const session = yield* Session.SessionService
      const ctx = systemContext as {
        request?: Request
        setCookie?: (serialized: string) => void
        setHeader?: (name: string, value: string) => void
      }

      // ── 1. Session (Bearer header > cookie) ──────────────────────────────
      const fromHeader = session.readBearerToken(ctx.request?.headers.get('authorization'))
      const token = fromHeader ?? session.readSessionToken(ctx.request?.headers.get('cookie') ?? '')
      if (token) {
        const resolved = yield* session.resolve(token)
        if (resolved) {
          if (resolved.session.token !== token) {
            if (ctx.setCookie)
              ctx.setCookie(session.setCookie(resolved.session.token).serialize())
            if (fromHeader != null && ctx.setHeader)
              ctx.setHeader('X-Session-Token', resolved.session.token)
          }
          return { auth: resolved }
        }
      }

      // ── 2. API key (only when no session resolved) ───────────────────────
      const plainKey = ctx.request?.headers.get('x-api-key')
      if (plainKey) {
        const apiKeys = yield* ApiKeyService
        const principal = yield* apiKeys.verify(plainKey).pipe(
          Effect.map(key => ({
            id: key.id,
            organizationId: key.reference === 'organization' ? key.referenceId : null,
            permissions: (key.permissions ?? {}) as Record<string, string[]>,
          })),
          // Genuine auth failures → anonymous (the request continues, gated fields
          // deny). `RateLimited` intentionally degrades to anonymous here rather
          // than surfacing a 429. Anything NOT listed (DbFailed, Misconfigured, or
          // a future tag) is an internal fault and PROPAGATES — fail closed.
          Effect.catchTags({
            InvalidApiKey: () => Effect.succeed(null),
            KeyDisabled: () => Effect.succeed(null),
            KeyExpired: () => Effect.succeed(null),
            Unauthorized: () => Effect.succeed(null),
            RateLimited: () => Effect.succeed(null),
            UsageExceeded: () => Effect.succeed(null),
          }),
        )
        if (principal)
          return { auth: { session: null, apiKey: principal } }
      }

      // ── 3. Anonymous ─────────────────────────────────────────────────────
      return { auth: { session: null } }
    })
}
