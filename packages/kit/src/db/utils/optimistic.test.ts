import { expect, layer } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { Effect } from 'effect'
import { DrizzleDb } from '../'
import { makePostgresTestLayer } from '../../testing'
import { OptimisticLockError } from './errors'
import { optimisticUpdate } from './optimistic'

const things = pgTable('things_opt_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/** Create the probe table (no migration) and reset it for per-test isolation. */
const ensureTable = Effect.gen(function* () {
  const db = yield* DrizzleDb
  yield* db.execute(sql`
    CREATE TABLE IF NOT EXISTS things_opt_test (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      name TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `).pipe(Effect.orDie)
  yield* db.execute(sql`TRUNCATE TABLE things_opt_test RESTART IDENTITY CASCADE`).pipe(Effect.orDie)
})

layer(makePostgresTestLayer(), { timeout: 120_000 })('optimisticUpdate', (it) => {
  it.effect('increments version on successful update', () =>
    Effect.gen(function* () {
      yield* ensureTable
      const db = yield* DrizzleDb
      const rows = yield* db.insert(things).values({ name: 'a' }).returning().pipe(Effect.orDie)
      const row = rows[0]!
      const updated = yield* optimisticUpdate({
        db,
        table: things,
        id: row.id,
        expectedVersion: 1,
        values: { name: 'b' },
      }).pipe(Effect.orDie)
      expect(updated.version).toBe(2)
      expect(updated.name).toBe('b')
    }))

  it.effect('fails with OptimisticLockError on version mismatch', () =>
    Effect.gen(function* () {
      yield* ensureTable
      const db = yield* DrizzleDb
      const rows = yield* db.insert(things).values({ name: 'a' }).returning().pipe(Effect.orDie)
      const row = rows[0]!
      const err = yield* optimisticUpdate({
        db,
        table: things,
        id: row.id,
        expectedVersion: 999,
        values: { name: 'b' },
      }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(OptimisticLockError)
    }))

  it.effect('reports actualVersion for an existing row', () =>
    Effect.gen(function* () {
      yield* ensureTable
      const db = yield* DrizzleDb
      const rows = yield* db.insert(things).values({ name: 'a' }).returning().pipe(Effect.orDie)
      const row = rows[0]!
      const err = yield* optimisticUpdate({
        db,
        table: things,
        id: row.id,
        expectedVersion: 999,
        values: { name: 'b' },
      }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(OptimisticLockError)
      expect((err as OptimisticLockError).actualVersion).toBe(1)
      expect((err as OptimisticLockError).expectedVersion).toBe(999)
    }))

  it.effect('reports null actualVersion for a missing row', () =>
    Effect.gen(function* () {
      yield* ensureTable
      const db = yield* DrizzleDb
      const err = yield* optimisticUpdate({
        db,
        table: things,
        id: 99999,
        expectedVersion: 1,
        values: { name: 'x' },
      }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(OptimisticLockError)
      expect((err as OptimisticLockError).actualVersion).toBeNull()
    }))
})
