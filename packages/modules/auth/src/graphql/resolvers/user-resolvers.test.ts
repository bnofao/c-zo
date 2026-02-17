import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRegisterResolvers = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('@czo/kit/graphql', () => ({
  registerResolvers: mockRegisterResolvers,
}))

vi.mock('../guards/admin-guard', () => ({
  requireAdmin: mockRequireAdmin,
  isAdmin: () =>
    (next: (...args: unknown[]) => unknown) =>
      (root: unknown, args: unknown, ctx: unknown, info: unknown) => {
        mockRequireAdmin(ctx)
        return next(root, args, ctx, info)
      },
}))

// eslint-disable-next-line import/first
import './user-resolvers'

type ResolverFn = (...args: unknown[]) => Promise<unknown>
interface ResolverMap {
  Query: Record<string, ResolverFn>
  Mutation: Record<string, ResolverFn>
}

const resolvers = mockRegisterResolvers.mock.calls[0]![0] as ResolverMap

describe('user resolvers', () => {
  const mockHeaders = new Headers({ authorization: 'Bearer test-token' })
  const mockRequest = { headers: mockHeaders } as Request

  const mockUserService = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    ban: vi.fn(),
    unban: vi.fn(),
    remove: vi.fn(),
    setRole: vi.fn(),
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeSessions: vi.fn(),
    impersonate: vi.fn(),
    stopImpersonating: vi.fn(),
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
    userService: mockUserService,
    authRestrictions: mockAuthRestrictions,
    authEvents: mockAuthEvents,
    request: mockRequest,
  }

  beforeEach(() => {
    Object.values(mockUserService).forEach(fn => fn.mockReset())
    mockAuthRestrictions.getEffectiveConfig.mockReset()
    mockRequireAdmin.mockReset()
    Object.values(mockAuthEvents).forEach(fn => fn.mockReset())
  })

  it('should register resolvers with Query and Mutation', () => {
    expect(mockRegisterResolvers).toHaveBeenCalledTimes(1)
    expect(resolvers.Query).toBeDefined()
    expect(resolvers.Mutation).toBeDefined()
  })

  describe('query.users', () => {
    it('should call requireAdmin and list users via userService', async () => {
      const serviceResult = {
        users: [{ id: 'u2', name: 'User', email: 'user@czo.dev', role: 'user', banned: false, banReason: null, banExpires: null, createdAt: new Date('2026-01-01') }],
        total: 1,
      }
      mockUserService.list.mockResolvedValue(serviceResult)

      const result = await resolvers.Query.users!(null, { limit: 10, offset: 0 }, mockContext) as { users: unknown[], total: number }

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockUserService.list).toHaveBeenCalledWith(mockHeaders, {
        limit: 10,
        offset: 0,
        search: undefined,
      })
      expect(result.total).toBe(1)
      expect(result.users).toHaveLength(1)
      expect(result.users[0]).toEqual(expect.objectContaining({ id: 'u2', role: 'user' }))
    })

    it('should pass search when provided', async () => {
      mockUserService.list.mockResolvedValue({ users: [], total: 0 })

      await resolvers.Query.users!(null, { search: 'test' }, mockContext)

      expect(mockUserService.list).toHaveBeenCalledWith(mockHeaders, {
        limit: undefined,
        offset: undefined,
        search: 'test',
      })
    })

    it('should default limit and offset to undefined when not provided', async () => {
      mockUserService.list.mockResolvedValue({ users: [], total: 0 })

      await resolvers.Query.users!(null, {}, mockContext)

      expect(mockUserService.list).toHaveBeenCalledWith(mockHeaders, {
        limit: undefined,
        offset: undefined,
        search: undefined,
      })
    })
  })

  describe('query.user', () => {
    it('should call userService.get with userId', async () => {
      const user = { id: 'u2', name: 'User', email: 'user@czo.dev', role: 'user', banned: false, banReason: null, banExpires: null, createdAt: new Date() }
      mockUserService.get.mockResolvedValue(user)

      const result = await resolvers.Query.user!(null, { userId: 'u2' }, mockContext)

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockUserService.get).toHaveBeenCalledWith(mockHeaders, 'u2')
      expect(result).toEqual(user)
    })
  })

  describe('query.userSessions', () => {
    it('should call userService.listSessions with userId', async () => {
      const sessions = [
        { id: 's1', userId: 'u2', expiresAt: new Date(), ipAddress: '127.0.0.1', userAgent: 'test', impersonatedBy: null, createdAt: new Date() },
      ]
      mockUserService.listSessions.mockResolvedValue(sessions)

      const result = await resolvers.Query.userSessions!(null, { userId: 'u2' }, mockContext)

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockUserService.listSessions).toHaveBeenCalledWith(mockHeaders, 'u2')
      expect(result).toEqual(sessions)
    })
  })

  describe('mutation.createUser', () => {
    it('should call userService.create with input', async () => {
      const user = { id: 'u-new', name: 'New User', email: 'new@czo.dev', role: 'user', banned: false, banReason: null, banExpires: null, createdAt: new Date() }
      mockUserService.create.mockResolvedValue(user)

      const result = await resolvers.Mutation.createUser!(
        null,
        { input: { email: 'new@czo.dev', name: 'New User' } },
        mockContext,
      )

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockUserService.create).toHaveBeenCalledWith(mockHeaders, {
        email: 'new@czo.dev',
        name: 'New User',
        password: undefined,
        role: undefined,
      })
      expect(result).toEqual(user)
    })

    it('should pass password and role when provided', async () => {
      mockUserService.create.mockResolvedValue({ id: 'u-new', name: 'Admin', email: 'admin@czo.dev', role: 'admin', banned: false, createdAt: new Date() })

      await resolvers.Mutation.createUser!(
        null,
        { input: { email: 'admin@czo.dev', name: 'Admin', password: 'secret', role: 'admin' } },
        mockContext,
      )

      expect(mockUserService.create).toHaveBeenCalledWith(mockHeaders, {
        email: 'admin@czo.dev',
        name: 'Admin',
        password: 'secret',
        role: 'admin',
      })
    })
  })

  describe('mutation.updateUser', () => {
    it('should call userService.update with userId and input', async () => {
      const user = { id: 'u2', name: 'Updated', email: 'user@czo.dev', role: 'user', banned: false, banReason: null, banExpires: null, createdAt: new Date() }
      mockUserService.update.mockResolvedValue(user)

      const result = await resolvers.Mutation.updateUser!(
        null,
        { userId: 'u2', input: { name: 'Updated' } },
        mockContext,
      )

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockUserService.update).toHaveBeenCalledWith(mockHeaders, 'u2', {
        name: 'Updated',
        email: undefined,
      })
      expect(result).toEqual(user)
    })
  })

  describe('mutation.impersonateUser', () => {
    it('should call requireAdmin, check restrictions, impersonate, and emit event', async () => {
      mockAuthRestrictions.getEffectiveConfig.mockResolvedValue({ allowImpersonation: true })
      mockUserService.impersonate.mockResolvedValue(true)

      const result = await resolvers.Mutation.impersonateUser!(
        null,
        { userId: 'u2' },
        mockContext,
      )

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockAuthRestrictions.getEffectiveConfig).toHaveBeenCalledWith('u2')
      expect(mockUserService.impersonate).toHaveBeenCalledWith(mockHeaders, 'u2')
      expect(mockAuthEvents.impersonationStarted).toHaveBeenCalledWith({
        adminUserId: 'u1',
        targetUserId: 'u2',
      })
      expect(result).toBe(true)
    })

    it('should throw FORBIDDEN when impersonation is not allowed for target user', async () => {
      mockAuthRestrictions.getEffectiveConfig.mockResolvedValue({ allowImpersonation: false })

      await expect(
        resolvers.Mutation.impersonateUser!(null, { userId: 'u-admin' }, mockContext),
      ).rejects.toThrow('Impersonation is not allowed for this user')

      expect(mockUserService.impersonate).not.toHaveBeenCalled()
      expect(mockAuthEvents.impersonationStarted).not.toHaveBeenCalled()
    })
  })

  describe('mutation.stopImpersonation', () => {
    it('should call requireAdmin, stop impersonation, and emit event', async () => {
      mockUserService.stopImpersonating.mockResolvedValue(true)

      const result = await resolvers.Mutation.stopImpersonation!(null, {}, mockContext)

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockUserService.stopImpersonating).toHaveBeenCalledWith(mockHeaders)
      expect(mockAuthEvents.impersonationStopped).toHaveBeenCalledWith({
        adminUserId: 'u1',
        targetUserId: 'u1',
      })
      expect(result).toBe(true)
    })
  })

  describe('mutation.banUser', () => {
    it('should call requireAdmin, ban user, and emit event', async () => {
      mockUserService.ban.mockResolvedValue({})

      const result = await resolvers.Mutation.banUser!(
        null,
        { userId: 'u2', reason: 'spam', expiresIn: 3600 },
        mockContext,
      )

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockUserService.ban).toHaveBeenCalledWith(mockHeaders, 'u2', 'spam', 3600)
      expect(mockAuthEvents.userBanned).toHaveBeenCalledWith({
        userId: 'u2',
        bannedBy: 'u1',
        reason: 'spam',
        expiresIn: 3600,
      })
      expect(result).toBe(true)
    })

    it('should ban user without reason or expiresIn', async () => {
      mockUserService.ban.mockResolvedValue({})

      await resolvers.Mutation.banUser!(null, { userId: 'u2' }, mockContext)

      expect(mockUserService.ban).toHaveBeenCalledWith(mockHeaders, 'u2', undefined, undefined)
      expect(mockAuthEvents.userBanned).toHaveBeenCalledWith({
        userId: 'u2',
        bannedBy: 'u1',
        reason: null,
        expiresIn: null,
      })
    })
  })

  describe('mutation.unbanUser', () => {
    it('should call requireAdmin, unban user, and emit event', async () => {
      mockUserService.unban.mockResolvedValue({})

      const result = await resolvers.Mutation.unbanUser!(null, { userId: 'u2' }, mockContext)

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockUserService.unban).toHaveBeenCalledWith(mockHeaders, 'u2')
      expect(mockAuthEvents.userUnbanned).toHaveBeenCalledWith({
        userId: 'u2',
        unbannedBy: 'u1',
      })
      expect(result).toBe(true)
    })
  })

  describe('mutation.setRole', () => {
    it('should call requireAdmin and set role', async () => {
      mockUserService.setRole.mockResolvedValue({})

      const result = await resolvers.Mutation.setRole!(
        null,
        { userId: 'u2', role: 'admin' },
        mockContext,
      )

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockUserService.setRole).toHaveBeenCalledWith(mockHeaders, 'u2', 'admin')
      expect(result).toBe(true)
    })
  })

  describe('mutation.removeUser', () => {
    it('should call requireAdmin and remove user', async () => {
      mockUserService.remove.mockResolvedValue(true)

      const result = await resolvers.Mutation.removeUser!(null, { userId: 'u2' }, mockContext)

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockUserService.remove).toHaveBeenCalledWith(mockHeaders, 'u2')
      expect(result).toBe(true)
    })
  })

  describe('mutation.revokeSession', () => {
    it('should call requireAdmin and revoke session by token', async () => {
      mockUserService.revokeSession.mockResolvedValue(true)

      const result = await resolvers.Mutation.revokeSession!(
        null,
        { sessionToken: 'tok-abc' },
        mockContext,
      )

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockUserService.revokeSession).toHaveBeenCalledWith(mockHeaders, 'tok-abc')
      expect(result).toBe(true)
    })
  })

  describe('mutation.revokeSessions', () => {
    it('should call requireAdmin and revoke all sessions for user', async () => {
      mockUserService.revokeSessions.mockResolvedValue(true)

      const result = await resolvers.Mutation.revokeSessions!(
        null,
        { userId: 'u2' },
        mockContext,
      )

      expect(mockRequireAdmin).toHaveBeenCalledWith(mockContext)
      expect(mockUserService.revokeSessions).toHaveBeenCalledWith(mockHeaders, 'u2')
      expect(result).toBe(true)
    })
  })
})
