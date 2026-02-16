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
  /** Database session ID */
  sessionId?: string
  userId: string
  reason: 'user_initiated' | 'admin_revoked' | 'expired'
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

export interface Auth2FAEnabledPayload {
  userId: string
  actorType: string
}

export interface Auth2FADisabledPayload {
  userId: string
  actorType: string
}

export interface AuthApiKeyCreatedPayload {
  apiKeyId: string
  userId: string
  name: string | null
  prefix: string | null
}

export interface AuthApiKeyRevokedPayload {
  apiKeyId: string
  userId: string
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
  TWO_FA_ENABLED: 'auth.2fa.enabled',
  TWO_FA_DISABLED: 'auth.2fa.disabled',
  API_KEY_CREATED: 'auth.api-key.created',
  API_KEY_REVOKED: 'auth.api-key.revoked',
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
    'auth.2fa.enabled': Auth2FAEnabledPayload
    'auth.2fa.disabled': Auth2FADisabledPayload
    'auth.api-key.created': AuthApiKeyCreatedPayload
    'auth.api-key.revoked': AuthApiKeyRevokedPayload
  }
}
