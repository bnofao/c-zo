import type { AuthGraphQLSchemaBuilder } from '../../.'
import { UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { ApiKeyNotFound, ApiKeyService, NoChanges, RefillPairRequired } from '../../../services/api-key'

// ─── API Key Mutations ────────────────────────────────────────────────────────

export function registerApiKeyMutations(builder: AuthGraphQLSchemaBuilder): void {
  // ── createApiKey ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createApiKey',
    {
      inputFields: t => ({
        owner: t.field({ type: 'ApiKeyOwnerInput', required: true }),
        name: t.string({ required: true }),
        group: t.string({ required: true }),
        prefix: t.string({ required: true }),
        expiresIn: t.int({ required: false }),
        remaining: t.int({ required: false }),
        refillAmount: t.int({ required: false }),
        refillInterval: t.int({ required: false }),
        rateLimitEnabled: t.boolean({ required: false }),
        rateLimitTimeWindow: t.int({ required: false }),
        rateLimitMax: t.int({ required: false }),
      }),
    },
    {
      errors: { types: [ValidationError, UnauthenticatedError, RefillPairRequired] },
      authScopes: (_parent, args, _ctx) => ({
        apiKeyOwner: {
          ownerType: args.input.owner.type,
          ownerId: Number(args.input.owner.id.id),
          action: 'create' as const,
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const owner = input.owner

        // Pothos already validated the global ID is a `User`/`Organization`;
        // also require its type to match the `type` discriminator.
        const expectedTypename = owner.type === 'USER' ? 'User' : 'Organization'
        if (owner.id.typename !== expectedTypename) {
          throw new ValidationError(
            [{ path: 'owner.id', message: `must be a ${expectedTypename} global ID`, code: 'type_mismatch' }],
            'owner.id does not match owner.type',
          )
        }

        const reference = owner.type === 'USER' ? 'user' : 'organization'
        const referenceId = Number(owner.id.id)
        const { owner: _owner, ...rest } = input

        const { apiKey, plain } = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ApiKeyService
            return yield* svc.create(
              {
                ...rest,
                referenceId,
                refillAmount: input.refillAmount ?? undefined,
                refillInterval: input.refillInterval ?? undefined,
                rateLimitEnabled: input.rateLimitEnabled ?? undefined,
                rateLimitTimeWindow: input.rateLimitTimeWindow ?? undefined,
                rateLimitMax: input.rateLimitMax ?? undefined,
              },
              { reference },
            )
          }),
        )

        // `plain` is the one-time secret — only ever returned here, at creation.
        return { apiKey, plain }
      },
    },
    {
      outputFields: t => ({
        apiKey: t.field({ type: 'ApiKey', resolve: p => p.apiKey }),
        plain: t.string({ nullable: true, resolve: p => p.plain }),
      }),
    },
  )

  // ── updateApiKey ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateApiKey',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'ApiKey', required: true }),
        name: t.string({ required: false }),
        enabled: t.boolean({ required: false }),
        remaining: t.int({ required: false }),
        expiresIn: t.int({ required: false }),
        refillAmount: t.int({ required: false }),
        refillInterval: t.int({ required: false }),
        rateLimitEnabled: t.boolean({ required: false }),
        rateLimitTimeWindow: t.int({ required: false }),
        rateLimitMax: t.int({ required: false }),
      }),
    },
    {
      errors: { types: [ValidationError, UnauthenticatedError, ApiKeyNotFound, NoChanges, RefillPairRequired] },
      authScopes: (_parent, args, _ctx) => ({
        apiKeyOwner: {
          keyId: Number(args.input.id.id),
          action: 'update' as const,
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const keyId = Number(input.id.id)

        const apiKey = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ApiKeyService
            const { id: _id, ...patch } = input
            return yield* svc.update(keyId, patch)
          }),
        )

        return { apiKey }
      },
    },
    {
      outputFields: t => ({
        apiKey: t.field({ type: 'ApiKey', resolve: p => p.apiKey }),
      }),
    },
  )

  // ── removeApiKey ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'removeApiKey',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'ApiKey', required: true }),
      }),
    },
    {
      errors: { types: [UnauthenticatedError, ApiKeyNotFound] },
      authScopes: (_parent, args, _ctx) => ({
        apiKeyOwner: {
          keyId: Number(args.input.id.id),
          action: 'delete' as const,
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const keyId = Number(input.id.id)

        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ApiKeyService
            return yield* svc.remove(keyId)
          }),
        )

        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ resolve: p => p.success }),
      }),
    },
  )
}
