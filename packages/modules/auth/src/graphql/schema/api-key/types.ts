// ApiKey sub-module — Pothos type definitions
//
// Relations available (relations.ts): apikeys.installedApp (→ apps).
// This is a one-way relation from apikeys to apps. Used via t.relation.
// The key secret/hash is never exposed — only safe metadata fields.

export function registerApiKeyTypes(builder: any): void {
  (builder as any).drizzleNode('apikeys', {
    name: 'ApiKey',
    id: { column: (k: any) => k.id },
    fields: (t: any) => ({
      name: t.exposeString('name', { nullable: true }),
      prefix: t.exposeString('prefix', { nullable: true }),
      start: t.exposeString('start', { nullable: true }),
      enabled: t.exposeBoolean('enabled'),
      rateLimitEnabled: t.exposeBoolean('rateLimitEnabled'),
      rateLimitTimeWindow: t.exposeInt('rateLimitTimeWindow', { nullable: true }),
      rateLimitMax: t.exposeInt('rateLimitMax', { nullable: true }),
      refillInterval: t.exposeInt('refillInterval', { nullable: true }),
      refillAmount: t.exposeInt('refillAmount', { nullable: true }),
      requestCount: t.exposeInt('requestCount'),
      remaining: t.exposeInt('remaining', { nullable: true }),
      permissions: t.exposeString('permissions', { nullable: true }),
      expiresAt: t.expose('expiresAt', { type: 'DateTime', nullable: true }),
      lastRequest: t.expose('lastRequest', { type: 'DateTime', nullable: true }),
      lastRefillAt: t.expose('lastRefillAt', { type: 'DateTime', nullable: true }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
      userId: t.exposeString('userId'),
      installedApp: t.relation('installedApp', { nullable: true }),
    }),
  })
}
