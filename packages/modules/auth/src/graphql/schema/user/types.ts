import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'

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

export function registerUserTypes(builder: AuthGraphQLSchemaBuilder): void {
  // ── Session type (admin-scoped view) ──────────────────────────────────────
  builder.objectRef('Session').implement({
    description: 'An authenticated session belonging to a user, viewed in an admin-scoped context.',
    fields: t => ({
      id: t.id({ description: 'Unique identifier of the session.', resolve: (s: any) => s.id }),
      userId: t.string({ description: 'Identifier of the user that owns this session.', resolve: (s: any) => s.userId }),
      expiresAt: t.field({ description: 'Timestamp at which the session expires and is no longer valid.', type: 'DateTime', resolve: (s: any) => s.expiresAt }),
      createdAt: t.field({ description: 'Timestamp at which the session was created.', type: 'DateTime', resolve: (s: any) => s.createdAt }),
      ipAddress: t.string({ description: 'IP address from which the session was established.', resolve: (s: any) => s.ipAddress ?? null, nullable: true }),
      userAgent: t.string({ description: 'User-agent string of the client that established the session.', resolve: (s: any) => s.userAgent ?? null, nullable: true }),
      impersonatedBy: t.string({ description: 'Identifier of the admin user impersonating the session owner, if this is an impersonation session.', resolve: (s: any) => s.impersonatedBy ?? null, nullable: true }),
      actorType: t.string({ description: 'Type of actor that owns the session, distinguishing users from other principals.', resolve: (s: any) => s.actorType }),
    }),
  })

  // ── User node ─────────────────────────────────────────────────────────────
  builder.drizzleNode('users', {
    name: 'User',
    description: 'A platform account, identified globally and distinct from per-organization memberships.',
    id: { column: (u: any) => u.id },
    fields: t => ({
      name: t.exposeString('name', { description: 'Display name of the user.' }),
      email: t.exposeString('email', { description: 'Email address used to identify and contact the user.' }),
      emailVerified: t.exposeBoolean('emailVerified', { description: 'Whether the user has confirmed ownership of their email address.' }),
      image: t.exposeString('image', { description: 'URL of the user\'s avatar image.', nullable: true }),
      role: t.string({ description: 'Platform-level global role of the user, distinct from per-organization membership roles; defaults to "user".', resolve: u => u.role ?? 'user' }),
      banned: t.exposeBoolean('banned', { description: 'Whether the user is currently banned from the platform.', nullable: true }),
      banReason: t.exposeString('banReason', { description: 'Reason recorded for the user\'s ban.', nullable: true }),
      banExpires: t.expose('banExpires', { description: 'Timestamp at which the user\'s ban expires, or null for a permanent ban.', type: 'DateTime', nullable: true }),
      twoFactorEnabled: t.exposeBoolean('twoFactorEnabled', { description: 'Whether two-factor authentication is enabled for the user.', nullable: true }),
      createdAt: t.expose('createdAt', { description: 'Timestamp at which the user account was created.', type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { description: 'Timestamp at which the user account was last updated.', type: 'DateTime' }),
    }),
  })
}
