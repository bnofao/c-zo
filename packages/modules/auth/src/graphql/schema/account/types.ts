// Account sub-module — Pothos type definitions
//
// Session type is owned by the user sub-module (Session).
// This module defines MySession for the authenticated user's self-service view
// (mySessions query) — a separate type to avoid conflicts with admin Session.
//
// LinkedAccount (maps to `accounts` DB table) exposes only non-sensitive fields.
// Credentials (accessToken, refreshToken, password) are never exposed in GraphQL.

export function registerAccountTypes(builder: any): void {
  // ── MySession — self-service session view ─────────────────────────────────
  (builder as any).objectRef('MySession').implement({
    fields: (t: any) => ({
      id: t.id({ resolve: (s: any) => s.id }),
      token: t.string({ resolve: (s: any) => s.token }),
      userId: t.string({ resolve: (s: any) => s.userId }),
      expiresAt: t.field({ type: 'DateTime', resolve: (s: any) => s.expiresAt }),
      createdAt: t.field({ type: 'DateTime', resolve: (s: any) => s.createdAt }),
      ipAddress: t.string({ resolve: (s: any) => s.ipAddress ?? null, nullable: true }),
      userAgent: t.string({ resolve: (s: any) => s.userAgent ?? null, nullable: true }),
    }),
  });

  // ── LinkedAccount — safe view of `accounts` table ─────────────────────────
  // Does NOT use drizzleNode — accounts are queried via better-auth and
  // returned as plain objects; no globalID needed for linked accounts.
  (builder as any).objectRef('LinkedAccount').implement({
    fields: (t: any) => ({
      id: t.id({ resolve: (a: any) => a.id }),
      providerId: t.string({ resolve: (a: any) => a.providerId }),
      accountId: t.string({ resolve: (a: any) => a.accountId }),
      scope: t.string({ resolve: (a: any) => a.scope ?? null, nullable: true }),
      createdAt: t.field({ type: 'DateTime', resolve: (a: any) => a.createdAt }),
      updatedAt: t.field({ type: 'DateTime', resolve: (a: any) => a.updatedAt }),
    }),
  })
}
