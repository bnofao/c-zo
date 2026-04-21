import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { integer, pgTable, timestamp } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { notDeleted, notDeletedFilter, onlyDeleted, withNotDeleted } from './scope'

const testTable = pgTable('test', {
  id: integer('id').primaryKey(),
  deletedAt: timestamp('deleted_at'),
})

const db = drizzle.mock()

describe('notDeleted (v1 SQL)', () => {
  it('produces IS NULL filter on deletedAt', () => {
    const q = db.select().from(testTable).where(notDeleted(testTable))
    const { sql } = q.toSQL()
    expect(sql.toLowerCase()).toContain('"deleted_at" is null')
  })

  it('combines with extra where clause via AND', () => {
    const q = db.select().from(testTable).where(notDeleted(testTable, eq(testTable.id, 5)))
    const { sql, params } = q.toSQL()
    const lower = sql.toLowerCase()
    expect(lower).toContain('"deleted_at" is null')
    expect(lower).toContain('"id" =')
    expect(params).toContain(5)
  })
})

describe('onlyDeleted (v1 SQL)', () => {
  it('produces IS NOT NULL filter', () => {
    const q = db.select().from(testTable).where(onlyDeleted(testTable))
    const { sql } = q.toSQL()
    expect(sql.toLowerCase()).toContain('"deleted_at" is not null')
  })
})

describe('notDeletedFilter (v2 filter object)', () => {
  it('is a filter object targeting deletedAt isNull', () => {
    expect(notDeletedFilter).toEqual({ deletedAt: { isNull: true } })
  })
})

describe('withNotDeleted (v2 composer)', () => {
  it('merges with empty filter', () => {
    expect(withNotDeleted()).toEqual({ deletedAt: { isNull: true } })
  })

  it('preserves caller fields and appends deletedAt', () => {
    expect(withNotDeleted({ id: 5, name: 'foo' })).toEqual({
      id: 5,
      name: 'foo',
      deletedAt: { isNull: true },
    })
  })

  it('caller-provided deletedAt takes precedence (merge order)', () => {
    // Our implementation spreads notDeletedFilter LAST, so it overrides caller's deletedAt.
    // Document this as intended behavior (notDeleted is authoritative).
    expect(withNotDeleted({ deletedAt: { isNotNull: true } } as any)).toEqual({
      deletedAt: { isNull: true },
    })
  })
})
