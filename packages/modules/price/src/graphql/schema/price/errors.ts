import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { registerError } from '@czo/kit/graphql'
import { InvalidPriceRule, PriceListNotFound, PriceNotFound, PriceSetNotFound } from '../../../services/price'

export { InvalidPriceRule, PriceListNotFound, PriceNotFound, PriceSetNotFound }

export function registerPriceErrors(builder: PriceGraphQLSchemaBuilder): void {
  registerError(builder, PriceSetNotFound, { name: 'PriceSetNotFoundError' })
  registerError(builder, PriceNotFound, { name: 'PriceNotFoundError' })
  registerError(builder, PriceListNotFound, { name: 'PriceListNotFoundError' })
  registerError(builder, InvalidPriceRule, {
    name: 'InvalidPriceRuleError',
    fields: t => ({ attribute: t.exposeString('attribute') }),
  })
}
