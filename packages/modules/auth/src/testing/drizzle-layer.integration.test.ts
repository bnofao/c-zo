import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SchemaRegistry } from '@czo/kit/db'
import { DatabaseConfig, DrizzleDb, DrizzleDbLayer } from '@czo/kit/db/effect'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Effect, Layer, Redacted } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authRelations } from '../database/relations'
import * as authSchema from '../database/schema'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')

/**
 * Regression guard for the *production* DrizzleDb composition.
 *
 * The integration suites elsewhere use `AuthPostgresLayer`, which composes the
 * PgClient via `Layer.provide` — so they never exercised `@czo/kit`'s real
 * `DrizzleDbLayer`. That layer built the pool with `Effect.provide` inside a
 * generator, which closed the pool's scope at construction (`pool.end()`), so
 * the first real query failed with "Cannot use a pool after calling end on the
 * pool". This test drives the actual `DrizzleDbLayer` end-to-end to ensure the
 * pool survives for the layer's lifetime.
 */
describe('drizzleDbLayer (production composition)', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>>
  let url: Redacted.Redacted<string>

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17').start()
    url = Redacted.make(container.getConnectionUri())
  }, 120_000)

  afterAll(async () => {
    await container?.stop()
  })

  it('keeps the pg pool alive past construction so the first query reaches the DB', async () => {
    const relations = authRelations(authSchema)
    const DbLayer = DrizzleDbLayer.pipe(
      Layer.provide(Layer.succeed(DatabaseConfig, DatabaseConfig.of({ url, replicas: [], poolMax: 10 }))),
      Layer.provide(Layer.succeed(SchemaRegistry, SchemaRegistry.of({
        schemas: Effect.succeed(authSchema),
        relations: Effect.succeed(relations),
      }))),
    )

    const program = Effect.gen(function* () {
      const db = yield* DrizzleDb
      yield* migrate(db, { migrationsFolder: MIGRATIONS }).pipe(Effect.orDie)
      // A real query against the production pool — the operation class that
      // failed with "Cannot use a pool after calling end" (credential.ts
      // sign-up's user lookup). The core `select` form types off the table
      // directly, so the test needs no `Database<Relations>` cast.
      return yield* db.select().from(authSchema.users).where(eq(authSchema.users.email, 'nobody@example.com'))
    }).pipe(Effect.provide(DbLayer), Effect.scoped)

    const rows = await Effect.runPromise(program)
    expect(rows).toHaveLength(0)
  }, 120_000)
})
