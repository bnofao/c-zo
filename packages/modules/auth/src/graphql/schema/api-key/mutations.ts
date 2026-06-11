import type { AuthGraphQLSchemaBuilder } from '../../.'
import { UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { ApiKeyNotFound, ApiKeyService, NoChanges, RefillPairRequired } from '../../../services/api-key'
import { sg } from '../subgraphs'

// ─── API Key Mutations ────────────────────────────────────────────────────────
//
// The api-key surface is fully partitioned per audience: each op has an
// `account` variant (personal key; owner = the session user) and an `org`
// variant (`organizationId`-scoped). The `ApiKeyService.{create,update,remove}`
// signatures are unchanged — only the resolver's owner source + the field name
// + the `sg()` spread differ between variants.

export function registerApiKeyMutations(builder: AuthGraphQLSchemaBuilder): void {
  const ACC = sg('account')
  const ORG = sg('org')

  // ── createApiKey (account — owner = session user) ─────────────────────────
  builder.relayMutationField(
    'createApiKey',
    {
      ...ACC.input,
      inputFields: t => ({
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
      ...ACC.field,
      description: 'Creates a personal API key owned by the current user and returns the one-time plaintext secret.',
      errors: { types: [ValidationError, UnauthenticatedError, RefillPairRequired], ...ACC.errorOpts },
      authScopes: (_parent, _args, ctx) => ({
        apiKeyOwner: {
          ownerType: 'USER' as const,
          ownerId: Number(ctx.auth.user!.id),
          action: 'create' as const,
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const { apiKey, plain } = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ApiKeyService
            return yield* svc.create(
              {
                ...input,
                referenceId: Number(ctx.auth.user!.id),
                refillAmount: input.refillAmount ?? undefined,
                refillInterval: input.refillInterval ?? undefined,
                rateLimitEnabled: input.rateLimitEnabled ?? undefined,
                rateLimitTimeWindow: input.rateLimitTimeWindow ?? undefined,
                rateLimitMax: input.rateLimitMax ?? undefined,
              },
              { reference: 'user' },
            )
          }),
        )

        // `plain` is the one-time secret — only ever returned here, at creation.
        return { apiKey, plain }
      },
    },
    {
      ...ACC.payload,
      outputFields: t => ({
        apiKey: t.field({ type: 'ApiKey', resolve: p => p.apiKey, description: 'The newly created key, with its safe metadata.' }),
        plain: t.string({ nullable: true, resolve: p => p.plain, description: 'The plaintext secret. It is shown only ONCE, here at creation, and can never be retrieved again; store it securely.' }),
      }),
    },
  )

  // ── createOrganizationApiKey (org — owner = organizationId) ───────────────
  builder.relayMutationField(
    'createOrganizationApiKey',
    {
      ...ORG.input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'Organization that will own the new key.' }),
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
      ...ORG.field,
      description: 'Creates an organization-owned API key and returns the one-time plaintext secret.',
      errors: { types: [ValidationError, UnauthenticatedError, RefillPairRequired], ...ORG.errorOpts },
      authScopes: (_parent, args, _ctx) => ({
        apiKeyOwner: {
          ownerType: 'ORGANIZATION' as const,
          ownerId: Number(args.input.organizationId.id),
          action: 'create' as const,
        },
      }),
      resolve: async (_root, { input }, ctx) => {
        const { organizationId, ...rest } = input

        const { apiKey, plain } = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ApiKeyService
            return yield* svc.create(
              {
                ...rest,
                referenceId: Number(organizationId.id),
                refillAmount: rest.refillAmount ?? undefined,
                refillInterval: rest.refillInterval ?? undefined,
                rateLimitEnabled: rest.rateLimitEnabled ?? undefined,
                rateLimitTimeWindow: rest.rateLimitTimeWindow ?? undefined,
                rateLimitMax: rest.rateLimitMax ?? undefined,
              },
              { reference: 'organization' },
            )
          }),
        )

        // `plain` is the one-time secret — only ever returned here, at creation.
        return { apiKey, plain }
      },
    },
    {
      ...ORG.payload,
      outputFields: t => ({
        apiKey: t.field({ type: 'ApiKey', resolve: p => p.apiKey, description: 'The newly created key, with its safe metadata.' }),
        plain: t.string({ nullable: true, resolve: p => p.plain, description: 'The plaintext secret. It is shown only ONCE, here at creation, and can never be retrieved again; store it securely.' }),
      }),
    },
  )

  // ── updateApiKey (account) ────────────────────────────────────────────────
  builder.relayMutationField(
    'updateApiKey',
    {
      ...ACC.input,
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
      ...ACC.field,
      description: 'Updates the mutable settings of an existing API key.',
      errors: { types: [ValidationError, UnauthenticatedError, ApiKeyNotFound, NoChanges, RefillPairRequired], ...ACC.errorOpts },
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
      ...ACC.payload,
      outputFields: t => ({
        apiKey: t.field({ type: 'ApiKey', resolve: p => p.apiKey, description: 'The updated key, with its safe metadata.' }),
      }),
    },
  )

  // ── updateOrganizationApiKey (org) ────────────────────────────────────────
  builder.relayMutationField(
    'updateOrganizationApiKey',
    {
      ...ORG.input,
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
      ...ORG.field,
      description: 'Updates the mutable settings of an existing organization-owned API key.',
      errors: { types: [ValidationError, UnauthenticatedError, ApiKeyNotFound, NoChanges, RefillPairRequired], ...ORG.errorOpts },
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
      ...ORG.payload,
      outputFields: t => ({
        apiKey: t.field({ type: 'ApiKey', resolve: p => p.apiKey, description: 'The updated key, with its safe metadata.' }),
      }),
    },
  )

  // ── removeApiKey (account) ────────────────────────────────────────────────
  builder.relayMutationField(
    'removeApiKey',
    {
      ...ACC.input,
      inputFields: t => ({
        id: t.globalID({ for: 'ApiKey', required: true, description: 'Global ID of the key to remove.' }),
      }),
    },
    {
      ...ACC.field,
      description: 'Permanently removes an API key so it can no longer authenticate.',
      errors: { types: [UnauthenticatedError, ApiKeyNotFound], ...ACC.errorOpts },
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
      ...ACC.payload,
      outputFields: t => ({
        success: t.boolean({ resolve: p => p.success, description: 'True when the key was removed.' }),
      }),
    },
  )

  // ── removeOrganizationApiKey (org) ────────────────────────────────────────
  builder.relayMutationField(
    'removeOrganizationApiKey',
    {
      ...ORG.input,
      inputFields: t => ({
        id: t.globalID({ for: 'ApiKey', required: true, description: 'Global ID of the key to remove.' }),
      }),
    },
    {
      ...ORG.field,
      description: 'Permanently removes an organization-owned API key so it can no longer authenticate.',
      errors: { types: [UnauthenticatedError, ApiKeyNotFound], ...ORG.errorOpts },
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
      ...ORG.payload,
      outputFields: t => ({
        success: t.boolean({ resolve: p => p.success, description: 'True when the key was removed.' }),
      }),
    },
  )
}
