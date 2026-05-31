/**
 * Application bootstrap — `buildApp` (pure builder) + `runApp` (terminal runner).
 *
 * `buildApp(options)`:
 *  1. Merges every module's DB schema + relations.
 *  2. Pre-populates `SchemaRegistry` and wires `DrizzleDbLayer`.
 *  3. Aggregates GraphQL contributions / authScopes / context builders
 *     into `GraphQLBuilder`.
 *  4. Composes the full app `Layer` and an `Effect.never`-terminated
 *     program that runs startup → builds schema → mounts Yoga + module
 *     routes → starts h3 server → parks until SIGINT.
 *
 * `runApp(built)` hands the program to `NodeRuntime.runMain` for
 * signal handling and exit-code reporting. Never returns.
 *
 * Tests skip `runApp` and consume `built.program` directly via
 * `Effect.runPromiseExit` (typically with a `port: 0` override).
 */
import type { GraphQLContextMap } from '@czo/kit/graphql'
import type { ConfigError } from 'effect/Config'
import type { GraphQLSchema } from 'graphql'
import type { YogaServerInstance } from 'graphql-yoga'
import type { RelationsEntry, SchemaRegistryShape } from '../db'
import type { Module } from './contract'
import process from 'node:process'
import { buildSchemaRegistryLayer, DatabaseConfigFromEnv, DrizzleDbLayer } from '@czo/kit/db'
import { GraphQLBuilder, makeGraphQLBuilder } from '@czo/kit/graphql'
import { findDuplicateRoutes, mountOpenApi } from '@czo/kit/openapi'
import { NodeFileSystem, NodeRuntime } from '@effect/platform-node'
import { ConfigProvider, Effect, Layer } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { createYoga } from 'graphql-yoga'
import { fromNodeHandler, H3, serve } from 'h3'

declare module 'h3' {
  interface H3EventContext {
    /**
     * Runs an Effect against the app-wide context. Available on every
     * h3 event thanks to a kit-registered middleware. Same closure as
     * `ctx.runEffect` on the GraphQL context — pulls services from the
     * `appLayer` (DrizzleDb, module services, …).
     */
    runEffect: <A, E>(effect: Effect.Effect<A, E, any>) => Promise<A>
  }
}

export interface BuildAppOptions {
  readonly modules: ReadonlyArray<Module>
  readonly httpApp?: H3 | (() => H3)
  readonly extend?: (httpApp: H3) => Effect.Effect<void, never, never>
  readonly graphQLApp?: (schema: GraphQLSchema) => YogaServerInstance<Record<string, any>, GraphQLContextMap>
  readonly http?: {
    readonly port?: number
    readonly hostname?: string
  }
  readonly openapi?: {
    readonly title: string
    readonly version: string
    readonly description?: string
    /** Default `/openapi.json`. */
    readonly jsonPath?: string
    /** Default `/reference`. */
    readonly uiPath?: string
    /** Scalar bundle URL; defaults to jsDelivr `@scalar/api-reference`. */
    readonly cdn?: string
    /**
     * Force the docs endpoints on/off. When `undefined`, defaults to
     * `process.env.NODE_ENV !== 'production'` (gated off in prod). REST
     * routes are always registered regardless of this flag.
     */
    readonly enabled?: boolean
  }
}

export interface BuiltApp {
  /**
   * Long-running program: runs startup, builds the GraphQL schema,
   * mounts Yoga + module routes, starts the HTTP server, registers
   * `teardown` as a finalizer, and parks on `Effect.never`. Consume
   * via `runApp` (production) or `Effect.runPromiseExit` (tests).
   *
   * `E = ConfigError` because `DatabaseConfigFromEnv` reads env vars
   * and can fail at layer construction.
   */
  readonly program: Effect.Effect<void, ConfigError, never>
  /** Module list — exposed for logging / tooling. */
  readonly modules: ReadonlyArray<Module>
  /** Sequenced `onStart` effects, in case the caller wants to inspect. */
  readonly startup: Effect.Effect<void>
  /** Sequenced `onStarted` effects (run after every `onStart`). */
  readonly started: Effect.Effect<void>
  /** Sequenced `onStop` effects, in case the caller wants to inspect. */
  readonly teardown: Effect.Effect<void>
}

/**
 * Pure builder — composes layers and the runtime program. **Does not
 * execute anything.** The returned `program` is an `Effect.never`-
 * terminated effect already provided with `appLayer`. Hand it to
 * `runApp(built)` for production, or to `Effect.runPromiseExit` in
 * tests for short-lived assertions.
 */
export function buildApp(options: BuildAppOptions): BuiltApp {
  // 1. Merge DB contributions. Schemas first (flat merge), then invoke
  //    each relations factory with the merged schemas so cross-module
  //    references (`r.one.users()` from a non-auth module) resolve.
  const dbSchemas: SchemaRegistryShape = Object.assign(
    {},
    ...options.modules.map(m => m.db?.schema ?? {}),
  )
  const relations: RelationsEntry = Object.assign(
    {},
    ...options.modules.flatMap(m => m.db?.relations ? [m.db.relations(dbSchemas)] : []),
  )

  // 2. Module layers — fold with `provideMerge` so each module is
  //    provided by all earlier modules: a module listed AFTER its
  //    dependencies (e.g. `stock-location` after `auth`) resolves their
  //    exported services (`OrganizationService`, `AccessService`) at its
  //    own construction. Sibling `Layer.merge` does NOT cross-wire — it
  //    would leave the dependent's requirement unsatisfied at build time.
  //    `provideMerge` keeps every module's outputs visible at the surface.
  //    NB: each `m.layer` is typed `Layer<never, never, never>` via the
  //    contract's cast, but at runtime the services it provides (e.g.
  //    `UserService`) reach for `DrizzleDb`. `DrizzleLayer` is piped in
  //    below so those resolutions succeed.
  const moduleLayersRaw = options.modules.reduce<Layer.Layer<never, never, never>>(
    (acc, m) => Layer.provideMerge(m.layer, acc),
    Layer.empty,
  )

  // 3. GraphQL contributions — flat-map keeps O(n) and skips undefined.
  const graphQLContributions = options.modules.flatMap(m => m.graphql?.contribution ? [m.graphql.contribution] : [])
  const authScopes = options.modules.flatMap(m => m.graphql?.authScope ? [m.graphql.authScope] : [])
  const graphQLContexts = options.modules.flatMap(m => m.graphql?.contexts ? [m.graphql.contexts] : [])

  // 4. Infrastructure layers.
  const SchemaRegistryLayer = buildSchemaRegistryLayer(dbSchemas, relations)
  const DrizzleLayer = DrizzleDbLayer.pipe(
    Layer.provide(SchemaRegistryLayer),
    Layer.provide(DatabaseConfigFromEnv),
  )
  const GraphQLBuilderLayer = makeGraphQLBuilder(
    graphQLContributions,
    graphQLContexts,
    authScopes,
    relations,
  ).pipe(Layer.provide(DrizzleLayer))

  // Wire DrizzleLayer INTO moduleLayers so module-internal services
  // (`UserService`, `OrganizationService`, …) resolve `DrizzleDb` at
  // construction. `provideMerge` keeps `DrizzleDb` in the layer's
  // outputs so the rest of the program (main effect, resolvers) can
  // still pull it.
  const moduleLayers = moduleLayersRaw.pipe(Layer.provideMerge(DrizzleLayer))

  const appLayer = Layer.mergeAll(moduleLayers, GraphQLBuilderLayer)

  // 5. Lifecycle effects. R defaults to `never` on `Module`, so onStart
  //    /onStarted/onStop are already `Effect<void>` — no cast needed.
  //    `onStart` runs first (modules register into shared registries),
  //    then `onStarted` runs once every module's `onStart` has completed
  //    (finalization that must observe all registrations, e.g. freeze).
  const startup = Effect.gen(function* () {
    for (const m of options.modules) {
      if (m.onStart)
        yield* m.onStart
    }
  })

  const started = Effect.gen(function* () {
    for (const m of options.modules) {
      if (m.onStarted)
        yield* m.onStarted
    }
  })

  const teardown = Effect.gen(function* () {
    for (const m of [...options.modules].reverse()) {
      if (m.onStop)
        yield* m.onStop
    }
  })

  const port = options.http?.port ?? 4000
  const hostname = options.http?.hostname ?? '127.0.0.1'

  const main = Effect.gen(function* () {
    // Run startup INSIDE the program so errors propagate and the
    // server cannot listen before modules are ready. `onStart` phase
    // first (registrations), then `onStarted` (finalization, e.g. freeze).
    yield* startup
    yield* started

    // Capture the current Context so the synchronous Yoga `context`
    // callback can re-enter Effect via `Effect.runPromiseWith`.
    const appContext = yield* Effect.context<GraphQLBuilder>()
    const graphQLBuilder = yield* GraphQLBuilder
    const gqlSchema = yield* graphQLBuilder.buildSchema()

    const httpApp = typeof options.httpApp === 'function'
      ? options.httpApp()
      : options.httpApp ?? new H3()

    // Resolvers bridge back into Effect-land through `ctx.runEffect`,
    // which closes over the captured `appContext`. No global runtime
    // singleton, no per-resolver wiring.
    const runEffect = <A, E>(effect: Effect.Effect<A, E, any>): Promise<A> =>
      Effect.runPromiseWith(appContext)(effect)

    // Make `runEffect` available on every h3 event via
    // `event.context.runEffect(myEffect)`. Module routes and host
    // `extend` handlers reach it without importing any kit symbol.
    httpApp.use((event) => {
      event.context.runEffect = runEffect
    })

    const yoga = options.graphQLApp?.(gqlSchema) ?? createYoga<{ pendingCookies?: string[] }, GraphQLContextMap>({
      schema: gqlSchema,
      context: async (initialContext) => {
        // Yoga owns the Node response and never flushes the h3 `event.res`, so
        // cookies cannot be set through the event. Instead, resolvers (and the
        // session-context contributor) push serialized `Set-Cookie` values onto
        // this per-request sink; the `onResponse` plugin below flushes them.
        const pendingCookies = initialContext.pendingCookies ?? []
        const setCookie = (serialized: string): void => {
          pendingCookies.push(serialized)
        }
        // Expose on the systemContext so context contributors can queue cookies
        // while the context is still being built (e.g. session-token rotation).
        Object.assign(initialContext, { setCookie })
        const userCtx = await runEffect(graphQLBuilder.buildContext(initialContext))
        return { ...userCtx, runEffect, setCookie }
      },
      plugins: [
        {
          onResponse({ response, serverContext }) {
            const pending = (serverContext as { pendingCookies?: string[] })?.pendingCookies ?? []
            for (const value of pending)
              response.headers.append('set-cookie', value)
          },
        },
      ],
    })

    httpApp.all(yoga.graphqlEndpoint, fromNodeHandler(yoga))

    // Modules register their own routes / middlewares.
    for (const m of options.modules) {
      if (m.http)
        yield* m.http(httpApp)
    }

    // Aggregate declarative REST routes from every module, warn on
    // duplicate (method, path) pairs, then register them — and, when
    // configured + enabled, mount the OpenAPI document + Scalar UI.
    const apiRoutes = options.modules.flatMap(m => m.routes ? [...m.routes] : [])
    for (const dup of findDuplicateRoutes(apiRoutes))
      yield* Effect.logWarning(`OpenAPI: duplicate route ${dup} — last operation wins in the document`)

    const oa = options.openapi
    const exposeDocs = oa ? (oa.enabled ?? process.env.NODE_ENV !== 'production') : false
    mountOpenApi(
      httpApp,
      apiRoutes,
      oa && exposeDocs
        ? {
            info: { title: oa.title, version: oa.version, description: oa.description },
            jsonPath: oa.jsonPath ?? '/openapi.json',
            uiPath: oa.uiPath ?? '/reference',
            cdn: oa.cdn,
          }
        : undefined,
    )

    // Host-level extension hook.
    if (options.extend)
      yield* options.extend(httpApp)

    yield* Effect.acquireRelease(
      Effect.sync(() => serve(httpApp, { port, hostname })),
      s => Effect.promise(async () => { await s.close() }),
    )

    // Teardown runs before the surrounding Scope tears down infra
    // (still has module-service access).
    yield* Effect.addFinalizer(() => teardown)

    yield* Effect.log(`Server listening on http://${hostname}:${port}`)
    yield* Effect.never
  })

  const program = Effect.scoped(main).pipe(Effect.provide(appLayer))

  return { program, modules: options.modules, startup, started, teardown }
}

const ConfigProviderLayer = ConfigProvider.layerAdd(ConfigProvider.fromDotEnv()).pipe(
  Layer.provide(NodeFileSystem.layer),
)

/**
 * Production entry point — hands the built program to `NodeRuntime.runMain`
 * for SIGINT/SIGTERM handling and exit-code reporting.
 *
 * `runMain` schedules the program on the event loop and **returns
 * synchronously**. The program stays alive via `Effect.never` inside
 * `built.program`; the event loop keeps the process running. Signal
 * handling + exit codes are owned by `runMain`.
 */
export function runApp(built: BuiltApp): void {
  NodeRuntime.runMain(built.program.pipe(Effect.provide(ConfigProviderLayer), Effect.provide(Persistence.layerMemory)))
}
