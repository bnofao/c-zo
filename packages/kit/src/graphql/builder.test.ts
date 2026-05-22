import type { GraphQLSchema } from 'graphql'
import { it as itEffect } from '@effect/vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer } from 'effect'
import { describe, expect } from 'vitest'
import { DrizzleDb } from '../db/effect'
import { GraphQLBuilder, makeGraphQLBuilder } from './builder'

/**
 * The Pothos drizzle plugin only needs `db` as a client reference while
 * assembling the schema — `toSchema()` never executes a query — so a mocked
 * drizzle instance is sufficient for these unit tests.
 */
const db = drizzle.mock()

/** Provide the mocked drizzle instance under the `DrizzleDb` Tag. */
const DrizzleDbLayer = Layer.succeed(DrizzleDb, db as never)

/**
 * Build a `GraphQLSchema` through the CURRENT builder API: compose a
 * `GraphQLBuilder` Layer via `makeGraphQLBuilder`, then run its
 * `buildSchema()` effect against the mocked `DrizzleDb`.
 *
 * `buildSchema()` keeps `DrizzleDb` in its requirements (it is resolved at
 * invocation time, not when the `GraphQLBuilder` Layer is constructed), so
 * `DrizzleDb` is merged alongside `GraphQLBuilder` into the provided Layer.
 */
function buildSchema(
  contributions: ReadonlyArray<Parameters<typeof makeGraphQLBuilder>[0][number]> = [],
): Promise<GraphQLSchema> {
  const layer = Layer.merge(
    makeGraphQLBuilder(contributions, [], [], {} as never),
    DrizzleDbLayer,
  )
  return Effect.runPromise(
    Effect.gen(function* () {
      const builder = yield* GraphQLBuilder
      return yield* builder.buildSchema()
    }).pipe(Effect.provide(layer)),
  )
}

describe('makeGraphQLBuilder — buildSchema', () => {
  itEffect('registers DateTime and JSONObject scalars', async () => {
    const schema = await buildSchema()
    expect(schema.getType('DateTime')).toBeDefined()
    expect(schema.getType('JSONObject')).toBeDefined()
  })

  itEffect('registers Date and Time scalars', async () => {
    const schema = await buildSchema()
    expect(schema.getType('Date')).toBeDefined()
    expect(schema.getType('Time')).toBeDefined()
  })

  itEffect('registers Error interface and the shared error types', async () => {
    const schema = await buildSchema()
    expect(schema.getType('Error')).toBeDefined()
    expect(schema.getType('ValidationError')).toBeDefined()
    expect(schema.getType('NotFoundError')).toBeDefined()
    expect(schema.getType('ConflictError')).toBeDefined()
    expect(schema.getType('ForbiddenError')).toBeDefined()
    expect(schema.getType('UnauthenticatedError')).toBeDefined()
    expect(schema.getType('FieldError')).toBeDefined()
  })

  itEffect('produces a schema with Query and Mutation root types', async () => {
    const schema = await buildSchema()
    expect(schema.getQueryType()).toBeDefined()
    expect(schema.getMutationType()).toBeDefined()
  })
})

describe('makeGraphQLBuilder — schema contributions', () => {
  itEffect('applies all registered contributions in order', async () => {
    const order: string[] = []
    const schema = await buildSchema([
      (b) => {
        order.push('a')
        b.objectRef<{ id: string }>('Foo').implement({
          fields: t => ({ id: t.string({ resolve: () => 'x' }) }),
        })
      },
      (_b) => {
        order.push('b')
      },
    ])

    expect(order).toEqual(['a', 'b'])
    expect(schema.getType('Foo')).toBeDefined()
  })

  itEffect('buildSchema can be invoked repeatedly, each call yielding a fresh schema', async () => {
    const layer = Layer.merge(
      makeGraphQLBuilder([], [], [], {} as never),
      DrizzleDbLayer,
    )
    const [first, second] = await Effect.runPromise(
      Effect.gen(function* () {
        const builder = yield* GraphQLBuilder
        return [yield* builder.buildSchema(), yield* builder.buildSchema()] as const
      }).pipe(Effect.provide(layer)),
    )
    expect(first.getType('DateTime')).toBeDefined()
    expect(second.getType('DateTime')).toBeDefined()
    // Each invocation builds an independent schema instance.
    expect(first).not.toBe(second)
  })
})

describe('makeGraphQLBuilder — Effect context contributors', () => {
  itEffect.effect('buildContext composes async (Effect) contributors', () =>
    Effect.gen(function* () {
      const builder = yield* GraphQLBuilder
      const ctx = yield* builder.buildContext({ request: new Request('http://x') })
      expect((ctx as any).auth).toEqual({ session: null })
    }).pipe(Effect.provide(makeGraphQLBuilder(
      [],
      [() => Effect.succeed({ auth: { session: null } } as never)],
      [],
      {} as never,
    ))))

  itEffect.effect('buildContext merges multiple context contributors', () =>
    Effect.gen(function* () {
      const builder = yield* GraphQLBuilder
      const ctx = yield* builder.buildContext({ request: new Request('http://x') })
      expect((ctx as any).auth).toEqual({ session: null })
      expect((ctx as any).locale).toBe('en')
    }).pipe(Effect.provide(makeGraphQLBuilder(
      [],
      [
        () => Effect.succeed({ auth: { session: null } } as never),
        () => Effect.succeed({ locale: 'en' } as never),
      ],
      [],
      {} as never,
    ))))
})
