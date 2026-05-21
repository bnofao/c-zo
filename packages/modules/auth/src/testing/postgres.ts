import type { Database } from '@czo/kit/db'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DrizzleDb } from '@czo/kit/db/effect'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Effect, Layer } from 'effect'
import { Pool } from 'pg'
import { authRelations } from '../database/relations'
import * as authSchema from '../database/schema'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')

/**
 * A Postgres Testcontainer wrapped as a scoped `DrizzleDb` Layer — the
 * `effect-smol` `NodeRedis.test.ts` pattern. The container + pg pool are
 * acquired/released by the layer's scope; the auth Drizzle migrations are
 * applied on acquire. Provide it to a suite via `@effect/vitest`'s `layer()`.
 */
export const AuthPostgresLayer: Layer.Layer<DrizzleDb> = Layer.unwrap(
  Effect.gen(function* () {
    const container = yield* Effect.acquireRelease(
      Effect.promise(() => new PostgreSqlContainer('postgres:17').start()),
      c => Effect.promise(() => c.stop()),
    )
    const pool = yield* Effect.acquireRelease(
      Effect.sync(() => new Pool({ connectionString: container.getConnectionUri() })),
      p => Effect.promise(() => p.end()),
    )
    // Pass `relations` so RQBv2 (`db.query.<table>.findFirst/findMany`) is
    // populated — exactly as the real `DrizzleDb` is built in `@czo/kit`
    // (`db/effect.ts`). Without it `db.query` is undefined.
    const db = drizzle({ client: pool, relations: authRelations(authSchema) })
    yield* Effect.promise(() => migrate(db, { migrationsFolder: MIGRATIONS }))
    return Layer.succeed(DrizzleDb, db as unknown as Database)
  }),
)

/** Truncate the auth tables — call at the top of an `it.effect` for isolation. */
export const truncateAuth: Effect.Effect<void, never, DrizzleDb> = Effect.gen(function* () {
  const db = yield* DrizzleDb
  yield* Effect.promise(() => db.execute(
    sql`TRUNCATE TABLE ${authSchema.accounts}, ${authSchema.sessions}, ${authSchema.users} RESTART IDENTITY CASCADE`,
  ))
})
