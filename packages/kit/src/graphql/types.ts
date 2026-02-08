import type { DocumentNode } from 'graphql'

const typeDefs: Array<DocumentNode | string> = [
  `
    type Query {
      _empty: String
    }
    type Mutation {
      _empty: String
    }
  `,
]

export function registerTypeDefs(typeDef: DocumentNode) {
  typeDefs.push(typeDef)
}

export function registeredTypeDefs() {
  return typeDefs
}
