import type { GraphQLSchema } from 'graphql'
import type { DirectiveDefinition } from '../../directives'

// @drizzle is a pure annotation directive on INPUT_FIELD_DEFINITION.
// It does not transform the schema at runtime — the @connection directive
// reads these annotations to auto-transform `where` args before calling the resolver.
// - On StringFilterInput fields: no-op (already RQBv2-compatible)
// - On GlobalIDFilterInput fields: decodes global IDs to local IDs
// - column arg: remaps the field key in the where object (e.g., organizationId → organization_id)
export const drizzleDirective: DirectiveDefinition = {
  name: 'drizzle',
  typeDef: 'directive @drizzle(column: String) on INPUT_FIELD_DEFINITION',
  transformer: (schema: GraphQLSchema) => schema, // no-op — annotation only
}
