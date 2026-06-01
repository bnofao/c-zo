import type { StockLocationGraphQLSchemaBuilder } from '@czo/stock-location/graphql'
import { registerStockLocationErrors } from './stock-location/errors'
import { registerStockLocationInputs } from './stock-location/inputs'
import { registerStockLocationMutations } from './stock-location/mutations'
import { registerStockLocationQueries } from './stock-location/queries'
import { registerStockLocationTypes } from './stock-location/types'

// Builder alias re-exported so consumers can reference the phantom-typed
// builder by its scoped name without reaching into `graphql/index.ts`.
export type StockLocationBuilder = StockLocationGraphQLSchemaBuilder

export function registerStockLocationSchema(builder: StockLocationBuilder): void {
  registerStockLocationTypes(builder)
  registerStockLocationErrors(builder)
  registerStockLocationInputs(builder)
  registerStockLocationQueries(builder)
  registerStockLocationMutations(builder)
}
