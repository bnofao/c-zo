import type { Auth } from '../../../config/auth.config'
import type { TokenRotationService } from '../../../services/token-rotation'
import { eq } from 'drizzle-orm'
import { defineHandler, HTTPError, readBody } from 'nitro/h3'
import { JWT_EXPIRATION_SECONDS } from '../../../config/auth.config'
import { sessions as sessionTable } from '../../../database/schema'
import { defineRouteMeta } from '../_openapi'

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Refresh access token',
    description: 'Exchange a valid refresh token for a new access token. Optionally rotates the refresh token.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['refreshToken'],
            properties: {
              refreshToken: { type: 'string', description: 'The refresh token from sign-in' },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Token refreshed successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DualTokenResponse' },
          },
        },
      },
      400: { description: 'Missing refreshToken' },
      401: { description: 'Invalid/expired session or token reuse detected' },
    },
    $global: {
      components: {
        schemas: {
          DualTokenResponse: {
            type: 'object',
            required: ['accessToken', 'refreshToken', 'expiresIn'],
            properties: {
              accessToken: { type: 'string', description: 'Short-lived JWT (15min)' },
              refreshToken: { type: 'string', description: 'Long-lived session token (7d)' },
              expiresIn: { type: 'integer', description: 'Access token TTL in seconds' },
              tokenType: { type: 'string', enum: ['Bearer'] },
            },
          },
        },
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  },
})

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
