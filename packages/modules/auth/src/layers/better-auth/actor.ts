import type { BetterAuthPlugin } from 'better-auth'
import type { AuthMethod } from '../../services/actor'
import { useRuntime } from '@czo/kit/effect'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { Effect } from 'effect'
import { AuthActorService } from '../../services/actor'

export const ACTOR_TYPE_HEADER = 'x-czo-actor'

// ─── Effect → sync bridges ────────────────────────────────────────────
//
// The `actor-type` better-auth plugin runs entirely outside the Effect world
// (request hooks). It reads from the `AuthActorService` registry, which by the
// time any request is served has been populated and frozen at boot — so the
// reads are pure and safe to run synchronously against the boot runtime.

// The boot runtime provides `AuthActorService` but its type is erased to
// `<never, never>` (see `@czo/kit/effect`), so we cast the requirement away —
// same trick `runEffect` uses for resolvers.
function runSync<A>(effect: Effect.Effect<A, never, AuthActorService>): A {
  return useRuntime().runSync(effect as Effect.Effect<A, never>)
}

function registeredActors(): readonly string[] {
  return runSync(AuthActorService.pipe(Effect.flatMap(s => s.registeredActors)))
}

function actorRestrictionConfig(type: string) {
  return runSync(AuthActorService.pipe(Effect.flatMap(s => s.actorRestrictionConfig(type))))
}

function isMethodAllowedForActor(type: string, method: AuthMethod): boolean {
  return runSync(AuthActorService.pipe(Effect.flatMap(s => s.isMethodAllowedForActor(type, method))))
}

export function actorType(): BetterAuthPlugin {
  return {
    id: 'actor-type',

    onRequest: async (request) => {
      const actor = request.headers.get(ACTOR_TYPE_HEADER)
      if (!actor)
        return

      const actors = registeredActors()
      if (!actors.includes(actor)) {
        return {
          response: new Response(
            JSON.stringify({
              error: `Invalid actor: ${actor}. Must be one of: ${actors.join(', ')}`,
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

            if (!actor || !registeredActors().includes(actor))
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

            const actors = registeredActors()
            if (!actors.includes(actor)) {
              throw new APIError('BAD_REQUEST', {
                message: `Invalid actor: ${actor}. Must be one of: ${actors.join(', ')}`,
              })
            }

            const actorConfig = actorRestrictionConfig(actor)

            if (ctx.path.startsWith('/sign-up') && actorConfig.enableRegistration === false) {
              throw new APIError('FORBIDDEN', {
                message: `Registration is not allowed for actor: ${actor}`,
              })
            }

            const body = ctx.context.body as { provider?: string, additionalData?: Record<string, unknown> } | undefined
            const method = (body?.provider ? `oauth:${body.provider}` : ctx.path.split('/').pop() ?? 'email') as AuthMethod

            if (!isMethodAllowedForActor(actor, method)) {
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
