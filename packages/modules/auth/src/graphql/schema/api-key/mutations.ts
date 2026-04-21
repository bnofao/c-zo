import type { AuthContext } from '@czo/auth/types'
import type { SchemaBuilder } from '@czo/kit/graphql'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { NotFoundError, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'

interface Ctx { auth: AuthContext, request?: Request }

// ─── API Key Mutations ────────────────────────────────────────────────────────

export function registerApiKeyMutations(builder: SchemaBuilder): void {
  // ── createApiKey ──────────────────────────────────────────────────────────
  builder.mutationField('createApiKey', t =>
    t.field({
      // Returns a special object with the full key (only visible once)
      type: 'String',
      errors: { types: [ValidationError, UnauthenticatedError] },
      args: {
        input: t.arg({ type: 'CreateApiKeyInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { input: { name: string, expiresIn?: number, prefix?: string, remaining?: number, refillAmount?: number, refillInterval?: number, rateLimitEnabled?: boolean, rateLimitTimeWindow?: number, rateLimitMax?: number } }, ctx: Ctx) => {
        const authUser = ctx.auth?.user
        if (!authUser)
          throw new UnauthenticatedError()

        const result = await ctx.auth.apiKeyService.create(
          { ...args.input, userId: authUser.id },
          ctx.request?.headers ?? new Headers(),
        )
        if (!result)
          throw new NotFoundError('ApiKey', 'created')

        await publishAuthEvent(AUTH_EVENTS.API_KEY_CREATED, {
          apiKeyId: result.id,
          userId: authUser.id,
          name: (result as any).name ?? null,
          prefix: (result as any).prefix ?? null,
        })

        // Return the full key string (only available at creation time)
        return (result as any).key ?? result.id
      },
    }))

  // ── deleteApiKey ──────────────────────────────────────────────────────────
  builder.mutationField('deleteApiKey', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, UnauthenticatedError] },
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { id: string }, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        await ctx.auth.apiKeyService.remove(String(args.id), ctx.request?.headers ?? new Headers())
        return true
      },
    }))

  // ── updateApiKey ──────────────────────────────────────────────────────────
  builder.mutationField('updateApiKey', t =>
    t.field({
      type: 'ApiKey',
      errors: { types: [ValidationError, NotFoundError, UnauthenticatedError] },
      args: {
        id: t.arg.id({ required: true }),
        input: t.arg({ type: 'UpdateApiKeyInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: unknown, args: { id: string, input: { name?: string, enabled?: boolean, remaining?: number, expiresIn?: number, refillAmount?: number, refillInterval?: number, rateLimitEnabled?: boolean, rateLimitTimeWindow?: number, rateLimitMax?: number } }, ctx: Ctx) => {
        if (!ctx.auth?.user)
          throw new UnauthenticatedError()

        const result = await ctx.auth.apiKeyService.update(
          { keyId: String(args.id), ...args.input },
          ctx.request?.headers ?? new Headers(),
        )
        if (!result)
          throw new NotFoundError('ApiKey', String(args.id))
        return result
      },
    }))
}
