import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import type { RuleOperator, RuleValue } from '../../../../services/price'
import { OptimisticLockError } from '@czo/kit/db'
import { ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { z } from 'zod'
import { PriceService } from '../../../../services/price'
import { loadPriceOrganizationId } from '../authz'
import { InvalidPriceRule, PriceListNotFound, PriceNotFound, PriceSetNotFound } from '../errors'

// ─── helpers ─────────────────────────────────────────────────────────────────

function mapRules(rules: ReadonlyArray<{ attribute: string, operator: unknown, value?: unknown }> | null | undefined) {
  return (rules ?? []).map(r => ({
    attribute: r.attribute,
    operator: r.operator as RuleOperator,
    value: r.value as RuleValue,
  }))
}

// ─── Price Mutations ──────────────────────────────────────────────────────────

export function registerPriceMutationsInner(builder: PriceGraphQLSchemaBuilder): void {
  // ── createPrice ───────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createPrice',
    {
      inputFields: t => ({
        priceSetId: t.globalID({ for: 'PriceSet', required: true }),
        priceListId: t.globalID({ for: 'PriceList' }),
        currencyCode: t.string({
          required: true,
          validate: z.string().length(3).transform(v => v.toLowerCase()),
        }),
        amount: t.string({
          required: true,
          validate: z.string().regex(/^\d+(\.\d+)?$/),
        }),
        minQuantity: t.int(),
        maxQuantity: t.int(),
        rules: t.field({ type: ['PriceRuleInput'] }),
      }),
    },
    {
      errors: { types: [ValidationError, PriceSetNotFound, PriceListNotFound, InvalidPriceRule] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            const set = yield* svc.findPriceSetById(Number(args.input.priceSetId.id)).pipe(
              Effect.catchTag('PriceSetNotFound', () => Effect.succeed(null)),
            )
            return set?.organizationId ?? null
          }),
        )
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['create'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const price = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.createPrice({
              priceSetId: Number(input.priceSetId.id),
              priceListId: input.priceListId ? Number(input.priceListId.id) : null,
              currencyCode: input.currencyCode,
              amount: input.amount,
              minQuantity: input.minQuantity ?? undefined,
              maxQuantity: input.maxQuantity ?? undefined,
              rules: mapRules(input.rules),
            })
          }),
        )
        return { price }
      },
    },
    {
      outputFields: t => ({
        price: t.field({ type: 'Price', resolve: p => p.price }),
      }),
    },
  )

  // ── updatePrice ───────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updatePrice',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Price', required: true }),
        version: t.int({ required: true }),
        currencyCode: t.string({
          validate: z.string().length(3).transform(v => v.toLowerCase()).optional(),
        }),
        amount: t.string({
          validate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
        }),
        minQuantity: t.int(),
        maxQuantity: t.int(),
        rules: t.field({ type: ['PriceRuleInput'] }),
      }),
    },
    {
      errors: { types: [ValidationError, PriceNotFound, InvalidPriceRule, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadPriceOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const price = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.updatePrice(Number(input.id.id), input.version, {
              currencyCode: input.currencyCode ?? undefined,
              amount: input.amount ?? undefined,
              minQuantity: input.minQuantity ?? undefined,
              maxQuantity: input.maxQuantity ?? undefined,
              rules: input.rules !== null && input.rules !== undefined ? mapRules(input.rules) : undefined,
            })
          }),
        )
        return { price }
      },
    },
    {
      outputFields: t => ({
        price: t.field({ type: 'Price', resolve: p => p.price }),
      }),
    },
  )

  // ── deletePrice (soft delete) ─────────────────────────────────────────────
  builder.relayMutationField(
    'deletePrice',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Price', required: true }),
        version: t.int({ required: true }),
      }),
    },
    {
      errors: { types: [PriceNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadPriceOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['delete'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const price = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.softDeletePrice(Number(input.id.id), input.version)
          }),
        )
        return { price }
      },
    },
    {
      outputFields: t => ({
        price: t.field({ type: 'Price', resolve: p => p.price }),
      }),
    },
  )
}
