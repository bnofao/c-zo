import type { DomainEvent, EventMap, EventPayload } from '@czo/kit/event-bus'
import type {
  Auth2FADisabledPayload,
  Auth2FAEnabledPayload,
  AuthAccountDeletedPayload,
  AuthApiKeyCreatedPayload,
  AuthApiKeyRevokedPayload,
  AuthEventType,
  AuthImpersonationStartedPayload,
  AuthImpersonationStoppedPayload,
  AuthInvitationRequestedPayload,
  AuthLoginFailedAlertPayload,
  AuthNewDeviceLoginPayload,
  AuthPasswordChangedPayload,
  AuthPasswordResetRequestedPayload,
  AuthRestrictionDeniedPayload,
  AuthSessionCreatedPayload,
  AuthSessionRevokedPayload,
  AuthUserBannedPayload,
  AuthUserRegisteredPayload,
  AuthUserUnbannedPayload,
  AuthUserUpdatedPayload,
  AuthVerificationEmailRequestedPayload,
} from './types'
import { describe, expect, it } from 'vitest'
import { AUTH_EVENTS } from './types'

describe('auth event types', () => {
  describe('auth events constants', () => {
    it('should define all 20 routing keys', () => {
      expect(Object.keys(AUTH_EVENTS)).toHaveLength(24)
    })

    it('should use auth.* dot-delimited prefix', () => {
      for (const key of Object.values(AUTH_EVENTS)) {
        expect(key).toMatch(/^auth\./)
      }
    })

    it('should have correct routing keys for active events', () => {
      expect(AUTH_EVENTS.USER_REGISTERED).toBe('auth.user.registered')
      expect(AUTH_EVENTS.USER_UPDATED).toBe('auth.user.updated')
      expect(AUTH_EVENTS.SESSION_CREATED).toBe('auth.session.created')
      expect(AUTH_EVENTS.SESSION_REVOKED).toBe('auth.session.revoked')
    })

    it('should have correct routing keys for org events', () => {
      expect(AUTH_EVENTS.ORG_CREATED).toBe('auth.org.created')
      expect(AUTH_EVENTS.ORG_MEMBER_ADDED).toBe('auth.org.member.added')
      expect(AUTH_EVENTS.ORG_MEMBER_REMOVED).toBe('auth.org.member.removed')
      expect(AUTH_EVENTS.ORG_ROLE_CHANGED).toBe('auth.org.role.changed')
    })

    it('should have correct routing keys for 2FA events', () => {
      expect(AUTH_EVENTS.TWO_FA_ENABLED).toBe('auth.2fa.enabled')
      expect(AUTH_EVENTS.TWO_FA_DISABLED).toBe('auth.2fa.disabled')
    })

    it('should have correct routing keys for API key events', () => {
      expect(AUTH_EVENTS.API_KEY_CREATED).toBe('auth.api-key.created')
      expect(AUTH_EVENTS.API_KEY_REVOKED).toBe('auth.api-key.revoked')
    })

    it('should have correct routing key for restriction denied event', () => {
      expect(AUTH_EVENTS.RESTRICTION_DENIED).toBe('auth.restriction.denied')
    })

    it('should have correct routing keys for admin events', () => {
      expect(AUTH_EVENTS.IMPERSONATION_STARTED).toBe('auth.admin.impersonation.started')
      expect(AUTH_EVENTS.IMPERSONATION_STOPPED).toBe('auth.admin.impersonation.stopped')
      expect(AUTH_EVENTS.USER_BANNED).toBe('auth.admin.user.banned')
      expect(AUTH_EVENTS.USER_UNBANNED).toBe('auth.admin.user.unbanned')
    })

    it('should have correct routing keys for email events', () => {
      expect(AUTH_EVENTS.PASSWORD_RESET_REQUESTED).toBe('auth.email.password-reset-requested')
      expect(AUTH_EVENTS.VERIFICATION_EMAIL_REQUESTED).toBe('auth.email.verification-requested')
      expect(AUTH_EVENTS.INVITATION_REQUESTED).toBe('auth.email.invitation-requested')
    })

    it('should have correct routing keys for security notification events', () => {
      expect(AUTH_EVENTS.PASSWORD_CHANGED).toBe('auth.security.password-changed')
      expect(AUTH_EVENTS.NEW_DEVICE_LOGIN).toBe('auth.security.new-device-login')
      expect(AUTH_EVENTS.LOGIN_FAILED_ALERT).toBe('auth.security.login-failed-alert')
      expect(AUTH_EVENTS.ACCOUNT_DELETED).toBe('auth.security.account-deleted')
    })
  })

  describe('eventMap declaration merging (compile-time)', () => {
    it('should type-check auth.user.registered payload via EventMap', () => {
      const payload: EventMap['auth.user.registered'] = {
        userId: 'u1',
        email: 'test@czo.dev',
        actorType: 'customer',
      }
      expect(payload.userId).toBe('u1')
    })

    it('should type-check auth.session.created payload via EventPayload', () => {
      const payload: EventPayload<'auth.session.created'> = {
        sessionId: 's1',
        userId: 'u1',
        actorType: 'admin',
        authMethod: 'email',
      }
      expect(payload.sessionId).toBe('s1')
    })

    it('should type-check DomainEvent generic with auth event', () => {
      const event: DomainEvent<AuthUserRegisteredPayload> = {
        id: 'e1',
        type: 'auth.user.registered',
        timestamp: new Date().toISOString(),
        payload: { userId: 'u1', email: 'test@czo.dev', actorType: 'customer' },
        metadata: { source: 'auth', version: 1 },
      }
      expect(event.payload.email).toBe('test@czo.dev')
    })
  })

  describe('payload interfaces', () => {
    it('should enforce required fields on AuthUserRegisteredPayload', () => {
      const p: AuthUserRegisteredPayload = {
        userId: 'u1',
        email: 'a@b.c',
        actorType: 'customer',
      }
      expect(p).toEqual({ userId: 'u1', email: 'a@b.c', actorType: 'customer' })
    })

    it('should enforce required fields on AuthUserUpdatedPayload', () => {
      const p: AuthUserUpdatedPayload = {
        userId: 'u1',
        changes: { name: 'New Name' },
      }
      expect(p.changes).toEqual({ name: 'New Name' })
    })

    it('should enforce required fields on AuthSessionCreatedPayload', () => {
      const p: AuthSessionCreatedPayload = {
        sessionId: 's1',
        userId: 'u1',
        actorType: 'customer',
        authMethod: 'email',
      }
      expect(p.authMethod).toBe('email')
    })

    it('should enforce reason union on AuthSessionRevokedPayload', () => {
      const p: AuthSessionRevokedPayload = {
        sessionId: 's1',
        userId: 'u1',
        reason: 'user_initiated',
      }
      expect(p.reason).toBe('user_initiated')
    })

    it('should allow optional sessionId on AuthSessionRevokedPayload', () => {
      const withSession: AuthSessionRevokedPayload = {
        sessionId: 's1',
        userId: 'u1',
        reason: 'admin_revoked',
      }
      const withoutSession: AuthSessionRevokedPayload = {
        userId: 'u1',
        reason: 'user_initiated',
      }
      expect(withSession.sessionId).toBe('s1')
      expect(withoutSession.sessionId).toBeUndefined()
    })

    it('should enforce required fields on Auth2FAEnabledPayload', () => {
      const p: Auth2FAEnabledPayload = {
        userId: 'u1',
        actorType: 'customer',
      }
      expect(p).toEqual({ userId: 'u1', actorType: 'customer' })
    })

    it('should enforce required fields on Auth2FADisabledPayload', () => {
      const p: Auth2FADisabledPayload = {
        userId: 'u1',
        actorType: 'admin',
      }
      expect(p).toEqual({ userId: 'u1', actorType: 'admin' })
    })

    it('should enforce required fields on AuthApiKeyCreatedPayload', () => {
      const p: AuthApiKeyCreatedPayload = {
        apiKeyId: 'ak1',
        userId: 'u1',
        name: 'My Key',
        prefix: 'czo_',
      }
      expect(p.apiKeyId).toBe('ak1')
      expect(p.name).toBe('My Key')
    })

    it('should allow null name and prefix on AuthApiKeyCreatedPayload', () => {
      const p: AuthApiKeyCreatedPayload = {
        apiKeyId: 'ak1',
        userId: 'u1',
        name: null,
        prefix: null,
      }
      expect(p.name).toBeNull()
      expect(p.prefix).toBeNull()
    })

    it('should enforce required fields on AuthApiKeyRevokedPayload', () => {
      const p: AuthApiKeyRevokedPayload = {
        apiKeyId: 'ak1',
        userId: 'u1',
      }
      expect(p).toEqual({ apiKeyId: 'ak1', userId: 'u1' })
    })

    it('should enforce required fields on AuthRestrictionDeniedPayload', () => {
      const p: AuthRestrictionDeniedPayload = {
        actorType: 'customer',
        authMethod: 'oauth:github',
        userId: 'u1',
        reason: 'Not allowed',
      }
      expect(p).toEqual({ actorType: 'customer', authMethod: 'oauth:github', userId: 'u1', reason: 'Not allowed' })
    })

    it('should enforce required fields on AuthImpersonationStartedPayload', () => {
      const p: AuthImpersonationStartedPayload = {
        adminUserId: 'u1',
        targetUserId: 'u2',
      }
      expect(p).toEqual({ adminUserId: 'u1', targetUserId: 'u2' })
    })

    it('should enforce required fields on AuthImpersonationStoppedPayload', () => {
      const p: AuthImpersonationStoppedPayload = {
        adminUserId: 'u1',
        targetUserId: 'u2',
      }
      expect(p).toEqual({ adminUserId: 'u1', targetUserId: 'u2' })
    })

    it('should enforce required fields on AuthUserBannedPayload', () => {
      const p: AuthUserBannedPayload = {
        userId: 'u2',
        bannedBy: 'u1',
        reason: 'spam',
        expiresIn: 3600,
      }
      expect(p.userId).toBe('u2')
      expect(p.reason).toBe('spam')
    })

    it('should allow null reason and expiresIn on AuthUserBannedPayload', () => {
      const p: AuthUserBannedPayload = {
        userId: 'u2',
        bannedBy: 'u1',
        reason: null,
        expiresIn: null,
      }
      expect(p.reason).toBeNull()
      expect(p.expiresIn).toBeNull()
    })

    it('should enforce required fields on AuthUserUnbannedPayload', () => {
      const p: AuthUserUnbannedPayload = {
        userId: 'u2',
        unbannedBy: 'u1',
      }
      expect(p).toEqual({ userId: 'u2', unbannedBy: 'u1' })
    })

    it('should enforce required fields on AuthPasswordResetRequestedPayload', () => {
      const p: AuthPasswordResetRequestedPayload = {
        email: 'test@czo.dev',
        userName: 'Test',
        url: 'http://reset',
        token: 'tok',
      }
      expect(p.email).toBe('test@czo.dev')
    })

    it('should enforce required fields on AuthVerificationEmailRequestedPayload', () => {
      const p: AuthVerificationEmailRequestedPayload = {
        email: 'test@czo.dev',
        userName: 'Test',
        url: 'http://verify',
        token: 'tok',
      }
      expect(p.email).toBe('test@czo.dev')
    })

    it('should enforce required fields on AuthInvitationRequestedPayload', () => {
      const p: AuthInvitationRequestedPayload = {
        email: 'test@czo.dev',
        organizationName: 'Acme',
        inviterName: 'Admin',
        invitationId: 'inv1',
      }
      expect(p.organizationName).toBe('Acme')
    })

    it('should enforce required fields on AuthPasswordChangedPayload', () => {
      const p: AuthPasswordChangedPayload = {
        userId: 'u1',
        email: 'test@czo.dev',
      }
      expect(p).toEqual({ userId: 'u1', email: 'test@czo.dev' })
    })

    it('should enforce required fields on AuthNewDeviceLoginPayload', () => {
      const p: AuthNewDeviceLoginPayload = {
        userId: 'u1',
        sessionId: 's1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      }
      expect(p.ipAddress).toBe('192.168.1.1')
    })

    it('should allow null ipAddress and userAgent on AuthNewDeviceLoginPayload', () => {
      const p: AuthNewDeviceLoginPayload = {
        userId: 'u1',
        sessionId: 's1',
        ipAddress: null,
        userAgent: null,
      }
      expect(p.ipAddress).toBeNull()
      expect(p.userAgent).toBeNull()
    })

    it('should enforce required fields on AuthLoginFailedAlertPayload', () => {
      const p: AuthLoginFailedAlertPayload = {
        email: 'test@czo.dev',
        ipAddress: '10.0.0.1',
        reason: 'invalid_credentials',
      }
      expect(p.reason).toBe('invalid_credentials')
    })

    it('should allow null ipAddress on AuthLoginFailedAlertPayload', () => {
      const p: AuthLoginFailedAlertPayload = {
        email: 'test@czo.dev',
        ipAddress: null,
        reason: 'invalid_credentials',
      }
      expect(p.ipAddress).toBeNull()
    })

    it('should enforce required fields on AuthAccountDeletedPayload', () => {
      const p: AuthAccountDeletedPayload = {
        userId: 'u1',
        email: 'test@czo.dev',
      }
      expect(p).toEqual({ userId: 'u1', email: 'test@czo.dev' })
    })
  })

  describe('authEventType union', () => {
    it('should accept valid event type strings', () => {
      const types: AuthEventType[] = [
        'auth.user.registered',
        'auth.user.updated',
        'auth.session.created',
        'auth.session.revoked',
        'auth.org.created',
        'auth.org.member.added',
        'auth.org.member.removed',
        'auth.org.role.changed',
        'auth.2fa.enabled',
        'auth.2fa.disabled',
        'auth.api-key.created',
        'auth.api-key.revoked',
        'auth.restriction.denied',
        'auth.admin.impersonation.started',
        'auth.admin.impersonation.stopped',
        'auth.admin.user.banned',
        'auth.admin.user.unbanned',
        'auth.email.password-reset-requested',
        'auth.email.verification-requested',
        'auth.email.invitation-requested',
        'auth.security.password-changed',
        'auth.security.new-device-login',
        'auth.security.login-failed-alert',
        'auth.security.account-deleted',
      ]
      expect(types).toHaveLength(24)
    })
  })
})
