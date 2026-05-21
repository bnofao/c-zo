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
 *                          `DrizzleDbLive` from `DatabaseConfig` +
 *                          the kit's global relations registry.
 *  - `DrizzleDbLive`    — `Layer.scoped` — `pg.Pool` is closed
 *                          automatically when the surrounding scope
 *                          (`ManagedRuntime`) disposes. No more
 *                          singleton leak on hot-reload.
 *
 * `manager.ts:useDatabase()` is preserved for now as a legacy façade —
 * the ~12 remaining call sites can migrate to `yield* DrizzleDb`
 * incrementally.
 */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool as PgPool } from 'pg'
import type { RelationsEntry, SchemaRegistryShape } from './schema-registry'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { withReplicas } from 'drizzle-orm/pg-core'
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
  /** `pg.Pool` `max` for the primary pool. Default 10. */
  readonly poolMax: number
}

export class DatabaseConfig extends Context.Service<DatabaseConfig, DatabaseConfigShape>()(
  '@czo/kit/DatabaseConfig',
) {}

// Type of the drizzle instance. The `SchemaRegistry` generic is the
// shape `initBuilder()` expects so the Pothos drizzle plugin sees the
// full table map for selection-aware reads.
export type Database<Relations extends RelationsEntry = RelationsEntry>
  = NodePgDatabase<SchemaRegistryShape, Relations> & { $client: PgPool }

export class DrizzleDb extends Context.Service<DrizzleDb, Database>()(
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
 * Build the drizzle instance. Owns the `pg.Pool` lifetime via the
 * surrounding `Scope` — `pool.end()` is called on dispose.
 */
const acquireDb = Effect.gen(function* () {
  const config = yield* DatabaseConfig
  const registry = yield* SchemaRegistry

  const masterUrl = Redacted.value(config.url)
  const masterPool = new pg.Pool({ connectionString: masterUrl, max: config.poolMax })
  yield* Effect.addFinalizer(() => Effect.promise(() => masterPool.end()))

  // Relations are sourced from the SchemaRegistry Service — populated
  // by `composeApp` / `App` at runtime construction time from each
  // module's `db.relations` factory.
  const relations = yield* registry.relations

  if (config.replicas.length === 0) {
    return drizzleNodePg({ client: masterPool, relations })
  }

  const replicaPools: PgPool[] = config.replicas.map(r =>
    new pg.Pool({ connectionString: Redacted.value(r) }),
  )

  for (const p of replicaPools) {
    yield* Effect.addFinalizer(() => Effect.promise(() => p.end()))
  }

  return withReplicas(
    drizzleNodePg({ client: masterPool, relations }),
    replicaPools.map(p => drizzleNodePg({ client: p, relations })) as any,
  )
})

/**
 * Live Layer. Requires `DatabaseConfig` (use
 * `Layer.provide(DatabaseConfigFromEnv)` or a custom config Layer).
 *
 * Scoped: the pg pool(s) are closed when the `ManagedRuntime` disposes.
 */
export const DrizzleDbLayer = Layer.effect(DrizzleDb, acquireDb as unknown as Effect.Effect<Database, never, DatabaseConfig | SchemaRegistry>)
