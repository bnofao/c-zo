import { makeExecutableSchema } from '@graphql-tools/schema'
import { graphql } from 'graphql'
// packages/kit/src/graphql/relay/directives/connection.test.ts
import { describe, expect, it } from 'vitest'
import { connectionDirective } from './connection'

const typeDefs = [
  connectionDirective.typeDef,
  `type Query {
    items(first: Int, after: String, last: Int, before: String): ItemConnection! @connection(maxPageSize: 5)
  }
  type ItemConnection { edges: [ItemEdge!]!, pageInfo: PageInfo!, totalCount: Int! }
  type ItemEdge { node: Item!, cursor: String! }
  type Item { id: ID!, name: String! }
  type PageInfo { hasNextPage: Boolean!, hasPreviousPage: Boolean!, startCursor: String, endCursor: String }`,
]

describe('@connection directive', () => {
  it('should transform PaginateResult into a Connection', async () => {
    const nodes = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: { Query: { items: () => ({ nodes, totalCount: 2 }) } },
    })
    schema = connectionDirective.transformer(schema)

    const result = await graphql({ schema, source: '{ items(first: 2) { edges { node { id name } cursor } pageInfo { hasNextPage } totalCount } }' })

    expect(result.errors).toBeUndefined()
    expect((result.data as any).items.edges).toHaveLength(2)
    expect((result.data as any).items.totalCount).toBe(2)
    expect((result.data as any).items.pageInfo.hasNextPage).toBe(false)
  })

  it('should reject first > maxPageSize', async () => {
    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: { Query: { items: () => ({ nodes: [], totalCount: 0 }) } },
    })
    schema = connectionDirective.transformer(schema)

    const result = await graphql({ schema, source: '{ items(first: 10) { edges { node { id } } } }' })

    expect(result.errors).toBeDefined()
    expect(result.errors![0]!.message).toContain('5')
  })

  it('should reject first + last together', async () => {
    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: { Query: { items: () => ({ nodes: [], totalCount: 0 }) } },
    })
    schema = connectionDirective.transformer(schema)

    const result = await graphql({ schema, source: '{ items(first: 2, last: 2) { edges { node { id } } } }' })

    expect(result.errors).toBeDefined()
  })
})
