import { defineRouteMeta } from '../../_openapi'
import { createTwoFactorVerifyHandler } from './_verify-handler'

defineRouteMeta({
  openAPI: {
    tags: ['Auth', '2FA'],
    summary: 'Verify backup code',
    description: 'Verifies a backup code after sign-in. Returns dual-token response on success.',
    parameters: [
      { name: 'actor', in: 'path', required: true, schema: { type: 'string', enum: ['customer', 'admin'] } },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['code'],
            properties: {
              code: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Backup code verified, tokens issued',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/DualTokenResponse' } } },
      },
      400: { description: 'Invalid actor' },
      401: { description: 'Invalid backup code' },
    },
  },
})

export default createTwoFactorVerifyHandler({
  betterAuthPath: '/two-factor/verify-backup-code',
})
