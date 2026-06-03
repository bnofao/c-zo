import type { AttributeGraphQLSchemaBuilder } from '@czo/attribute/graphql'
import { registerAttributeEnums } from './enums'
import { registerAttributeErrors } from './errors'
import { registerAttributeInputs } from './inputs'
import { registerAttributeMutations } from './mutations/attribute'
import { registerChoiceValueMutations } from './mutations/choice-value'
import { registerTypedValueMutations } from './mutations/typed-value'
import { registerAttributeQueries } from './queries'
import { registerAttributeScalars } from './scalars'
import { registerAttributeTypes } from './types'

// Builder alias re-exported so consumers can reference the phantom-typed builder
// by its scoped name without reaching into `graphql/index.ts`.
export type AttributeBuilder = AttributeGraphQLSchemaBuilder

/**
 * Aggregate the attribute module's GraphQL contributions onto the shared
 * builder. Wires scalars → enums → errors → types → inputs → queries →
 * mutations (fields must register after their type/input/enum definitions).
 */
export function registerAttributeSchema(builder: AttributeBuilder): void {
  registerAttributeScalars(builder)
  registerAttributeEnums(builder)
  registerAttributeErrors(builder)
  registerAttributeTypes(builder)
  registerAttributeInputs(builder)
  registerAttributeQueries(builder)
  registerAttributeMutations(builder)
  registerChoiceValueMutations(builder)
  registerTypedValueMutations(builder)
}
