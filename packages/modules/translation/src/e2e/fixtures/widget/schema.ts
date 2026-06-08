import type {} from '@czo/kit/db'
import { integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const widgets = pgTable('widgets', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
export const widgetTranslations = pgTable('widget_translations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  widgetId: integer('widget_id').notNull().references(() => widgets.id, { onDelete: 'cascade' }),
  localeCode: text('locale_code').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [uniqueIndex('widget_translations_uniq').on(t.widgetId, t.localeCode)])

declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    widgets: typeof widgets
    widgetTranslations: typeof widgetTranslations
  }
}
