import type { RuleInput } from './price'

export type ValidationResult = { ok: true } | { ok: false, reason: string }

const NUMERIC: ReadonlyArray<string> = ['gt', 'gte', 'lt', 'lte']

/** Enforce operator↔value coherence + the reserved `quantity` attribute (spec). */
export function validateRuleInput(rule: RuleInput): ValidationResult {
  if (rule.attribute === 'quantity')
    return { ok: false, reason: '`quantity` is reserved to min/max columns, not a rule' }
  if (rule.attribute.trim() === '')
    return { ok: false, reason: 'attribute must be non-empty' }

  if (rule.operator === 'in') {
    if (!Array.isArray(rule.value) || rule.value.length === 0)
      return { ok: false, reason: '`in` requires a non-empty array' }
    return { ok: true }
  }
  if (Array.isArray(rule.value))
    return { ok: false, reason: `operator '${rule.operator}' does not accept an array` }
  if (NUMERIC.includes(rule.operator) && typeof rule.value !== 'number')
    return { ok: false, reason: `operator '${rule.operator}' requires a number` }
  return { ok: true }
}
