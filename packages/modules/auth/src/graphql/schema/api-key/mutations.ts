import { NotFoundError, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import { createApiKeySchema, updateApiKeySchema } from './inputs'

// ─── API Key Mutations ────────────────────────────────────────────────────────

export function registerApiKeyMutations(builder: any): void {
  // ── createApiKey ──────────────────────────────────────────────────────────
  builder.mutationField('createApiKey', (t: any) =>
    t.field({
      // Returns a special object with the full key (only visible once)
      type: 'String',
      errors: { types: [ValidationError, UnauthenticatedError] },
      args: {
        input: t.arg({ type: 'CreateApiKeyInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        const authUser = (ctx as any).auth?.user
        if (!authUser)
          throw new UnauthenticatedError()

        const parsed = createApiKeySchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const container = useContainer()
        const apiKeyService = await container.make('auth:apikeys')
        const result = await (apiKeyService as any).create(
          { ...parsed.data, userId: authUser.id },
          ctx.request?.headers,
        )
        if (!result)
          throw new NotFoundError('ApiKey', 'created')
        // Return the full key string (only available at creation time)
        return (result as any).key ?? result.id
      },
    }))

  // ── deleteApiKey ──────────────────────────────────────────────────────────
  builder.mutationField('deleteApiKey', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, UnauthenticatedError] },
      args: {
        id: t.arg.id({ required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const container = useContainer()
        const apiKeyService = await container.make('auth:apikeys')
        await (apiKeyService as any).remove(String(args.id), ctx.request?.headers)
        return true
      },
    }))

  // ── updateApiKey ──────────────────────────────────────────────────────────
  builder.mutationField('updateApiKey', (t: any) =>
    t.field({
      type: 'ApiKey',
      errors: { types: [ValidationError, NotFoundError, UnauthenticatedError] },
      args: {
        id: t.arg.id({ required: true }),
        input: t.arg({ type: 'UpdateApiKeyInput', required: true }),
      },
      authScopes: { loggedIn: true },
      resolve: async (_root: any, args: any, ctx: any) => {
        if (!(ctx as any).auth?.user)
          throw new UnauthenticatedError()

        const parsed = updateApiKeySchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const container = useContainer()
        const apiKeyService = await container.make('auth:apikeys')
        const result = await (apiKeyService as any).update(
          { keyId: String(args.id), ...parsed.data },
          ctx.request?.headers,
        )
        if (!result)
          throw new NotFoundError('ApiKey', String(args.id))
        return result
      },
    }))
}
