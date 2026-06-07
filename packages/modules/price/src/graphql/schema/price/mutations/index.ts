import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { registerPriceMutationsInner } from './price'
import { registerPriceListMutations } from './priceList'
import { registerPriceSetMutations } from './priceSet'

export function registerPriceMutations(builder: PriceGraphQLSchemaBuilder): void {
  registerPriceSetMutations(builder)
  registerPriceMutationsInner(builder)
  registerPriceListMutations(builder)
}
