import type { Auth } from '../../../config/auth.config'
import type { JwtBlocklist } from '../../../services/jwt-blocklist'
import type { Actor } from './[...all]'
import { Buffer } from 'node:buffer'
import { defineHandler, getRouterParam, HTTPError } from 'nitro/h3'
import { JWT_EXPIRATION_SECONDS } from '../../../config/auth.config'
import { VALID_ACTORS } from './[...all]'

export default defineHandler(async (event) => {
  const auth = (event.context as Record<string, unknown>).auth as Auth | undefined
  const blocklist = (event.context as Record<string, unknown>).blocklist as JwtBlocklist | undefined

  if (!auth) {
    throw new HTTPError({ status: 500, statusText: 'Auth not initialized' })
  }

  const actor = getRouterParam(event, 'actor')

  if (!actor || !VALID_ACTORS.includes(actor as Actor)) {
    throw new HTTPError({ status: 400, statusText: `Invalid actor: ${actor}. Must be one of: ${VALID_ACTORS.join(', ')}` })
  }

  // Blocklist the current JWT (best effort) before sign-out destroys the session
  if (blocklist) {
    try {
      const tokenResponse = await auth.api.getToken({
        headers: event.req.headers,
      })
      if (tokenResponse?.token) {
        const [, payload] = tokenResponse.token.split('.')
        if (payload) {
          const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
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

  return auth.handler(rewrittenReq)
})
