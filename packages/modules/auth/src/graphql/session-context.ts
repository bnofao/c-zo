import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import * as Session from '../services/session'

/**
 * The `graphql.contexts` contributor: read the session token off the request
 * and resolve it into `ctx.auth`. The token is taken from the `Authorization:
 * Bearer <token>` header when present, otherwise from the session cookie.
 * Absent/expired → anonymous. An infra failure (`SessionStoreFailed`) is
 * propagated — the request fails, never silently downgraded to anonymous.
 *
 * Rotation: when `resolve` walks up from an expired impersonation child to its
 * parent, the returned `session.token` differs from the incoming token. We
 * rewrite the cookie in the response so the next (cookie-based) request uses
 * the parent's token; the front detects the impersonation has ended via
 * `session.impersonatedBy` flipping back to `null`. A Bearer-sourced request
 * additionally receives the rotated token via the `X-Session-Token` response
 * header so that token-only clients can update their stored credential.
 */
export function makeSessionContextContributor() {
  return (systemContext: unknown): Effect.Effect<Partial<GraphQLContextMap>, unknown, Session.SessionService> =>
    Effect.gen(function* () {
      const session = yield* Session.SessionService
      const ctx = systemContext as {
        request?: Request
        setCookie?: (serialized: string) => void
        setHeader?: (name: string, value: string) => void
      }
      // Authorization header takes precedence over the cookie fallback.
      const fromHeader = session.readBearerToken(ctx.request?.headers.get('authorization'))
      const token = fromHeader ?? session.readSessionToken(ctx.request?.headers.get('cookie') ?? '')
      if (!token)
        return { auth: { session: null } }
      const resolved = yield* session.resolve(token)
      if (!resolved)
        return { auth: { session: null } }
      if (resolved.session.token !== token) {
        if (ctx.setCookie)
          ctx.setCookie(session.setCookie(resolved.session.token).serialize())
        if (fromHeader != null && ctx.setHeader)
          ctx.setHeader('X-Session-Token', resolved.session.token)
      }
      return { auth: resolved }
    })
}
