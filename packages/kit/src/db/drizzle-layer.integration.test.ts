import { expect, layer } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import { Effect, Layer } from 'effect'
import { PostgresContainer, PostgresContainerUrl } from '../testing'
import { DatabaseConfig, DrizzleDb, DrizzleDbLayer } from './'
import { buildSchemaRegistryLayer } from './schema'

const probe = pgTable('_kit_pool_probe', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
})

/**
 * Regression guard for the *production* `DrizzleDbLayer` composition.
 *
 * Module integration suites use `makePostgresTestLayer`, which composes the
 * PgClient via `Layer.provide` — so they never exercise `DrizzleDbLayer`
 * itself. That layer built the pool with `Effect.provide` inside a generator,
 * which closed the pool's scope at construction (`pool.end()`), so the first
 * real query failed with "Cannot use a pool after calling end on the pool".
 * This drives the actual `DrizzleDbLayer` end-to-end against a real container
 * to ensure the pool survives for the layer's lifetime.
 */
layer(PostgresContainer(), { timeout: 120_000 })('drizzleDbLayer (production composition)', (it) => {
  it.effect('keeps the pg pool alive past construction so the first query reaches the DB', () =>
    Effect.gen(function* () {
      const url = yield* PostgresContainerUrl
      const DbLayer = DrizzleDbLayer.pipe(
        Layer.provide(Layer.succeed(DatabaseConfig, DatabaseConfig.of({ url, replicas: [], poolMax: 10 }))),
        Layer.provide(buildSchemaRegistryLayer({ probe }, {})),
      )

      const rows = yield* Effect.gen(function* () {
        const db = yield* DrizzleDb
        yield* db.execute(sql`
          CREATE TABLE _kit_pool_probe (
            id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
            name TEXT NOT NULL
          )
        `).pipe(Effect.orDie)
        // A real table query against the production pool — the operation class
        // that failed with "Cannot use a pool after calling end". The core
        // `select` form types off the table directly, so no `Database<Relations>`
        // cast is needed.
        return yield* db.select().from(probe)
      }).pipe(Effect.provide(DbLayer), Effect.scoped)

      expect(rows).toHaveLength(0)
    }))
})
