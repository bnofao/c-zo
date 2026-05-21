import { Cause, Effect, Exit } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeSchemaRegistryLive,
  SchemaRegistry,
  SchemaRegistryAlreadyFrozen,
  SchemaRegistryFrozen,
} from './schema-registry'

describe('schema-registry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should return empty object when no schemas registered', async () => {
    const { registeredSchemas } = await import('./schema-registry')

    expect(registeredSchemas()).toEqual({})
  })

  it('should return a single registered schema', async () => {
    const { registerSchema, registeredSchemas } = await import('./schema-registry')
    const schema = { users: 'usersTable', posts: 'postsTable' }

    registerSchema(schema)

    expect(registeredSchemas()).toEqual({ users: 'usersTable', posts: 'postsTable' })
  })

  it('should merge multiple schemas into a flat object', async () => {
    const { registerSchema, registeredSchemas } = await import('./schema-registry')

    registerSchema({ users: 'usersTable' })
    registerSchema({ products: 'productsTable', categories: 'categoriesTable' })

    expect(registeredSchemas()).toEqual({
      users: 'usersTable',
      products: 'productsTable',
      categories: 'categoriesTable',
    })
  })

  it('should let last registration win on key conflict', async () => {
    const { registerSchema, registeredSchemas } = await import('./schema-registry')

    registerSchema({ users: 'v1' })
    registerSchema({ users: 'v2' })

    expect(registeredSchemas()).toEqual({ users: 'v2' })
  })

  // ─── Relations registry ─────────────────────────────────────────────

  it('should return empty object when no relations registered', async () => {
    const { registeredRelations } = await import('./schema-registry')

    expect(registeredRelations()).toEqual({})
  })

  it('should invoke factory with merged schemas', async () => {
    const { registerSchema, registerRelations, registeredRelations } = await import('./schema-registry')
    const factory = vi.fn().mockReturnValue({ apps: { installedByUser: 'rel1' } })

    registerSchema({ apps: 'appsTable', users: 'usersTable' })
    registerRelations(factory)

    const result = registeredRelations()

    expect(factory).toHaveBeenCalledWith({ apps: 'appsTable', users: 'usersTable' })
    expect(result).toEqual({ apps: { installedByUser: 'rel1' } })
  })

  it('should support factory that ignores schema (self-contained module)', async () => {
    const { registerRelations, registeredRelations } = await import('./schema-registry')

    registerRelations(() => ({ apps: { installedByUser: 'rel1' } }))

    expect(registeredRelations()).toEqual({ apps: { installedByUser: 'rel1' } })
  })

  it('should merge results from multiple relation factories', async () => {
    const { registerSchema, registerRelations, registeredRelations } = await import('./schema-registry')

    registerSchema({ products: 'productsTable', attributes: 'attributesTable' })
    registerRelations(() => ({ apps: { installedByUser: 'rel1' } }))
    registerRelations(schema => ({
      products: { attributes: `rel-to-${(schema as Record<string, unknown>).attributes}` },
    }))

    expect(registeredRelations()).toEqual({
      apps: { installedByUser: 'rel1' },
      products: { attributes: 'rel-to-attributesTable' },
    })
  })

  it('should let last factory win on key conflict', async () => {
    const { registerRelations, registeredRelations } = await import('./schema-registry')

    registerRelations(() => ({ apps: 'v1' }))
    registerRelations(() => ({ apps: 'v2' }))

    expect(registeredRelations()).toEqual({ apps: 'v2' })
  })

  // ─── SchemaRegistry Service (Effect) ────────────────────────────────

  describe('schemaRegistry service', () => {
    const provide = <A, E>(eff: Effect.Effect<A, E, SchemaRegistry>) =>
      Effect.provide(eff, makeSchemaRegistryLive())

    it('starts empty', async () => {
      const program = Effect.gen(function* () {
        const registry = yield* SchemaRegistry
        return {
          schemas: yield* registry.schemas,
          relations: yield* registry.relations,
        }
      })
      const result = await Effect.runPromise(provide(program))
      expect(result.schemas).toEqual({})
      expect(result.relations).toEqual({})
    })

    it('merges registered schemas', async () => {
      const program = Effect.gen(function* () {
        const registry = yield* SchemaRegistry
        yield* registry.registerSchema({ users: 'usersTable' })
        yield* registry.registerSchema({ posts: 'postsTable' })
        return yield* registry.schemas
      })
      const result = await Effect.runPromise(provide(program))
      expect(result).toEqual({ users: 'usersTable', posts: 'postsTable' })
    })

    it('invokes relation factories with merged schemas', async () => {
      const program = Effect.gen(function* () {
        const registry = yield* SchemaRegistry
        yield* registry.registerSchema({ users: 'usersTable' })
        yield* registry.registerRelations(s => ({ rel: `rel-to-${(s as Record<string, unknown>).users}` } as any))
        return yield* registry.relations
      })
      const result = await Effect.runPromise(provide(program))
      expect(result).toEqual({ rel: 'rel-to-usersTable' })
    })

    it('uses initial pre-population', async () => {
      const program = Effect.gen(function* () {
        const registry = yield* SchemaRegistry
        return yield* registry.schemas
      })
      const layer = makeSchemaRegistryLive({ schemas: [{ a: 1 }, { b: 2 }] })
      const result = await Effect.runPromise(Effect.provide(program, layer))
      expect(result).toEqual({ a: 1, b: 2 })
    })

    it('fails registerSchema after freeze with SchemaRegistryFrozen', async () => {
      const program = Effect.gen(function* () {
        const registry = yield* SchemaRegistry
        yield* registry.freeze
        yield* registry.registerSchema({ x: 1 })
      })
      const exit = await Effect.runPromiseExit(provide(program))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const found = Cause.findErrorOption(exit.cause)
        const err = found._tag === 'Some' ? found.value : null
        expect(err).toBeInstanceOf(SchemaRegistryFrozen)
        expect(err.attempted).toBe('schema')
      }
    })

    it('fails registerRelations after freeze with SchemaRegistryFrozen', async () => {
      const program = Effect.gen(function* () {
        const registry = yield* SchemaRegistry
        yield* registry.freeze
        yield* registry.registerRelations(() => ({} as any))
      })
      const exit = await Effect.runPromiseExit(provide(program))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const found = Cause.findErrorOption(exit.cause)
        const err = found._tag === 'Some' ? found.value : null
        expect(err).toBeInstanceOf(SchemaRegistryFrozen)
        expect(err.attempted).toBe('relations')
      }
    })

    it('fails second freeze with SchemaRegistryAlreadyFrozen', async () => {
      const program = Effect.gen(function* () {
        const registry = yield* SchemaRegistry
        yield* registry.freeze
        yield* registry.freeze
      })
      const exit = await Effect.runPromiseExit(provide(program))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const found = Cause.findErrorOption(exit.cause)
        const err = found._tag === 'Some' ? found.value : null
        expect(err).toBeInstanceOf(SchemaRegistryAlreadyFrozen)
      }
    })
  })
})
