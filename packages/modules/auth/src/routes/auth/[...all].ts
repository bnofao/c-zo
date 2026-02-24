import type { Auth } from '../../config/auth'
import { defineHandler } from 'nitro/h3'
import { defineRouteMeta } from './_openapi'

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Auth catch-all (sign-in, sign-up, 2FA enable/disable)',
    description: 'Proxies to better-auth. Handles sign-in/email, sign-up/email, two-factor/enable, two-factor/disable, generate-backup-codes.',
    responses: {
      200: { description: 'Varies by endpoint' },
      400: { description: 'Invalid request' },
      500: { description: 'Auth not initialized' },
    },
  },
})

export default defineHandler(async (event) => {
  const auth = (event.context as Record<string, unknown>).auth as Auth
  return auth.handler(event.req)
})
