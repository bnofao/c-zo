// Price sub-module — Pothos type definitions
//
// Relations available (relations.ts):
//   priceSets.organization → one organizations        (→ PriceSet.organization)
//   priceSets.prices → many prices                     (→ PriceSet.prices connection)
//   prices.organization → one organizations            (→ Price.organization)
//   prices.priceSet → one priceSets                    (→ Price.priceSet)
//   prices.priceList → one priceLists                  (→ Price.priceList, nullable)
//   priceLists.organization → one organizations        (→ PriceList.organization)
//   priceLists.prices → many prices                    (→ PriceList.prices connection)
//
// Rules (priceRules / priceListRules) are exposed as plain LIST fields resolved
// via the service — NOT relay connections: a price/list has few rules, and
// connections fail closed inside mutation payloads.
//
// `CalculatedPrice` is a Pothos union (BasePrice | OverridePrice | SalePrice),
// the return type of the `resolvePrice` query (Task 15). It is referenceable by
// string name from queries.ts via the `BuilderSchemaObjects` augmentation in
// `graphql/index.ts`.

import type { PriceGraphQLSchemaBuilder } from '../..'
import type { CalculatedPrice } from '../../../services/price'
import { encodeGlobalID } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { PriceService } from '../../../services/price'

function loadPriceRules(priceId: number) {
  return Effect.gen(function* () {
    return yield* (yield* PriceService).findPriceRules(priceId)
  })
}
function loadListRules(listId: number) {
  return Effect.gen(function* () {
    return yield* (yield* PriceService).findPriceListRules(listId)
  })
}

export function registerPriceTypes(builder: PriceGraphQLSchemaBuilder): void {
  // ── Rule object refs ───────────────────────────────────────────────────────
  // Rule `value` is arbitrary JSON (string | number | array), so it is exposed
  // via the generic kit-global `JSON` scalar, not `JSONObject` (object-only).
  const PriceRuleRef = builder.objectRef<{ id: number, attribute: string, operator: string, value: unknown, priority: number }>('PriceRule').implement({
    description: 'A condition gating when a price applies, comparing a buying-context attribute against a value via an operator.',
    fields: t => ({
      id: t.exposeInt('id', { description: 'Unique identifier of the rule.' }),
      attribute: t.exposeString('attribute', { description: 'Name of the buying-context attribute the rule tests.' }),
      operator: t.exposeString('operator', { description: 'Comparison operator (eq, ne, gt, gte, lt, lte, in).' }),
      priority: t.exposeInt('priority', { description: 'Evaluation priority among the price\'s rules (lower runs first).' }),
      value: t.field({ type: 'JSON', resolve: r => r.value, description: 'The value compared against — a JSON scalar, or an array for `in`.' }),
    }),
  })
  const PriceListRuleRef = builder.objectRef<{ id: number, attribute: string, operator: string, value: unknown }>('PriceListRule').implement({
    description: 'A condition gating when a price list applies, comparing a buying-context attribute against a value via an operator.',
    fields: t => ({
      id: t.exposeInt('id', { description: 'Unique identifier of the rule.' }),
      attribute: t.exposeString('attribute', { description: 'Name of the buying-context attribute the rule tests.' }),
      operator: t.exposeString('operator', { description: 'Comparison operator (eq, ne, gt, gte, lt, lte, in).' }),
      value: t.field({ type: 'JSON', resolve: r => r.value, description: 'The value compared against — a JSON scalar, or an array for `in`.' }),
    }),
  })

  // ── PriceSet node ──────────────────────────────────────────────────────────
  builder.drizzleNode('priceSets', {
    name: 'PriceSet',
    description: 'An organization-scoped container of prices for one priceable thing (e.g. a product variant). Resolution (`resolvePrice`) picks the effective price from its prices for a given currency and buying context.',
    // Load all columns so the `node(id:)` guard can read `organizationId`.
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        description: 'Freeform JSON metadata attached to the price set.',
        resolve: s => s.metadata as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),
      version: t.exposeInt('version', { description: 'Optimistic-lock version, incremented on each update.' }),

      organization: t.relation('organization', { description: 'The organization that owns this row.' }),

      prices: t.relatedConnection('prices', {
        description: 'The prices contained in this price set (soft-deleted excluded). Requires `price:read` in the set\'s org.',
        authScopes: parent => ({ permission: { resource: 'price', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
    }),
  })

  // ── Price node ─────────────────────────────────────────────────────────────
  builder.drizzleNode('prices', {
    name: 'Price',
    description: 'A single priced entry within a price set: an amount in a currency, optionally bounded by a quantity tier and gated by operator rules. May belong to a price list (sale/override).',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      // `amount` is `numeric` → exposed as a String.
      currencyCode: t.exposeString('currencyCode', { description: 'ISO 4217 currency code of the amount (e.g. `USD`).' }),
      amount: t.exposeString('amount', { description: 'The price amount, as a decimal string to preserve precision.' }),
      minQuantity: t.exposeInt('minQuantity', { nullable: true, description: 'Lower bound (inclusive) of the quantity tier this price applies to; null = no lower bound.' }),
      maxQuantity: t.exposeInt('maxQuantity', { nullable: true, description: 'Upper bound (inclusive) of the quantity tier this price applies to; null = no upper bound.' }),
      version: t.exposeInt('version', { description: 'Optimistic-lock version, incremented on each update.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),

      organization: t.relation('organization', { description: 'The organization that owns this row.' }),
      priceSet: t.relation('priceSet', { description: 'The price set this price belongs to.' }),
      priceList: t.relation('priceList', { nullable: true, description: 'The price list this price belongs to (sale/override), or null for a base price.' }),

      rules: t.field({
        type: [PriceRuleRef],
        description: 'Operator rules that decide when this price applies; all must match the buying context.',
        resolve: (price, _args, ctx) => ctx.runEffect(loadPriceRules(price.id)),
      }),
    }),
  })

  // ── PriceList node ─────────────────────────────────────────────────────────
  builder.drizzleNode('priceLists', {
    name: 'PriceList',
    description: 'An organization-scoped, named grouping of prices that applies conditionally — e.g. a SALE or an OVERRIDE — with a lifecycle status, an optional active window, and operator rules.',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      title: t.exposeString('title', { description: 'Display name of the price list.' }),
      description: t.exposeString('description', { nullable: true, description: 'Optional freeform description of the price list.' }),
      type: t.exposeString('type', { description: 'The list\'s pricing behavior, e.g. SALE or OVERRIDE.' }),
      status: t.exposeString('status', { description: 'Lifecycle status of the price list (e.g. DRAFT, ACTIVE).' }),
      startsAt: t.expose('startsAt', { type: 'DateTime', nullable: true, description: 'Start of the active window; null = no start bound.' }),
      endsAt: t.expose('endsAt', { type: 'DateTime', nullable: true, description: 'End of the active window; null = no end bound.' }),
      version: t.exposeInt('version', { description: 'Optimistic-lock version, incremented on each update.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),

      organization: t.relation('organization', { description: 'The organization that owns this row.' }),

      prices: t.relatedConnection('prices', {
        description: 'The prices that belong to this price list (soft-deleted excluded). Requires `price:read` in the list\'s org.',
        authScopes: parent => ({ permission: { resource: 'price', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),

      rules: t.field({
        type: [PriceListRuleRef],
        description: 'Operator rules that decide when this price list applies; all must match the buying context.',
        resolve: (list, _args, ctx) => ctx.runEffect(loadListRules(list.id)),
      }),
    }),
  })

  // ── CalculatedPrice union ──────────────────────────────────────────────────
  const BasePriceRef = builder.objectRef<Extract<CalculatedPrice, { _tag: 'Base' }>>('BasePrice').implement({
    subGraphs: ['public'],
    description: 'A resolved price taken directly from the price set, with no price list applied.',
    fields: t => ({
      amount: t.exposeString('amount', { description: 'The effective amount, as a decimal string.' }),
      currencyCode: t.exposeString('currencyCode', { description: 'ISO 4217 currency code of the amount.' }),
      priceId: t.exposeInt('priceId', { description: 'Id of the underlying price row that was selected.' }),
    }),
  })
  const OverridePriceRef = builder.objectRef<Extract<CalculatedPrice, { _tag: 'Override' }>>('OverridePrice').implement({
    subGraphs: ['public'],
    description: 'A resolved price where an OVERRIDE price list replaced the base price.',
    fields: t => ({
      amount: t.exposeString('amount', { description: 'The effective (overriding) amount, as a decimal string.' }),
      currencyCode: t.exposeString('currencyCode', { description: 'ISO 4217 currency code of the amount.' }),
      priceId: t.exposeInt('priceId', { description: 'Id of the underlying price row that was selected.' }),
      priceListId: t.exposeInt('priceListId', { description: 'Id of the override price list that applied.' }),
    }),
  })
  const SalePriceRef = builder.objectRef<Extract<CalculatedPrice, { _tag: 'Sale' }>>('SalePrice').implement({
    subGraphs: ['public'],
    description: 'A resolved price where a SALE price list discounted the base price; exposes both the sale and original amounts.',
    fields: t => ({
      amount: t.exposeString('amount', { description: 'The effective (sale) amount, as a decimal string.' }),
      originalAmount: t.exposeString('originalAmount', { description: 'The pre-sale base amount, as a decimal string.' }),
      currencyCode: t.exposeString('currencyCode', { description: 'ISO 4217 currency code of the amounts.' }),
      priceId: t.exposeInt('priceId', { description: 'Id of the underlying price row that was selected.' }),
      priceListId: t.exposeInt('priceListId', { description: 'Id of the sale price list that applied.' }),
    }),
  })
  builder.unionType('CalculatedPrice', {
    subGraphs: ['public'],
    description: 'The effective price returned by price resolution: a BasePrice (no list), an OverridePrice (override list), or a SalePrice (sale list).',
    types: [BasePriceRef, OverridePriceRef, SalePriceRef],
    resolveType: v => (v._tag === 'Base' ? 'BasePrice' : v._tag === 'Override' ? 'OverridePrice' : 'SalePrice'),
  })

  // ── PriceResolution — one entry per requested set in the bulk `resolvePrices` ─
  builder.objectRef<{ priceSetId: number, price: CalculatedPrice | null }>('PriceResolution').implement({
    subGraphs: ['public'],
    description: 'One entry of a bulk `resolvePrices` result: the requested price set and its resolved price (null when none applied or the set is out of scope).',
    fields: t => ({
      priceSetId: t.id({ resolve: r => encodeGlobalID('PriceSet', String(r.priceSetId)), description: 'Relay global id of the requested price set.' }),
      price: t.field({ type: 'CalculatedPrice', nullable: true, resolve: r => r.price, description: 'The resolved price for this set, or null if none applied / out of scope.' }),
    }),
  })
}
