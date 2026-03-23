import { describe, expect, it } from 'vitest'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { graphql } from 'graphql'
import { globalIdDirective } from './global-id'

function buildSchema() {
  let schema = makeExecutableSchema({
    typeDefs: [
      globalIdDirective.typeDef,
      `type Query { app: App }
       type App { id: ID! @globalId(type: "App"), name: String! }`,
    ],
    resolvers: {
      Query: { app: () => ({ id: 'local-123', name: 'TestApp' }) },
    },
  })
  schema = globalIdDirective.transformer(schema)
  return schema
}

describe('@globalId directive', () => {
  it('should encode the id field as a global ID', async () => {
    const schema = buildSchema()
    const result = await graphql({ schema, source: '{ app { id name } }' })

    expect(result.errors).toBeUndefined()
    const id = result.data!.app.id as string
    expect(atob(id)).toBe('App:local-123')
  })

  it('should not affect non-id fields', async () => {
    const schema = buildSchema()
    const result = await graphql({ schema, source: '{ app { name } }' })

    expect(result.data!.app.name).toBe('TestApp')
  })
})
