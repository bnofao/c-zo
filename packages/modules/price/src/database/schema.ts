import type {} from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const priceRuleOperator = pgEnum('price_rule_operator', ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in'])
export const priceListType = pgEnum('price_list_type', ['sale', 'override'])
export const priceListStatus = pgEnum('price_list_status', ['draft', 'active'])

export const priceSets = pgTable('price_sets', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('price_sets_organization_id_idx').on(t.organizationId),
])

export const priceLists = pgTable('price_lists', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  type: priceListType('type').notNull(),
  status: priceListStatus('status').notNull().default('draft'),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('price_lists_organization_id_idx').on(t.organizationId),
])

export const prices = pgTable('prices', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  priceSetId: integer('price_set_id').notNull().references(() => priceSets.id, { onDelete: 'cascade' }),
  priceListId: integer('price_list_id').references(() => priceLists.id, { onDelete: 'cascade' }),
  currencyCode: text('currency_code').notNull(),
  amount: numeric('amount').notNull(),
  minQuantity: integer('min_quantity'),
  maxQuantity: integer('max_quantity'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('prices_price_set_id_idx').on(t.priceSetId),
  index('prices_price_list_id_idx').on(t.priceListId),
  index('prices_set_currency_idx').on(t.priceSetId, t.currencyCode),
  check('chk_price_amount_nonneg', sql`${t.amount} >= 0`),
  check('chk_price_min_qty', sql`${t.minQuantity} IS NULL OR ${t.minQuantity} >= 1`),
  check('chk_price_max_qty', sql`${t.maxQuantity} IS NULL OR ${t.maxQuantity} >= 1`),
  check('chk_price_max_ge_min', sql`${t.maxQuantity} IS NULL OR ${t.minQuantity} IS NULL OR ${t.maxQuantity} >= ${t.minQuantity}`),
])

export const priceRules = pgTable('price_rules', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  priceId: integer('price_id').notNull().references(() => prices.id, { onDelete: 'cascade' }),
  attribute: text('attribute').notNull(),
  operator: priceRuleOperator('operator').notNull().default('eq'),
  value: jsonb('value').notNull(),
  priority: integer('priority').notNull().default(0),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [
  uniqueIndex('price_rules_price_attr_uniq').on(t.priceId, t.attribute).where(sql`${t.deletedAt} IS NULL`),
  index('price_rules_price_id_idx').on(t.priceId),
])

export const priceListRules = pgTable('price_list_rules', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  priceListId: integer('price_list_id').notNull().references(() => priceLists.id, { onDelete: 'cascade' }),
  attribute: text('attribute').notNull(),
  operator: priceRuleOperator('operator').notNull().default('eq'),
  value: jsonb('value').notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [
  uniqueIndex('price_list_rules_list_attr_uniq').on(t.priceListId, t.attribute).where(sql`${t.deletedAt} IS NULL`),
  index('price_list_rules_list_id_idx').on(t.priceListId),
])

declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    priceSets: typeof priceSets
    priceLists: typeof priceLists
    prices: typeof prices
    priceRules: typeof priceRules
    priceListRules: typeof priceListRules
  }
}
