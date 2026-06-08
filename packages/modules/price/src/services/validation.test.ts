import { describe, expect, it } from 'vitest'
import { validateRuleInput } from './validation'

describe('validateRuleInput', () => {
  it('numeric op requires a number', () => {
    expect(validateRuleInput({ attribute: 'item_total', operator: 'gte', value: 100 }).ok).toBe(true)
    expect(validateRuleInput({ attribute: 'item_total', operator: 'gte', value: 'x' }).ok).toBe(false)
  })
  it('in requires a non-empty array', () => {
    expect(validateRuleInput({ attribute: 'r', operator: 'in', value: ['a', 'b'] }).ok).toBe(true)
    expect(validateRuleInput({ attribute: 'r', operator: 'in', value: [] }).ok).toBe(false)
    expect(validateRuleInput({ attribute: 'r', operator: 'in', value: 'a' }).ok).toBe(false)
  })
  it('eq/ne accept string or number, not array', () => {
    expect(validateRuleInput({ attribute: 'r', operator: 'eq', value: 'eu' }).ok).toBe(true)
    expect(validateRuleInput({ attribute: 'r', operator: 'eq', value: ['eu'] }).ok).toBe(false)
  })
  it('reserved attribute "quantity" is rejected (column-only)', () => {
    expect(validateRuleInput({ attribute: 'quantity', operator: 'gte', value: 1 }).ok).toBe(false)
  })
})
