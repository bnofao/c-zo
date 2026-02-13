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
import { AuthEventsService } from './auth-events'

describe('authEventsService', () => {
  let service: AuthEventsService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new AuthEventsService()
  })

  describe('userRegistered', () => {
    it('should publish auth.user.registered event with correct payload', async () => {
      const payload = { userId: 'u1', email: 'test@czo.dev', actorType: 'customer' }

      await service.userRegistered(payload)

      expect(mockCreateDomainEvent).toHaveBeenCalledWith({
        type: AUTH_EVENTS.USER_REGISTERED,
        payload,
        metadata: { source: 'auth' },
      })
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AUTH_EVENTS.USER_REGISTERED,
          payload,
        }),
      )
    })
  })

  describe('userUpdated', () => {
    it('should publish auth.user.updated event with correct payload', async () => {
      const payload = { userId: 'u1', changes: { name: 'New Name' } }

      await service.userUpdated(payload)

      expect(mockCreateDomainEvent).toHaveBeenCalledWith({
        type: AUTH_EVENTS.USER_UPDATED,
        payload,
        metadata: { source: 'auth' },
      })
      expect(mockPublish).toHaveBeenCalled()
    })
  })

  describe('sessionCreated', () => {
    it('should publish auth.session.created event with correct payload', async () => {
      const payload = { sessionId: 's1', userId: 'u1', actorType: 'admin', authMethod: 'email' }

      await service.sessionCreated(payload)

      expect(mockCreateDomainEvent).toHaveBeenCalledWith({
        type: AUTH_EVENTS.SESSION_CREATED,
        payload,
        metadata: { source: 'auth' },
      })
      expect(mockPublish).toHaveBeenCalled()
    })
  })

  describe('sessionRevoked', () => {
    it('should publish auth.session.revoked event with correct payload', async () => {
      const payload = { sessionId: 's1', userId: 'u1', reason: 'user_initiated' as const }

      await service.sessionRevoked(payload)

      expect(mockCreateDomainEvent).toHaveBeenCalledWith({
        type: AUTH_EVENTS.SESSION_REVOKED,
        payload,
        metadata: { source: 'auth' },
      })
      expect(mockPublish).toHaveBeenCalled()
    })
  })

  describe('orgCreated', () => {
    it('should publish auth.org.created event with correct payload', async () => {
      const payload = { orgId: 'org1', ownerId: 'u1', name: 'My Org', type: 'merchant' as string | null }

      await service.orgCreated(payload)

      expect(mockCreateDomainEvent).toHaveBeenCalledWith({
        type: AUTH_EVENTS.ORG_CREATED,
        payload,
        metadata: { source: 'auth' },
      })
      expect(mockPublish).toHaveBeenCalled()
    })
  })

  describe('orgMemberAdded', () => {
    it('should publish auth.org.member.added event with correct payload', async () => {
      const payload = { orgId: 'org1', userId: 'u2', role: 'member' }

      await service.orgMemberAdded(payload)

      expect(mockCreateDomainEvent).toHaveBeenCalledWith({
        type: AUTH_EVENTS.ORG_MEMBER_ADDED,
        payload,
        metadata: { source: 'auth' },
      })
      expect(mockPublish).toHaveBeenCalled()
    })
  })

  describe('orgMemberRemoved', () => {
    it('should publish auth.org.member.removed event with correct payload', async () => {
      const payload = { orgId: 'org1', userId: 'u2' }

      await service.orgMemberRemoved(payload)

      expect(mockCreateDomainEvent).toHaveBeenCalledWith({
        type: AUTH_EVENTS.ORG_MEMBER_REMOVED,
        payload,
        metadata: { source: 'auth' },
      })
      expect(mockPublish).toHaveBeenCalled()
    })
  })

  describe('orgRoleChanged', () => {
    it('should publish auth.org.role.changed event with correct payload', async () => {
      const payload = { orgId: 'org1', userId: 'u2', previousRole: 'member', newRole: 'admin' }

      await service.orgRoleChanged(payload)

      expect(mockCreateDomainEvent).toHaveBeenCalledWith({
        type: AUTH_EVENTS.ORG_ROLE_CHANGED,
        payload,
        metadata: { source: 'auth' },
      })
      expect(mockPublish).toHaveBeenCalled()
    })
  })

  describe('twoFactorEnabled', () => {
    it('should publish auth.2fa.enabled event with correct payload', async () => {
      const payload = { userId: 'u1', actorType: 'customer' }

      await service.twoFactorEnabled(payload)

      expect(mockCreateDomainEvent).toHaveBeenCalledWith({
        type: AUTH_EVENTS.TWO_FA_ENABLED,
        payload,
        metadata: { source: 'auth' },
      })
      expect(mockPublish).toHaveBeenCalled()
    })
  })

  describe('twoFactorDisabled', () => {
    it('should publish auth.2fa.disabled event with correct payload', async () => {
      const payload = { userId: 'u1', actorType: 'admin' }

      await service.twoFactorDisabled(payload)

      expect(mockCreateDomainEvent).toHaveBeenCalledWith({
        type: AUTH_EVENTS.TWO_FA_DISABLED,
        payload,
        metadata: { source: 'auth' },
      })
      expect(mockPublish).toHaveBeenCalled()
    })
  })

  describe('safePublish (fire-and-forget)', () => {
    it('should catch and log errors without throwing', async () => {
      mockPublish.mockRejectedValueOnce(new Error('Bus offline'))

      await expect(
        service.userRegistered({ userId: 'u1', email: 'a@b.c', actorType: 'customer' }),
      ).resolves.toBeUndefined()

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('auth.user.registered'),
        'Bus offline',
      )
    })

    it('should catch errors when useEventBus fails', async () => {
      mockUseEventBus.mockRejectedValueOnce(new Error('Config missing'))
      const failService = new AuthEventsService()

      await expect(
        failService.sessionCreated({
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
      const retryService = new AuthEventsService()

      // First call fails
      await retryService.userRegistered({ userId: 'u1', email: 'a@b.c', actorType: 'customer' })
      expect(mockLogger.warn).toHaveBeenCalledTimes(1)

      // Second call should retry useEventBus (not reuse cached rejection)
      mockUseEventBus.mockResolvedValueOnce({ publish: mockPublish })
      await retryService.userUpdated({ userId: 'u1', changes: { name: 'X' } })

      // retryService calls useEventBus twice: once failing, once succeeding
      expect(mockUseEventBus).toHaveBeenCalledTimes(2)
      expect(mockPublish).toHaveBeenCalled()
    })
  })

  describe('lazy bus resolution', () => {
    it('should call useEventBus only once across multiple publishes', async () => {
      await service.userRegistered({ userId: 'u1', email: 'a@b.c', actorType: 'customer' })
      await service.userUpdated({ userId: 'u1', changes: { name: 'X' } })
      await service.sessionCreated({ sessionId: 's1', userId: 'u1', actorType: 'admin', authMethod: 'email' })

      expect(mockUseEventBus).toHaveBeenCalledTimes(1)
    })
  })
})
