import type { Auth } from '../../../config/auth.config'
import { defineHandler, HTTPError, readBody } from 'nitro/h3'
import { JWT_EXPIRATION_SECONDS } from '../../../config/auth.config'

export default defineHandler(async (event) => {
  const { auth } = event.context as { auth: Auth }

  if (!auth) {
    throw new HTTPError({ status: 500, statusText: 'Auth not initialized' })
  }

  const body = await readBody<{ refreshToken?: string }>(event)

  if (!body?.refreshToken) {
    throw new HTTPError({ status: 400, statusText: 'refreshToken is required' })
  }

  const sessionResponse = await auth.api.getSession({
    headers: new Headers({
      authorization: `Bearer ${body.refreshToken}`,
    }),
  })

  if (!sessionResponse) {
    throw new HTTPError({ status: 401, statusText: 'Invalid or expired session' })
  }

  const tokenResponse = await auth.api.getToken({
    headers: new Headers({
      authorization: `Bearer ${body.refreshToken}`,
    }),
  })

  if (!tokenResponse?.token) {
    throw new HTTPError({ status: 401, statusText: 'Failed to generate token' })
  }

  return {
    accessToken: tokenResponse.token,
    tokenType: 'Bearer',
    expiresIn: JWT_EXPIRATION_SECONDS,
  }
})
