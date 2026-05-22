import type { SqlError } from 'effect/unstable/sql/SqlError'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DrizzleDb, makePgClientLayer } from '@czo/kit/db/effect'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Effect, Layer, Redacted } from 'effect'
import { authRelations } from '../database/relations'
import * as authSchema from '../database/schema'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')

/**
 * A Postgres Testcontainer wrapped as a scoped `DrizzleDb` Layer — the
 * `effect-smol` `NodeRedis.test.ts` pattern. The container + pg pool are
 * acquired/released by the layer's scope; the auth Drizzle migrations are
 * applied on acquire. Provide it to a suite via `@effect/vitest`'s `layer()`.
 *
 * The PgClient is built via `makePgClientLayer` (from `@czo/kit/db/effect`)
 * so the same `getTypeParser` override applies in tests as in production —
 * date/time OIDs arrive as raw strings and date round-trips are reliable.
 */
export const AuthPostgresLayer: Layer.Layer<DrizzleDb, SqlError> = Layer.unwrap(
  Effect.gen(function* () {
    const container = yield* Effect.acquireRelease(
      Effect.promise(() => new PostgreSqlContainer('postgres:17').start()),
      c => Effect.promise(() => c.stop()),
    )

    const url = Redacted.make(container.getConnectionUri())
    const relations = authRelations(authSchema)

    // Build a DrizzleDb Layer scoped to the container's lifetime.
    // `makePgClientLayer` provides the canonical getTypeParser override so
    // date handling matches production. The PgClient's pool lifecycle is tied
    // to the Layer's scope (not the outer Effect.gen scope).
    const dbLayer = Layer.effect(
      DrizzleDb,
      PgDrizzle.makeWithDefaults({ relations }).pipe(
        Effect.flatMap(db =>
          migrate(db, { migrationsFolder: MIGRATIONS }).pipe(
            Effect.orDie,
            Effect.map(() => db),
          ),
        ),
      ),
    ).pipe(
      Layer.provide(makePgClientLayer(url)),
    )

    return dbLayer
  }),
)

/** Truncate the auth tables — call at the top of an `it.effect` for isolation. */
export const truncateAuth: Effect.Effect<void, never, DrizzleDb> = Effect.gen(function* () {
  const db = yield* DrizzleDb
  yield* db.execute(
    sql`TRUNCATE TABLE ${authSchema.accounts}, ${authSchema.sessions}, ${authSchema.users} RESTART IDENTITY CASCADE`,
  ).pipe(Effect.orDie)
})
