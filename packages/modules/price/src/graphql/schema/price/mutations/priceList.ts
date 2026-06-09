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
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The organization that will own the new price list.' }),
        title: t.string({ required: true, validate: z.string().min(1).max(255).transform(v => v.trim()), description: 'Human-readable name for the price list.' }),
        description: t.string({ description: 'Optional freeform text describing the purpose of the price list.' }),
        type: t.string({ required: true, validate: z.enum(['sale', 'override']), description: 'How the list applies: \'sale\' for promotional pricing or \'override\' to replace base prices.' }),
        status: t.string({ validate: z.enum(['draft', 'active']).optional(), description: 'Lifecycle state of the list; defaults to \'draft\' when omitted.' }),
        startsAt: t.field({ type: 'DateTime', description: 'When the list becomes eligible to apply; open-ended if omitted.' }),
        endsAt: t.field({ type: 'DateTime', description: 'When the list stops applying; open-ended if omitted.' }),
        rules: t.field({ type: ['PriceRuleInput'], description: 'Operator rules (attribute/operator/value predicates) deciding when the list applies.' }),
        metadata: t.field({ type: 'JSONObject', description: 'Arbitrary key-value data attached to the price list.' }),
      }),
    },
    {
      description: 'Creates a new org-scoped price list, optionally seeding its applicability rules.',
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
        priceList: t.field({ type: 'PriceList', resolve: p => p.priceList, description: 'The newly created price list.' }),
      }),
    },
  )

  // ── updatePriceList ───────────────────────────────────────────────────────
  builder.relayMutationField(
    'updatePriceList',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'PriceList', required: true, description: 'The price list to update.' }),
        version: t.int({ required: true, description: 'Current version for optimistic-lock concurrency control.' }),
        title: t.string({ validate: z.string().min(1).max(255).transform(v => v.trim()).optional(), description: 'New human-readable name; unchanged when omitted.' }),
        description: t.string({ description: 'New freeform descriptive text; unchanged when omitted.' }),
        type: t.string({ validate: z.enum(['sale', 'override']).optional(), description: 'New application kind, \'sale\' or \'override\'; unchanged when omitted.' }),
        status: t.string({ validate: z.enum(['draft', 'active']).optional(), description: 'New lifecycle state; unchanged when omitted.' }),
        startsAt: t.field({ type: 'DateTime', description: 'New start of the applicability window; unchanged when omitted.' }),
        endsAt: t.field({ type: 'DateTime', description: 'New end of the applicability window; unchanged when omitted.' }),
        rules: t.field({ type: ['PriceRuleInput'], description: 'Replacement set of applicability rules; rules are left untouched when omitted.' }),
        metadata: t.field({ type: 'JSONObject', description: 'New arbitrary key-value data; unchanged when omitted.' }),
      }),
    },
    {
      description: 'Updates an existing price list and optionally replaces its applicability rules, guarded by optimistic locking.',
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
        priceList: t.field({ type: 'PriceList', resolve: p => p.priceList, description: 'The updated price list.' }),
      }),
    },
  )

  // ── deletePriceList (soft delete) ─────────────────────────────────────────
  builder.relayMutationField(
    'deletePriceList',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'PriceList', required: true, description: 'The price list to delete.' }),
        version: t.int({ required: true, description: 'Current version for optimistic-lock concurrency control.' }),
      }),
    },
    {
      description: 'Soft-deletes a price list, marking it removed while preserving the record.',
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
        priceList: t.field({ type: 'PriceList', resolve: p => p.priceList, description: 'The soft-deleted price list.' }),
      }),
    },
  )
}
