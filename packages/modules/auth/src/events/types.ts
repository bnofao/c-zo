/**
 * Auth module domain event types.
 *
 * Uses declaration merging to extend the shared EventMap in @czo/kit/event-bus,
 * giving compile-time safety for event payloads across the monorepo.
 */

// ─── Payload interfaces ────────────────────────────────────────────────

export interface AuthUserRegisteredPayload {
  userId: string
  email: string
  actorType: string
}

export interface AuthUserUpdatedPayload {
  userId: string
  changes: Record<string, unknown>
}

export interface AuthSessionCreatedPayload {
  sessionId: string
  userId: string
  actorType: string
  authMethod: string
}

export interface AuthSessionRevokedPayload {
  /** Database session ID (available from admin revocation or token rotation) */
  sessionId?: string
  /** JWT token ID from the jti claim (available from user-initiated sign-out) */
  jwtId?: string
  userId: string
  reason: 'user_initiated' | 'admin_revoked' | 'token_rotation' | 'expired'
}

export interface AuthOrgCreatedPayload {
  orgId: string
  ownerId: string
  name: string
  type: string | null
}

export interface AuthOrgMemberAddedPayload {
  orgId: string
  userId: string
  role: string
}

export interface AuthOrgMemberRemovedPayload {
  orgId: string
  userId: string
}

export interface AuthOrgRoleChangedPayload {
  orgId: string
  userId: string
  previousRole: string
  newRole: string
}

// ─── Routing key constants ─────────────────────────────────────────────

export const AUTH_EVENTS = {
  USER_REGISTERED: 'auth.user.registered',
  USER_UPDATED: 'auth.user.updated',
  SESSION_CREATED: 'auth.session.created',
  SESSION_REVOKED: 'auth.session.revoked',
  ORG_CREATED: 'auth.org.created',
  ORG_MEMBER_ADDED: 'auth.org.member.added',
  ORG_MEMBER_REMOVED: 'auth.org.member.removed',
  ORG_ROLE_CHANGED: 'auth.org.role.changed',
} as const

export type AuthEventType = (typeof AUTH_EVENTS)[keyof typeof AUTH_EVENTS]

// ─── EventMap declaration merging ──────────────────────────────────────

declare module '@czo/kit/event-bus' {
  interface EventMap {
    'auth.user.registered': AuthUserRegisteredPayload
    'auth.user.updated': AuthUserUpdatedPayload
    'auth.session.created': AuthSessionCreatedPayload
    'auth.session.revoked': AuthSessionRevokedPayload
    'auth.org.created': AuthOrgCreatedPayload
    'auth.org.member.added': AuthOrgMemberAddedPayload
    'auth.org.member.removed': AuthOrgMemberRemovedPayload
    'auth.org.role.changed': AuthOrgRoleChangedPayload
  }
}
