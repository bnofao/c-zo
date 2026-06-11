import type { GraphQLSchema } from 'graphql'
import { it as itEffect } from '@effect/vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer } from 'effect'
import { assertValidSchema } from 'graphql'
import { describe, expect } from 'vitest'
import { DrizzleDb } from '../db'
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
  subGraph?: 'public' | 'account' | 'org' | 'admin',
): Promise<GraphQLSchema> {
  const layer = Layer.merge(
    // 6th arg = the runtime sub-graph-names list (root + PageInfo tagging). Tests
    // build several sub-graphs, so pass all four; production passes the served set.
    // Kit's `SubGraphName` is only `'public'` until auth augments `BuilderSubGraphs`
    // (later task), so the extra names are cast through at these call sites.
    makeGraphQLBuilder(contributions, [], [], {} as never, {}, ['public', 'account', 'org', 'admin'] as never),
    DrizzleDbLayer,
  )
  return Effect.runPromise(
    Effect.gen(function* () {
      const builder = yield* GraphQLBuilder
      return yield* builder.buildSchema(subGraph as never)
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

describe('makeGraphQLBuilder — sub-graphs (opt-in / default-none)', () => {
  // A contribution adding one public-tagged query field and one untagged field.
  const fields = [
    (b: any) => {
      b.queryField('publicPing', (t: any) =>
        t.string({ subGraphs: ['public'], resolve: () => 'pong' }))
      b.queryField('secretPing', (t: any) =>
        t.string({ resolve: () => 'shh' }))
    },
  ]

  itEffect('full schema (no subGraph) contains BOTH tagged and untagged fields', async () => {
    const schema = await buildSchema(fields)
    const q = schema.getQueryType()!.getFields()
    expect(q.publicPing).toBeDefined()
    expect(q.secretPing).toBeDefined()
  })

  itEffect('public sub-graph contains the tagged field and OMITS the untagged field', async () => {
    const schema = await buildSchema(fields, 'public')
    const qt = schema.getQueryType()
    expect(qt).toBeDefined()
    const q = qt!.getFields()
    expect(q.publicPing).toBeDefined()
    expect(q.secretPing).toBeUndefined()
  })

  itEffect('account sub-graph (nothing tagged into it) has a Query type but none of the fields', async () => {
    const schema = await buildSchema(fields, 'account')
    const qt = schema.getQueryType()
    expect(qt).toBeDefined()
    const q = qt!.getFields()
    expect(q.publicPing).toBeUndefined()
    expect(q.secretPing).toBeUndefined()
  })

  itEffect('public sub-graph builds a field whose ARGUMENT is a custom scalar (DateTime)', async () => {
    const withScalarArg = [
      (b: any) => {
        b.queryField('publicAt', (t: any) =>
          t.string({
            subGraphs: ['public'],
            args: { at: t.arg({ type: 'DateTime' }) },
            resolve: () => 'ok',
          }))
      },
    ]
    const schema = await buildSchema(withScalarArg, 'public')
    expect(schema.getQueryType()!.getFields().publicAt).toBeDefined()
    expect(schema.getType('DateTime')).toBeDefined()
  })

  itEffect('public sub-graph with no tagged mutation drops the (empty) Mutation root so the schema validates', async () => {
    const schema = await buildSchema(fields, 'public')
    // The sub-graph plugin keeps Mutation in every sub-graph but filters its
    // fields; an empty Mutation object would fail GraphQL validation. It must be
    // dropped, while Query (with the tagged field) survives.
    expect(schema.getMutationType()).toBeUndefined()
    expect(() => assertValidSchema(schema)).not.toThrow()
    expect(schema.getQueryType()!.getFields().publicPing).toBeDefined()
  })
})

describe('makeGraphQLBuilder — relay connection inside a sub-graph', () => {
  const withConnection = [
    (b: any) => {
      const Thing = b.objectRef('Thing')
      Thing.implement({
        subGraphs: ['public'],
        fields: (t: any) => ({
          id: t.exposeID('id'),
          name: t.exposeString('name'),
        }),
      })
      b.queryField('things', (t: any) =>
        t.connection(
          {
            type: Thing,
            subGraphs: ['public'],
            authScopes: { public: true }, // a scope-auth gate co-located with the sub-graph tag
            resolve: () => ({
              edges: [],
              pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
            }),
          },
          { subGraphs: ['public'] }, // connection-type options
          { subGraphs: ['public'] }, // edge-type options
        ))
    },
  ]

  itEffect('public sub-graph includes the connection field + Connection/Edge/PageInfo types', async () => {
    const schema = await buildSchema(withConnection, 'public')
    const q = schema.getQueryType()!.getFields()
    expect(q.things).toBeDefined()
    expect(schema.getType('QueryThingsConnection')).toBeDefined()
    expect(schema.getType('QueryThingsConnectionEdge')).toBeDefined()
    expect(schema.getType('PageInfo')).toBeDefined()
    expect(schema.getType('Thing')).toBeDefined()
  })

  itEffect('a sub-graph with nothing tagged omits the connection AND its generated types', async () => {
    const schema = await buildSchema(withConnection, 'admin')
    expect(schema.getQueryType()!.getFields().things).toBeUndefined()
    expect(schema.getType('QueryThingsConnection')).toBeUndefined()
    expect(schema.getType('Thing')).toBeUndefined()
  })
})
