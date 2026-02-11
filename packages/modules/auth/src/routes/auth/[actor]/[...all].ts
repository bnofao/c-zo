import type { Auth } from '../../../config/auth.config'
import { defineHandler, getRouterParam, HTTPError } from 'nitro/h3'
import { JWT_EXPIRATION_SECONDS } from '../../../config/auth.config'
import { runWithSessionContext } from '../../../services/session-context'

export const VALID_ACTORS = ['customer', 'admin'] as const
export type Actor = (typeof VALID_ACTORS)[number]

const TOKEN_RESPONSE_PATHS = new Set([
  '/sign-in/email',
  '/sign-up/email',
])

export default defineHandler(async (event) => {
  const auth = (event.context as Record<string, unknown>).auth as Auth | undefined

  if (!auth) {
    throw new HTTPError({ status: 500, statusText: 'Auth instance not found in event context' })
  }

  const actor = getRouterParam(event, 'actor')

  if (!actor || !VALID_ACTORS.includes(actor as Actor)) {
    throw new HTTPError({ status: 400, statusText: `Invalid actor: ${actor}. Must be one of: ${VALID_ACTORS.join(', ')}` })
  }

  (event.context as Record<string, unknown>).actor = actor

  // Rewrite URL: strip /{actor}/ segment so better-auth sees /api/auth/...
  const url = new URL(event.req.url)
  url.pathname = url.pathname.replace(`/auth/${actor}/`, '/auth/')
  const rewrittenReq = new Request(url, event.req)

  const response = await runWithSessionContext(
    { actorType: actor, authMethod: 'email' },
    () => auth.handler(rewrittenReq),
  )

  // Transform sign-in/sign-up responses to dual-token format
  const remainingPath = url.pathname.replace(/^\/api\/auth/, '')
  if (response.ok && TOKEN_RESPONSE_PATHS.has(remainingPath)) {
    try {
      const data = await response.json() as { session?: { token?: string }, user?: unknown }
      if (data?.session?.token) {
        const tokenResponse = await auth.api.getToken({
          headers: new Headers({
            authorization: `Bearer ${data.session.token}`,
          }),
        })

        if (tokenResponse?.token) {
          return new Response(JSON.stringify({
            accessToken: tokenResponse.token,
            refreshToken: data.session.token,
            expiresIn: JWT_EXPIRATION_SECONDS,
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
    }
    catch {
      // Fallback: return original response on any transformation failure
    }
  }

  return response
})
