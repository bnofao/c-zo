import type { GraphQLSchema } from 'graphql'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('graphql/directives', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should start with an empty registry', async () => {
    const { registeredDirectives } = await import('./directives')
    expect(registeredDirectives()).toEqual([])
  })

  it('should accumulate directives via registerDirective()', async () => {
    const { registerDirective, registeredDirectives } = await import('./directives')

    registerDirective({
      name: 'auth',
      typeDef: 'directive @auth on FIELD_DEFINITION',
      transformer: (s: GraphQLSchema) => s,
    })

    expect(registeredDirectives()).toHaveLength(1)
    expect(registeredDirectives()[0]!.name).toBe('auth')
  })

  it('should accumulate multiple registrations', async () => {
    const { registerDirective, registeredDirectives } = await import('./directives')

    registerDirective({
      name: 'auth',
      typeDef: 'directive @auth on FIELD_DEFINITION',
      transformer: (s: GraphQLSchema) => s,
    })
    registerDirective({
      name: 'admin',
      typeDef: 'directive @admin on FIELD_DEFINITION',
      transformer: (s: GraphQLSchema) => s,
    })

    expect(registeredDirectives()).toHaveLength(2)
  })

  it('should return SDL strings via registeredDirectiveTypeDefs()', async () => {
    const { registerDirective, registeredDirectiveTypeDefs } = await import('./directives')

    registerDirective({
      name: 'auth',
      typeDef: 'directive @auth on FIELD_DEFINITION',
      transformer: (s: GraphQLSchema) => s,
    })
    registerDirective({
      name: 'admin',
      typeDef: 'directive @admin on FIELD_DEFINITION',
      transformer: (s: GraphQLSchema) => s,
    })

    const defs = registeredDirectiveTypeDefs()
    expect(defs).toEqual([
      'directive @auth on FIELD_DEFINITION',
      'directive @admin on FIELD_DEFINITION',
    ])
  })

  it('should chain all transformers via applyDirectives()', async () => {
    const { registerDirective, applyDirectives } = await import('./directives')

    const calls: string[] = []
    const fakeSchema = {} as GraphQLSchema

    registerDirective({
      name: 'first',
      typeDef: 'directive @first on FIELD_DEFINITION',
      transformer: (s: GraphQLSchema) => {
        calls.push('first')
        return { ...s, first: true } as unknown as GraphQLSchema
      },
    })
    registerDirective({
      name: 'second',
      typeDef: 'directive @second on FIELD_DEFINITION',
      transformer: (s: GraphQLSchema) => {
        calls.push('second')
        return { ...s, second: true } as unknown as GraphQLSchema
      },
    })

    const result = applyDirectives(fakeSchema)

    expect(calls).toEqual(['first', 'second'])
    expect(result).toEqual(expect.objectContaining({ first: true, second: true }))
  })

  it('should return the schema unchanged when no directives registered', async () => {
    const { applyDirectives } = await import('./directives')

    const fakeSchema = { original: true } as unknown as GraphQLSchema
    const result = applyDirectives(fakeSchema)

    expect(result).toBe(fakeSchema)
  })
})
