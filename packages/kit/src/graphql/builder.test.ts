import { drizzle } from 'drizzle-orm/node-postgres'
import { beforeEach, describe, expect, it } from 'vitest'
import { _resetBuilderState, buildSchema, initBuilder, registerSchema } from './builder'

const db = drizzle.mock()
const relations = {} as any

beforeEach(() => _resetBuilderState())

describe('initBuilder', () => {
  it('returns a Pothos SchemaBuilder', () => {
    const builder = initBuilder({ db, relations })
    expect(builder).toBeDefined()
    expect(typeof (builder as any).objectRef).toBe('function')
  })

  it('registers DateTime and JSONObject scalars', () => {
    const builder = initBuilder({ db, relations })
    const schema = buildSchema(builder)
    expect(schema.getType('DateTime')).toBeDefined()
    expect(schema.getType('JSONObject')).toBeDefined()
  })

  it('registers Error interface and 5 error types', () => {
    const builder = initBuilder({ db, relations })
    const schema = buildSchema(builder)
    expect(schema.getType('Error')).toBeDefined()
    expect(schema.getType('ValidationError')).toBeDefined()
    expect(schema.getType('NotFoundError')).toBeDefined()
    expect(schema.getType('ConflictError')).toBeDefined()
    expect(schema.getType('ForbiddenError')).toBeDefined()
    expect(schema.getType('UnauthenticatedError')).toBeDefined()
    expect(schema.getType('FieldError')).toBeDefined()
  })
})

describe('registerSchema + buildSchema', () => {
  it('applies all registered contributions in order', () => {
    const order: string[] = []
    registerSchema((b) => {
      order.push('a')
      b.objectRef<{ id: string }>('Foo').implement({
        fields: t => ({ id: t.string({ resolve: () => 'x' }) }),
      })
    })
    registerSchema((_b) => {
      order.push('b')
    })

    const builder = initBuilder({ db, relations })
    const schema = buildSchema(builder)

    expect(order).toEqual(['a', 'b'])
    expect(schema.getType('Foo')).toBeDefined()
  })

  it('throws on double-build', () => {
    const builder = initBuilder({ db, relations })
    buildSchema(builder)
    expect(() => buildSchema(builder)).toThrow('Schema already built')
  })
})
