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
        priceSetId: t.globalID({ for: 'PriceSet', required: true, description: 'The price set this price belongs to and whose organization gates the operation.' }),
        priceListId: t.globalID({ for: 'PriceList', description: 'Optional price list this price is scoped to, such as a sale or customer-group override.' }),
        currencyCode: t.string({
          required: true,
          validate: z.string().length(3).transform(v => v.toLowerCase()),
          description: 'ISO 4217 currency code the amount is denominated in.',
        }),
        amount: t.string({
          required: true,
          validate: z.string().regex(/^\d+(\.\d+)?$/),
          description: 'The price amount as a decimal string, preserving precision.',
        }),
        minQuantity: t.int({ description: 'Lowest quantity at which this price applies, for quantity-tier pricing.' }),
        maxQuantity: t.int({ description: 'Highest quantity at which this price applies, for quantity-tier pricing.' }),
        rules: t.field({ type: ['PriceRuleInput'], description: 'Operator rules that decide when this price applies, evaluated against the pricing context.' }),
      }),
    },
    {
      description: 'Creates a price within a price set, optionally scoped to a price list and gated by operator rules.',
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
        price: t.field({ type: 'Price', resolve: p => p.price, description: 'The newly created price.' }),
      }),
    },
  )

  // ── updatePrice ───────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updatePrice',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Price', required: true, description: 'The price to update.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control.' }),
        currencyCode: t.string({
          validate: z.string().length(3).transform(v => v.toLowerCase()).optional(),
          description: 'New ISO 4217 currency code; leave unset to keep the current one.',
        }),
        amount: t.string({
          validate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
          description: 'New amount as a decimal string; leave unset to keep the current one.',
        }),
        minQuantity: t.int({ description: 'New lowest quantity at which this price applies, for quantity-tier pricing.' }),
        maxQuantity: t.int({ description: 'New highest quantity at which this price applies, for quantity-tier pricing.' }),
        rules: t.field({ type: ['PriceRuleInput'], description: 'Replacement set of operator rules that decide when this price applies; leave unset to keep the current ones.' }),
      }),
    },
    {
      description: 'Updates a price\'s amount, currency, quantity tiers, or operator rules, guarded by optimistic locking.',
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
        price: t.field({ type: 'Price', resolve: p => p.price, description: 'The updated price.' }),
      }),
    },
  )

  // ── deletePrice (soft delete) ─────────────────────────────────────────────
  builder.relayMutationField(
    'deletePrice',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Price', required: true, description: 'The price to delete.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control.' }),
      }),
    },
    {
      description: 'Soft-deletes a price, marking it removed while preserving the record, guarded by optimistic locking.',
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
        price: t.field({ type: 'Price', resolve: p => p.price, description: 'The soft-deleted price.' }),
      }),
    },
  )
}
