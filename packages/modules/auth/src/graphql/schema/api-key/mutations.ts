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
        owner: t.field({ type: 'ApiKeyOwnerInput', required: true, description: 'Entity that will own the new key, either a user or an organization.' }),
        name: t.string({ required: true, description: 'Human-readable label for the new key.' }),
        group: t.string({ required: true, description: 'Group the key belongs to, used to categorise related keys.' }),
        prefix: t.string({ required: true, description: 'Non-secret prefix to prepend to the generated key.' }),
        expiresIn: t.int({ required: false, description: 'Lifetime of the key in seconds; omit for a key that never expires.' }),
        remaining: t.int({ required: false, description: 'Initial request budget; omit for an unlimited key.' }),
        refillAmount: t.int({ required: false, description: 'Number of requests added to the budget at each refill interval.' }),
        refillInterval: t.int({ required: false, description: 'Interval in milliseconds between automatic budget refills.' }),
        rateLimitEnabled: t.boolean({ required: false, description: 'Whether to enforce request rate limiting on the key.' }),
        rateLimitTimeWindow: t.int({ required: false, description: 'Length of the rate-limit window in milliseconds.' }),
        rateLimitMax: t.int({ required: false, description: 'Maximum number of requests permitted within each rate-limit window.' }),
      }),
    },
    {
      description: 'Creates a new API key for a user or organization and returns the one-time plaintext secret.',
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
        apiKey: t.field({ type: 'ApiKey', resolve: p => p.apiKey, description: 'The newly created key, with its safe metadata.' }),
        plain: t.string({ nullable: true, resolve: p => p.plain, description: 'The plaintext secret. It is shown only ONCE, here at creation, and can never be retrieved again; store it securely.' }),
      }),
    },
  )

  // ── updateApiKey ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateApiKey',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'ApiKey', required: true, description: 'Global ID of the key to update.' }),
        name: t.string({ required: false, description: 'New human-readable label for the key.' }),
        enabled: t.boolean({ required: false, description: 'Whether the key should be active and accepted for authentication.' }),
        remaining: t.int({ required: false, description: 'New remaining request budget.' }),
        expiresIn: t.int({ required: false, description: 'New lifetime in seconds, measured from now.' }),
        refillAmount: t.int({ required: false, description: 'New number of requests added to the budget at each refill interval.' }),
        refillInterval: t.int({ required: false, description: 'New interval in milliseconds between automatic budget refills.' }),
        rateLimitEnabled: t.boolean({ required: false, description: 'Whether to enforce request rate limiting on the key.' }),
        rateLimitTimeWindow: t.int({ required: false, description: 'New length of the rate-limit window in milliseconds.' }),
        rateLimitMax: t.int({ required: false, description: 'New maximum number of requests permitted within each rate-limit window.' }),
      }),
    },
    {
      description: 'Updates the mutable settings of an existing API key.',
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
        apiKey: t.field({ type: 'ApiKey', resolve: p => p.apiKey, description: 'The updated key, with its safe metadata.' }),
      }),
    },
  )

  // ── removeApiKey ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'removeApiKey',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'ApiKey', required: true, description: 'Global ID of the key to remove.' }),
      }),
    },
    {
      description: 'Permanently removes an API key so it can no longer authenticate.',
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
        success: t.boolean({ resolve: p => p.success, description: 'True when the key was removed.' }),
      }),
    },
  )
}
