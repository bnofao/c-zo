// App sub-module — Pothos type definitions
//
// apps table is c-zo native (not better-auth managed).
// NOTE: apps has NO version column and NO deletedAt column in the actual DB schema
// (confirmed from schema.ts). Status field is used instead of soft delete.
//
// Relations available (authRelations):
//   apps.installedByUser → users (one)
//   apps.webhookDeliveries → webhookDeliveries (many)
//   apps.apiKeys → apikeys (many)

export function registerAppTypes(builder: any): void {
  // ── WebhookDelivery type ──────────────────────────────────────────────────
  (builder as any).drizzleNode('webhookDeliveries', {
    name: 'WebhookDelivery',
    id: { column: (w: any) => w.id },
    fields: (t: any) => ({
      event: t.exposeString('event'),
      status: t.exposeString('status'),
      attempts: t.exposeInt('attempts', { nullable: true }),
      responseCode: t.exposeInt('responseCode', { nullable: true }),
      lastAttemptAt: t.expose('lastAttemptAt', { type: 'DateTime', nullable: true }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      app: t.relation('app'),
    }),
  });

  // ── App node ──────────────────────────────────────────────────────────────
  (builder as any).drizzleNode('apps', {
    name: 'App',
    id: { column: (a: any) => a.id },
    fields: (t: any) => ({
      appId: t.exposeString('appId'),
      status: t.exposeString('status'),
      organizationId: t.exposeString('organizationId', { nullable: true }),
      installedBy: t.exposeString('installedBy'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
      installedByUser: t.relation('installedByUser', { nullable: true }),
      webhookDeliveries: t.relatedConnection('webhookDeliveries', { cursor: 'id' }),
      apiKeys: t.relatedConnection('apiKeys', { cursor: 'id' }),
    }),
  })
}
