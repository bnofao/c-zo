import type { GraphQLSchema } from 'graphql'
import { drizzleDirective } from './drizzle'
import { globalIdDirective } from './relay/global-id'
import { relayMutationDirective } from './relay/relay-mutation'

export { applyDrizzleDirectives } from './drizzle'

export interface DirectiveDefinition {
  name: string
  typeDef: string
  transformer: (schema: GraphQLSchema) => GraphQLSchema
}

const directives: DirectiveDefinition[] = [
  drizzleDirective,
  globalIdDirective,
  relayMutationDirective,
]

export function registerDirective(def: DirectiveDefinition) {
  directives.push(def)
}

export function registeredDirectives(): ReadonlyArray<DirectiveDefinition> {
  return directives
}

export function registeredDirectiveTypeDefs(): string[] {
  return directives.map(d => d.typeDef)
}

export function applyDirectives(schema: GraphQLSchema): GraphQLSchema {
  return directives.reduce<GraphQLSchema>((s, d) => d.transformer(s), schema)
}
