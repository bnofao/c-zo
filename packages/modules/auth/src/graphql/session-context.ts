import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import * as Session from '../services/session'

/**
 * The `graphql.contexts` contributor: read the session cookie off the request
 * and resolve it into `ctx.auth`. Absent/expired → anonymous. An infra failure
 * (`SessionStoreFailed`) is propagated — the request fails, never silently
 * downgraded to anonymous.
 */
export function makeSessionContextContributor() {
  return (systemContext: unknown): Effect.Effect<Partial<GraphQLContextMap>, unknown, Session.SessionService> =>
    Effect.gen(function* () {
      const session = yield* Session.SessionService
      const request = (systemContext as { request?: Request }).request
      const token = session.readSessionToken(request?.headers.get('cookie') ?? '')
      if (!token)
        return { auth: { session: null } }
      const resolved = yield* session.resolve(token)
      return { auth: resolved ?? { session: null } }
    })
}
