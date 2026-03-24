import type { DocumentNode } from 'graphql'

const typeDefs: Array<DocumentNode | string> = [
  `
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

    input StringFilterInput {
      eq: String
      ne: String
      contains: String
      startsWith: String
      endsWith: String
      in: [String!]
    }

    input BooleanFilterInput {
      eq: Boolean
    }

    input DateTimeFilterInput {
      eq: DateTime
      ne: DateTime
      gt: DateTime
      gte: DateTime
      lt: DateTime
      lte: DateTime
    }

    input GlobalIDFilterInput {
      eq: ID
      in: [ID!]
    }

    enum OrderDirection {
      ASC
      DESC
    }

    type Query {
      _empty: String
      node(id: ID!): Node
    }

    type Mutation {
      _empty: String
    }

    type Subscription {
      _empty: String
    }
  `,
]

export function registerTypeDefs(typeDef: DocumentNode | string) {
  typeDefs.push(typeDef)
}

export function registeredTypeDefs() {
  return typeDefs
}
