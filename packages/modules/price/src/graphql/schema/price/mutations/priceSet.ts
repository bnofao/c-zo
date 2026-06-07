import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import { PriceService } from '../../../../services/price'
import { loadPriceSetOrganizationId } from '../authz'
import { PriceSetNotFound } from '../errors'

// ─── PriceSet Mutations ───────────────────────────────────────────────────────

export function registerPriceSetMutations(builder: PriceGraphQLSchemaBuilder): void {
  // ── createPriceSet ────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createPriceSet',
    {
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true }),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
      errors: { types: [] },
      authScopes: (_parent, args) => ({
        permission: {
          resource: 'price',
          actions: ['create'],
          organization: Number(args.input.organizationId.id),
        },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const priceSet = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.createPriceSet({
              organizationId: Number(input.organizationId.id),
              metadata: input.metadata,
            })
          }),
        )
        return { priceSet }
      },
    },
    {
      outputFields: t => ({
        priceSet: t.field({ type: 'PriceSet', resolve: p => p.priceSet }),
      }),
    },
  )

  // ── deletePriceSet (soft delete) ──────────────────────────────────────────
  builder.relayMutationField(
    'deletePriceSet',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'PriceSet', required: true }),
        version: t.int({ required: true }),
      }),
    },
    {
      errors: { types: [PriceSetNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadPriceSetOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['delete'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const priceSet = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.softDeletePriceSet(Number(input.id.id), input.version)
          }),
        )
        return { priceSet }
      },
    },
    {
      outputFields: t => ({
        priceSet: t.field({ type: 'PriceSet', resolve: p => p.priceSet }),
      }),
    },
  )
}
