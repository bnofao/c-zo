import type {} from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const locales = pgTable('locales', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  uniqueIndex('locales_code_uniq').on(t.code).where(sql`${t.deletedAt} IS NULL`),
  index('locales_active_idx').on(t.isActive),
])

declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    locales: typeof locales
  }
}
