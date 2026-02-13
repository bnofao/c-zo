import type { DomainEvent, EventMap, EventPayload } from '@czo/kit/event-bus'
import type {
  AuthEventType,
  AuthSessionCreatedPayload,
  AuthSessionRevokedPayload,
  AuthUserRegisteredPayload,
  AuthUserUpdatedPayload,
} from './types'
import { describe, expect, it } from 'vitest'
import { AUTH_EVENTS } from './types'

describe('auth event types', () => {
  describe('auth events constants', () => {
    it('should define all 8 routing keys', () => {
      expect(Object.keys(AUTH_EVENTS)).toHaveLength(8)
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

    it('should have correct routing keys for future org events', () => {
      expect(AUTH_EVENTS.ORG_CREATED).toBe('auth.org.created')
      expect(AUTH_EVENTS.ORG_MEMBER_ADDED).toBe('auth.org.member.added')
      expect(AUTH_EVENTS.ORG_MEMBER_REMOVED).toBe('auth.org.member.removed')
      expect(AUTH_EVENTS.ORG_ROLE_CHANGED).toBe('auth.org.role.changed')
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
        jwtId: 'jwt-1',
        userId: 'u1',
        reason: 'user_initiated',
      }
      expect(p.reason).toBe('user_initiated')
    })

    it('should allow sessionId or jwtId on AuthSessionRevokedPayload', () => {
      const withSession: AuthSessionRevokedPayload = {
        sessionId: 's1',
        userId: 'u1',
        reason: 'admin_revoked',
      }
      const withJwt: AuthSessionRevokedPayload = {
        jwtId: 'jwt-1',
        userId: 'u1',
        reason: 'user_initiated',
      }
      expect(withSession.sessionId).toBe('s1')
      expect(withJwt.jwtId).toBe('jwt-1')
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
      ]
      expect(types).toHaveLength(8)
    })
  })
})
