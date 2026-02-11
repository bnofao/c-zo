import type { Auth } from '../../../config/auth.config'
import { createError, defineHandler, readBody } from 'nitro/h3'
import { JWT_EXPIRATION_SECONDS } from '../../../config/auth.config'

export default defineHandler(async (event) => {
  const { auth } = event.context as { auth: Auth }

  if (!auth) {
    throw createError({ statusCode: 500, statusMessage: 'Auth not initialized' })
  }

  const body = await readBody<{ refreshToken?: string }>(event)

  if (!body?.refreshToken) {
    throw createError({ statusCode: 400, statusMessage: 'refreshToken is required' })
  }

  const sessionResponse = await auth.api.getSession({
    headers: new Headers({
      authorization: `Bearer ${body.refreshToken}`,
    }),
  })

  if (!sessionResponse) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired session' })
  }

  const tokenResponse = await auth.api.getToken({
    headers: new Headers({
      authorization: `Bearer ${body.refreshToken}`,
    }),
  })

  if (!tokenResponse?.token) {
    throw createError({ statusCode: 401, statusMessage: 'Failed to generate token' })
  }

  return {
    accessToken: tokenResponse.token,
    tokenType: 'Bearer',
    expiresIn: JWT_EXPIRATION_SECONDS,
  }
})
