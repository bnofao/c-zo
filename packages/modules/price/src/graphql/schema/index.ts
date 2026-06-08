import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { registerPriceErrors } from './price/errors'
import { registerPriceInputs } from './price/inputs'
import { registerPriceMutations } from './price/mutations'
import { registerPriceQueries } from './price/queries'
import { registerPriceTypes } from './price/types'

// Builder alias re-exported so consumers can reference the phantom-typed
// builder by its scoped name without reaching into `graphql/index.ts`.
export type PriceBuilder = PriceGraphQLSchemaBuilder

export function registerPriceSchema(builder: PriceBuilder): void {
  registerPriceTypes(builder)
  registerPriceErrors(builder)
  registerPriceInputs(builder)
  registerPriceQueries(builder)
  registerPriceMutations(builder)
}
