import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const apps = pgTable('apps', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1, // Optional: customize sequence start
    increment: 1, // Optional: customize increment amount
  }),
  appId: text('app_id').notNull().unique(),
  manifest: jsonb('manifest').notNull(),
  status: text('status').notNull().default('active'),
  webhookSecret: text('webhook_secret').notNull().default(''),
  installedBy: integer('installed_by').notNull().references(() => users.id),
  organizationId: integer('organization_id').references(() => organizations.id),
  createdAt: timestamp('created_at', { precision: 6, withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, withTimezone: true }).notNull(),
})

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1, // Optional: customize sequence start
    increment: 1, // Optional: customize increment amount
  }),
  appId: integer('app_id').notNull().references(() => apps.id),
  event: text('event').notNull(),
  payload: text('payload').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').default(0),
  lastAttemptAt: timestamp('last_attempt_at'),
  responseCode: integer('response_code'),
  responseBody: text('response_body'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [
  index('webhook_deliveries_app_id_idx').on(t.appId),
  index('webhook_deliveries_status_idx').on(t.status),
])