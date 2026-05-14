import type { SchemaBuilder } from '@czo/kit/graphql'
import { registerStockLocationInputs } from './stock-location/inputs'
import { registerStockLocationMutations } from './stock-location/mutations'
import { registerStockLocationQueries } from './stock-location/queries'
import { registerStockLocationTypes } from './stock-location/types'

// Type alias for the builder scoped to this module.
// Uses SchemaBuilder from kit (the Pothos phantom-typed alias).
export type StockLocationBuilder = SchemaBuilder

export function registerStockLocationSchema(builder: StockLocationBuilder): void {
  registerStockLocationTypes(builder)
  registerStockLocationInputs(builder)
  registerStockLocationQueries(builder)
  registerStockLocationMutations(builder)
}
