import type { BetterAuthPlugin } from 'better-auth'
import type { AuthActorService, AuthMethod } from '../actor'
import { APIError, createAuthMiddleware } from 'better-auth/api'

export const ACTOR_TYPE_HEADER = 'x-czo-actor'
export interface ActorConfig {
  allowedOAuthProviders: readonly string[]
}

export interface ActorTypeOptions {
  actorService: AuthActorService
}

export function actorType({ actorService }: ActorTypeOptions): BetterAuthPlugin {
  const registeredActors = actorService.registeredActors()

  return {
    id: 'actor-type',

    onRequest: async (request) => {
      const actor = request.headers.get(ACTOR_TYPE_HEADER)
      if (!actor)
        return

      if (!registeredActors.includes(actor)) {
        return {
          response: new Response(
            JSON.stringify({
              error: `Invalid actor: ${actor}. Must be one of: ${registeredActors.join(', ')}`,
            }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          ),
        }
      }
    },

    hooks: {
      before: [
        {
          matcher: context => !!context.path?.startsWith('/callback/'),
          handler: createAuthMiddleware(async (ctx) => {
            const request = ctx.request

            if (!request?.url)
              return

            const url = new URL(request.url)
            const state = url.searchParams.get('state')

            if (!state)
              return

            const adapter = ctx.context.internalAdapter
            const verification = await adapter.findVerificationValue(state)

            if (!verification)
              return

            let stateData: Record<string, unknown>

            try {
              stateData = JSON.parse(verification.value) as Record<string, unknown>
            }
            catch {
              return
            }

            const actor = stateData.actor as string | undefined

            if (!actor || !registeredActors.includes(actor))
              return

            ctx.setHeader(ACTOR_TYPE_HEADER, actor)
          }),
        },
        {
          matcher: context => (
            context.path === '/sign-in/social'
            || context.path === '/sign-in/email'
            || context.path === '/sign-up/email'
          ),
          handler: createAuthMiddleware(async (ctx) => {
            const actor = ctx.headers?.get(ACTOR_TYPE_HEADER)
              ?? ctx.request?.headers.get(ACTOR_TYPE_HEADER)

            if (!actor)
              return

            if (!registeredActors.includes(actor)) {
              throw new APIError('BAD_REQUEST', {
                message: `Invalid actor: ${actor}. Must be one of: ${registeredActors.join(', ')}`,
              })
            }

            const actorConfig = actorService.actorRestrictionConfig(actor)

            if (ctx.path.startsWith('/sign-up') && actorConfig.enableRegistration === false) {
              throw new APIError('FORBIDDEN', {
                message: `Registration is not allowed for actor: ${actor}`,
              })
            }

            const body = ctx.body as { provider?: string, additionalData?: Record<string, unknown> } | undefined
            const method = (body?.provider ? `oauth:${body.provider}` : ctx.path.split('/').pop() ?? 'email') as AuthMethod

            if (!actorService.isMethodAllowedForActor(actor, method)) {
              throw new APIError('BAD_REQUEST', {
                message: `Auth method "${method}" is not allowed for actor type "${actor}".`,
              })
            }

            // Inject actor into additionalData for better-auth's OAuth state
            if (body) {
              body.additionalData = { ...body.additionalData, actor }
            }
            return { context: { body } }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}
