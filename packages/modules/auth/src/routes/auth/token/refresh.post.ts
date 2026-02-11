import type { Auth } from '../../../config/auth.config'
import type { TokenRotationService } from '../../../services/token-rotation'
import { eq } from 'drizzle-orm'
import { defineHandler, HTTPError, readBody } from 'nitro/h3'
import { JWT_EXPIRATION_SECONDS } from '../../../config/auth.config'
import { session as sessionTable } from '../../../database/schema'

export default defineHandler(async (event) => {
  const { auth, db, rotation } = event.context as {
    auth: Auth
    db?: { update: (table: unknown) => { set: (data: unknown) => { where: (cond: unknown) => Promise<unknown> } } }
    rotation?: TokenRotationService
  }

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

  const sessionId = (sessionResponse as { session: { id: string } }).session.id

  // Check for reuse detection if rotation service is available
  if (rotation) {
    const tokenHash = rotation.hashToken(body.refreshToken)
    const reused = await rotation.wasAlreadyRotated(sessionId, tokenHash)

    if (reused) {
      // Token reuse detected — revoke all sessions for the user
      await auth.api.revokeSessions({
        headers: new Headers({
          authorization: `Bearer ${body.refreshToken}`,
        }),
      })
      throw new HTTPError({ status: 401, statusText: 'Token reuse detected — all sessions revoked' })
    }
  }

  const tokenResponse = await auth.api.getToken({
    headers: new Headers({
      authorization: `Bearer ${body.refreshToken}`,
    }),
  })

  if (!tokenResponse?.token) {
    throw new HTTPError({ status: 401, statusText: 'Failed to generate token' })
  }

  let refreshToken = body.refreshToken

  // Rotate the refresh token if rotation service is available
  if (rotation && db) {
    const oldTokenHash = rotation.hashToken(body.refreshToken)
    const newToken = rotation.generateToken()

    await db.update(sessionTable).set({
      token: newToken,
      updatedAt: new Date(),
    }).where(eq(sessionTable.id, sessionId))

    await rotation.recordRotation(sessionId, oldTokenHash)
    refreshToken = newToken
  }

  return {
    accessToken: tokenResponse.token,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: JWT_EXPIRATION_SECONDS,
  }
})
