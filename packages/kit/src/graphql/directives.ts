import type { GraphQLSchema } from 'graphql'
import { connectionDirective } from './relay/directives/connection'
import { drizzleDirective } from './relay/directives/drizzle'
import { globalIdDirective } from './relay/directives/global-id'
import { relayMutationDirective } from './relay/directives/relay-mutation'

export interface DirectiveDefinition {
  name: string
  typeDef: string
  transformer: (schema: GraphQLSchema) => GraphQLSchema
}

const directives: DirectiveDefinition[] = [
  connectionDirective,
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
