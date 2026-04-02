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
      like: String
      ilike: String
      notLike: String
      in: [String!]
      notIn: [String!]
      notIlike: String
      OR: [StringFilterInput!]
      AND: [StringFilterInput!]
      NOT: StringFilterInput
    }

    input BooleanFilterInput {
      eq: Boolean
      OR: [BooleanFilterInput!]
      AND: [BooleanFilterInput!]
      NOT: BooleanFilterInput
    }

    input DateTimeFilterInput {
      eq: DateTime
      ne: DateTime
      gt: DateTime
      gte: DateTime
      lt: DateTime
      lte: DateTime
      in: [DateTime!]
      notIn: [DateTime!]
      OR: [DateTimeFilterInput!]
      AND: [DateTimeFilterInput!]
      NOT: DateTimeFilterInput
    }

    input TimeFilterInput {
      eq: Time
      ne: Time
      gt: Time
      gte: Time
      lt: Time
      lte: Time
      in: [Time!]
      notIn: [Time!]
      OR: [TimeFilterInput!]
      AND: [TimeFilterInput!]
      NOT: TimeFilterInput
    }

    input DateFilterInput {
      eq: Date
      ne: Date
      gt: Date
      gte: Date
      lt: Date
      lte: Date
      in: [Date!]
      notIn: [Date!]
      OR: [DateFilterInput!]
      AND: [DateFilterInput!]
      NOT: DateFilterInput
    }

    input IntFilterInput {
      eq: Int
      ne: Int
      gt: Int
      gte: Int
      lt: Int
      lte: Int
      in: [Int!]
      notIn: [Int!]
      OR: [IntFilterInput!]
      AND: [IntFilterInput!]
      NOT: IntFilterInput
    }

    input FloatFilterInput {
      eq: Float
      ne: Float
      gt: Float
      gte: Float
      lt: Float
      lte: Float
      in: [Float!]
      notIn: [Float!]
      OR: [FloatFilterInput!]
      AND: [FloatFilterInput!]
      NOT: FloatFilterInput
    }

    input IDFilterInput {
      eq: ID
      in: [ID!]
      notIn: [ID!]
      OR: [IDFilterInput!]
      AND: [IDFilterInput!]
      NOT: IDFilterInput
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
