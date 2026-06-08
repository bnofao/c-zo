import type { CalculatedPrice, RuleOperator } from './price'
import { BigDecimal } from 'effect'

export type JsonScalar = string | number

export interface EvalRule {
  readonly attribute: string
  readonly operator: RuleOperator
  readonly value: JsonScalar | ReadonlyArray<JsonScalar>
}

/**
 * Type-driven scalar equality (shared by `eq`/`ne`/`in`).
 *
 * A **number-typed** rule value compares NUMERICALLY — so a context value of
 * `'100.00'` (or `100.0`) matches a rule value of `100`. A **string-typed**
 * value matches EXACTLY — preserving codes like `'00123'` that a blind numeric
 * coercion would collapse to `123`. Authoring intent drives it: categorical
 * dimensions use string values; numeric dimensions author a number.
 */
function scalarEq(c: JsonScalar, value: JsonScalar): boolean {
  return typeof value === 'number' ? Number(c) === value : String(c) === String(value)
}

/** A rule is satisfied iff the context provides its attribute AND the per-operator comparison holds. */
export function ruleSatisfied(rule: EvalRule, ctx: ReadonlyMap<string, JsonScalar>): boolean {
  if (!ctx.has(rule.attribute))
    return false
  const c = ctx.get(rule.attribute)!
  switch (rule.operator) {
    case 'eq':
      return scalarEq(c, rule.value as JsonScalar)
    case 'ne':
      return !scalarEq(c, rule.value as JsonScalar)
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = Number(c)
      const b = Number(rule.value as JsonScalar)
      if (Number.isNaN(a) || Number.isNaN(b))
        return false
      return rule.operator === 'gt' ? a > b : rule.operator === 'gte' ? a >= b : rule.operator === 'lt' ? a < b : a <= b
    }
    case 'in':
      return Array.isArray(rule.value) && rule.value.some(v => scalarEq(c, v))
    default:
      return false
  }
}

/** A price with its rules + per-rule priorities. Quantity is handled separately (a column filter). */
export interface CandidateRule extends EvalRule { readonly priority: number }
export interface Candidate {
  readonly priceId: number
  readonly amount: string
  readonly currencyCode: string
  readonly priceListId: number | null
  readonly priceListType: 'sale' | 'override' | null
  readonly rules: ReadonlyArray<CandidateRule>
}

export interface Evaluated {
  readonly candidate: Candidate
  readonly rulesMatched: number
  readonly sumPriority: number
}

// ─── Row → Candidate gate ───────────────────────────────────────────────────

export interface RawCandidateRule {
  readonly attribute: string
  readonly operator: RuleOperator
  readonly value: JsonScalar | ReadonlyArray<JsonScalar>
  readonly priority: number
}
export interface RawListForGate {
  readonly status: string
  readonly startsAt: Date | null
  readonly endsAt: Date | null
  readonly type: 'sale' | 'override'
  readonly rules: ReadonlyArray<{ readonly attribute: string, readonly operator: RuleOperator, readonly value: JsonScalar | ReadonlyArray<JsonScalar> }>
}
export interface RawPriceForGate {
  readonly priceId: number
  readonly amount: string
  readonly currencyCode: string
  readonly priceListId: number | null
  readonly rules: ReadonlyArray<RawCandidateRule>
}

/** Apply the price-list temporal/status/list-rule gate; build the Candidate, or null if the list gates it out. */
export function rowToCandidate(price: RawPriceForGate, list: RawListForGate | null, at: Date, ctx: ReadonlyMap<string, JsonScalar>): Candidate | null {
  let priceListType: 'sale' | 'override' | null = null
  if (price.priceListId !== null) {
    if (!list || list.status !== 'active')
      return null
    if (list.startsAt !== null && at < list.startsAt)
      return null
    if (list.endsAt !== null && at > list.endsAt)
      return null
    if (!list.rules.every(r => ruleSatisfied(r, ctx)))
      return null
    priceListType = list.type
  }
  return {
    priceId: price.priceId,
    amount: price.amount,
    currencyCode: price.currencyCode,
    priceListId: price.priceListId,
    priceListType,
    rules: price.rules.map(r => ({ attribute: r.attribute, operator: r.operator, value: r.value, priority: r.priority })),
  }
}

/** Returns the evaluated candidate if ALL its rules are satisfied, else null. */
export function evaluatePrice(candidate: Candidate, ctx: ReadonlyMap<string, JsonScalar>): Evaluated | null {
  let sumPriority = 0
  for (const r of candidate.rules) {
    if (!ruleSatisfied(r, ctx))
      return null
    sumPriority += r.priority
  }
  return { candidate, rulesMatched: candidate.rules.length, sumPriority }
}

/** Total order: rulesMatched DESC, sumPriority DESC, amount ASC (BigDecimal), priceId ASC. Returns the better of (a, b). */
function better(a: Evaluated, b: Evaluated): Evaluated {
  if (a.rulesMatched !== b.rulesMatched)
    return a.rulesMatched > b.rulesMatched ? a : b
  if (a.sumPriority !== b.sumPriority)
    return a.sumPriority > b.sumPriority ? a : b
  const av = BigDecimal.fromStringUnsafe(a.candidate.amount)
  const bv = BigDecimal.fromStringUnsafe(b.candidate.amount)
  if (!BigDecimal.equals(av, bv))
    return BigDecimal.isLessThan(av, bv) ? a : b
  return a.candidate.priceId <= b.candidate.priceId ? a : b
}

function bestOf(evals: ReadonlyArray<Evaluated>): Evaluated | null {
  return evals.reduce<Evaluated | null>((acc, e) => (acc === null ? e : better(acc, e)), null)
}

/**
 * Resolve the calculated price for `candidates` (already currency- + temporally
 * filtered by the caller) against `ctx`. Pure: evaluate rules, partition into
 * tier-1 (price-list) / tier-0 (base), tier-override, rank, shape the union.
 */
export function resolveCalculated(
  candidates: ReadonlyArray<Candidate>,
  ctx: ReadonlyMap<string, JsonScalar>,
): CalculatedPrice | null {
  const applicable = candidates.map(c => evaluatePrice(c, ctx)).filter((e): e is Evaluated => e !== null)
  if (applicable.length === 0)
    return null

  const tier1 = applicable.filter(e => e.candidate.priceListId !== null)
  const tier0 = applicable.filter(e => e.candidate.priceListId === null)

  const winner = tier1.length > 0 ? bestOf(tier1)! : bestOf(tier0)!
  const w = winner.candidate

  if (w.priceListId === null)
    return { _tag: 'Base', amount: w.amount, currencyCode: w.currencyCode, priceId: w.priceId }

  if (w.priceListType === 'sale') {
    const base = bestOf(tier0)
    if (base !== null) {
      return { _tag: 'Sale', amount: w.amount, originalAmount: base.candidate.amount, currencyCode: w.currencyCode, priceId: w.priceId, priceListId: w.priceListId }
    }
  }
  return { _tag: 'Override', amount: w.amount, currencyCode: w.currencyCode, priceId: w.priceId, priceListId: w.priceListId }
}
