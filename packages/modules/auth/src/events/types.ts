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
  actorType?: string
}

export interface AuthUserUpdatedPayload {
  userId: string
  changes: Record<string, unknown>
}

export interface AuthSessionCreatedPayload {
  sessionId: string
  userId: string
  actorType?: string
  authMethod?: string
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
  actorType?: string
}

export interface Auth2FADisabledPayload {
  userId: string
  actorType?: string
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

export interface AuthRestrictionDeniedPayload {
  actorType?: string
  authMethod?: string
  userId: string
  reason: string
}

export interface AuthImpersonationStartedPayload {
  adminUserId: string
  targetUserId: string
}

export interface AuthImpersonationStoppedPayload {
  adminUserId: string
  targetUserId: string
}

export interface AuthUserBannedPayload {
  userId: string
  bannedBy: string
  reason: string | null
  expiresIn: number | null
}

export interface AuthUserUnbannedPayload {
  userId: string
  unbannedBy: string
}

export interface AuthPasswordResetRequestedPayload {
  email: string
  userName: string
  url: string
  token: string
}

export interface AuthVerificationEmailRequestedPayload {
  email: string
  userName: string
  url: string
  token: string
}

export interface AuthInvitationRequestedPayload {
  email: string
  organizationName: string
  inviterName: string
  invitationId: string
}

// ─── Security notification payloads ───────────────────────────────────

export interface AuthPasswordChangedPayload {
  userId: string
  email: string
}

export interface AuthNewDeviceLoginPayload {
  userId: string
  sessionId: string
  ipAddress: string | null
  userAgent: string | null
}

export interface AuthLoginFailedAlertPayload {
  email: string
  ipAddress: string | null
  reason: string
}

export interface AuthAccountDeletedPayload {
  userId: string
  email: string
}

// ─── App system payloads ───────────────────────────────────────────────

export interface AuthAppInstalledPayload {
  /** Manifest ID (e.g. 'stripe-payments') — used to update status */
  appId: string
  /** URL of the app's registration endpoint */
  registerUrl: string
  /** Raw API key value to transmit to the app */
  apiKey: string
  /** User who triggered the installation */
  installedBy: string
}

export interface AuthAppUninstalledPayload {
  appId: string
}

export interface AuthAppManifestUpdatedPayload {
  appId: string
  /** New manifest version string */
  version: string
}

export interface AuthAppStatusChangedPayload {
  appId: string
  status: string
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
  RESTRICTION_DENIED: 'auth.restriction.denied',
  IMPERSONATION_STARTED: 'auth.admin.impersonation.started',
  IMPERSONATION_STOPPED: 'auth.admin.impersonation.stopped',
  USER_BANNED: 'auth.admin.user.banned',
  USER_UNBANNED: 'auth.admin.user.unbanned',
  PASSWORD_RESET_REQUESTED: 'auth.email.password-reset-requested',
  VERIFICATION_EMAIL_REQUESTED: 'auth.email.verification-requested',
  INVITATION_REQUESTED: 'auth.email.invitation-requested',
  PASSWORD_CHANGED: 'auth.security.password-changed',
  NEW_DEVICE_LOGIN: 'auth.security.new-device-login',
  LOGIN_FAILED_ALERT: 'auth.security.login-failed-alert',
  ACCOUNT_DELETED: 'auth.security.account-deleted',
  APP_INSTALLED: 'auth.app.installed',
  APP_UNINSTALLED: 'auth.app.uninstalled',
  APP_MANIFEST_UPDATED: 'auth.app.manifest-updated',
  APP_STATUS_CHANGED: 'auth.app.status-changed',
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
    'auth.restriction.denied': AuthRestrictionDeniedPayload
    'auth.admin.impersonation.started': AuthImpersonationStartedPayload
    'auth.admin.impersonation.stopped': AuthImpersonationStoppedPayload
    'auth.admin.user.banned': AuthUserBannedPayload
    'auth.admin.user.unbanned': AuthUserUnbannedPayload
    'auth.email.password-reset-requested': AuthPasswordResetRequestedPayload
    'auth.email.verification-requested': AuthVerificationEmailRequestedPayload
    'auth.email.invitation-requested': AuthInvitationRequestedPayload
    'auth.security.password-changed': AuthPasswordChangedPayload
    'auth.security.new-device-login': AuthNewDeviceLoginPayload
    'auth.security.login-failed-alert': AuthLoginFailedAlertPayload
    'auth.security.account-deleted': AuthAccountDeletedPayload
    'auth.app.installed': AuthAppInstalledPayload
    'auth.app.uninstalled': AuthAppUninstalledPayload
    'auth.app.manifest-updated': AuthAppManifestUpdatedPayload
    'auth.app.status-changed': AuthAppStatusChangedPayload
  }
}
