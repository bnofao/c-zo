import type { UserService } from './user.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createUserService } from './user.service'

function createMockApi() {
  return {
    listUsers: vi.fn(),
    getUser: vi.fn(),
    createUser: vi.fn(),
    adminUpdateUser: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    removeUser: vi.fn(),
    setRole: vi.fn(),
    setUserPassword: vi.fn(),
    listUserSessions: vi.fn(),
    revokeUserSession: vi.fn(),
    revokeUserSessions: vi.fn(),
    impersonateUser: vi.fn(),
    stopImpersonating: vi.fn(),
  }
}

function createMockAuth() {
  return { api: createMockApi() } as unknown as Parameters<typeof createUserService>[0]
}

function api(auth: ReturnType<typeof createMockAuth>) {
  return (auth as unknown as { api: ReturnType<typeof createMockApi> }).api
}

const headers = new Headers({ authorization: 'Bearer test-token' })

describe('userService', () => {
  let auth: ReturnType<typeof createMockAuth>
  let service: UserService

  beforeEach(() => {
    auth = createMockAuth()
    service = createUserService(auth)
  })

  describe('list', () => {
    it('should call listUsers and pass through response', async () => {
      const response = {
        users: [{ id: 'u1', name: 'User One', email: 'one@test.com', role: 'admin', banned: false, banReason: null, banExpires: null, createdAt: new Date('2026-01-01') }],
        total: 1,
      }
      api(auth).listUsers.mockResolvedValue(response)

      const result = await service.list({}, headers)

      expect(api(auth).listUsers).toHaveBeenCalledWith({
        headers,
        query: {},
      })
      expect(result.total).toBe(1)
      expect(result.users[0]).toEqual(expect.objectContaining({ id: 'u1', role: 'admin' }))
    })

    it('should pass search params directly to API', async () => {
      api(auth).listUsers.mockResolvedValue({ users: [], total: 0 })

      await service.list({ limit: 5, offset: 10, searchValue: 'test', searchField: 'email' }, headers)

      expect(api(auth).listUsers).toHaveBeenCalledWith({
        headers,
        query: { limit: 5, offset: 10, searchValue: 'test', searchField: 'email' },
      })
    })

    it('should call listUsers without headers for server-side usage', async () => {
      api(auth).listUsers.mockResolvedValue({ users: [], total: 0 })

      await service.list({ limit: 10 })

      expect(api(auth).listUsers).toHaveBeenCalledWith({
        headers: undefined,
        query: { limit: 10 },
      })
    })

    it('should propagate API error', async () => {
      api(auth).listUsers.mockRejectedValue(new Error('API failure'))

      await expect(service.list({}, headers)).rejects.toThrow('API failure')
    })
  })

  describe('get', () => {
    it('should call getUser with userId', async () => {
      const user = { id: 'u1', name: 'Found', email: 'found@test.com', role: 'user', createdAt: new Date() }
      api(auth).getUser.mockResolvedValue(user)

      const result = await service.get('u1', headers)

      expect(api(auth).getUser).toHaveBeenCalledWith({
        headers,
        query: { id: 'u1' },
      })
      expect(result.id).toBe('u1')
    })

    it('should call getUser without headers for server-side usage', async () => {
      const user = { id: 'u1', name: 'Found', email: 'found@test.com', role: 'user', createdAt: new Date() }
      api(auth).getUser.mockResolvedValue(user)

      await service.get('u1')

      expect(api(auth).getUser).toHaveBeenCalledWith({
        headers: undefined,
        query: { id: 'u1' },
      })
    })

    it('should throw when getUser fails', async () => {
      api(auth).getUser.mockRejectedValue(new Error('not found'))

      await expect(service.get('unknown', headers)).rejects.toThrow('User not found: unknown')
    })
  })

  describe('create', () => {
    it('should call createUser with input', async () => {
      const user = { id: 'u-new', name: 'New User', email: 'new@test.com', role: 'user', createdAt: new Date() }
      api(auth).createUser.mockResolvedValue({ user })

      const result = await service.create({ email: 'new@test.com', name: 'New User' }, headers)

      expect(api(auth).createUser).toHaveBeenCalledWith({
        headers,
        body: { email: 'new@test.com', name: 'New User' },
      })
      expect(result.id).toBe('u-new')
    })

    it('should pass password and role when provided', async () => {
      const user = { id: 'u-new', name: 'Admin', email: 'admin@test.com', role: 'admin', createdAt: new Date() }
      api(auth).createUser.mockResolvedValue({ user })

      await service.create({ email: 'admin@test.com', name: 'Admin', password: 'secret123', role: 'admin' }, headers)

      expect(api(auth).createUser).toHaveBeenCalledWith({
        headers,
        body: { email: 'admin@test.com', name: 'Admin', password: 'secret123', role: 'admin' },
      })
    })

    it('should call createUser without headers for server-side usage', async () => {
      const user = { id: 'u-new', name: 'Bot', email: 'bot@test.com', role: 'user', createdAt: new Date() }
      api(auth).createUser.mockResolvedValue({ user })

      await service.create({ email: 'bot@test.com', name: 'Bot' })

      expect(api(auth).createUser).toHaveBeenCalledWith({
        headers: undefined,
        body: { email: 'bot@test.com', name: 'Bot' },
      })
    })
  })

  describe('update', () => {
    it('should call adminUpdateUser with userId and data', async () => {
      const user = { id: 'u1', name: 'Updated', email: 'u1@test.com', role: 'user', createdAt: new Date() }
      api(auth).adminUpdateUser.mockResolvedValue(user)

      const result = await service.update({ userId: 'u1', data: { name: 'Updated' } }, headers)

      expect(api(auth).adminUpdateUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1', data: { name: 'Updated' } },
      })
      expect(result.name).toBe('Updated')
    })

    it('should only include provided fields in data', async () => {
      const user = { id: 'u1', name: 'User', email: 'new@test.com', role: 'user', createdAt: new Date() }
      api(auth).adminUpdateUser.mockResolvedValue(user)

      await service.update({ userId: 'u1', data: { email: 'new@test.com' } }, headers)

      expect(api(auth).adminUpdateUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1', data: { email: 'new@test.com' } },
      })
    })

    it('should call adminUpdateUser without headers for server-side usage', async () => {
      const user = { id: 'u1', name: 'Updated', email: 'u1@test.com', role: 'user', createdAt: new Date() }
      api(auth).adminUpdateUser.mockResolvedValue(user)

      await service.update({ userId: 'u1', data: { name: 'Updated' } })

      expect(api(auth).adminUpdateUser).toHaveBeenCalledWith({
        headers: undefined,
        body: { userId: 'u1', data: { name: 'Updated' } },
      })
    })
  })

  describe('ban', () => {
    it('should call banUser with reason and expiresIn', async () => {
      const user = { id: 'u1', name: 'Banned', email: 'banned@test.com', role: 'user', banned: true, banReason: 'spam', createdAt: new Date() }
      api(auth).banUser.mockResolvedValue({ user })

      const result = await service.ban({ userId: 'u1', banReason: 'spam', banExpiresIn: 3600 }, headers)

      expect(api(auth).banUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1', banReason: 'spam', banExpiresIn: 3600 },
      })
      expect(result.banned).toBe(true)
    })

    it('should ban without reason or expiresIn', async () => {
      const user = { id: 'u1', name: 'User', email: 'user@test.com', banned: true, createdAt: new Date() }
      api(auth).banUser.mockResolvedValue({ user })

      await service.ban({ userId: 'u1' }, headers)

      expect(api(auth).banUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1' },
      })
    })

    it('should call banUser without headers for server-side usage', async () => {
      const user = { id: 'u1', name: 'User', email: 'user@test.com', banned: true, createdAt: new Date() }
      api(auth).banUser.mockResolvedValue({ user })

      await service.ban({ userId: 'u1', banReason: 'abuse' })

      expect(api(auth).banUser).toHaveBeenCalledWith({
        headers: undefined,
        body: { userId: 'u1', banReason: 'abuse' },
      })
    })
  })

  describe('unban', () => {
    it('should call unbanUser and return result', async () => {
      const user = { id: 'u1', name: 'Unbanned', email: 'user@test.com', banned: false, createdAt: new Date() }
      api(auth).unbanUser.mockResolvedValue({ user })

      const result = await service.unban('u1', headers)

      expect(api(auth).unbanUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1' },
      })
      expect(result.banned).toBe(false)
    })

    it('should call unbanUser without headers for server-side usage', async () => {
      const user = { id: 'u1', name: 'Unbanned', email: 'user@test.com', banned: false, createdAt: new Date() }
      api(auth).unbanUser.mockResolvedValue({ user })

      await service.unban('u1')

      expect(api(auth).unbanUser).toHaveBeenCalledWith({
        headers: undefined,
        body: { userId: 'u1' },
      })
    })
  })

  describe('remove', () => {
    it('should call removeUser', async () => {
      api(auth).removeUser.mockResolvedValue({})

      await service.remove('u1', headers)

      expect(api(auth).removeUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1' },
      })
    })

    it('should call removeUser without headers for server-side usage', async () => {
      api(auth).removeUser.mockResolvedValue({})

      await service.remove('u1')

      expect(api(auth).removeUser).toHaveBeenCalledWith({
        headers: undefined,
        body: { userId: 'u1' },
      })
    })
  })

  describe('setRole', () => {
    it('should call setRole and return result', async () => {
      const user = { id: 'u1', name: 'User', email: 'user@test.com', role: 'admin', createdAt: new Date() }
      api(auth).setRole.mockResolvedValue({ user })

      const result = await service.setRole({ userId: 'u1', role: 'admin' }, headers)

      expect(api(auth).setRole).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1', role: 'admin' },
      })
      expect(result.role).toBe('admin')
    })
  })

  describe('setUserPassword', () => {
    it('should call setUserPassword with userId and newPassword', async () => {
      api(auth).setUserPassword.mockResolvedValue({ status: true })

      const result = await service.setUserPassword({ userId: 'u1', newPassword: 'new-secret' }, headers)

      expect(api(auth).setUserPassword).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1', newPassword: 'new-secret' },
      })
      expect(result).toEqual({ status: true })
    })

    it('should wrap APIError with contextual message', async () => {
      const { APIError } = await import('better-auth')
      api(auth).setUserPassword.mockRejectedValue(new APIError('BAD_REQUEST', { message: 'Weak password' }))

      await expect(service.setUserPassword({ userId: 'u1', newPassword: 'short' }, headers))
        .rejects
        .toThrow('Failed to set user password')
    })

    it('should propagate non-APIError', async () => {
      api(auth).setUserPassword.mockRejectedValue(new Error('DB error'))

      await expect(service.setUserPassword({ userId: 'u1', newPassword: 'new-secret' }, headers))
        .rejects
        .toThrow('DB error')
    })
  })

  describe('listSessions', () => {
    it('should call listUserSessions and return sessions', async () => {
      const sessions = [
        { id: 's1', userId: 'u1', expiresAt: new Date('2026-12-31'), ipAddress: '127.0.0.1', userAgent: 'test', impersonatedBy: null, createdAt: new Date('2026-01-01') },
      ]
      api(auth).listUserSessions.mockResolvedValue({ sessions })

      const result = await service.listSessions('u1', headers)

      expect(api(auth).listUserSessions).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1' },
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(expect.objectContaining({ id: 's1', userId: 'u1' }))
    })

    it('should call listUserSessions without headers for server-side usage', async () => {
      api(auth).listUserSessions.mockResolvedValue({ sessions: [] })

      await service.listSessions('u1')

      expect(api(auth).listUserSessions).toHaveBeenCalledWith({
        headers: undefined,
        body: { userId: 'u1' },
      })
    })

    it('should propagate error when API fails', async () => {
      api(auth).listUserSessions.mockRejectedValue(new Error('API failure'))

      await expect(service.listSessions('u1', headers)).rejects.toThrow('API failure')
    })
  })

  describe('revokeSession', () => {
    it('should call revokeUserSession', async () => {
      api(auth).revokeUserSession.mockResolvedValue({})

      await service.revokeSession('tok-abc', headers)

      expect(api(auth).revokeUserSession).toHaveBeenCalledWith({
        headers,
        body: { sessionToken: 'tok-abc' },
      })
    })

    it('should call revokeUserSession without headers for server-side usage', async () => {
      api(auth).revokeUserSession.mockResolvedValue({})

      await service.revokeSession('tok-abc')

      expect(api(auth).revokeUserSession).toHaveBeenCalledWith({
        headers: undefined,
        body: { sessionToken: 'tok-abc' },
      })
    })
  })

  describe('revokeSessions', () => {
    it('should call revokeUserSessions', async () => {
      api(auth).revokeUserSessions.mockResolvedValue({})

      await service.revokeSessions('u1', headers)

      expect(api(auth).revokeUserSessions).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1' },
      })
    })

    it('should call revokeUserSessions without headers for server-side usage', async () => {
      api(auth).revokeUserSessions.mockResolvedValue({})

      await service.revokeSessions('u1')

      expect(api(auth).revokeUserSessions).toHaveBeenCalledWith({
        headers: undefined,
        body: { userId: 'u1' },
      })
    })
  })

  describe('impersonate', () => {
    it('should call impersonateUser', async () => {
      api(auth).impersonateUser.mockResolvedValue({})

      await service.impersonate('u2', headers)

      expect(api(auth).impersonateUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u2' },
      })
    })

    it('should call impersonateUser without headers for server-side usage', async () => {
      api(auth).impersonateUser.mockResolvedValue({})

      await service.impersonate('u2')

      expect(api(auth).impersonateUser).toHaveBeenCalledWith({
        headers: undefined,
        body: { userId: 'u2' },
      })
    })
  })

  describe('stopImpersonating', () => {
    it('should call stopImpersonating', async () => {
      api(auth).stopImpersonating.mockResolvedValue({})

      await service.stopImpersonating(headers)

      expect(api(auth).stopImpersonating).toHaveBeenCalledWith({
        headers,
      })
    })
  })
})
