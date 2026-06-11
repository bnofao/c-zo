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
    subGraphs: ['account', 'org'],
    description: 'A credential that authenticates a client. It is owned by either a user or an organization. The secret is stored hashed and never exposed; only safe metadata is returned here.',
    id: { column: k => k.id },
    fields: t => ({
      name: t.exposeString('name', { nullable: true, description: 'Human-readable label distinguishing this key from the owner\'s other keys.' }),
      prefix: t.exposeString('prefix', { nullable: true, description: 'Non-secret prefix prepended to the key, used to namespace or recognise it.' }),
      start: t.exposeString('start', { nullable: true, description: 'Non-secret leading characters of the key, kept for display so the key can be recognised without revealing the secret.' }),
      enabled: t.exposeBoolean('enabled', { nullable: true, description: 'Whether the key is active and accepted for authentication. A null value should be treated as the default (enabled).' }),
      rateLimitEnabled: t.exposeBoolean('rateLimitEnabled', { nullable: true, description: 'Whether request rate limiting is enforced for this key.' }),
      rateLimitTimeWindow: t.exposeInt('rateLimitTimeWindow', { nullable: true, description: 'Length of the rate-limit window in milliseconds.' }),
      rateLimitMax: t.exposeInt('rateLimitMax', { nullable: true, description: 'Maximum number of requests permitted within each rate-limit window.' }),
      refillInterval: t.exposeInt('refillInterval', { nullable: true, description: 'Interval in milliseconds between automatic refills of the remaining request budget.' }),
      refillAmount: t.exposeInt('refillAmount', { nullable: true, description: 'Number of requests added to the remaining budget at each refill interval.' }),
      requestCount: t.exposeInt('requestCount', { nullable: true, description: 'Total number of requests authenticated with this key so far.' }),
      remaining: t.exposeInt('remaining', { nullable: true, description: 'Remaining request budget before the key is throttled, or null when unlimited.' }),
      expiresAt: t.expose('expiresAt', { type: 'DateTime', nullable: true, description: 'Moment after which the key is no longer accepted, or null when it never expires.' }),
      lastRequest: t.expose('lastRequest', { type: 'DateTime', nullable: true, description: 'Timestamp of the most recent request authenticated with this key.' }),
      lastRefillAt: t.expose('lastRefillAt', { type: 'DateTime', nullable: true, description: 'Timestamp of the most recent budget refill.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Moment the key was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Moment the key was last modified.' }),
      referenceType: t.exposeString('reference', { description: 'Kind of owner this key belongs to, either a user or an organization.' }),
      referenceId: t.exposeInt('referenceId', { nullable: true, description: 'Identifier of the owning user or organization.' }),
    }),
  })
}
