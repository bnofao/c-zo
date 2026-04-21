// User sub-module — Pothos type definitions
//
// Session type ownership: `user` module owns `Session` (admin-scoped list).
// The account module uses `MySession` for self-service session listing.
// Rationale: userSessions(userId) is an admin query; the session relation is
// user-scoped (sessions.userId → users.id), matching the user domain.
//
// Relations available (relations.ts): apps.installedByUser, apps.webhookDeliveries,
// apps.apiKeys, webhookDeliveries.app, apikeys.installedApp.
// NOTE: users/sessions/accounts do NOT appear in authRelations — they're
// managed by better-auth and have no defineRelationsPart entries. Therefore
// t.relation('sessions') and t.relation('accounts') are NOT used here.

export function registerUserTypes(builder: any): void {
  // ── Session type (admin-scoped view) ──────────────────────────────────────
  (builder as any).objectRef('Session').implement({
    fields: (t: any) => ({
      id: t.id({ resolve: (s: any) => s.id }),
      userId: t.string({ resolve: (s: any) => s.userId }),
      expiresAt: t.field({ type: 'DateTime', resolve: (s: any) => s.expiresAt }),
      createdAt: t.field({ type: 'DateTime', resolve: (s: any) => s.createdAt }),
      ipAddress: t.string({ resolve: (s: any) => s.ipAddress ?? null, nullable: true }),
      userAgent: t.string({ resolve: (s: any) => s.userAgent ?? null, nullable: true }),
      impersonatedBy: t.string({ resolve: (s: any) => s.impersonatedBy ?? null, nullable: true }),
      actorType: t.string({ resolve: (s: any) => s.actorType }),
    }),
  });

  // ── User node ─────────────────────────────────────────────────────────────
  (builder as any).drizzleNode('users', {
    name: 'User',
    id: { column: (u: any) => u.id },
    fields: (t: any) => ({
      name: t.exposeString('name'),
      email: t.exposeString('email'),
      emailVerified: t.exposeBoolean('emailVerified'),
      image: t.exposeString('image', { nullable: true }),
      role: t.string({ resolve: (u: any) => u.role ?? 'user' }),
      banned: t.exposeBoolean('banned'),
      banReason: t.exposeString('banReason', { nullable: true }),
      banExpires: t.expose('banExpires', { type: 'DateTime', nullable: true }),
      twoFactorEnabled: t.exposeBoolean('twoFactorEnabled', { nullable: true }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
  })
}
