import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { registerProductErrors } from './product/errors'
import { registerProductInputs } from './product/inputs'
import { registerProductMutations } from './product/mutations'
import { registerProductQueries } from './product/queries'
import { registerProductTypes } from './product/types'

// Builder alias re-exported so consumers can reference the phantom-typed
// builder by its scoped name without reaching into `graphql/index.ts`.
export type ProductBuilder = ProductGraphQLSchemaBuilder

export function registerProductSchema(builder: ProductBuilder): void {
  registerProductErrors(builder)
  registerProductTypes(builder)
  registerProductInputs(builder)
  registerProductQueries(builder)
  registerProductMutations(builder)
}
