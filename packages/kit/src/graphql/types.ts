import type { DocumentNode } from 'graphql'

const typeDefs: Array<DocumentNode> = []

export function registerTypeDefs (typeDef: DocumentNode) {
  typeDefs.push(typeDef)
}

export function registeredTypeDefs () {
  return typeDefs
}