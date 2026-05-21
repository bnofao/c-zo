import { Effect } from 'effect'
import { defineHandler, getCookie } from 'h3'
import * as Cookie from '../services/cookie'
import * as Session from '../services/session'

export const signOutHandler = defineHandler(async (event) => {
  const blank = await event.context.runEffect(
    Effect.gen(function* () {
      const session = yield* Session.SessionService
      const cookies = yield* Cookie.CookieService
      const token = getCookie(event, cookies.name)
      if (token)
        // A revoke infra failure must NOT block logout — log it and clear the
        // cookie anyway. Stays in Effect (a pipe); the handler keeps no try/catch.
        yield* session.revoke(token).pipe(
          Effect.catchCause(cause =>
            Effect.logWarning('sign-out: session revoke failed', cause)),
        )
      return cookies.createBlank()
    }),
  )
  event.res.headers.append('set-cookie', blank.serialize())
  event.res.status = 204
  return null
})
