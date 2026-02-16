import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRegisterResolvers = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('@czo/kit/graphql', () => ({
  registerResolvers: mockRegisterResolvers,
}))

vi.mock('../services/admin-guard', () => ({
  requireAdmin: mockRequireAdmin,
}))

// eslint-disable-next-line import/first
import './admin-resolvers'

type ResolverFn = (...args: unknown[]) => Promise<unknown>
interface ResolverMap {
  Query: Record<string, ResolverFn>
  Mutation: Record<string, ResolverFn>
}

const resolvers = mockRegisterResolvers.mock.calls[0]![0] as ResolverMap

describe('admin resolvers', () => {
  const mockHeaders = new Headers({ authorization: 'Bearer test-token' })
  const mockRequest = { headers: mockHeaders } as Request

  const mockAuthInstance = {
    api: {
      listUsers: vi.fn(),
      impersonateUser: vi.fn(),
      stopImpersonating: vi.fn(),
      banUser: vi.fn(),
      unbanUser: vi.fn(),
      setRole: vi.fn(),
      removeUser: vi.fn(),
      revokeUserSession: vi.fn(),
      revokeUserSessions: vi.fn(),
    },
  }

  const mockAuthRestrictions = {
    getEffectiveConfig: vi.fn(),
  }

  const mockAuthEvents = {
    impersonationStarted: vi.fn(),
    impersonationStopped: vi.fn(),
    userBanned: vi.fn(),
    userUnbanned: vi.fn(),
  }

  const mockContext = {
    auth: {
      session: {
        id: 's1',
        userId: 'u1',
        expiresAt: new Date(),
        actorType: 'admin',
        authMethod: 'email',
        organizationId: null,
        impersonatedBy: null,
      },
      user: {
        id: 'u1',
        email: 'admin@czo.dev',
        name: 'Admin',
        twoFactorEnabled: false,
        role: 'admin',
        banned: false,
        banReason: null,
      },
      actorType: 'admin',
      organization: null,
      authSource: 'bearer' as const,
    },
    authInstance: mockAuthInstance,
    authRestrictions: mockAuthRestrictions,
    authEvents: mockAuthEvents,
    request: mockRequest,
  }

  beforeEach(() => {
    Object.values(mockAuthInstance.api).forEach(fn => fn.mockReset())
    mockAuthRestrictions.getEffectiveConfig.mockReset()
    mockRequireAdmin.mockReset()
    Object.values(mockAuthEvents).forEach(fn => fn.mockReset())
  })

  it('should register resolvers with Query and Mutation', () => {
    expect(mockRegisterResolvers).toHaveBeenCalledTimes(1)
    expect(resolvers.Query).toBeDefined()
    expect(resolvers.Mutation).toBeDefined()
  })

  describe('query.adminUsers', () => {
    it('should call requireAdmin and list users with mapped fields', async () => {
      const apiUsers = [{ id: 'u2', name: 'User', email: 'user@czo.dev', role: 'user', banned: false, banReason: null, banExpires: null, createdAt: new Date('2026-01-01') }]
      mockAuthInstance.api.listUsers.mockResolvedValue({ users: apiUsers, total: 1 })

      const result = await resolvers.Query.adminUsers!(null, { limit: 10, offset: 0 }, mockContext) as { users: unknown[], total: number }

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockAuthInstance.api.listUsers).toHaveBeenCalledWith({
        headers: mockHeaders,
        query: { limit: 10, offset: 0 },
      })
      expect(result.total).toBe(1)
      expect(result.users).toHaveLength(1)
      expect(result.users[0]).toEqual(expect.objectContaining({ id: 'u2', role: 'user' }))
    })

    it('should default role to user when undefined in API response', async () => {
      const apiUsers = [{ id: 'u2', name: 'User', email: 'user@czo.dev', banned: false, createdAt: new Date() }]
      mockAuthInstance.api.listUsers.mockResolvedValue({ users: apiUsers, total: 1 })

      const result = await resolvers.Query.adminUsers!(null, {}, mockContext) as { users: { role: string }[] }

      expect(result.users[0]!.role).toBe('user')
    })

    it('should default limit to 10 and offset to 0', async () => {
      mockAuthInstance.api.listUsers.mockResolvedValue({ users: [], total: 0 })

      await resolvers.Query.adminUsers!(null, {}, mockContext)

      expect(mockAuthInstance.api.listUsers).toHaveBeenCalledWith({
        headers: mockHeaders,
        query: { limit: 10, offset: 0 },
      })
    })

    it('should pass searchValue and searchField when search is provided', async () => {
      mockAuthInstance.api.listUsers.mockResolvedValue({ users: [], total: 0 })

      await resolvers.Query.adminUsers!(null, { search: 'test' }, mockContext)

      expect(mockAuthInstance.api.listUsers).toHaveBeenCalledWith({
        headers: mockHeaders,
        query: { limit: 10, offset: 0, searchValue: 'test', searchField: 'email' },
      })
    })

    it('should return empty users and 0 total when listUsers returns null', async () => {
      mockAuthInstance.api.listUsers.mockResolvedValue(null)

      const result = await resolvers.Query.adminUsers!(null, {}, mockContext)

      expect(result).toEqual({ users: [], total: 0 })
    })
  })

  describe('mutation.adminImpersonateUser', () => {
    it('should call requireAdmin, check restrictions, impersonate, and emit event', async () => {
      mockAuthRestrictions.getEffectiveConfig.mockResolvedValue({ allowImpersonation: true })
      mockAuthInstance.api.impersonateUser.mockResolvedValue({})

      const result = await resolvers.Mutation.adminImpersonateUser!(
        null,
        { userId: 'u2' },
        mockContext,
      )

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockAuthRestrictions.getEffectiveConfig).toHaveBeenCalledWith('u2')
      expect(mockAuthInstance.api.impersonateUser).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { userId: 'u2' },
      })
      expect(mockAuthEvents.impersonationStarted).toHaveBeenCalledWith({
        adminUserId: 'u1',
        targetUserId: 'u2',
      })
      expect(result).toBe(true)
    })

    it('should throw FORBIDDEN when impersonation is not allowed for target user', async () => {
      mockAuthRestrictions.getEffectiveConfig.mockResolvedValue({ allowImpersonation: false })

      await expect(
        resolvers.Mutation.adminImpersonateUser!(null, { userId: 'u-admin' }, mockContext),
      ).rejects.toThrow('Impersonation is not allowed for this user')

      expect(mockAuthInstance.api.impersonateUser).not.toHaveBeenCalled()
      expect(mockAuthEvents.impersonationStarted).not.toHaveBeenCalled()
    })
  })

  describe('mutation.adminStopImpersonation', () => {
    it('should call requireAdmin, stop impersonation, and emit event', async () => {
      mockAuthInstance.api.stopImpersonating.mockResolvedValue({})

      const result = await resolvers.Mutation.adminStopImpersonation!(null, {}, mockContext)

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockAuthInstance.api.stopImpersonating).toHaveBeenCalledWith({
        headers: mockHeaders,
      })
      expect(mockAuthEvents.impersonationStopped).toHaveBeenCalledWith({
        adminUserId: 'u1',
        targetUserId: 'u1',
      })
      expect(result).toBe(true)
    })
  })

  describe('mutation.adminBanUser', () => {
    it('should call requireAdmin, ban user, and emit event', async () => {
      mockAuthInstance.api.banUser.mockResolvedValue({})

      const result = await resolvers.Mutation.adminBanUser!(
        null,
        { userId: 'u2', reason: 'spam', expiresIn: 3600 },
        mockContext,
      )

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockAuthInstance.api.banUser).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { userId: 'u2', banReason: 'spam', banExpiresIn: 3600 },
      })
      expect(mockAuthEvents.userBanned).toHaveBeenCalledWith({
        userId: 'u2',
        bannedBy: 'u1',
        reason: 'spam',
        expiresIn: 3600,
      })
      expect(result).toBe(true)
    })

    it('should ban user without reason or expiresIn', async () => {
      mockAuthInstance.api.banUser.mockResolvedValue({})

      await resolvers.Mutation.adminBanUser!(null, { userId: 'u2' }, mockContext)

      expect(mockAuthInstance.api.banUser).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { userId: 'u2' },
      })
      expect(mockAuthEvents.userBanned).toHaveBeenCalledWith({
        userId: 'u2',
        bannedBy: 'u1',
        reason: null,
        expiresIn: null,
      })
    })
  })

  describe('mutation.adminUnbanUser', () => {
    it('should call requireAdmin, unban user, and emit event', async () => {
      mockAuthInstance.api.unbanUser.mockResolvedValue({})

      const result = await resolvers.Mutation.adminUnbanUser!(null, { userId: 'u2' }, mockContext)

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockAuthInstance.api.unbanUser).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { userId: 'u2' },
      })
      expect(mockAuthEvents.userUnbanned).toHaveBeenCalledWith({
        userId: 'u2',
        unbannedBy: 'u1',
      })
      expect(result).toBe(true)
    })
  })

  describe('mutation.adminSetRole', () => {
    it('should call requireAdmin and set role', async () => {
      mockAuthInstance.api.setRole.mockResolvedValue({})

      const result = await resolvers.Mutation.adminSetRole!(
        null,
        { userId: 'u2', role: 'admin' },
        mockContext,
      )

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockAuthInstance.api.setRole).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { userId: 'u2', role: 'admin' },
      })
      expect(result).toBe(true)
    })
  })

  describe('mutation.adminRemoveUser', () => {
    it('should call requireAdmin and remove user', async () => {
      mockAuthInstance.api.removeUser.mockResolvedValue({})

      const result = await resolvers.Mutation.adminRemoveUser!(null, { userId: 'u2' }, mockContext)

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockAuthInstance.api.removeUser).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { userId: 'u2' },
      })
      expect(result).toBe(true)
    })
  })

  describe('mutation.adminRevokeSession', () => {
    it('should call requireAdmin and revoke session by token', async () => {
      mockAuthInstance.api.revokeUserSession.mockResolvedValue({})

      const result = await resolvers.Mutation.adminRevokeSession!(
        null,
        { sessionToken: 'tok-abc' },
        mockContext,
      )

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockAuthInstance.api.revokeUserSession).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { sessionToken: 'tok-abc' },
      })
      expect(result).toBe(true)
    })
  })

  describe('mutation.adminRevokeSessions', () => {
    it('should call requireAdmin and revoke all sessions for user', async () => {
      mockAuthInstance.api.revokeUserSessions.mockResolvedValue({})

      const result = await resolvers.Mutation.adminRevokeSessions!(
        null,
        { userId: 'u2' },
        mockContext,
      )

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockAuthInstance.api.revokeUserSessions).toHaveBeenCalledWith({
        headers: mockHeaders,
        body: { userId: 'u2' },
      })
      expect(result).toBe(true)
    })
  })
})
