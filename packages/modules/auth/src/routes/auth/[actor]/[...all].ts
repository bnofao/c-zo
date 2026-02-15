import type { Auth } from '../../../config/auth.config'
import { defineHandler, getRouterParam, HTTPError } from 'nitro/h3'
import { JWT_EXPIRATION_SECONDS } from '../../../config/auth.config'
import { runWithSessionContext } from '../../../services/session-context'
import { defineRouteMeta } from '../_openapi'

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Auth catch-all (sign-in, sign-up, 2FA enable/disable)',
    description: 'Proxies to better-auth. Handles sign-in/email, sign-up/email, two-factor/enable, two-factor/disable, generate-backup-codes.',
    parameters: [
      { name: 'actor', in: 'path', required: true, schema: { type: 'string', enum: ['customer', 'admin'] } },
    ],
    responses: {
      200: {
        description: 'Varies by endpoint',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/DualTokenResponse' } } },
      },
      400: { description: 'Invalid actor' },
      500: { description: 'Auth not initialized' },
    },
  },
})

export const VALID_ACTORS = ['customer', 'admin'] as const
export type Actor = (typeof VALID_ACTORS)[number]

const TOKEN_RESPONSE_PATHS = new Set([
  '/sign-in/email',
  '/sign-up/email',
])

interface OrganizationFields {
  name?: string
  type?: string
}

async function parseOrganizationFields(req: Request): Promise<OrganizationFields> {
  try {
    const body = await req.json() as Record<string, unknown>
    const fields: OrganizationFields = {}
    if (typeof body.organizationName === 'string' && body.organizationName.trim()) {
      fields.name = body.organizationName.trim()
    }
    if (typeof body.organizationType === 'string' && body.organizationType.trim()) {
      fields.type = body.organizationType.trim()
    }
    return fields
  }
  catch {
    // Not JSON or no organization fields — ignore
  }
  return {}
}

async function autoCreateOrganization(auth: Auth, sessionToken: string, fields: OrganizationFields): Promise<void> {
  try {
    const body: Record<string, unknown> = { name: fields.name }
    if (fields.type) {
      body.type = fields.type
    }
    await auth.api.createOrganization({
      headers: new Headers({ authorization: `Bearer ${sessionToken}` }),
      body: body as { name: string, slug: string },
    })
  }
  catch {
    // Best-effort: sign-up succeeded, org creation is non-blocking
  }
}

export default defineHandler(async (event) => {
  const auth = (event.context as Record<string, unknown>).auth as Auth | undefined

  if (!auth) {
    throw new HTTPError({ status: 500, statusText: 'Auth instance not found in event context' })
  }

  const actor = getRouterParam(event, 'actor')

  if (!actor || !VALID_ACTORS.includes(actor as Actor)) {
    throw new HTTPError({ status: 400, statusText: `Invalid actor: ${actor}. Must be one of: ${VALID_ACTORS.join(', ')}` })
  }

  (event.context as Record<string, unknown>).actor = actor

  // Rewrite URL: strip /{actor}/ segment so better-auth sees /api/auth/...
  const url = new URL(event.req.url)
  url.pathname = url.pathname.replace(`/auth/${actor}/`, '/auth/')

  // For sign-up, check if organization fields are provided before consuming the body
  const remainingPath = url.pathname.replace(/^\/api\/auth/, '')
  const isSignUp = remainingPath === '/sign-up/email'
  let orgFields: OrganizationFields = {}
  if (isSignUp) {
    orgFields = await parseOrganizationFields(event.req.clone())
  }

  const rewrittenReq = new Request(url, event.req)

  const response = await runWithSessionContext(
    { actorType: actor, authMethod: 'email' },
    () => auth.handler(rewrittenReq),
  )

  // Transform sign-in/sign-up responses to dual-token format
  if (response.ok && TOKEN_RESPONSE_PATHS.has(remainingPath)) {
    try {
      const cloned = response.clone()
      const data = await cloned.json() as {
        session?: { token?: string }
        user?: Record<string, unknown>
        twoFactorRedirect?: boolean
      }

      // Pass through 2FA redirect responses with cookies intact
      if (data?.twoFactorRedirect === true) {
        return response
      }

      if (data?.session?.token) {
        // Auto-create organization on sign-up when organizationName is provided
        if (isSignUp && orgFields.name) {
          void autoCreateOrganization(auth, data.session.token, orgFields)
        }

        const tokenResponse = await auth.api.getToken({
          headers: new Headers({
            authorization: `Bearer ${data.session.token}`,
          }),
        })

        if (tokenResponse?.token) {
          const responseBody: Record<string, unknown> = {
            accessToken: tokenResponse.token,
            refreshToken: data.session.token,
            expiresIn: JWT_EXPIRATION_SECONDS,
          }

          // Flag admins without 2FA enabled
          if (actor === 'admin' && data.user?.twoFactorEnabled !== true) {
            responseBody.requiresTwoFactorSetup = true
          }

          return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
    }
    catch {
      // Fallback: return original response on any transformation failure
    }
  }

  return response
})
