import { makeExecutableSchema } from '@graphql-tools/schema'
import { graphql } from 'graphql'
import { describe, expect, it } from 'vitest'
import { relayMutationDirective } from './relay-mutation'

const typeDefs = [
  relayMutationDirective.typeDef,
  `type Query { _empty: String }
   type Mutation {
     createItem(name: String!): CreateItemPayload! @relayMutation(payloadField: "item")
   }
   type CreateItemPayload { item: Item, userErrors: [UserError!]! }
   type Item { id: ID!, name: String! }
   type UserError { field: [String!], message: String!, code: String! }`,
]

describe('@relayMutation directive', () => {
  it('should wrap successful result in payload with empty userErrors', async () => {
    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: { _empty: () => null },
        Mutation: { createItem: (_p: unknown, args: { name: string }) => ({ id: '1', name: args.name }) },
      },
    })
    schema = relayMutationDirective.transformer(schema)

    const result = await graphql({ schema, source: 'mutation { createItem(name: "Test") { item { id name } userErrors { message code } } }' })

    expect(result.errors).toBeUndefined()
    expect((result.data as any).createItem.item).toEqual({ id: '1', name: 'Test' })
    expect((result.data as any).createItem.userErrors).toEqual([])
  })

  it('should convert thrown errors to userErrors', async () => {
    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: { _empty: () => null },
        Mutation: { createItem: () => { throw new Error('Item not found') } },
      },
    })
    schema = relayMutationDirective.transformer(schema)

    const result = await graphql({ schema, source: 'mutation { createItem(name: "Test") { item { id } userErrors { message code } } }' })

    expect(result.errors).toBeUndefined()
    expect((result.data as any).createItem.item).toBeNull()
    expect((result.data as any).createItem.userErrors).toHaveLength(1)
    expect((result.data as any).createItem.userErrors[0].code).toBe('NOT_FOUND')
  })
})
