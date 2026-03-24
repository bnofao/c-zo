import { makeExecutableSchema } from '@graphql-tools/schema'
import { graphql } from 'graphql'
import { describe, expect, it } from 'vitest'
import { drizzleDirective } from './drizzle'

const typeDefs = [
  drizzleDirective.typeDef,
  `type Query {
    apps(where: AppWhereInput): [App!]!
  }
  input AppWhereInput {
    status: StringFilterInput @drizzle
    organizationId: GlobalIDFilterInput @drizzle(column: "orgId")
  }
  input StringFilterInput { eq: String, ne: String, in: [String!] }
  input GlobalIDFilterInput { eq: ID, in: [ID!] }
  type App { id: ID!, status: String! }`,
]

describe('@drizzle directive', () => {
  it('should decode GlobalIDFilterInput values to local IDs', async () => {
    let receivedWhere: any

    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: {
          apps: (_p: unknown, args: any) => {
            receivedWhere = args.where
            return []
          },
        },
      },
    })
    schema = drizzleDirective.transformer(schema)

    const globalId = btoa('Organization:org-123')
    await graphql({
      schema,
      source: `{ apps(where: { organizationId: { eq: "${globalId}" } }) { id } }`,
    })

    // Should have decoded the global ID and renamed the key
    expect(receivedWhere.orgId).toBeDefined()
    expect(receivedWhere.orgId.eq).toBe('org-123')
    expect(receivedWhere.organizationId).toBeUndefined()
  })

  it('should pass StringFilterInput values through as-is', async () => {
    let receivedWhere: any

    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: {
          apps: (_p: unknown, args: any) => {
            receivedWhere = args.where
            return []
          },
        },
      },
    })
    schema = drizzleDirective.transformer(schema)

    await graphql({
      schema,
      source: '{ apps(where: { status: { eq: "active" } }) { id } }',
    })

    expect(receivedWhere.status).toEqual({ eq: 'active' })
  })

  it('should not transform args on fields without @drizzle annotations', async () => {
    let receivedWhere: any

    const plainTypeDefs = [
      drizzleDirective.typeDef,
      `type Query { items(where: ItemWhereInput): [Item!]! }
       input ItemWhereInput { name: StringFilterInput }
       input StringFilterInput { eq: String }
       type Item { id: ID! }`,
    ]

    let schema = makeExecutableSchema({
      typeDefs: plainTypeDefs,
      resolvers: {
        Query: {
          items: (_p: unknown, args: any) => {
            receivedWhere = args.where
            return []
          },
        },
      },
    })
    schema = drizzleDirective.transformer(schema)

    await graphql({
      schema,
      source: '{ items(where: { name: { eq: "test" } }) { id } }',
    })

    // No @drizzle annotation → where should be untouched
    expect(receivedWhere).toEqual({ name: { eq: 'test' } })
  })

  it('should decode GlobalIDFilterInput.in array', async () => {
    let receivedWhere: any

    let schema = makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: {
          apps: (_p: unknown, args: any) => {
            receivedWhere = args.where
            return []
          },
        },
      },
    })
    schema = drizzleDirective.transformer(schema)

    const gid1 = btoa('Organization:org-1')
    const gid2 = btoa('Organization:org-2')
    await graphql({
      schema,
      source: `{ apps(where: { organizationId: { in: ["${gid1}", "${gid2}"] } }) { id } }`,
    })

    expect(receivedWhere.orgId.in).toEqual(['org-1', 'org-2'])
  })
})
