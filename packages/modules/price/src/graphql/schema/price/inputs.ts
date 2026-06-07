import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { z } from 'zod'

export function registerPriceInputs(builder: PriceGraphQLSchemaBuilder): void {
  // Operator enum (shared by rule + list-rule inputs).
  const RuleOperatorRef = builder.enumType('PriceRuleOperator', {
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
    fields: t => ({
      attribute: t.string({ required: true, validate: z.string().min(1).max(128) }),
      operator: t.field({ type: RuleOperatorRef, required: true }),
      value: t.field({ type: 'JSON', required: true }),
    }),
  })

  // Buying-context attribute: { attribute, value } — no operator (operators live on rules).
  builder.inputType('PriceContextRuleInput', {
    fields: t => ({
      attribute: t.string({ required: true }),
      value: t.field({ type: 'JSON', required: true }),
    }),
  })
}
