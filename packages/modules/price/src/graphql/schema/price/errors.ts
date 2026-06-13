import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { registerError } from '@czo/kit/graphql'
import { InvalidPriceRule, PriceListNotFound, PriceNotFound, PriceSetNotFound } from '../../../services/price'

export { InvalidPriceRule, PriceListNotFound, PriceNotFound, PriceSetNotFound }

export function registerPriceErrors(builder: PriceGraphQLSchemaBuilder): void {
  registerError(builder, PriceSetNotFound, { name: 'PriceSetNotFoundError', subGraphs: ['org'] })
  registerError(builder, PriceNotFound, { name: 'PriceNotFoundError', subGraphs: ['org'] })
  registerError(builder, PriceListNotFound, { name: 'PriceListNotFoundError', subGraphs: ['org'] })
  registerError(builder, InvalidPriceRule, {
    name: 'InvalidPriceRuleError',
    subGraphs: ['org'],
    fields: t => ({ attribute: t.exposeString('attribute') }),
  })
}
