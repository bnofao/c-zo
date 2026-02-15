import { defineRouteMeta } from '../../_openapi'
import { createTwoFactorVerifyHandler } from './_verify-handler'

defineRouteMeta({
  openAPI: {
    tags: ['Auth', '2FA'],
    summary: 'Verify TOTP code',
    description: 'Verifies a TOTP code after sign-in. Returns dual-token response on success.',
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
              code: { type: 'string', minLength: 6, maxLength: 6 },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: '2FA verified, tokens issued',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/DualTokenResponse' } } },
      },
      400: { description: 'Invalid actor' },
      401: { description: 'Invalid TOTP code' },
    },
  },
})

export default createTwoFactorVerifyHandler({
  betterAuthPath: '/two-factor/verify-totp',
})
