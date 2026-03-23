import { registerResolvers } from '../resolvers'
import { registerTypeDefs } from '../types'
import { resolveNode } from './node-registry'

registerTypeDefs(`
  interface Node {
    id: ID!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type UserError {
    field: [String!]
    message: String!
    code: String!
  }

  extend type Query {
    node(id: ID!): Node
  }
`)

registerResolvers({
  Query: {
    node: (_parent: unknown, args: { id: string }, ctx: unknown) => {
      return resolveNode(args.id, ctx as any)
    },
  },
} as any)
