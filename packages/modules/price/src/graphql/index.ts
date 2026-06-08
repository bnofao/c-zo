import type { SchemaBuilder } from '@czo/kit/graphql'
import type { Relations } from '@czo/price/relations'
import type { CalculatedPrice, Price, PriceList, PriceSet, RuleOperator } from '../services/price'
// Pull in auth's module augmentation so cross-module ctx slices (`ctx.auth`)
// and object refs (`'Organization'`) resolve against the shared interfaces.
import '@czo/auth/graphql'

export { priceNodeGuards } from './node-guards'
export { type PriceBuilder, registerPriceSchema } from './schema'

export type PriceGraphQLSchemaBuilder = SchemaBuilder<Relations>

declare module '@czo/kit/graphql' {
  interface BuilderSchemaInputs {
    // Rule + context inputs carry a `value` typed by the generic `JSON` scalar,
    // whose `$inferInput` is `unknown` — the declared shape MUST use `unknown`
    // (a concrete type conflicts with the scalar's inferred input).
    PriceRuleInput: { attribute: string, operator: RuleOperator, value: unknown }
    PriceContextRuleInput: { attribute: string, value: unknown }
  }

  interface BuilderSchemaObjects {
    PriceSet: PriceSet
    Price: Price
    PriceList: PriceList
    PriceRule: { id: number, attribute: string, operator: string, value: unknown, priority: number }
    PriceListRule: { id: number, attribute: string, operator: string, value: unknown }
    BasePrice: Extract<CalculatedPrice, { _tag: 'Base' }>
    OverridePrice: Extract<CalculatedPrice, { _tag: 'Override' }>
    SalePrice: Extract<CalculatedPrice, { _tag: 'Sale' }>
    CalculatedPrice: CalculatedPrice
    PriceResolution: { priceSetId: number, price: CalculatedPrice | null }
  }

  interface SchemaBuilderRefs {}
}
