import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'

export const ACTOR_TYPE_HEADER = 'x-czo-actor'
export const AUTH_METHOD_HEADER = 'x-czo-auth-method'
export interface ActorConfig {
  allowedOAuthProviders: readonly string[]
}

export interface ActorTypeOptions {
  actors: Record<string, ActorConfig>
}

export function actorType(options: ActorTypeOptions): BetterAuthPlugin {
  const validActors = new Set(Object.keys(options.actors))

  return {
    id: 'actor-type',

    onRequest: async (request) => {
      const actor = request.headers.get(ACTOR_TYPE_HEADER)
      if (!actor)
        return
      if (!validActors.has(actor)) {
        return {
          response: new Response(
            JSON.stringify({
              error: `Invalid actor: ${actor}. Must be one of: ${[...validActors].join(', ')}`,
            }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          ),
        }
      }
    },

    hooks: {
      before: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            const actor = ctx.headers?.get(ACTOR_TYPE_HEADER)
              ?? (ctx as unknown as { request?: Request }).request?.headers.get(ACTOR_TYPE_HEADER)
            if (!actor)
              return
            const authContext = ctx.context as Record<string, unknown>
            authContext.actorType = actor
            authContext.authMethod = ctx.headers?.get(AUTH_METHOD_HEADER) ?? 'email'
            return { context: ctx }
          }),
        },
        {
          matcher: context => !!context.path?.startsWith('/callback/'),
          handler: createAuthMiddleware(async (ctx) => {
            const request = (ctx as unknown as { request?: Request }).request
            if (!request?.url)
              return
            const url = new URL(request.url, 'http://localhost')
            const state = url.searchParams.get('state')
            if (!state)
              return
            const adapter = ctx.context.internalAdapter as {
              findVerificationValue: (id: string) => Promise<{ value: string } | null>
            }
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
            if (!actor || !validActors.has(actor))
              return
            const provider = url.pathname.match(/\/callback\/([^/]+)/)?.[1]
            const authContext = ctx.context as Record<string, unknown>
            authContext.actorType = actor
            authContext.authMethod = provider ? `oauth:${provider}` : 'oauth'
            return { context: ctx }
          }),
        },
        {
          matcher: context => !!context.path?.startsWith('/two-factor/verify'),
          handler: createAuthMiddleware(async (ctx) => {
            const actor = ctx.headers?.get(ACTOR_TYPE_HEADER)
              ?? (ctx as unknown as { request?: Request }).request?.headers.get(ACTOR_TYPE_HEADER)
            if (!actor)
              return
            const authContext = ctx.context as Record<string, unknown>
            authContext.authMethod = 'two-factor'
            return { context: ctx }
          }),
        },
        {
          matcher: context => context.path === '/sign-in/social',
          handler: createAuthMiddleware(async (ctx) => {
            const actor = ctx.headers?.get(ACTOR_TYPE_HEADER)
              ?? (ctx as unknown as { request?: Request }).request?.headers.get(ACTOR_TYPE_HEADER)
            if (!actor)
              return
            const config = options.actors[actor]
            if (!config)
              return
            const body = ctx.body as { provider?: string, additionalData?: Record<string, unknown> } | undefined
            if (body?.provider && !config.allowedOAuthProviders.includes(body.provider)) {
              throw new APIError('FORBIDDEN', {
                message: `Provider ${body.provider} is not allowed for actor ${actor}`,
              })
            }
            const authContext = ctx.context as Record<string, unknown>
            if (body?.provider) {
              authContext.authMethod = `oauth:${body.provider}`
            }
            // Inject actor into additionalData for better-auth's OAuth state
            if (body) {
              body.additionalData = { ...body.additionalData, actor }
            }
            return { context: ctx }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}

export function isProviderAllowedForActor(
  options: ActorTypeOptions,
  provider: string,
  actor: string,
): boolean {
  const config = options.actors[actor]
  if (!config)
    return false
  return config.allowedOAuthProviders.includes(provider)
}

export function getValidActors(options: ActorTypeOptions): ReadonlySet<string> {
  return new Set(Object.keys(options.actors))
}
