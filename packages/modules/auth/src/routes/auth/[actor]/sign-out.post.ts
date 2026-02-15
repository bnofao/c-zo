import type { Auth } from '../../../config/auth.config'
import type { AuthEventsService } from '../../../events/auth-events'
import type { JwtBlocklist } from '../../../services/jwt-blocklist'
import type { Actor } from './[...all]'
import { Buffer } from 'node:buffer'
import { defineHandler, getRouterParam, HTTPError } from 'nitro/h3'
import { JWT_EXPIRATION_SECONDS } from '../../../config/auth.config'
import { defineRouteMeta } from '../_openapi'
import { VALID_ACTORS } from './[...all]'

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Sign out',
    description: 'Revokes the current session for the given actor.',
    parameters: [
      { name: 'actor', in: 'path', required: true, schema: { type: 'string', enum: ['customer', 'admin'] } },
    ],
    security: [{ BearerAuth: [] }],
    responses: {
      200: { description: 'Session revoked' },
      400: { description: 'Invalid actor' },
      500: { description: 'Auth not initialized' },
    },
  },
})

export default defineHandler(async (event) => {
  const auth = (event.context as Record<string, unknown>).auth as Auth | undefined
  const blocklist = (event.context as Record<string, unknown>).blocklist as JwtBlocklist | undefined
  const authEvents = (event.context as Record<string, unknown>).authEvents as AuthEventsService | undefined

  if (!auth) {
    throw new HTTPError({ status: 500, statusText: 'Auth not initialized' })
  }

  const actor = getRouterParam(event, 'actor')

  if (!actor || !VALID_ACTORS.includes(actor as Actor)) {
    throw new HTTPError({ status: 400, statusText: `Invalid actor: ${actor}. Must be one of: ${VALID_ACTORS.join(', ')}` })
  }

  // Blocklist the current JWT (best effort) before sign-out destroys the session
  let jwtUserId: string | undefined
  let jwtId: string | undefined

  if (blocklist) {
    try {
      const tokenResponse = await auth.api.getToken({
        headers: event.req.headers,
      })
      if (tokenResponse?.token) {
        const [, payload] = tokenResponse.token.split('.')
        if (payload) {
          const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
          jwtUserId = decoded.sub
          jwtId = decoded.jti
          if (decoded.jti) {
            await blocklist.add(decoded.jti, JWT_EXPIRATION_SECONDS)
          }
        }
      }
    }
    catch {
      // Best effort — JWT expires naturally in 15 minutes
    }
  }

  // Rewrite URL: strip /{actor}/ segment so better-auth sees /api/auth/sign-out
  const url = new URL(event.req.url)
  url.pathname = url.pathname.replace(`/auth/${actor}/`, '/auth/')
  const rewrittenReq = new Request(url, event.req)

  const response = auth.handler(rewrittenReq)

  // Fire-and-forget: emit session.revoked event
  if (jwtUserId && jwtId) {
    void authEvents?.sessionRevoked({
      jwtId,
      userId: jwtUserId,
      reason: 'user_initiated',
    })
  }

  return response
})
