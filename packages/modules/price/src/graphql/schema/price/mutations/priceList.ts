import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import type { RuleOperator, RuleValue } from '../../../../services/price'
import { OptimisticLockError } from '@czo/kit/db'
import { ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { z } from 'zod'
import { PriceService } from '../../../../services/price'
import { loadPriceListOrganizationId } from '../authz'
import { InvalidPriceRule, PriceListNotFound } from '../errors'

// ─── helpers ─────────────────────────────────────────────────────────────────

function mapRules(rules: ReadonlyArray<{ attribute: string, operator: unknown, value?: unknown }> | null | undefined) {
  return (rules ?? []).map(r => ({
    attribute: r.attribute,
    operator: r.operator as RuleOperator,
    value: r.value as RuleValue,
  }))
}

function toDate(v: string | Date | null | undefined): Date | null | undefined {
  if (v == null)
    return v as null | undefined
  return v instanceof Date ? v : new Date(v)
}

// ─── PriceList Mutations ──────────────────────────────────────────────────────

export function registerPriceListMutations(builder: PriceGraphQLSchemaBuilder): void {
  // ── createPriceList ───────────────────────────────────────────────────────
  builder.relayMutationField(
    'createPriceList',
    {
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true }),
        title: t.string({ required: true, validate: z.string().min(1).max(255).transform(v => v.trim()) }),
        description: t.string(),
        type: t.string({ required: true, validate: z.enum(['sale', 'override']) }),
        status: t.string({ validate: z.enum(['draft', 'active']).optional() }),
        startsAt: t.field({ type: 'DateTime' }),
        endsAt: t.field({ type: 'DateTime' }),
        rules: t.field({ type: ['PriceRuleInput'] }),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
      errors: { types: [ValidationError, InvalidPriceRule] },
      authScopes: (_parent, args) => ({
        permission: {
          resource: 'price',
          actions: ['create'],
          organization: Number(args.input.organizationId.id),
        },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const priceList = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.createPriceList({
              organizationId: Number(input.organizationId.id),
              title: input.title,
              description: input.description ?? undefined,
              type: input.type as 'sale' | 'override',
              status: (input.status as 'draft' | 'active' | null | undefined) ?? undefined,
              startsAt: toDate(input.startsAt),
              endsAt: toDate(input.endsAt),
              rules: mapRules(input.rules),
              metadata: input.metadata,
            })
          }),
        )
        return { priceList }
      },
    },
    {
      outputFields: t => ({
        priceList: t.field({ type: 'PriceList', resolve: p => p.priceList }),
      }),
    },
  )

  // ── updatePriceList ───────────────────────────────────────────────────────
  builder.relayMutationField(
    'updatePriceList',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'PriceList', required: true }),
        version: t.int({ required: true }),
        title: t.string({ validate: z.string().min(1).max(255).transform(v => v.trim()).optional() }),
        description: t.string(),
        type: t.string({ validate: z.enum(['sale', 'override']).optional() }),
        status: t.string({ validate: z.enum(['draft', 'active']).optional() }),
        startsAt: t.field({ type: 'DateTime' }),
        endsAt: t.field({ type: 'DateTime' }),
        rules: t.field({ type: ['PriceRuleInput'] }),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
      errors: { types: [ValidationError, PriceListNotFound, InvalidPriceRule, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadPriceListOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const priceList = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.updatePriceList(Number(input.id.id), input.version, {
              title: input.title ?? undefined,
              description: input.description ?? undefined,
              type: (input.type as 'sale' | 'override' | null | undefined) ?? undefined,
              status: (input.status as 'draft' | 'active' | null | undefined) ?? undefined,
              startsAt: toDate(input.startsAt),
              endsAt: toDate(input.endsAt),
              rules: input.rules !== null && input.rules !== undefined ? mapRules(input.rules) : undefined,
              metadata: input.metadata ?? undefined,
            })
          }),
        )
        return { priceList }
      },
    },
    {
      outputFields: t => ({
        priceList: t.field({ type: 'PriceList', resolve: p => p.priceList }),
      }),
    },
  )

  // ── deletePriceList (soft delete) ─────────────────────────────────────────
  builder.relayMutationField(
    'deletePriceList',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'PriceList', required: true }),
        version: t.int({ required: true }),
      }),
    },
    {
      errors: { types: [PriceListNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadPriceListOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['delete'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const priceList = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceService
            return yield* svc.softDeletePriceList(Number(input.id.id), input.version)
          }),
        )
        return { priceList }
      },
    },
    {
      outputFields: t => ({
        priceList: t.field({ type: 'PriceList', resolve: p => p.priceList }),
      }),
    },
  )
}
