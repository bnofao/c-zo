// ApiKey sub-module — Pothos type definitions
//
// The key secret/hash is never exposed — only safe metadata fields.
// Note: installedApp relation is not yet wired (installedAppId column commented out in schema).
//
// BC NOTE (SP3): `enabled` was exposed as `Boolean!` pre-SP3. The DB column
// is `boolean('enabled').default(true)` (no notNull) — strict typing is
// `Boolean` (nullable). Clients querying `enabled` should treat null as the
// default (true) until/unless the column is migrated to NOT NULL.

import type { AuthGraphQLSchemaBuilder } from '../../index'

export function registerApiKeyTypes(builder: AuthGraphQLSchemaBuilder): void {
  builder.drizzleNode('apikeys', {
    name: 'ApiKey',
    id: { column: k => k.id },
    fields: t => ({
      name: t.exposeString('name', { nullable: true }),
      prefix: t.exposeString('prefix', { nullable: true }),
      start: t.exposeString('start', { nullable: true }),
      enabled: t.exposeBoolean('enabled', { nullable: true }),
      rateLimitEnabled: t.exposeBoolean('rateLimitEnabled', { nullable: true }),
      rateLimitTimeWindow: t.exposeInt('rateLimitTimeWindow', { nullable: true }),
      rateLimitMax: t.exposeInt('rateLimitMax', { nullable: true }),
      refillInterval: t.exposeInt('refillInterval', { nullable: true }),
      refillAmount: t.exposeInt('refillAmount', { nullable: true }),
      requestCount: t.exposeInt('requestCount', { nullable: true }),
      remaining: t.exposeInt('remaining', { nullable: true }),
      expiresAt: t.expose('expiresAt', { type: 'DateTime', nullable: true }),
      lastRequest: t.expose('lastRequest', { type: 'DateTime', nullable: true }),
      lastRefillAt: t.expose('lastRefillAt', { type: 'DateTime', nullable: true }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
      referenceType: t.exposeString('reference'),
      referenceId: t.exposeInt('referenceId', { nullable: true }),
    }),
  })
}
