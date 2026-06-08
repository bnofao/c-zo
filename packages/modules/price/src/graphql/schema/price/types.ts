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
    fields: t => ({
      id: t.exposeInt('id'),
      attribute: t.exposeString('attribute'),
      operator: t.exposeString('operator'),
      priority: t.exposeInt('priority'),
      value: t.field({ type: 'JSON', resolve: r => r.value }),
    }),
  })
  const PriceListRuleRef = builder.objectRef<{ id: number, attribute: string, operator: string, value: unknown }>('PriceListRule').implement({
    fields: t => ({
      id: t.exposeInt('id'),
      attribute: t.exposeString('attribute'),
      operator: t.exposeString('operator'),
      value: t.field({ type: 'JSON', resolve: r => r.value }),
    }),
  })

  // ── PriceSet node ──────────────────────────────────────────────────────────
  builder.drizzleNode('priceSets', {
    name: 'PriceSet',
    // Load all columns so the `node(id:)` guard can read `organizationId`.
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        resolve: s => s.metadata as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
      version: t.exposeInt('version'),

      organization: t.relation('organization'),

      prices: t.relatedConnection('prices', {
        authScopes: parent => ({ permission: { resource: 'price', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
    }),
  })

  // ── Price node ─────────────────────────────────────────────────────────────
  builder.drizzleNode('prices', {
    name: 'Price',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      // `amount` is `numeric` → exposed as a String.
      currencyCode: t.exposeString('currencyCode'),
      amount: t.exposeString('amount'),
      minQuantity: t.exposeInt('minQuantity', { nullable: true }),
      maxQuantity: t.exposeInt('maxQuantity', { nullable: true }),
      version: t.exposeInt('version'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),

      organization: t.relation('organization'),
      priceSet: t.relation('priceSet'),
      priceList: t.relation('priceList', { nullable: true }),

      rules: t.field({
        type: [PriceRuleRef],
        resolve: (price, _args, ctx) => ctx.runEffect(loadPriceRules(price.id)),
      }),
    }),
  })

  // ── PriceList node ─────────────────────────────────────────────────────────
  builder.drizzleNode('priceLists', {
    name: 'PriceList',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      title: t.exposeString('title'),
      description: t.exposeString('description', { nullable: true }),
      type: t.exposeString('type'),
      status: t.exposeString('status'),
      startsAt: t.expose('startsAt', { type: 'DateTime', nullable: true }),
      endsAt: t.expose('endsAt', { type: 'DateTime', nullable: true }),
      version: t.exposeInt('version'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),

      organization: t.relation('organization'),

      prices: t.relatedConnection('prices', {
        authScopes: parent => ({ permission: { resource: 'price', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),

      rules: t.field({
        type: [PriceListRuleRef],
        resolve: (list, _args, ctx) => ctx.runEffect(loadListRules(list.id)),
      }),
    }),
  })

  // ── CalculatedPrice union ──────────────────────────────────────────────────
  const BasePriceRef = builder.objectRef<Extract<CalculatedPrice, { _tag: 'Base' }>>('BasePrice').implement({
    fields: t => ({
      amount: t.exposeString('amount'),
      currencyCode: t.exposeString('currencyCode'),
      priceId: t.exposeInt('priceId'),
    }),
  })
  const OverridePriceRef = builder.objectRef<Extract<CalculatedPrice, { _tag: 'Override' }>>('OverridePrice').implement({
    fields: t => ({
      amount: t.exposeString('amount'),
      currencyCode: t.exposeString('currencyCode'),
      priceId: t.exposeInt('priceId'),
      priceListId: t.exposeInt('priceListId'),
    }),
  })
  const SalePriceRef = builder.objectRef<Extract<CalculatedPrice, { _tag: 'Sale' }>>('SalePrice').implement({
    fields: t => ({
      amount: t.exposeString('amount'),
      originalAmount: t.exposeString('originalAmount'),
      currencyCode: t.exposeString('currencyCode'),
      priceId: t.exposeInt('priceId'),
      priceListId: t.exposeInt('priceListId'),
    }),
  })
  builder.unionType('CalculatedPrice', {
    types: [BasePriceRef, OverridePriceRef, SalePriceRef],
    resolveType: v => (v._tag === 'Base' ? 'BasePrice' : v._tag === 'Override' ? 'OverridePrice' : 'SalePrice'),
  })

  // ── PriceResolution — one entry per requested set in the bulk `resolvePrices` ─
  builder.objectRef<{ priceSetId: number, price: CalculatedPrice | null }>('PriceResolution').implement({
    fields: t => ({
      priceSetId: t.id({ resolve: r => encodeGlobalID('PriceSet', String(r.priceSetId)) }),
      price: t.field({ type: 'CalculatedPrice', nullable: true, resolve: r => r.price }),
    }),
  })
}
