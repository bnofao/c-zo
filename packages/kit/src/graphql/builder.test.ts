import type { GraphQLSchema } from 'graphql'
import { it as itEffect } from '@effect/vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Data, Effect, Layer } from 'effect'
import { assertValidSchema } from 'graphql'
import { describe, expect } from 'vitest'
import { DrizzleDb } from '../db'
import { GraphQLBuilder, makeGraphQLBuilder, parseTraceparent, tracingSpanOptions } from './builder'
import { ValidationError } from './errors'
import { registerError } from './errors/builders'

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

describe('makeGraphQLBuilder — relay mutation inside a sub-graph', () => {
  class ThingFailed extends Data.TaggedError('ThingFailed')<{ message: string }> {
    readonly code = 'THING_FAILED'
  }

  const withMutation = [
    (b: any) => {
      registerError(b, ThingFailed, { name: 'ThingFailed', subGraphs: ['public'] })
      // A served sub-graph always carries at least one query field (its Query root
      // is never empty, unlike Mutation which `dropEmptyRootTypes` removes). Tag one
      // into `public` so this isolated mutation-only fixture still validates.
      b.queryField('thingPing', (t: any) =>
        t.string({ subGraphs: ['public'], resolve: () => 'pong' }))
      b.relayMutationField(
        'doThing',
        { subGraphs: ['public'], inputFields: (t: any) => ({ name: t.string({ required: true }) }) },
        {
          subGraphs: ['public'],
          errors: {
            types: [ValidationError, ThingFailed],
            union: { subGraphs: ['public'] },
            result: { subGraphs: ['public'] },
          },
          resolve: () => ({ ok: true }),
        },
        { subGraphs: ['public'], outputFields: (t: any) => ({ ok: t.boolean({ resolve: (p: any) => p.ok }) }) },
      )
    },
  ]

  itEffect('public sub-graph contains the mutation + its Input/Payload/Result/Success + shared error, and validates', async () => {
    const schema = await buildSchema(withMutation, 'public')
    expect(() => assertValidSchema(schema)).not.toThrow()
    expect(schema.getMutationType()!.getFields().doThing).toBeDefined()
    expect(schema.getType('DoThingInput')).toBeDefined()
    expect(schema.getType('DoThingPayload')).toBeDefined()
    expect(schema.getType('DoThingResult')).toBeDefined()
    expect(schema.getType('DoThingSuccess')).toBeDefined()
    expect(schema.getType('ValidationError')).toBeDefined()
    expect(schema.getType('ThingFailed')).toBeDefined()
  })

  itEffect('admin sub-graph (mutation not tagged into it) omits the mutation and its generated types', async () => {
    const schema = await buildSchema(withMutation, 'admin')
    expect(schema.getMutationType()?.getFields().doThing).toBeUndefined()
    expect(schema.getType('DoThingPayload')).toBeUndefined()
  })

  itEffect('node(id:) query + Node interface are present in a served sub-graph', async () => {
    // The relay `node`/`nodes` query + `Node` interface are created lazily by the
    // plugin on the first `nodeInterfaceRef()` call — i.e. when a relay node is
    // registered. Register one (tagged into `public`) so the shared relay infra
    // materializes; the `nodeTypeOptions`/`nodeQueryOptions` `subGraphs` tags then
    // keep `Node` + `node` in the served sub-graph.
    const withNode = [
      (b: any) => {
        const Thing = b.objectRef('NodeThing')
        b.node(
          Thing,
          {
            subGraphs: ['public'],
            id: { resolve: (x: any) => x.id },
            loadOne: (id: string) => ({ id }),
          },
          (t: any) => ({ name: t.string({ resolve: () => 'n' }) }),
        )
        b.queryField('nodePing', (t: any) =>
          t.string({ subGraphs: ['public'], resolve: () => 'pong' }))
      },
    ]
    const schema = await buildSchema(withNode, 'public')
    expect(() => assertValidSchema(schema)).not.toThrow()
    expect(schema.getType('Node')).toBeDefined()
    expect(schema.getQueryType()!.getFields().node).toBeDefined()
  })
})

describe('tracingSpanOptions — per-field span attributes', () => {
  itEffect('maps the { attributes } option to span options', () => {
    expect(tracingSpanOptions({ attributes: { name: 'x', n: 1, b: true } }))
      .toEqual({ attributes: { name: 'x', n: 1, b: true } })
  })

  itEffect('yields undefined for boolean / absent / no-attributes options', () => {
    expect(tracingSpanOptions(true)).toBeUndefined()
    expect(tracingSpanOptions(false)).toBeUndefined()
    expect(tracingSpanOptions(undefined)).toBeUndefined()
    expect(tracingSpanOptions({})).toBeUndefined()
  })

  // End-to-end through Effect: the mapped attributes land on the actual span the
  // tracing `wrap` creates (and thus on what the Otlp tracer exports). Mirrors
  // the wrap's `Effect.withSpan(name, tracingSpanOptions(options))`.
  itEffect('attaches the attributes onto the Effect span', async () => {
    const value = await Effect.runPromise(
      Effect.withSpan('graphql.Query.hello', tracingSpanOptions({ attributes: { name: 'Ada' } }))(
        Effect.map(Effect.currentSpan, span => span.attributes.get('name')),
      ),
    )
    expect(value).toBe('Ada')
  })
})

describe('parseTraceparent — W3C → external span', () => {
  const TRACE = '0af7651916cd43dd8448eb211c80319c'
  const SPAN = 'b7ad6b7169203331'

  itEffect('parses a sampled traceparent into an external span', () => {
    const ext = parseTraceparent(`00-${TRACE}-${SPAN}-01`)
    expect(ext?._tag).toBe('ExternalSpan')
    expect(ext?.traceId).toBe(TRACE)
    expect(ext?.spanId).toBe(SPAN)
    expect(ext?.sampled).toBe(true)
  })

  itEffect('reads the sampled flag low bit (00 = not sampled)', () => {
    expect(parseTraceparent(`00-${TRACE}-${SPAN}-00`)?.sampled).toBe(false)
  })

  itEffect('returns undefined for absent / malformed / all-zero ids', () => {
    expect(parseTraceparent(undefined)).toBeUndefined()
    expect(parseTraceparent(null)).toBeUndefined()
    expect(parseTraceparent('')).toBeUndefined()
    expect(parseTraceparent('garbage')).toBeUndefined()
    expect(parseTraceparent(`00-${TRACE}-${SPAN}`)).toBeUndefined() // 3 parts
    expect(parseTraceparent(`01-${TRACE}-${SPAN}-01`)).toBeUndefined() // bad version
    expect(parseTraceparent(`00-XYZ-${SPAN}-01`)).toBeUndefined() // non-hex trace
    expect(parseTraceparent(`00-${'0'.repeat(32)}-${SPAN}-01`)).toBeUndefined() // zero trace
    expect(parseTraceparent(`00-${TRACE}-${'0'.repeat(16)}-01`)).toBeUndefined() // zero span
  })
})

describe('tracing wrap — distributed parent', () => {
  const TRACE = '0af7651916cd43dd8448eb211c80319c'
  const SPAN = 'b7ad6b7169203331'

  // A child span created with an external parent inherits the parent's traceId —
  // this is what links life's GraphQL span into the caller's (tour's) trace.
  itEffect('a span created with the external parent inherits its traceId', async () => {
    const parent = parseTraceparent(`00-${TRACE}-${SPAN}-01`)!
    const traceId = await Effect.runPromise(
      Effect.withSpan('graphql.Query.users', { parent })(
        Effect.map(Effect.currentSpan, span => span.traceId),
      ),
    )
    expect(traceId).toBe(TRACE)
  })

  // Span context is fiber-local: a resolver body's `ctx.runEffect` spawns a NEW
  // root fiber, so service spans (e.g. `sql.execute`) would start fresh traces.
  // Mirrors the wrap's fix: capture the resolver span, re-parent the inner run
  // with `Effect.withParentSpan(span)` — the inner span must land in the SAME
  // trace, as a child of the resolver span.
  itEffect('re-parents spans across the runEffect fiber boundary', async () => {
    const parent = parseTraceparent(`00-${TRACE}-${SPAN}-01`)!
    const inner = await Effect.runPromise(
      Effect.withSpan('graphql.Query.userCounts', { parent })(
        Effect.gen(function* () {
          const span = yield* Effect.orDie(Effect.currentSpan)
          // Simulate the resolver body: a separate root fiber (runEffect).
          const runEffect = <A, E>(effect: Effect.Effect<A, E>) =>
            Effect.runPromise(Effect.withParentSpan(span)(effect) as Effect.Effect<A>)
          const observed = yield* Effect.promise(() => runEffect(
            Effect.withSpan('sql.execute')(
              Effect.map(Effect.currentSpan, s => ({
                traceId: s.traceId,
                parentSpanId: s.parent._tag === 'Some' ? s.parent.value.spanId : undefined,
              })),
            ),
          ))
          return { resolverSpanId: span.spanId, observed }
        }),
      ),
    )
    expect(inner.observed.traceId).toBe(TRACE)
    expect(inner.observed.parentSpanId).toBe(inner.resolverSpanId)
  })
})
