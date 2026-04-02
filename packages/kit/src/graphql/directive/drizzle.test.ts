import { makeExecutableSchema } from '@graphql-tools/schema'
import { isInputObjectType } from 'graphql'
import { describe, expect, it } from 'vitest'
import { applyDrizzleDirectives, drizzleDirective } from './drizzle'

const typeDefs = [
  drizzleDirective.typeDef,
  `type Query { _empty: String }
  input AppWhereInput {
    status: StringFilterInput @drizzle
    organizationId: GlobalIDFilterInput @drizzle(column: "orgId")
  }
  input StringFilterInput { eq: String, ne: String, in: [String!] }
  input GlobalIDFilterInput { eq: ID, in: [ID!] }`,
]

function getInputType(schema: ReturnType<typeof makeExecutableSchema>, name: string) {
  const type = schema.getType(name)
  if (!type || !isInputObjectType(type))
    throw new Error(`${name} not found`)
  return type
}

describe('applyDrizzleDirectives', () => {
  const schema = makeExecutableSchema({ typeDefs })
  const inputType = getInputType(schema, 'AppWhereInput')

  it('should decode GlobalIDFilterInput.eq to local ID and remap key', () => {
    const globalId = btoa('Organization:org-123')
    const result = applyDrizzleDirectives(
      { organizationId: { eq: globalId } },
      inputType,
    )

    expect(result!.orgId).toEqual({ eq: 'org-123' })
    expect(result!.organizationId).toBeUndefined()
  })

  it('should decode GlobalIDFilterInput.in array', () => {
    const gid1 = btoa('Organization:org-1')
    const gid2 = btoa('Organization:org-2')
    const result = applyDrizzleDirectives(
      { organizationId: { in: [gid1, gid2] } },
      inputType,
    )

    expect(result!.orgId).toEqual({ in: ['org-1', 'org-2'] })
  })

  it('should pass StringFilterInput values through as-is', () => {
    const result = applyDrizzleDirectives(
      { status: { eq: 'active' } },
      inputType,
    )

    expect(result!.status).toEqual({ eq: 'active' })
  })

  it('should return undefined for empty input', () => {
    expect(applyDrizzleDirectives(undefined, inputType)).toBeUndefined()
    expect(applyDrizzleDirectives({}, inputType)).toBeUndefined()
  })

  it('should pass through fields without @drizzle annotation', () => {
    const plainSchema = makeExecutableSchema({
      typeDefs: [
        drizzleDirective.typeDef,
        `type Query { _empty: String }
         input ItemWhereInput { name: StringFilterInput }
         input StringFilterInput { eq: String }`,
      ],
    })
    const plainType = getInputType(plainSchema, 'ItemWhereInput')

    const result = applyDrizzleDirectives({ name: { eq: 'test' } }, plainType)
    expect(result).toEqual({ name: { eq: 'test' } })
  })
})
