import type { GraphQLSchema } from 'graphql'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The directives module pre-registers 3 Relay directives (connection, globalId, relayMutation)
// at module-load time. All tests account for this base state.
const RELAY_DIRECTIVE_COUNT = 4

describe('graphql/directives', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should start with Relay directives pre-registered', async () => {
    const { registeredDirectives } = await import('./directives')
    expect(registeredDirectives()).toHaveLength(RELAY_DIRECTIVE_COUNT)
  })

  it('should accumulate directives via registerDirective()', async () => {
    const { registerDirective, registeredDirectives } = await import('./directives')

    registerDirective({
      name: 'auth',
      typeDef: 'directive @auth on FIELD_DEFINITION',
      transformer: (s: GraphQLSchema) => s,
    })

    expect(registeredDirectives()).toHaveLength(RELAY_DIRECTIVE_COUNT + 1)
    expect(registeredDirectives()[RELAY_DIRECTIVE_COUNT]!.name).toBe('auth')
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

    expect(registeredDirectives()).toHaveLength(RELAY_DIRECTIVE_COUNT + 2)
  })

  it('should return SDL strings via registeredDirectiveTypeDefs()', async () => {
    const { registerDirective, registeredDirectiveTypeDefs } = await import('./directives')

    registerDirective({
      name: 'auth',
      typeDef: 'directive @auth on FIELD_DEFINITION',
      transformer: (s: GraphQLSchema) => s,
    })

    const defs = registeredDirectiveTypeDefs()
    // Relay directive typeDefs + the newly registered auth directive
    expect(defs).toHaveLength(RELAY_DIRECTIVE_COUNT + 1)
    expect(defs).toContain('directive @auth on FIELD_DEFINITION')
  })

  it('should chain all transformers via applyDirectives()', async () => {
    const { registerDirective, applyDirectives } = await import('./directives')

    const calls: string[] = []

    registerDirective({
      name: 'first',
      typeDef: 'directive @first on FIELD_DEFINITION',
      transformer: (s: GraphQLSchema) => {
        calls.push('first')
        return s
      },
    })
    registerDirective({
      name: 'second',
      typeDef: 'directive @second on FIELD_DEFINITION',
      transformer: (s: GraphQLSchema) => {
        calls.push('second')
        return s
      },
    })

    // Use a real schema since Relay directives call mapSchema() which requires one
    const { makeExecutableSchema } = await import('@graphql-tools/schema')
    const schema = makeExecutableSchema({
      typeDefs: 'type Query { _empty: String }',
    })
    applyDirectives(schema)

    // Relay directives run first (connection, globalId, relayMutation), then first, then second
    expect(calls).toEqual(['first', 'second'])
  })
})
