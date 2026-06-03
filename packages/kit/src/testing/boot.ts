import type { Scope } from 'effect'
import type { Database, RelationsEntry } from '../db'
/**
 * `bootTestApp` — boot a set of kit modules on an ephemeral Postgres
 * (Testcontainers) and return a FETCHABLE app: no socket, no `serve`.
 *
 * It reuses `buildApp`'s assembly seam (`appLayer` + `assembleApp` +
 * `startup`/`started`/`teardown` + the `db?` override) to materialize the
 * full app context into the caller's `Scope`, then exposes `httpApp.fetch`
 * for in-process GraphQL / module-route requests. The container + pg pool
 * are released when the scope closes; `close()` runs module `teardown`.
 */
import type { BuildAppOptions } from '../module/app'
import type { Module } from './../module/contract'
import { PgClient } from '@effect/sql-pg'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { Effect, Layer, Redacted } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import pg from 'pg'
import { DrizzleDb } from '../db'
import { buildApp } from '../module/app'
import { acquireContainerUrl } from './postgres'

export interface BootTestApp {
  /** Drive the real h3 fetch handler — GraphQL at `/graphql`, module routes (e.g. `/api/auth/**`). */
  readonly fetch: (req: Request) => Promise<Response>
  /** Re-enter the app's Effect runtime (same context the resolvers use) for direct seeding. */
  readonly runEffect: <A, E>(e: Effect.Effect<A, E, any>) => Promise<A>
  /** Tear down the app (module `teardown`) + release the container/pool scope. */
  readonly close: () => Promise<void>
}

export interface BootTestAppOptions {
  readonly modules: Module[]
  /** Each module's `migrations/` folder, applied in array order on the one container. */
  readonly migrations: readonly string[]
  readonly buildOptions?: Omit<BuildAppOptions, 'modules' | 'db' | 'http'>
  readonly image?: string
}

/**
 * Boot the given modules on a fresh Postgres Testcontainer and return a
 * fetchable app. Scoped: the container, pg pool, and app runtime stay alive
 * until the surrounding `Scope` closes (or `close()` is called).
 */
export function bootTestApp(options: BootTestAppOptions): Effect.Effect<BootTestApp, unknown, Scope.Scope> {
  return Effect.gen(function* () {
    const url = yield* acquireContainerUrl(options.image ?? 'postgres:17')

    // Merge every module's schema + relations the same way `buildApp` does,
    // so the test DB sees cross-module relation references.
    const dbSchemas = Object.assign({}, ...options.modules.map(m => m.db?.schema ?? {}))
    const relations: RelationsEntry = Object.assign(
      {},
      ...options.modules.flatMap(m => m.db?.relations ? [m.db.relations(dbSchemas)] : []),
    )

    // Own a single `pg.Pool` and expose TWO drizzle views over it, exactly like
    // production `makeClientDb`: the effect-postgres client for service code AND a
    // node-postgres `$promise` view for the Pothos drizzle plugin's promise-based
    // model-loader (`node(id:)`, drizzleObject field resolution). Without `$promise`
    // the loader hits the effect client and throws "query.then is not a function".
    const dbLayer = Layer.effect(
      DrizzleDb,
      Effect.gen(function* () {
        const pool = yield* Effect.acquireRelease(
          Effect.sync(() => new pg.Pool({ connectionString: Redacted.value(url) })),
          p => Effect.promise(() => p.end()),
        )
        const context = yield* Layer.build(
          PgClient.layerFrom(PgClient.fromPool({ acquire: Effect.succeed(pool) })),
        )
        const effectDb = yield* PgDrizzle.makeWithDefaults({ relations }).pipe(Effect.provide(context))
        yield* Effect.forEach(options.migrations, folder =>
          migrate(effectDb, { migrationsFolder: folder }).pipe(Effect.orDie))
        const promiseDb = drizzleNodePg({ client: pool, relations })
        return Object.assign(effectDb, { $promise: promiseDb }) as Database
      }),
    )

    const built = buildApp({
      modules: options.modules,
      db: dbLayer,
      http: { port: 0 },
      ...options.buildOptions,
    })

    // Build the app layer into the CURRENT scope so the runtime + pool stay
    // alive for fetch calls; close() (or scope exit) releases them.
    // `Persistence.layerMemory` is provided here for the same reason production
    // `main` provides it: SessionService's cache requires the `Persistence`
    // service. `buildApp` leaves it to the entrypoint (the module-layer casts
    // hide the requirement from `appLayer`'s `never` channel), so the test
    // harness must supply it too or boot fails with "Service not found:
    // effect/persistence/Persistence".
    const appLayer = built.appLayer.pipe(Layer.provide(Persistence.layerMemory))
    const scope = yield* Effect.scope
    const ctx = yield* Layer.buildWithScope(appLayer, scope)

    // Mirror production `main` ordering: startup (registrations) -> started
    // (freeze, e.g. AccessService) -> assemble. All BEFORE first request.
    yield* built.startup.pipe(Effect.provide(ctx))
    yield* built.started.pipe(Effect.provide(ctx))
    const assembled = yield* built.assembleApp.pipe(Effect.provide(ctx))

    return {
      // GraphQL goes straight to `yoga.fetch` (the production `fromNodeHandler`
      // mount only runs on a Node server, not h3's in-process web-fetch path);
      // everything else (e.g. `/api/auth/**`) goes through the h3 handler. This
      // keeps the production GraphQL mount untouched — the split lives here.
      fetch: async (req: Request): Promise<Response> => {
        const { pathname } = new URL(req.url)
        if (pathname !== assembled.yoga.graphqlEndpoint)
          return assembled.httpApp.fetch(req)
        const res = await assembled.yoga.fetch(req)
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers })
      },
      runEffect: assembled.runEffect,
      // Keep close() non-throwing (it runs in afterEach/finalizers) but never
      // hide a broken teardown — scope exit releases the container/pool anyway.
      close: () =>
        Effect.runPromise(
          built.teardown.pipe(
            Effect.provide(ctx),
            Effect.tapCause(cause => Effect.logError('bootTestApp teardown failed', cause)),
          ),
        ).catch(() => undefined),
    } satisfies BootTestApp
  })
}
