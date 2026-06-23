import type { DrizzleDb } from '@czo/kit/db'
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
import type { GraphQLContextMap, SubGraphName } from '@czo/kit/graphql'
import type { GraphQLSchema } from 'graphql'
import type { YogaServerInstance } from 'graphql-yoga'
import type { RelationsEntry, SchemaRegistryShape } from '../db'
import type { Module } from './contract'
import process from 'node:process'
import { buildSchemaRegistryLayer, DatabaseConfigFromEnv, DrizzleDbLayer } from '@czo/kit/db'
import { GraphQLBuilder, makeGraphQLBuilder } from '@czo/kit/graphql'
import { findDuplicateRoutes, mountOpenApi } from '@czo/kit/openapi'
import { RateLimiterLive } from '@czo/kit/ratelimit'
import { Effect, Layer } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { defaultKeyGenerator, rateLimitDirective } from 'graphql-rate-limit-directive'
import { createYoga } from 'graphql-yoga'
import { fromNodeHandler, getRequestIP, H3, serve } from 'h3'
import { resolveClientIp } from './client-ip'

declare module 'h3' {
  interface H3EventContext {
    /**
     * Runs an Effect against the app-wide context. Available on every
     * h3 event thanks to a kit-registered middleware. Same closure as
     * `ctx.runEffect` on the GraphQL context — pulls services from the
     * `appLayer` (DrizzleDb, module services, …).
     */
    runEffect: <A, E>(effect: Effect.Effect<A, E, any>) => Promise<A>
    /**
     * The resolved client IP for this request under the trusted-proxy model
     * (`TRUSTED_PROXY_HOPS`). Set by the same kit middleware as `runEffect`;
     * REST handlers (e.g. credential rate-limiting) read it instead of trusting
     * `X-Forwarded-For` directly. See `resolveClientIp`.
     */
    clientIp: string
  }
}

// Enforces the `@rateLimit` directive (declared on fields via
// @pothos/plugin-directives) at the HTTP/schema-assembly seam — NOT inside the
// pure `buildSchema`, so the kit builder unit tests stay in a single graphql
// realm (this CJS transformer would otherwise duplicate `graphql`). Keyed by the
// trusted-proxy-resolved client IP (`ctx.clientIp`, see `resolveClientIp`); the
// per-account layer for those mutations is the existing 60s DB cooldown.
// In-memory store now; swap to a Redis-backed limiter when the deployment goes
// multi-instance. Module scope = one store across requests.
const { rateLimitDirectiveTransformer } = rateLimitDirective({
  keyGenerator: (dargs, src, args, ctx, info) =>
    `${defaultKeyGenerator(dargs, src, args, ctx, info)}:${(ctx as { clientIp?: string }).clientIp ?? 'anon'}`,
})

export interface BuildAppOptions {
  readonly modules: ReadonlyArray<Module>
  /**
   * Audience sub-graphs to serve as dedicated endpoints at `/graphql/<name>`,
   * in addition to the full `/graphql`. Default `['public']`. Each is a
   * filtered view of the same builder (opt-in tagging; see the sub-graph spec).
   * This same list is threaded into the builder so the Query/Mutation roots +
   * PageInfo are tagged into exactly these names.
   */
  readonly subGraphs?: ReadonlyArray<SubGraphName>
  /**
   * Override the database layer. Production omits this (DB comes from env via
   * `DrizzleDbLayer ⊕ DatabaseConfigFromEnv`). Tests inject a Testcontainers
   * `DrizzleDb` so the booted app talks to an ephemeral container.
   */
  readonly db?: Layer.Layer<DrizzleDb, unknown, never>
  /**
   * Host-provided cross-cutting services (canonically a real `EmailService`
   * transport — `@czo/kit/email/smtp` `fromEnv`). Wired into TWO contexts, both
   * load-bearing:
   *  - `provideMerge`'d UNDER the module layers (alongside `DrizzleLayer`) — so
   *    subscriber fibers forked with `Effect.forkScoped` *during* module-layer
   *    construction carry the service in their build context;
   *  - merged into `appLayer` — so the service is also in the runtime OUTPUT
   *    context that `runEffect` / `ctx.runEffect` resolve against at request
   *    time. Without this, `Effect.serviceOption(EmailService)` at send time
   *    returns `None` (the module-layer fold is cast to `Layer<never,never,never>`,
   *    so the service never reaches the surface from `provideMerge` alone).
   * It's the SAME layer reference in both spots, so Effect's by-reference layer
   * memoization builds it once (a stateful transport pool is acquired once).
   * Omitted in dev/test → optional services stay absent and subscribers skip
   * (e.g. emails log-and-skip).
   */
  readonly services?: Layer.Layer<any, unknown, never>
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
   * `E = unknown` because the DB layer is injectable (`options.db`): the
   * production path fails with `ConfigError` (env-var reads in
   * `DatabaseConfigFromEnv`), but an injected layer may surface any error,
   * so the merged `appLayer` error channel widens to `unknown`.
   */
  readonly program: Effect.Effect<void, unknown, never>
  /** Module list — exposed for logging / tooling. */
  readonly modules: ReadonlyArray<Module>
  /** Sequenced `onStart` effects, in case the caller wants to inspect. */
  readonly startup: Effect.Effect<void>
  /** Sequenced `onStarted` effects (run after every `onStart`). */
  readonly started: Effect.Effect<void>
  /** Sequenced `onStop` effects, in case the caller wants to inspect. */
  readonly teardown: Effect.Effect<void>
  /**
   * Assembles the h3 fetch app (schema → Yoga → module routes → OpenAPI →
   * extend) WITHOUT serving. `@czo/kit/testing` provides this with `appLayer`
   * to drive requests against a Testcontainers DB: module routes via
   * `httpApp.fetch(request)`, and GraphQL via `yoga.fetch(request)` directly
   * (the production `fromNodeHandler` mount can't run on the web-fetch path).
   */
  readonly assembleApp: Effect.Effect<{ httpApp: H3, runEffect: <A, E>(e: Effect.Effect<A, E, any>) => Promise<A>, yoga: YogaServerInstance<{ pendingCookies?: string[], pendingHeaders?: Array<[string, string]> }, GraphQLContextMap>, subYogas: ReadonlyArray<YogaServerInstance<{ pendingCookies?: string[], pendingHeaders?: Array<[string, string]> }, GraphQLContextMap>> }, never, GraphQLBuilder | DrizzleDb>
  /**
   * The composed app `Layer` (module services + `DrizzleDb` + `GraphQLBuilder`).
   * `@czo/kit/testing` can `Layer.buildWithScope(appLayer, scope)` then
   * provide `assembleApp` with the resulting context.
   */
  readonly appLayer: Layer.Layer<GraphQLBuilder | DrizzleDb, unknown, never>
}

/**
 * Pure builder — composes layers and the runtime program. **Does not
 * execute anything.** The returned `program` is an `Effect.never`-
 * terminated effect already provided with `appLayer`. Hand it to
 * `runApp(built)` for production, or to `Effect.runPromiseExit` in
 * tests for short-lived assertions.
 */
/**
 * Merge every module's `db.schema` (flat), then build relations from the MERGED
 * schema so cross-module relation references (e.g. `r.one.users()` from a
 * non-auth module) resolve. Shared by `buildApp` (production DB layer) and
 * `@czo/kit/testing`'s `bootTestApp` so the two never derive it differently.
 */
export function mergeModuleDb(modules: ReadonlyArray<Module>): {
  dbSchemas: SchemaRegistryShape
  relations: RelationsEntry
} {
  const dbSchemas: SchemaRegistryShape = Object.assign({}, ...modules.map(m => m.db?.schema ?? {}))
  const relations: RelationsEntry = Object.assign(
    {},
    ...modules.flatMap(m => m.db?.relations ? [m.db.relations(dbSchemas)] : []),
  )
  return { dbSchemas, relations }
}

/**
 * Compose module layers (deps-first `provideMerge` fold) and wire `DrizzleDb`
 * (+ optional host `services`) so module-internal services resolve it, while
 * keeping `DrizzleDb` in the surface outputs. Shared by `buildApp` (HTTP) and
 * `buildRuntime` (worker) so the two never derive the runtime differently.
 */
export function foldModuleLayers(
  modules: ReadonlyArray<Module>,
  drizzleLayer: Layer.Layer<DrizzleDb, unknown, never>,
  services?: Layer.Layer<any, unknown, never>,
): Layer.Layer<DrizzleDb, unknown, never> {
  const raw = modules.reduce<Layer.Layer<never, never, never>>(
    (acc, m) => Layer.provideMerge(m.layer, acc),
    Layer.empty,
  )
  return raw.pipe(
    Layer.provideMerge(services ? Layer.mergeAll(drizzleLayer, services) : drizzleLayer),
  ) as Layer.Layer<DrizzleDb, unknown, never>
}

export function buildApp(options: BuildAppOptions): BuiltApp {
  // 1. Merge DB contributions (schemas + relations) — see `mergeModuleDb`.
  const { dbSchemas, relations } = mergeModuleDb(options.modules)

  // 2. GraphQL contributions — flat-map keeps O(n) and skips undefined.
  const graphQLContributions = options.modules.flatMap(m => m.graphql?.contribution ? [m.graphql.contribution] : [])
  const authScopes = options.modules.flatMap(m => m.graphql?.authScope ? [m.graphql.authScope] : [])
  const graphQLContexts = options.modules.flatMap(m => m.graphql?.contexts ? [m.graphql.contexts] : [])
  const nodeGuards = Object.assign({}, ...options.modules.flatMap(m => m.graphql?.nodeGuards ? [m.graphql.nodeGuards] : []))

  // 3. Infrastructure layers.
  const SchemaRegistryLayer = buildSchemaRegistryLayer(dbSchemas, relations)
  const DrizzleLayer = options.db ?? DrizzleDbLayer.pipe(
    Layer.provide(SchemaRegistryLayer),
    Layer.provide(DatabaseConfigFromEnv),
  )
  const servedSubGraphs: ReadonlyArray<SubGraphName> = options.subGraphs ?? ['public']
  const GraphQLBuilderLayer = makeGraphQLBuilder(
    graphQLContributions,
    graphQLContexts,
    authScopes,
    relations,
    nodeGuards,
    servedSubGraphs,
  ).pipe(Layer.provide(DrizzleLayer))

  // Wire DrizzleLayer INTO moduleLayers so module-internal services
  // (`UserService`, `OrganizationService`, …) resolve `DrizzleDb` at
  // construction. `provideMerge` keeps `DrizzleDb` in the layer's
  // outputs so the rest of the program (main effect, resolvers) can
  // still pull it.
  const moduleLayers = foldModuleLayers(options.modules, DrizzleLayer, options.services)

  const appLayer = options.services
    ? Layer.mergeAll(moduleLayers, GraphQLBuilderLayer, RateLimiterLive, options.services)
    : Layer.mergeAll(moduleLayers, GraphQLBuilderLayer, RateLimiterLive)

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

  // Assemble the h3 fetch app (schema → Yoga → module routes → OpenAPI →
  // extend) WITHOUT serving. Shared by prod (`main`, which adds serve+never)
  // and `@czo/kit/testing`'s `bootTestApp` (which drives `httpApp.fetch`).
  const assembleApp = Effect.gen(function* () {
    // Capture the current Context so the synchronous Yoga `context`
    // callback can re-enter Effect via `Effect.runPromiseWith`.
    const appContext = yield* Effect.context<GraphQLBuilder>()
    const graphQLBuilder = yield* GraphQLBuilder
    const gqlSchema = rateLimitDirectiveTransformer(yield* graphQLBuilder.buildSchema())

    // Number of trusted proxies/LBs in front of the app. Read once at assembly.
    // `0` (default) trusts nothing from `X-Forwarded-For` and keys rate-limits
    // off the socket peer — see `resolveClientIp`. Behind a proxy, set this to
    // the hop count so the real client IP is recovered instead of the proxy's.
    const trustedProxyHops = Number(process.env.TRUSTED_PROXY_HOPS) || 0

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
      // Resolve the rate-limit client IP under the trusted-proxy model so REST
      // handlers never trust `X-Forwarded-For` blindly. `getRequestIP(event)`
      // (no `xForwardedFor`) is the socket peer.
      event.context.clientIp = resolveClientIp(
        event.req.headers.get('x-forwarded-for'),
        getRequestIP(event),
        trustedProxyHops,
      )
    })

    // One Yoga per schema. The context closure (runEffect + per-request
    // cookies/headers/clientIp) is identical across endpoints; only the schema
    // and the mounted path differ. `graphqlEndpoint` must match the mount path
    // so Yoga's own routing accepts the request.
    const makeYoga = (schema: GraphQLSchema, endpoint: string) => createYoga<{ pendingCookies?: string[], pendingHeaders?: Array<[string, string]> }, GraphQLContextMap>({
      schema,
      graphqlEndpoint: endpoint,
      context: async (initialContext) => {
        // Yoga owns the Node response and never flushes the h3 `event.res`, so
        // cookies cannot be set through the event. Instead, resolvers (and the
        // session-context contributor) push serialized `Set-Cookie` values onto
        // this per-request sink; the `onResponse` plugin below flushes them.
        const pendingCookies = initialContext.pendingCookies ?? []
        const setCookie = (serialized: string): void => {
          pendingCookies.push(serialized)
        }
        const pendingHeaders = initialContext.pendingHeaders ?? []
        const setHeader = (name: string, value: string): void => {
          pendingHeaders.push([name, value])
        }
        // Expose on the systemContext so context contributors can queue cookies
        // and headers while the context is still being built (e.g. session-token
        // rotation).
        Object.assign(initialContext, { setCookie, setHeader })
        const userCtx = await runEffect(graphQLBuilder.buildContext(initialContext))
        // Mirror the REST path's trusted-proxy resolution. The socket peer is the
        // Node request's `socket.remoteAddress` (present under the production
        // `fromNodeHandler` mount; absent on the in-process `yoga.fetch` test path,
        // where `hops=0` then keys off the forwarded hop).
        const socketIp = (initialContext as { req?: { socket?: { remoteAddress?: string } } }).req?.socket?.remoteAddress
        const clientIp = resolveClientIp(
          initialContext.request?.headers?.get('x-forwarded-for'),
          socketIp,
          trustedProxyHops,
        )
        return { ...userCtx, runEffect, setCookie, setHeader, clientIp }
      },
      plugins: [
        {
          onResponse({ response, serverContext }) {
            const pending = (serverContext as { pendingCookies?: string[] })?.pendingCookies ?? []
            for (const value of pending)
              response.headers.append('set-cookie', value)
            const pendingHeaders = (serverContext as { pendingHeaders?: Array<[string, string]> })?.pendingHeaders ?? []
            for (const [name, value] of pendingHeaders)
              response.headers.append(name, value)
          },
        },
      ],
    })

    // Full schema at /graphql (transition mount). A host override still applies
    // to the full schema.
    const yoga = options.graphQLApp?.(gqlSchema) ?? makeYoga(gqlSchema, '/graphql')
    httpApp.all(yoga.graphqlEndpoint, fromNodeHandler(yoga))

    // One dedicated endpoint per served sub-graph — a filtered view of the same
    // builder, through the same `rateLimitDirectiveTransformer` as the full mount.
    const subYogas: Array<ReturnType<typeof makeYoga>> = []
    for (const name of servedSubGraphs) {
      const subSchema = rateLimitDirectiveTransformer(yield* graphQLBuilder.buildSchema(name))
      const subYoga = makeYoga(subSchema, `/graphql/${name}`)
      httpApp.all(subYoga.graphqlEndpoint, fromNodeHandler(subYoga))
      subYogas.push(subYoga)
    }

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

    return { httpApp, runEffect, yoga, subYogas }
  })

  const main = Effect.gen(function* () {
    // Run startup INSIDE the program so errors propagate and the
    // server cannot listen before modules are ready. `onStart` phase
    // first (registrations), then `onStarted` (finalization, e.g. freeze).
    yield* startup
    yield* started

    const { httpApp } = yield* assembleApp

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

  return { program, modules: options.modules, startup, started, teardown, assembleApp, appLayer }
}

export interface BuildRuntimeOptions {
  readonly modules: ReadonlyArray<Module>
  readonly services?: Layer.Layer<any, unknown, never>
  readonly db?: Layer.Layer<DrizzleDb, unknown, never>
}

/**
 * HTTP-less sibling of `buildApp`: composes the module runtime (services +
 * `DrizzleDb`) and the sequenced lifecycle effects, WITHOUT GraphQL/Yoga. The
 * worker process provides this + a `PersistedQueueFactory` and forks each
 * module's `queues` consumers.
 */
export function buildRuntime(options: BuildRuntimeOptions): {
  runtimeLayer: Layer.Layer<DrizzleDb, unknown, never>
  startup: Effect.Effect<void>
  started: Effect.Effect<void>
  teardown: Effect.Effect<void>
  modules: ReadonlyArray<Module>
} {
  const { dbSchemas, relations } = mergeModuleDb(options.modules)
  const drizzleLayer = options.db ?? DrizzleDbLayer.pipe(
    Layer.provide(buildSchemaRegistryLayer(dbSchemas, relations)),
    Layer.provide(DatabaseConfigFromEnv),
  )
  const runtimeLayer = foldModuleLayers(options.modules, drizzleLayer, options.services)
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
  return { runtimeLayer, startup, started, teardown, modules: options.modules }
}

/**
 * The environment's `runMain` — schedules the program, owns SIGINT/SIGTERM
 * handling and exit-code reporting, returns synchronously. The caller supplies
 * it so kit stays platform-agnostic: Node passes `NodeRuntime.runMain` (from
 * `@effect/platform-node`), Bun/edge their own equivalent.
 */
export type RunMain = (effect: Effect.Effect<void, unknown, never>) => void

/** Shared options for the terminal runners (`runApp` / `runWorker`). */
export interface RunOptions {
  /** Environment runner — e.g. `NodeRuntime.runMain`. */
  readonly runMain: RunMain
  /**
   * Optional `ConfigProvider` layer (e.g. dotenv via `NodeFileSystem` —
   * platform-specific, so the app owns it). Omit to use only the default
   * environment-variable provider. Error channel is widened (`fromDotEnv`
   * surfaces `PlatformError`); it's absorbed by the program's `unknown` error.
   */
  readonly configProvider?: Layer.Layer<never, unknown, never>
}

/**
 * Run a long-running worker program. Mirrors `runApp`'s run mechanism so the
 * worker process owns signal handling + exit codes; the program parks on
 * `Effect.never`. The worker provides its own persistence (SQL-backed) inside
 * `program`, so — unlike `runApp` — no `Persistence` layer is added here.
 */
export function runWorker(program: Effect.Effect<void, unknown, never>, options: RunOptions): void {
  options.runMain(
    options.configProvider ? Effect.provide(program, options.configProvider) : program,
  )
}

/**
 * Production entry point — hands the built program to the supplied `runMain`
 * for signal handling and exit-code reporting.
 *
 * The program stays alive via `Effect.never` inside `built.program`; the event
 * loop keeps the process running.
 *
 * `runtimeLayer` is an optional app-owned layer merged into the program's
 * context — typically telemetry (e.g. Effect's `Otlp.layerProtobuf`). Because
 * `runEffect` closes over the program's captured `Context`, default services
 * installed here (Tracer / Logger / Metrics) reach every per-request resolver
 * effect, not just the boot program.
 */
export function runApp(
  built: BuiltApp,
  options: RunOptions & { readonly runtimeLayer?: Layer.Layer<never, unknown, never> },
): void {
  const envLayer = Layer.mergeAll(
    Persistence.layerMemory,
    options.configProvider ?? Layer.empty,
    options.runtimeLayer ?? Layer.empty,
  )
  options.runMain(Effect.provide(built.program, envLayer))
}
