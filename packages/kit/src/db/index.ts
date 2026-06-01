import type { TablesRelationalConfig } from 'drizzle-orm'
/**
 * Effect-native Drizzle/Postgres bindings — a fully composable Layer for
 * the Drizzle client (no singleton, no IoC config lookup):
 *
 *  - `DatabaseConfig`   — Tag exposing the resolved config (urls,
 *                          pool limits). Provide via
 *                          `DatabaseConfigFromEnv` (reads `DATABASE_URL`
 *                          via `Config.redacted`) or by hand for tests.
 *  - `DrizzleDb`        — Tag exposing the drizzle instance. Built by
 *                          `DrizzleDbLayer` from `DatabaseConfig` +
 *                          the kit's global relations registry.
 *  - `DrizzleDbLayer`   — `Layer.effect` — `PgClient` pool is closed
 *                          automatically when the surrounding scope
 *                          (`ManagedRuntime`) disposes. No more
 *                          singleton leak on hot-reload.
 */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RelationsEntry } from './schema'
import { PgClient } from '@effect/sql-pg'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { withReplicas } from 'drizzle-orm/pg-core/effect'
import { Config, Context, Effect, Layer, Redacted } from 'effect'
import pg from 'pg'
import { SchemaRegistry } from './schema'

// Schema registry for dynamic module schema registration
export { buildSchemaRegistryLayer, registeredRelations, registeredSchemas, registerRelations, registerSchema, SchemaRegistry } from './schema'
export type { RelationsEntry, RelationsFactory, SchemaRegistryShape } from './schema'
export * from './utils'

/* ─── Types ─────────────────────────────────────────────────────────── */

/**
 * Resolved database configuration. URLs are wrapped in `Redacted` so
 * they never appear in logs, span attributes, or `inspect()` output.
 */
export interface DatabaseConfigShape {
  /** Primary (read-write) connection URL. */
  readonly url: Redacted.Redacted<string>
  /** Optional read-only replicas. Empty → no replica routing. */
  readonly replicas: ReadonlyArray<Redacted.Redacted<string>>
  /** `pg` pool `max` for the primary pool. Default 10. */
  readonly poolMax: number
}

export class DatabaseConfig extends Context.Service<DatabaseConfig, DatabaseConfigShape>()(
  '@czo/kit/DatabaseConfig',
) {}

/** The drizzle instance — an effect-postgres `EffectPgDatabase`; queries return `Effect`s. */
export type Database<Relations extends RelationsEntry = RelationsEntry>
  = PgDrizzle.EffectPgDatabase<Relations> & {
    $client: PgClient.PgClient
    /**
     * Promise-based node-postgres drizzle view over the SAME pg pool. The
     * Pothos drizzle plugin's model-loader (`@pothos/plugin-drizzle`) calls
     * `.then()` on its queries, which the effect-postgres db does not support
     * (its queries are `Effect`s). The GraphQL builder hands this view to the
     * plugin while service resolvers keep using the effect db. Present in
     * production (`DrizzleDbLayer`); omitted by lightweight test layers.
     */
    $promise?: NodePgDatabase<Relations>
  }

export class DrizzleDb extends Context.Service<DrizzleDb, Database<TablesRelationalConfig>>()(
  '@czo/kit/DrizzleDb',
) {}

/* ─── Config provider ───────────────────────────────────────────────── */

/**
 * Resolve `DatabaseConfig` from env vars. Honours the legacy
 * comma-separated `DATABASE_URL` format (master,replica1,replica2) for
 * compatibility with the previous singleton.
 *
 * `Config.redacted` reads `process.env.DATABASE_URL` while keeping the
 * value masked in any subsequent Effect log / span attribute / `inspect`.
 */
export const DatabaseConfigFromEnv = Layer.effect(
  DatabaseConfig,
  Effect.gen(function* () {
    const raw = yield* Config.redacted('DATABASE_URL')
    const parts = Redacted.value(raw).split(',').map(s => s.trim()).filter(Boolean)
    const [master, ...replicas] = parts.length > 0
      ? parts as [string, ...string[]]
      : ['' as string] as [string, ...string[]]
    const poolMax = yield* Config.int('DATABASE_POOL_MAX').pipe(Config.withDefault(10))
    return {
      url: Redacted.make(master),
      replicas: replicas.map(r => Redacted.make(r)),
      poolMax,
    } satisfies DatabaseConfigShape
  }),
)

/* ─── Drizzle live ──────────────────────────────────────────────────── */

/**
 * PG type OIDs for which pg's built-in parser must be bypassed so that
 * values arrive as raw strings. This mirrors the set used by drizzle's
 * own pg adapter driver, the canonical reference for the pg family:
 *   1082 DATE, 1083 TIME, 1114 TIMESTAMP, 1115 TIMESTAMP[], 1182 DATE[],
 *   1184 TIMESTAMPTZ, 1185 TIMESTAMPTZ[], 1231 NUMERIC[].
 * The effect-postgres codecs inject `::text` SQL casts for these types
 * and handle the resulting strings themselves.
 */
const RAW_TYPE_OIDS = new Set([1184, 1114, 1082, 1083, 1231, 1115, 1185, 1182])

/**
 * pg type-parser override: date/time/numeric OIDs arrive as raw strings (the
 * effect-postgres codecs + drizzle handle them). Set on the pg pool so BOTH the
 * effect-postgres client and the node-postgres view share identical parsing.
 */
function rawTypeParser(id: number, format?: 'text' | 'binary') {
  return RAW_TYPE_OIDS.has(id) ? (value: unknown) => value : pg.types.getTypeParser(id, format)
}

/**
 * Build one db for a single connection URL. We OWN the `pg.Pool` so two drizzle
 * views can share it:
 *  - the effect-postgres client (`PgClient.fromPool`) used by service code, and
 *  - a node-postgres view (`db.$promise`) used by the Pothos drizzle plugin's
 *    promise-based model-loader.
 *
 * `pool.end()` is registered exactly once here (`acquireRelease`) on the
 * surrounding `Layer.effect` scope (app lifetime). `PgClient.fromPool` only
 * consumes the pool (`yield* options.acquire`) and registers NO pool finalizer,
 * so there is no double-`end`.
 */
function makeClientDb(url: Redacted.Redacted<string>, relations: RelationsEntry) {
  return Effect.gen(function* () {
    const pool = yield* Effect.acquireRelease(
      Effect.sync(() => new pg.Pool({
        connectionString: Redacted.value(url),
        types: { getTypeParser: rawTypeParser },
      })),
      p => Effect.promise(() => p.end()),
    )

    // `layerFrom` provides PgClient + SqlClient and absorbs Scope + Reactivity.
    // `Layer.build` attaches it to the surrounding `Layer.effect` scope, matching
    // the previous `Layer.build(makePgClientLayer(...))` composition.
    const context = yield* Layer.build(
      PgClient.layerFrom(PgClient.fromPool({ acquire: Effect.succeed(pool) })),
    )
    const effectDb = yield* PgDrizzle.makeWithDefaults({ relations }).pipe(Effect.provide(context))

    // Promise-based view over the SAME pool for `@pothos/plugin-drizzle`.
    const promiseDb = drizzleNodePg({ client: pool, relations })
    return Object.assign(effectDb, { $promise: promiseDb }) as Database
  })
}

/**
 * Build a `PgClient.layer` with the canonical `getTypeParser` override — the
 * same configuration used in production so date/time OIDs arrive as raw
 * strings and are handled consistently.
 *
 * Exported for test helpers that need to compose the PgClient Layer separately
 * (e.g. `testing/postgres.ts` builds its own scoped DrizzleDb Layer from a
 * Testcontainers URI without duplicating the OID list or parser logic).
 */
export function makePgClientLayer(url: Redacted.Redacted<string>) {
  return PgClient.layer({
    url,
    types: { getTypeParser: rawTypeParser },
  })
}

/**
 * Build the drizzle instance. Acquires `PgClient`(s) via
 * `@effect/sql-pg` — pool lifecycle is managed by the Scope
 * automatically. SqlError from PgClient.layer is converted to a defect
 * via orDie — a DB-connection failure at boot is unrecoverable.
 */
const acquireDb = Effect.gen(function* () {
  const config = yield* DatabaseConfig
  const registry = yield* SchemaRegistry
  const relations = yield* registry.relations

  const masterDb = yield* makeClientDb(config.url, relations)

  const replicaDbs = yield* Effect.forEach(config.replicas, r => makeClientDb(r, relations))
  const [firstReplica, ...restReplicas] = replicaDbs
  if (firstReplica === undefined)
    return masterDb

  // `withReplicas` returns a fresh proxy that drops our `$promise` prop —
  // re-attach the master's so the GraphQL model-loader keeps a promise view
  // (reads hit the master pool, which is fine: it only loads committed rows).
  return Object.assign(
    withReplicas(masterDb, [firstReplica, ...restReplicas]),
    { $promise: masterDb.$promise },
  )
}).pipe(Effect.orDie)

/**
 * Live Layer. Requires `DatabaseConfig` (use
 * `Layer.provide(DatabaseConfigFromEnv)` or a custom config Layer) +
 * `SchemaRegistry`.
 *
 * Scoped: the pg pool(s) are closed when the `ManagedRuntime` disposes.
 */
export const DrizzleDbLayer = Layer.effect(DrizzleDb, acquireDb)

// /* ─── Re-exports for convenience ────────────────────────────────────── */

// export type { RelationsEntry, SchemaRegistryShape }
