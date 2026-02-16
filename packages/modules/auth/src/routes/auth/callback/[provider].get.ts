import type { Auth } from '../../../config/auth.config'
import { defineHandler } from 'nitro/h3'
import { defineRouteMeta } from '../_openapi'

defineRouteMeta({
  openAPI: {
    tags: ['Auth', 'OAuth'],
    summary: 'OAuth callback',
    description: 'Handles OAuth provider callback and exchanges code for session.',
    parameters: [
      { name: 'provider', in: 'path', required: true, schema: { type: 'string', enum: ['google', 'github'] } },
    ],
    responses: {
      302: { description: 'Redirect to client callback URL with tokens' },
      400: { description: 'Missing state/code or invalid provider' },
    },
  },
})

export default defineHandler(async (event) => {
  const auth = (event.context as Record<string, unknown>).auth as Auth
  return auth.handler(event.req)
})
