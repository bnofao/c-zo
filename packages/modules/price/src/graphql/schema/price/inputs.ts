import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { z } from 'zod'

export function registerPriceInputs(builder: PriceGraphQLSchemaBuilder): void {
  // Operator enum (shared by rule + list-rule inputs).
  const RuleOperatorRef = builder.enumType('PriceRuleOperator', {
    subGraphs: ['org'],
    description: 'Comparison operator a price rule applies between its attribute and the buying-context value (equal, not-equal, greater/less-than(-or-equal), membership).',
    values: {
      EQ: { value: 'eq' },
      NE: { value: 'ne' },
      GT: { value: 'gt' },
      GTE: { value: 'gte' },
      LT: { value: 'lt' },
      LTE: { value: 'lte' },
      IN: { value: 'in' },
    } as const,
  })

  // Rule input: { attribute, operator, value } — value is JSON (scalar | array).
  builder.inputType('PriceRuleInput', {
    subGraphs: ['org'],
    description: 'A condition that gates when a price or price list applies: it compares the buying context\'s `attribute` against `value` using `operator`. All of a price\'s rules must match.',
    fields: t => ({
      attribute: t.string({ required: true, validate: z.string().min(1).max(128), description: 'Name of the buying-context attribute to test (e.g. `region`, `customerGroup`).' }),
      operator: t.field({ type: RuleOperatorRef, required: true, description: 'How to compare the attribute against the value.' }),
      value: t.field({ type: 'JSON', required: true, description: 'The value to compare against — a JSON scalar, or an array for the IN operator.' }),
    }),
  })

  // Buying-context attribute: { attribute, value } — no operator (operators live on rules).
  builder.inputType('PriceContextRuleInput', {
    description: 'One attribute of the buying context supplied to price resolution (e.g. region or customer group). Rules on candidate prices are evaluated against these.',
    subGraphs: ['public', 'org'],
    fields: t => ({
      attribute: t.string({ required: true, description: 'Name of the context attribute.' }),
      value: t.field({ type: 'JSON', required: true, description: 'The context attribute\'s value (a JSON scalar).' }),
    }),
  })
}
