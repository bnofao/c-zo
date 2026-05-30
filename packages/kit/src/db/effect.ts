import type { TablesRelationalConfig } from 'drizzle-orm'
import type { RelationsEntry, SchemaRegistryShape } from './schema-registry'
/**
 * Effect-native Drizzle/Postgres bindings.
 *
 * Replaces the legacy `manager.ts:useDatabase()` singleton + IoC config
 * lookup with a fully composable Layer:
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
 *
 * `manager.ts:useDatabase()` is preserved for now as a legacy façade —
 * the ~12 remaining call sites can migrate to `yield* DrizzleDb`
 * incrementally.
 */
import { PgClient } from '@effect/sql-pg'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { withReplicas } from 'drizzle-orm/pg-core/effect'
import { Config, Context, Effect, Layer, Redacted } from 'effect'
import pg from 'pg'
import { SchemaRegistry } from './schema-registry'

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
  = PgDrizzle.EffectPgDatabase<Relations> & { $client: PgClient.PgClient }

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
 * Build one effect-postgres db for a single connection URL.
 *  `PgClient.layer` owns the pool lifecycle and absorbs Scope + Reactivity.
 */
function makeClientDb(url: Redacted.Redacted<string>, relations: RelationsEntry) {
  return Effect.gen(function* () {
    // Build the PgClient layer into the AMBIENT (DrizzleDb layer) scope via
    // `Layer.build`, NOT `Effect.provide`. `Effect.provide(scopedLayer)` ties the
    // pool's scope to the completion of `makeWithDefaults` — so `pool.end()` runs
    // immediately after construction and the first real query fails with "Cannot
    // use a pool after calling end on the pool". `Layer.build` attaches the pool
    // finalizer to the surrounding `Layer.effect` scope (app lifetime), matching
    // how `testing/postgres.ts` composes it via `Layer.provide`.
    const context = yield* Layer.build(makePgClientLayer(url))
    return yield* PgDrizzle.makeWithDefaults({ relations }).pipe(Effect.provide(context))
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
    types: {
      getTypeParser: (id: number, format?: 'text' | 'binary') =>
        RAW_TYPE_OIDS.has(id)
          ? (value: unknown) => value
          : pg.types.getTypeParser(id, format),
    },
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

  return withReplicas(masterDb, [firstReplica, ...restReplicas])
}).pipe(Effect.orDie)

/**
 * Live Layer. Requires `DatabaseConfig` (use
 * `Layer.provide(DatabaseConfigFromEnv)` or a custom config Layer) +
 * `SchemaRegistry`.
 *
 * Scoped: the pg pool(s) are closed when the `ManagedRuntime` disposes.
 */
export const DrizzleDbLayer = Layer.effect(DrizzleDb, acquireDb)

/* ─── Re-exports for convenience ────────────────────────────────────── */

export type { RelationsEntry, SchemaRegistryShape }
