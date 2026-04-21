import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1, // Optional: customize sequence start
    increment: 1, // Optional: customize increment amount
  }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),

  // Two factor
  twoFactorEnabled: boolean('two_factor_enabled'),

  // Role and access
  role: text('role'),
  banned: boolean('banned'),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { precision: 6, withTimezone: true }),

  createdAt: timestamp('created_at', { precision: 6, withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, withTimezone: true }).notNull(),
})

export const sessions = pgTable('sessions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1, // Optional: customize sequence start
    increment: 1, // Optional: customize increment amount
  }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),

  // Actor
  actorType: text('actor_type').notNull(),

  // Organization
  activeOrganizationId: text('active_organization_id'),

  // Uuser impersonation
  impersonatedBy: text('impersonated_by'),

	expiresAt: timestamp("expires_at", { precision: 6, withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true }).notNull(),
})

export const accounts = pgTable('accounts', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1, // Optional: customize sequence start
    increment: 1, // Optional: customize increment amount
  }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { precision: 6, withTimezone: true }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { precision: 6, withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true }).notNull(),
})

export const verifications = pgTable('verifications', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1, // Optional: customize sequence start
    increment: 1, // Optional: customize increment amount
  }),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
	expiresAt: timestamp("expires_at", { precision: 6, withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true }).notNull(),
})

export const organizations = pgTable('organizations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1, // Optional: customize sequence start
    increment: 1, // Optional: customize increment amount
  }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  type: text('type'),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, withTimezone: true }),
})

export const members = pgTable('members', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1, // Optional: customize sequence start
    increment: 1, // Optional: customize increment amount
  }),
  organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull(),
})

export const invitations = pgTable('invitations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1, // Optional: customize sequence start
    increment: 1, // Optional: customize increment amount
  }),
  organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').notNull(),
  expiresAt: timestamp('expires_at', { precision: 6, withTimezone: true }).notNull(),
  inviterId: integer('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull(),
})

export const twoFactor = pgTable('two_factors', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1, // Optional: customize sequence start
    increment: 1, // Optional: customize increment amount
  }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
})

export const apps = pgTable('apps', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1, // Optional: customize sequence start
    increment: 1, // Optional: customize increment amount
  }),
  appId: text('app_id').notNull().unique(),
  manifest: jsonb('manifest').notNull(),
  status: text('status').notNull().default('active'),
  webhookSecret: text('webhook_secret').notNull().default(''),
  installedBy: text('installed_by').notNull().references(() => users.id),
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

export const apikeys = pgTable('apikeys', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1, // Optional: customize sequence start
    increment: 1, // Optional: customize increment amount
  }),
	configId: text("config_id").notNull(),
  name: text('name'),
  start: text('start'),
  prefix: text('prefix'),
  key: text('key').notNull(),
	referenceId: integer("reference_id").notNull(),
  refillInterval: integer('refill_interval'),
  refillAmount: integer('refill_amount'),
	lastRefillAt: timestamp("last_refill_at", { precision: 6, withTimezone: true }),
  enabled: boolean('enabled'),
  rateLimitEnabled: boolean('rate_limit_enabled'),
  rateLimitTimeWindow: integer('rate_limit_time_window'),
  rateLimitMax: integer('rate_limit_max'),
  requestCount: integer('request_count'),
  remaining: integer('remaining'),
  permissions: text('permissions'),
  metadata: text('metadata'),

  installedAppId: integer('installed_app_id').references(() => apps.id, { onDelete: 'cascade' }),

	lastRequest: timestamp("last_request", { precision: 6, withTimezone: true }),
	expiresAt: timestamp("expires_at", { precision: 6, withTimezone: true }),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true }).notNull(),
}, t => [
  index('apikey_reference_id_idx').on(t.referenceId),
  index('apikey_config_id_idx').on(t.configId),
])

export type UserSchema = typeof users
export type AccountSchema = typeof accounts
export type SessionSchema = typeof sessions
export type OrganizationSchema = typeof organizations
