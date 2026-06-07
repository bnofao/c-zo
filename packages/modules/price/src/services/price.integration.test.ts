import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { organizations } from '@czo/auth/schema'
import { makePostgresTestLayer, truncateTables } from '@czo/kit/testing'
import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { priceRelations } from '../database/relations'
import { priceListRules, priceLists, priceRules, prices, priceSets } from '../database/schema'
import * as Price from './price'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')
const PricePostgresLayer = makePostgresTestLayer({
  migrationsFolder: MIGRATIONS,
  relations: priceRelations({ priceSets, priceLists, prices, priceRules, priceListRules, organizations }),
})
const truncatePrice = truncateTables(priceListRules, priceRules, prices, priceLists, priceSets)

const TestLayer = Price.layer.pipe(Layer.provideMerge(PricePostgresLayer))

layer(TestLayer, { timeout: 120_000 })('PriceService', (it) => {
  it.effect('createPriceSet + findPriceSet round-trips', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      expect(set.organizationId).toBe(1)
      const found = yield* svc.findPriceSetById(set.id)
      expect(found.id).toBe(set.id)
    }))

  it.effect('findPriceSetById fails PriceSetNotFound for unknown id', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const err = yield* svc.findPriceSetById(999999).pipe(Effect.flip)
      expect(err._tag).toBe('PriceSetNotFound')
    }))

  it.effect('createPrice with rules, then findPrice loads them', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      const price = yield* svc.createPrice({
        priceSetId: set.id,
        currencyCode: 'eur',
        amount: '19.99',
        rules: [{ attribute: 'region_id', operator: 'eq', value: 'eu' }],
      })
      expect(price.organizationId).toBe(1)
      const rules = yield* svc.findPriceRules(price.id)
      expect(rules.length).toBe(1)
      expect(rules[0]!.attribute).toBe('region_id')
    }))

  it.effect('updatePrice replaces its rule set under optimistic lock', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      const price = yield* svc.createPrice({
        priceSetId: set.id,
        currencyCode: 'eur',
        amount: '10',
        rules: [{ attribute: 'region_id', operator: 'eq', value: 'eu' }],
      })
      const updated = yield* svc.updatePrice(price.id, price.version, {
        amount: '12',
        rules: [{ attribute: 'channel_id', operator: 'eq', value: 'web' }],
      })
      expect(updated.amount).toBe('12')
      const rules = yield* svc.findPriceRules(price.id)
      expect(rules.map(r => r.attribute)).toEqual(['channel_id'])
      const err = yield* svc.updatePrice(price.id, price.version, { amount: '99' }).pipe(Effect.flip)
      expect(err.name).toBe('OptimisticLockError')
    }))

  it.effect('createPriceList with list-rules + status/window', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const list = yield* svc.createPriceList({
        organizationId: 1,
        title: 'Summer Sale',
        type: 'sale',
        status: 'active',
        rules: [{ attribute: 'customer_group_id', operator: 'eq', value: 'vip' }],
      })
      expect(list.type).toBe('sale')
      expect(list.status).toBe('active')
      const rules = yield* svc.findPriceListRules(list.id)
      expect(rules.map(r => r.attribute)).toEqual(['customer_group_id'])
    }))

  it.effect('updatePriceList flips status + replaces rules under lock', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const list = yield* svc.createPriceList({ organizationId: 1, title: 'L', type: 'override' })
      const updated = yield* svc.updatePriceList(list.id, list.version, { status: 'active', rules: [{ attribute: 'region_id', operator: 'in', value: ['eu', 'us'] }] })
      expect(updated.status).toBe('active')
      const rules = yield* svc.findPriceListRules(list.id)
      expect(rules[0]!.operator).toBe('in')
    }))

  // ─── Task 10: resolvePrice ─────────────────────────────────────────────────

  const ctxAttr = (attribute: string, value: string | number) => ({ attribute, value })

  it.effect('resolvePrice picks region-specific over base; tiers by quantity; null on no-match', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '20' })
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '18', rules: [{ attribute: 'region_id', operator: 'eq', value: 'eu' }] })
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '15', minQuantity: 10 })

      const r1 = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', attributes: [ctxAttr('region_id', 'eu')] })
      expect(r1?._tag).toBe('Base')
      expect(r1?.amount).toBe('18')

      const r2 = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', quantity: 12 })
      expect(r2?.amount).toBe('15')

      const none = yield* svc.resolvePrice(1, set.id, { currencyCode: 'usd' })
      expect(none).toBe(null)
    }))

  it.effect('resolvePrice returns null for a foreign org (H1 cross-tenant guard)', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '9' })
      const r = yield* svc.resolvePrice(2, set.id, { currencyCode: 'eur' })
      expect(r).toBe(null)
    }))

  it.effect('active sale list overrides base within its window; outside → base', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '20' })
      const list = yield* svc.createPriceList({ organizationId: 1, title: 'June', type: 'sale', status: 'active', startsAt: new Date('2026-06-01T00:00:00Z'), endsAt: new Date('2026-06-30T00:00:00Z') })
      yield* svc.createPrice({ priceSetId: set.id, priceListId: list.id, currencyCode: 'eur', amount: '15' })

      const inside = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', at: new Date('2026-06-15T00:00:00Z') })
      expect(inside).toEqual({ _tag: 'Sale', amount: '15', originalAmount: '20', currencyCode: 'eur', priceId: expect.any(Number), priceListId: list.id })

      const before = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', at: new Date('2026-05-01T00:00:00Z') })
      expect(before?._tag).toBe('Base')

      // draft list does not apply even inside window
      const list2 = yield* svc.createPriceList({ organizationId: 1, title: 'Draft', type: 'sale', status: 'draft', startsAt: new Date('2026-06-01T00:00:00Z'), endsAt: new Date('2026-06-30T00:00:00Z') })
      yield* svc.createPrice({ priceSetId: set.id, priceListId: list2.id, currencyCode: 'eur', amount: '5' })
      const stillSale = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', at: new Date('2026-06-15T00:00:00Z') })
      expect(stillSale?.amount).toBe('15') // the active sale (15), not the draft (5)
    }))

  it.effect('numeric threshold rule (item_total gte 100) gates a price', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '20' })
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '16', rules: [{ attribute: 'item_total', operator: 'gte', value: 100 }] })
      const big = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', attributes: [ctxAttr('item_total', 150)] })
      expect(big?.amount).toBe('16')
      const small = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', attributes: [ctxAttr('item_total', 50)] })
      expect(small?.amount).toBe('20')
    }))

  // ─── Task 11: mutation-boundary rule validation ────────────────────────────

  it.effect('createPrice rejects an incoherent rule (InvalidPriceRule)', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      const err = yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '1', rules: [{ attribute: 'item_total', operator: 'gte', value: 'x' as unknown as number }] }).pipe(Effect.flip)
      expect(err._tag).toBe('InvalidPriceRule')
    }))

  it.effect('createPrice rejects linking a price-list from another org (C1 cross-tenant)', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const setA = yield* svc.createPriceSet({ organizationId: 1 })
      const listB = yield* svc.createPriceList({ organizationId: 2, title: 'B', type: 'sale', status: 'active' })
      const err = yield* svc.createPrice({ priceSetId: setA.id, priceListId: listB.id, currencyCode: 'eur', amount: '5' }).pipe(Effect.flip)
      expect(err._tag).toBe('PriceListNotFound')
    }))

  // Gap 1 — soft-delete exclusion + soft-delete lock conflict
  it.effect('soft-deleted price is excluded from resolvePrice; deleting the set → null', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      const p = yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '20' })
      yield* svc.softDeletePrice(p.id, p.version)
      const afterPriceDelete = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur' })
      expect(afterPriceDelete).toBe(null)
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '10' })
      yield* svc.softDeletePriceSet(set.id, set.version)
      const afterSetDelete = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur' })
      expect(afterSetDelete).toBe(null)
    }))

  it.effect('softDeletePrice conflicts on a stale version', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      const p = yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '20' })
      yield* svc.updatePrice(p.id, p.version, { amount: '21' }) // bumps version → p.version now stale
      const err = yield* svc.softDeletePrice(p.id, p.version).pipe(Effect.flip)
      expect(err.name).toBe('OptimisticLockError')
    }))

  // Gap 2 — price-list applies ONLY when its list-rules match the context
  it.effect('price-list applies only when its list-rules match the context', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '20' })
      const list = yield* svc.createPriceList({ organizationId: 1, title: 'VIP', type: 'sale', status: 'active', rules: [{ attribute: 'customer_group_id', operator: 'eq', value: 'vip' }] })
      yield* svc.createPrice({ priceSetId: set.id, priceListId: list.id, currencyCode: 'eur', amount: '15' })
      const noGroup = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur' })
      expect(noGroup?._tag).toBe('Base')
      expect(noGroup?.amount).toBe('20')
      const vip = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', attributes: [{ attribute: 'customer_group_id', value: 'vip' }] })
      expect(vip).toEqual({ _tag: 'Sale', amount: '15', originalAmount: '20', currencyCode: 'eur', priceId: expect.any(Number), priceListId: list.id })
    }))

  // Gap 5 — maxQuantity upper bound excludes a price above the band
  it.effect('maxQuantity upper bound excludes a price above the band', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '20' })
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '12', maxQuantity: 9 })
      const low = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', quantity: 5 })
      expect(low?.amount).toBe('12')
      const high = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', quantity: 50 })
      expect(high?.amount).toBe('20')
    }))

  // Gap 7 — `in` operator round-trips through jsonb (array value) in resolution
  it.effect('in operator (array jsonb) matches in resolution; no-match falls to base', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '20' })
      yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '17', rules: [{ attribute: 'region_id', operator: 'in', value: ['eu', 'us'] }] })
      const us = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', attributes: [{ attribute: 'region_id', value: 'us' }] })
      expect(us?.amount).toBe('17')
      const apac = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', attributes: [{ attribute: 'region_id', value: 'apac' }] })
      expect(apac?.amount).toBe('20')
    }))

  it.effect('resolvePrices resolves many sets in one call; foreign/unknown → null entry', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const setA = yield* svc.createPriceSet({ organizationId: 1 })
      yield* svc.createPrice({ priceSetId: setA.id, currencyCode: 'eur', amount: '20' })
      yield* svc.createPrice({ priceSetId: setA.id, currencyCode: 'eur', amount: '18', rules: [{ attribute: 'region_id', operator: 'eq', value: 'eu' }] })
      const setB = yield* svc.createPriceSet({ organizationId: 1 })
      yield* svc.createPrice({ priceSetId: setB.id, currencyCode: 'eur', amount: '9' })
      const foreign = yield* svc.createPriceSet({ organizationId: 2 }) // other org
      const unknownId = 999999

      const map = yield* svc.resolvePrices(1, [setA.id, setB.id, foreign.id, unknownId], { currencyCode: 'eur', attributes: [{ attribute: 'region_id', value: 'eu' }] })
      expect(map.get(setA.id)?.amount).toBe('18') // region-specific
      expect(map.get(setB.id)?.amount).toBe('9')
      expect(map.get(foreign.id)).toBe(null) // cross-org
      expect(map.get(unknownId)).toBe(null)
    }))
})
