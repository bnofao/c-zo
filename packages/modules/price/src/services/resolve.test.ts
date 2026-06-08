import type { Candidate, JsonScalar, RawListForGate, RawPriceForGate } from './resolve'
import { describe, expect, it } from 'vitest'
import { resolveCalculated, rowToCandidate, ruleSatisfied } from './resolve'

const ctx = (pairs: Record<string, string | number>) => new Map<string, string | number>(Object.entries(pairs))

describe('ruleSatisfied', () => {
  it('eq normalizes string/number ("100" === 100)', () => {
    expect(ruleSatisfied({ attribute: 'item_total', operator: 'eq', value: 100 }, ctx({ item_total: '100' }))).toBe(true)
  })
  it('eq with a number value compares numerically (decimal strings match; M1)', () => {
    // number-typed value → numeric: "100.00" / "100.0" match 100, "99" does not
    expect(ruleSatisfied({ attribute: 'item_total', operator: 'eq', value: 100 }, ctx({ item_total: '100.00' }))).toBe(true)
    expect(ruleSatisfied({ attribute: 'item_total', operator: 'eq', value: 100 }, ctx({ item_total: '100.0' }))).toBe(true)
    expect(ruleSatisfied({ attribute: 'item_total', operator: 'eq', value: 100 }, ctx({ item_total: '99' }))).toBe(false)
  })
  it('eq with a string value matches exactly — preserves zero-padded codes (M1)', () => {
    // string-typed value → exact string: "00123" is NOT collapsed to 123
    expect(ruleSatisfied({ attribute: 'sku', operator: 'eq', value: '00123' }, ctx({ sku: '00123' }))).toBe(true)
    expect(ruleSatisfied({ attribute: 'sku', operator: 'eq', value: '00123' }, ctx({ sku: '123' }))).toBe(false)
  })
  it('in with number values compares numerically per element (M1)', () => {
    expect(ruleSatisfied({ attribute: 'tier', operator: 'in', value: [100, 200] }, ctx({ tier: '100.00' }))).toBe(true)
    expect(ruleSatisfied({ attribute: 'tier', operator: 'in', value: [100, 200] }, ctx({ tier: '150' }))).toBe(false)
  })
  it('ne true when different, gated on presence', () => {
    expect(ruleSatisfied({ attribute: 'region_id', operator: 'ne', value: 'eu' }, ctx({ region_id: 'us' }))).toBe(true)
    expect(ruleSatisfied({ attribute: 'region_id', operator: 'ne', value: 'eu' }, ctx({}))).toBe(false)
  })
  it('numeric ops coerce; non-numeric ctx ⇒ unsatisfied', () => {
    expect(ruleSatisfied({ attribute: 'item_total', operator: 'gte', value: 100 }, ctx({ item_total: 150 }))).toBe(true)
    expect(ruleSatisfied({ attribute: 'item_total', operator: 'gte', value: 100 }, ctx({ item_total: 'x' }))).toBe(false)
  })
  it('in matches via string-normalized membership', () => {
    expect(ruleSatisfied({ attribute: 'region_id', operator: 'in', value: ['eu', 'us'] }, ctx({ region_id: 'us' }))).toBe(true)
    expect(ruleSatisfied({ attribute: 'region_id', operator: 'in', value: ['eu'] }, ctx({ region_id: 'us' }))).toBe(false)
  })
  it('missing attribute ⇒ unsatisfied (rule gates on the dimension)', () => {
    expect(ruleSatisfied({ attribute: 'region_id', operator: 'eq', value: 'eu' }, ctx({}))).toBe(false)
  })
})

function cand(o: Partial<Candidate> & { priceId: number, amount: string }): Candidate {
  return {
    currencyCode: 'eur',
    priceListId: null,
    priceListType: null,
    rules: [],
    ...o,
  }
}

describe('rowToCandidate', () => {
  const basePrice = (o?: Partial<RawPriceForGate>): RawPriceForGate => ({
    priceId: 1,
    amount: '20',
    currencyCode: 'eur',
    priceListId: null,
    rules: [],
    ...o,
  })
  const list = (o?: Partial<RawListForGate>): RawListForGate => ({
    status: 'active',
    startsAt: null,
    endsAt: null,
    type: 'sale',
    rules: [],
    ...o,
  })

  it('base price (priceListId null) → Candidate with priceListType null, list ignored', () => {
    const c = rowToCandidate(basePrice(), null, new Date(), new Map())
    expect(c).toEqual({ priceId: 1, amount: '20', currencyCode: 'eur', priceListId: null, priceListType: null, rules: [] })
  })

  it('active list → Candidate carrying the list type', () => {
    const p = basePrice({ priceId: 2, amount: '15', priceListId: 9 })
    const c = rowToCandidate(p, list({ type: 'override' }), new Date(), new Map())
    expect(c).toEqual({ priceId: 2, amount: '15', currencyCode: 'eur', priceListId: 9, priceListType: 'override', rules: [] })
  })

  it('draft list → null', () => {
    const p = basePrice({ priceListId: 9 })
    expect(rowToCandidate(p, list({ status: 'draft' }), new Date(), new Map())).toBe(null)
  })

  it('out-of-window (before startsAt / after endsAt) → null', () => {
    const p = basePrice({ priceListId: 9 })
    const now = new Date('2026-06-07T00:00:00Z')
    expect(rowToCandidate(p, list({ startsAt: new Date('2026-06-08T00:00:00Z') }), now, new Map())).toBe(null)
    expect(rowToCandidate(p, list({ endsAt: new Date('2026-06-06T00:00:00Z') }), now, new Map())).toBe(null)
  })

  it('list-rule fail → null; satisfied → Candidate', () => {
    const p = basePrice({ priceListId: 9 })
    const ruled = list({ rules: [{ attribute: 'region_id', operator: 'eq', value: 'eu' }] })
    expect(rowToCandidate(p, ruled, new Date(), new Map())).toBe(null)
    const ctx = new Map<string, JsonScalar>([['region_id', 'eu']])
    expect(rowToCandidate(p, ruled, new Date(), ctx)?.priceListType).toBe('sale')
  })

  it('priceListId set but list missing → null', () => {
    const p = basePrice({ priceListId: 9 })
    expect(rowToCandidate(p, null, new Date(), new Map())).toBe(null)
  })
})

describe('resolveCalculated', () => {
  it('null when no candidates', () => {
    expect(resolveCalculated([], new Map())).toBe(null)
  })
  it('base when only base prices', () => {
    const r = resolveCalculated([cand({ priceId: 1, amount: '20' })], new Map())
    expect(r).toEqual({ _tag: 'Base', amount: '20', currencyCode: 'eur', priceId: 1 })
  })
  it('more specific (more matched rules) wins', () => {
    const ctx = new Map<string, JsonScalar>([['region_id', 'eu']])
    const base = cand({ priceId: 1, amount: '20' })
    const region = cand({ priceId: 2, amount: '18', rules: [{ attribute: 'region_id', operator: 'eq', value: 'eu', priority: 0 }] })
    const r = resolveCalculated([base, region], ctx)
    expect(r?.priceId).toBe(2)
  })
  it('tie broken by Σ priority then lower amount', () => {
    const ctx = new Map<string, JsonScalar>([['a', '1'], ['b', '1']])
    const hi = cand({ priceId: 1, amount: '30', rules: [{ attribute: 'a', operator: 'eq', value: '1', priority: 100 }] })
    const lo = cand({ priceId: 2, amount: '10', rules: [{ attribute: 'b', operator: 'eq', value: '1', priority: 1 }] })
    expect(resolveCalculated([hi, lo], ctx)?.priceId).toBe(1)
  })
  it('active sale list overrides a more-specific base (Sale with originalAmount)', () => {
    const ctx = new Map<string, JsonScalar>([['region_id', 'eu']])
    const base = cand({ priceId: 1, amount: '20', rules: [{ attribute: 'region_id', operator: 'eq', value: 'eu', priority: 0 }] })
    const sale = cand({ priceId: 2, amount: '15', priceListId: 9, priceListType: 'sale' })
    const r = resolveCalculated([base, sale], ctx)
    expect(r).toEqual({ _tag: 'Sale', amount: '15', originalAmount: '20', currencyCode: 'eur', priceId: 2, priceListId: 9 })
  })
  it('override list → Override (no originalAmount)', () => {
    const ovr = cand({ priceId: 2, amount: '15', priceListId: 9, priceListType: 'override' })
    expect(resolveCalculated([cand({ priceId: 1, amount: '20' }), ovr], new Map())).toEqual({ _tag: 'Override', amount: '15', currencyCode: 'eur', priceId: 2, priceListId: 9 })
  })
  it('sale list with no base price degrades to Override', () => {
    const sale = cand({ priceId: 2, amount: '15', priceListId: 9, priceListType: 'sale' })
    expect(resolveCalculated([sale], new Map())).toEqual({ _tag: 'Override', amount: '15', currencyCode: 'eur', priceId: 2, priceListId: 9 })
  })
})
