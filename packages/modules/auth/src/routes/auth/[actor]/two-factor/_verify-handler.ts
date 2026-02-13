import type { Auth } from '../../../../config/auth.config'
import type { Actor } from '../[...all]'
import { defineHandler, getRouterParam, HTTPError } from 'nitro/h3'
import { JWT_EXPIRATION_SECONDS } from '../../../../config/auth.config'
import { runWithSessionContext } from '../../../../services/session-context'
import { VALID_ACTORS } from '../[...all]'

interface CreateVerifyHandlerOptions {
  betterAuthPath: string
}

export function createTwoFactorVerifyHandler(options: CreateVerifyHandlerOptions) {
  return defineHandler(async (event) => {
    const auth = (event.context as Record<string, unknown>).auth as Auth | undefined

    if (!auth) {
      throw new HTTPError({ status: 500, statusText: 'Auth not initialized' })
    }

    const actor = getRouterParam(event, 'actor')

    if (!actor || !VALID_ACTORS.includes(actor as Actor)) {
      throw new HTTPError({ status: 400, statusText: `Invalid actor: ${actor}. Must be one of: ${VALID_ACTORS.join(', ')}` })
    }

    // Rewrite URL to better-auth's expected path
    const url = new URL(event.req.url)
    url.pathname = `/api/auth${options.betterAuthPath}`

    const rewrittenReq = new Request(url, event.req)

    const response = await runWithSessionContext(
      { actorType: actor, authMethod: 'totp' },
      () => auth.handler(rewrittenReq),
    )

    if (!response.ok) {
      return response
    }

    try {
      const cloned = response.clone()
      const data = await cloned.json() as {
        token?: string
        session?: { token?: string }
        user?: unknown
      }

      // better-auth verify endpoints may return { token } or { session: { token } }
      const sessionToken = data?.token ?? data?.session?.token

      if (!sessionToken) {
        return response
      }

      const tokenResponse = await auth.api.getToken({
        headers: new Headers({
          authorization: `Bearer ${sessionToken}`,
        }),
      })

      if (tokenResponse?.token) {
        return new Response(JSON.stringify({
          accessToken: tokenResponse.token,
          refreshToken: sessionToken,
          expiresIn: JWT_EXPIRATION_SECONDS,
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
    }
    catch {
      // Fallback: return original response
    }

    return response
  })
}
