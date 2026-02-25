import type { DocumentNode } from 'graphql'
import { scalarTypeDefs } from './scalars'

const typeDefs: Array<DocumentNode | string> = [
  `
    type Query {
      _empty: String
    }
    type Mutation {
      _empty: String
    }
    type Subscription {
      _empty: String
    }
  `,
  ...scalarTypeDefs,
]

export function registerTypeDefs(typeDef: DocumentNode | string) {
  typeDefs.push(typeDef)
}

export function registeredTypeDefs() {
  return typeDefs
}
