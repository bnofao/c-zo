import type { PgTable } from 'drizzle-orm/pg-core'
import type { SqlError } from 'effect/unstable/sql/SqlError'
import type { RelationsEntry } from '../db'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Context, Effect, Layer, Redacted } from 'effect'
import { DrizzleDb, makePgClientLayer } from '../db'

const DEFAULT_IMAGE = 'postgres:17'

/**
 * Acquire a Postgres Testcontainer and surface its connection URI as a
 * `Redacted<string>`. The container is stopped when the surrounding Scope
 * closes. Shared by both seams below.
 */
export function acquireContainerUrl(image: string) {
  return Effect.acquireRelease(
    Effect.promise(() => new PostgreSqlContainer(image).start()),
    c => Effect.promise(() => c.stop()),
  ).pipe(Effect.map(c => Redacted.make(c.getConnectionUri())))
}

/* ─── Low-level seam: container → connection URL ─────────────────────── */

/**
 * Tag exposing the `Redacted` connection URL of a running Postgres
 * Testcontainer. Use when a test needs the raw URL (e.g. to feed
 * `DatabaseConfig` and exercise the production `DrizzleDbLayer`) rather
 * than a pre-built `DrizzleDb`.
 */
export class PostgresContainerUrl extends Context.Service<PostgresContainerUrl, Redacted.Redacted<string>>()(
  '@czo/kit/testing/PostgresContainerUrl',
) {}

/**
 * Scoped Layer that boots a Postgres Testcontainer and provides its
 * connection URL via {@link PostgresContainerUrl}. Container lifecycle is
 * tied to the Layer's scope. Provide it to an `@effect/vitest` `layer()`
 * suite (with a generous `timeout`).
 */
export function PostgresContainer(image = DEFAULT_IMAGE): Layer.Layer<PostgresContainerUrl> {
  return Layer.effect(PostgresContainerUrl, acquireContainerUrl(image))
}

/* ─── High-level seam: container → DrizzleDb ─────────────────────────── */

export interface PostgresTestLayerOptions {
  /** Folder of drizzle migrations to apply on container acquire. Omit to skip. */
  readonly migrationsFolder?: string
  /** Drizzle relations for the schema under test. Defaults to an empty set. */
  readonly relations?: RelationsEntry
  /** Postgres image tag. Defaults to `postgres:17`. */
  readonly image?: string
}

/**
 * A Postgres Testcontainer wrapped as a scoped `DrizzleDb` Layer.
 *
 * The container + pg pool are acquired/released by the Layer's scope; the
 * supplied migrations (if any) are applied on acquire. The PgClient is built
 * via `makePgClientLayer` so the same `getTypeParser` override applies in tests
 * as in production — date/time OIDs arrive as raw strings and round-trip
 * reliably. Provide it to a suite via `@effect/vitest`'s `layer()`.
 *
 * Modules wrap this with their own schema/migrations (see
 * `@czo/auth`'s `AuthPostgresLayer`); kit's own DB tests use it directly.
 */
export function makePostgresTestLayer(options: PostgresTestLayerOptions = {}): Layer.Layer<DrizzleDb, SqlError> {
  const { migrationsFolder, relations, image = DEFAULT_IMAGE } = options
  return Layer.unwrap(
    Effect.gen(function* () {
      const url = yield* acquireContainerUrl(image)

      // Build a DrizzleDb Layer scoped to the container's lifetime. The
      // PgClient's pool lifecycle is tied to this Layer's scope (via
      // `Layer.provide`), not the outer `Effect.gen` scope.
      return Layer.effect(
        DrizzleDb,
        PgDrizzle.makeWithDefaults({ relations: relations ?? ({} as RelationsEntry) }).pipe(
          Effect.flatMap(db =>
            migrationsFolder
              ? migrate(db, { migrationsFolder }).pipe(Effect.orDie, Effect.map(() => db))
              : Effect.succeed(db),
          ),
        ),
      ).pipe(Layer.provide(makePgClientLayer(url)))
    }),
  )
}

/**
 * Build a `TRUNCATE … RESTART IDENTITY CASCADE` effect over the given tables —
 * call at the top of an `it.effect` for per-test isolation. Modules expose a
 * pre-bound variant (e.g. `truncateAuth`).
 */
export function truncateTables(...tables: PgTable[]): Effect.Effect<void, never, DrizzleDb> {
  return Effect.gen(function* () {
    const db = yield* DrizzleDb
    yield* db.execute(
      sql`TRUNCATE TABLE ${sql.join(tables, sql`, `)} RESTART IDENTITY CASCADE`,
    ).pipe(Effect.orDie)
  })
}
