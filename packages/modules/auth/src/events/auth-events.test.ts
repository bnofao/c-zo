import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_EVENTS } from './types'

const mockPublish = vi.hoisted(() => vi.fn())
const mockUseEventBus = vi.hoisted(() => vi.fn(() => Promise.resolve({ publish: mockPublish })))
const mockCreateDomainEvent = vi.hoisted(() => vi.fn((opts: { type: string, payload: unknown, metadata: unknown }) => ({
  id: 'evt-123',
  type: opts.type,
  timestamp: '2026-01-01T00:00:00.000Z',
  payload: opts.payload,
  metadata: { source: 'auth', version: 1, ...opts.metadata as object },
})))

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

vi.mock('@czo/kit/event-bus', () => ({
  useEventBus: mockUseEventBus,
  createDomainEvent: mockCreateDomainEvent,
}))

vi.mock('@czo/kit', () => ({
  useLogger: () => mockLogger,
}))

// eslint-disable-next-line import/first
import { publishAuthEvent, resetPublishAuthEvent } from './auth-events'

const eventCases = [
  [AUTH_EVENTS.USER_REGISTERED, { userId: 'u1', email: 'test@czo.dev', actorType: 'customer' }],
  [AUTH_EVENTS.USER_UPDATED, { userId: 'u1', changes: { name: 'New Name' } }],
  [AUTH_EVENTS.SESSION_CREATED, { sessionId: 's1', userId: 'u1', actorType: 'admin', authMethod: 'email' }],
  [AUTH_EVENTS.SESSION_REVOKED, { sessionId: 's1', userId: 'u1', reason: 'user_initiated' as const }],
  [AUTH_EVENTS.ORG_CREATED, { orgId: 'org1', ownerId: 'u1', name: 'My Org', type: 'merchant' as string | null }],
  [AUTH_EVENTS.ORG_MEMBER_ADDED, { orgId: 'org1', userId: 'u2', role: 'member' }],
  [AUTH_EVENTS.ORG_MEMBER_REMOVED, { orgId: 'org1', userId: 'u2' }],
  [AUTH_EVENTS.ORG_ROLE_CHANGED, { orgId: 'org1', userId: 'u2', previousRole: 'member', newRole: 'admin' }],
  [AUTH_EVENTS.TWO_FA_ENABLED, { userId: 'u1', actorType: 'customer' }],
  [AUTH_EVENTS.TWO_FA_DISABLED, { userId: 'u1', actorType: 'admin' }],
  [AUTH_EVENTS.API_KEY_CREATED, { apiKeyId: 'ak1', userId: 'u1', name: 'My Key', prefix: 'czo_' }],
  [AUTH_EVENTS.API_KEY_REVOKED, { apiKeyId: 'ak1', userId: 'u1' }],
  [AUTH_EVENTS.RESTRICTION_DENIED, { actorType: 'customer', authMethod: 'oauth:github', userId: 'u1', reason: 'Not allowed' }],
  [AUTH_EVENTS.IMPERSONATION_STARTED, { adminUserId: 'u1', targetUserId: 'u2' }],
  [AUTH_EVENTS.IMPERSONATION_STOPPED, { adminUserId: 'u1', targetUserId: 'u2' }],
  [AUTH_EVENTS.USER_BANNED, { userId: 'u2', bannedBy: 'u1', reason: 'spam' as string | null, expiresIn: 3600 as number | null }],
  [AUTH_EVENTS.USER_UNBANNED, { userId: 'u2', unbannedBy: 'u1' }],
  [AUTH_EVENTS.PASSWORD_RESET_REQUESTED, { email: 'test@czo.dev', userName: 'Test', url: 'http://reset', token: 'tok' }],
  [AUTH_EVENTS.VERIFICATION_EMAIL_REQUESTED, { email: 'test@czo.dev', userName: 'Test', url: 'http://verify', token: 'tok' }],
  [AUTH_EVENTS.INVITATION_REQUESTED, { email: 'test@czo.dev', organizationName: 'Acme', inviterName: 'Admin', invitationId: 'inv1' }],
] as const

describe('publishAuthEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPublishAuthEvent()
  })

  it.each(eventCases)(
    'should publish %s event with correct payload',
    async (type, payload) => {
      await publishAuthEvent(type, payload as any)

      expect(mockCreateDomainEvent).toHaveBeenCalledWith({
        type,
        payload,
        metadata: { source: 'auth' },
      })
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ type, payload }),
      )
    },
  )

  describe('fire-and-forget error handling', () => {
    it('should catch and log errors without throwing', async () => {
      mockPublish.mockRejectedValueOnce(new Error('Bus offline'))

      await expect(
        publishAuthEvent(AUTH_EVENTS.USER_REGISTERED, { userId: 'u1', email: 'a@b.c', actorType: 'customer' }),
      ).resolves.toBeUndefined()

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('auth.user.registered'),
        'Bus offline',
      )
    })

    it('should catch errors when useEventBus fails', async () => {
      mockUseEventBus.mockRejectedValueOnce(new Error('Config missing'))

      await expect(
        publishAuthEvent(AUTH_EVENTS.SESSION_CREATED, {
          sessionId: 's1',
          userId: 'u1',
          actorType: 'customer',
          authMethod: 'email',
        }),
      ).resolves.toBeUndefined()

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('auth.session.created'),
        'Config missing',
      )
    })

    it('should retry useEventBus after a failure (clears cached rejection)', async () => {
      mockUseEventBus.mockRejectedValueOnce(new Error('Transient error'))

      // First call fails
      await publishAuthEvent(AUTH_EVENTS.USER_REGISTERED, { userId: 'u1', email: 'a@b.c', actorType: 'customer' })
      expect(mockLogger.warn).toHaveBeenCalledTimes(1)

      // Second call should retry useEventBus (not reuse cached rejection)
      mockUseEventBus.mockResolvedValueOnce({ publish: mockPublish })
      await publishAuthEvent(AUTH_EVENTS.USER_UPDATED, { userId: 'u1', changes: { name: 'X' } })

      expect(mockUseEventBus).toHaveBeenCalledTimes(2)
      expect(mockPublish).toHaveBeenCalled()
    })
  })

  describe('lazy bus resolution', () => {
    it('should call useEventBus only once across multiple publishes', async () => {
      await publishAuthEvent(AUTH_EVENTS.USER_REGISTERED, { userId: 'u1', email: 'a@b.c', actorType: 'customer' })
      await publishAuthEvent(AUTH_EVENTS.USER_UPDATED, { userId: 'u1', changes: { name: 'X' } })
      await publishAuthEvent(AUTH_EVENTS.SESSION_CREATED, { sessionId: 's1', userId: 'u1', actorType: 'admin', authMethod: 'email' })

      expect(mockUseEventBus).toHaveBeenCalledTimes(1)
    })
  })
})
