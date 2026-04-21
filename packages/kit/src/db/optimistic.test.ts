import { sql } from 'drizzle-orm'
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncate } from '../testing'
import { OptimisticLockError } from './errors'
import { optimisticUpdate } from './optimistic'

const things = pgTable('things_opt_test', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

describe.runIf(process.env.TEST_DATABASE_URL)('optimisticUpdate', () => {
  const db = createTestDb()

  beforeAll(async () => {
    await db.execute(sql`DROP TABLE IF EXISTS things_opt_test`)
    await db.execute(sql`
      CREATE TABLE things_opt_test (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)
  })

  beforeEach(() => truncate(db, things))

  afterAll(async () => {
    await db.execute(sql`DROP TABLE IF EXISTS things_opt_test`)
  })

  it('increments version on successful update', async () => {
    const rows = await db.insert(things).values({ name: 'a' }).returning()
    const row = rows[0]!
    const updated = await optimisticUpdate({
      db,
      table: things,
      id: row.id,
      expectedVersion: 1,
      values: { name: 'b' },
    })
    expect(updated.version).toBe(2)
    expect(updated.name).toBe('b')
  })

  it('throws OptimisticLockError on version mismatch', async () => {
    const rows = await db.insert(things).values({ name: 'a' }).returning()
    const row = rows[0]!
    await expect(optimisticUpdate({
      db,
      table: things,
      id: row.id,
      expectedVersion: 999,
      values: { name: 'b' },
    })).rejects.toBeInstanceOf(OptimisticLockError)
  })

  it('optimisticLockError reports actualVersion for an existing row', async () => {
    const rows = await db.insert(things).values({ name: 'a' }).returning()
    const row = rows[0]!
    try {
      await optimisticUpdate({ db, table: things, id: row.id, expectedVersion: 999, values: { name: 'b' } })
      throw new Error('should have thrown')
    }
    catch (err) {
      expect(err).toBeInstanceOf(OptimisticLockError)
      expect((err as OptimisticLockError).actualVersion).toBe(1)
      expect((err as OptimisticLockError).expectedVersion).toBe(999)
    }
  })

  it('optimisticLockError reports null actualVersion for a missing row', async () => {
    try {
      await optimisticUpdate({ db, table: things, id: 99999, expectedVersion: 1, values: { name: 'x' } })
      throw new Error('should have thrown')
    }
    catch (err) {
      expect(err).toBeInstanceOf(OptimisticLockError)
      expect((err as OptimisticLockError).actualVersion).toBeNull()
    }
  })
})
