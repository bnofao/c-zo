import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import type { SessionRow, UserCounts } from '../../../services/user'
import { Effect } from 'effect'
import { AccessService, mergePermissions } from '../../../services/access'

/** One resource bucket of a user's effective (role-resolved) permissions. */
interface PermissionGroup { resource: string, actions: string[] }

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
  builder.objectRef<SessionRow>('Session').implement({
    subGraphs: ['admin'],
    description: 'An authenticated session belonging to a user, viewed in an admin-scoped context.',
    fields: t => ({
      id: t.id({ description: 'Unique identifier of the session.', resolve: s => s.id }),
      userId: t.string({ description: 'Identifier of the user that owns this session.', resolve: s => String(s.userId) }),
      expiresAt: t.field({ description: 'Timestamp at which the session expires and is no longer valid.', type: 'DateTime', resolve: s => s.expiresAt }),
      createdAt: t.field({ description: 'Timestamp at which the session was created.', type: 'DateTime', resolve: s => s.createdAt }),
      ipAddress: t.string({ description: 'IP address from which the session was established.', resolve: s => s.ipAddress, nullable: true }),
      userAgent: t.string({ description: 'User-agent string of the client that established the session.', resolve: s => s.userAgent, nullable: true }),
      impersonatedBy: t.string({ description: 'Identifier of the admin user impersonating the session owner, if this is an impersonation session.', resolve: s => s.impersonatedBy, nullable: true }),
      actorType: t.string({ description: 'Type of actor that owns the session, distinguishing users from other principals.', resolve: s => s.actorType }),
    }),
  })

  // ── Permission (effective, role-resolved access bucket) ───────────────────
  const permissionRef = builder.objectRef<PermissionGroup>('Permission').implement({
    subGraphs: ['admin'],
    description: 'A resource and the set of actions the user is permitted to perform on it, resolved from the user\'s roles.',
    fields: t => ({
      resource: t.exposeString('resource', { description: 'The protected resource (e.g. "user", "session").' }),
      actions: t.exposeStringList('actions', { description: 'Actions the user may perform on this resource (e.g. "read", "create").' }),
    }),
  })

  // ── UserCounts (admin filter-tab totals) ──────────────────────────────────
  builder.objectRef<UserCounts>('UserCounts').implement({
    subGraphs: ['admin'],
    description: 'Live (non-deleted) user totals per admin filter bucket, used to badge the user-management tabs.',
    fields: t => ({
      all: t.exposeInt('all', { description: 'Total number of live users.' }),
      admins: t.exposeInt('admins', { description: 'Number of live users with the global "admin" role.' }),
      unverified: t.exposeInt('unverified', { description: 'Number of live users whose email is not yet verified.' }),
      banned: t.exposeInt('banned', { description: 'Number of live users that are currently banned.' }),
    }),
  })

  // ── RoleTier / RoleHierarchy (role-picker registry) ───────────────────────
  const roleTierRef = builder.objectRef<{ name: string }>('RoleTier').implement({
    subGraphs: ['admin'],
    description: 'A single assignable role tier, e.g. "admin:manager". Tiers within a hierarchy are cumulative (higher tiers include lower ones).',
    fields: t => ({
      name: t.exposeString('name', { description: 'Full CSV role token stored on the user (e.g. "admin:manager").' }),
    }),
  })

  builder.objectRef<{ name: string, tiers: { name: string }[] }>('RoleHierarchy').implement({
    subGraphs: ['admin'],
    description: 'A role hierarchy (domain) and its assignable tiers in cumulative order. A user may hold at most one tier per hierarchy.',
    fields: t => ({
      name: t.exposeString('name', { description: 'Hierarchy/domain name (e.g. "admin", "product").' }),
      tiers: t.field({ type: [roleTierRef], description: 'Assignable tiers, lowest → highest.', resolve: h => h.tiers }),
    }),
  })

  // ── User node ─────────────────────────────────────────────────────────────
  builder.drizzleNode('users', {
    name: 'User',
    subGraphs: ['admin'],
    description: 'A platform account, identified globally and distinct from per-organization memberships.',
    id: { column: u => u.id },
    fields: t => ({
      name: t.exposeString('name', { description: 'Display name of the user.' }),
      email: t.exposeString('email', { description: 'Email address used to identify and contact the user.' }),
      emailVerified: t.exposeBoolean('emailVerified', { description: 'Whether the user has confirmed ownership of their email address.' }),
      image: t.exposeString('image', { description: 'URL of the user\'s avatar image.', nullable: true }),
      accounts: t.field({
        type: ['String'],
        nullable: false,
        description: 'Provider IDs of the user\'s linked login accounts (e.g. "credential" once a password is set, or an OAuth provider). Empty for an invited user who has not yet accepted the invitation.',
        // Batch-load the accounts relation into the parent query via the
        // Pothos-drizzle select sink; limit to `providerId` (never load password hashes).
        extensions: { pothosDrizzleSelect: { with: { accounts: { columns: { providerId: true } } } } },
        resolve: (u) => {
          const accounts = (u as { accounts?: { providerId: string }[] }).accounts ?? []
          return accounts.map(a => a.providerId)
        },
      }),
      role: t.string({ description: 'Platform-level global role of the user, distinct from per-organization membership roles; defaults to "user".', resolve: u => u.role ?? 'user' }),
      permissions: t.field({
        type: [permissionRef],
        description: 'Effective permissions resolved from the user\'s CSV roles via the access-control hierarchies (cumulative). The authoritative source for client-side RBAC gating; the server remains the security boundary.',
        resolve: (u, _args, ctx) => ctx.runEffect(Effect.gen(function* () {
          const access = yield* AccessService
          const names = (u.role ?? '').split(',').map(s => s.trim()).filter(Boolean)
          let merged: Record<string, string[]> = {}
          for (const name of names) {
            const acRole = yield* access.role(name)
            if (acRole)
              merged = mergePermissions(merged, acRole.statements as Record<string, string[]>) as Record<string, string[]>
          }
          return Object.entries(merged).map(([resource, actions]) => ({ resource, actions }))
        })) as never,
      }),
      banned: t.exposeBoolean('banned', { description: 'Whether the user is currently banned from the platform.', nullable: true }),
      banReason: t.exposeString('banReason', { description: 'Reason recorded for the user\'s ban.', nullable: true }),
      banExpires: t.expose('banExpires', { description: 'Timestamp at which the user\'s ban expires, or null for a permanent ban.', type: 'DateTime', nullable: true }),
      twoFactorEnabled: t.exposeBoolean('twoFactorEnabled', { description: 'Whether two-factor authentication is enabled for the user.', nullable: true }),
      createdAt: t.expose('createdAt', { description: 'Timestamp at which the user account was created.', type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { description: 'Timestamp at which the user account was last updated.', type: 'DateTime' }),
    }),
  })
}
