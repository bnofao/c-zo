import type { InventoryGraphQLSchemaBuilder } from '@czo/inventory/graphql'
import { registerInventoryErrors } from './inventory/errors'
import { registerInventoryInputs } from './inventory/inputs'
import { registerInventoryMutations } from './inventory/mutations'
import { registerInventoryQueries } from './inventory/queries'
import { registerInventoryTypes } from './inventory/types'

// Builder alias re-exported so consumers can reference the phantom-typed
// builder by its scoped name without reaching into `graphql/index.ts`.
export type InventoryBuilder = InventoryGraphQLSchemaBuilder

export function registerInventorySchema(builder: InventoryBuilder): void {
  registerInventoryTypes(builder)
  registerInventoryErrors(builder)
  registerInventoryInputs(builder)
  registerInventoryQueries(builder)
  registerInventoryMutations(builder)
}
