import type { UserService } from './user.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createUserService } from './user.service'

function createMockAuth() {
  return {
    api: {
      listUsers: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      banUser: vi.fn(),
      unbanUser: vi.fn(),
      removeUser: vi.fn(),
      setRole: vi.fn(),
      listUserSessions: vi.fn(),
      revokeUserSession: vi.fn(),
      revokeUserSessions: vi.fn(),
      impersonateUser: vi.fn(),
      stopImpersonating: vi.fn(),
    },
  } as unknown as Parameters<typeof createUserService>[0]
}

function api(auth: ReturnType<typeof createMockAuth>) {
  return (auth as unknown as { api: Record<string, ReturnType<typeof vi.fn>> }).api
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
    it('should call listUsers with defaults and normalize response', async () => {
      const rawUsers = [
        { id: 'u1', name: 'User One', email: 'one@test.com', role: 'admin', banned: false, banReason: null, banExpires: null, createdAt: new Date('2026-01-01') },
      ]
      api(auth).listUsers.mockResolvedValue({ users: rawUsers, total: 1 })

      const result = await service.list(headers, {})

      expect(api(auth).listUsers).toHaveBeenCalledWith({
        headers,
        query: { limit: 10, offset: 0 },
      })
      expect(result.total).toBe(1)
      expect(result.users[0]).toEqual(expect.objectContaining({ id: 'u1', role: 'admin' }))
    })

    it('should pass search params when provided', async () => {
      api(auth).listUsers.mockResolvedValue({ users: [], total: 0 })

      await service.list(headers, { limit: 5, offset: 10, search: 'test' })

      expect(api(auth).listUsers).toHaveBeenCalledWith({
        headers,
        query: { limit: 5, offset: 10, searchValue: 'test', searchField: 'email' },
      })
    })

    it('should default role to user when undefined', async () => {
      api(auth).listUsers.mockResolvedValue({
        users: [{ id: 'u1', name: 'No Role', email: 'norole@test.com', createdAt: new Date() }],
        total: 1,
      })

      const result = await service.list(headers, {})

      expect(result.users[0]!.role).toBe('user')
      expect(result.users[0]!.banned).toBe(false)
    })

    it('should return empty result when API returns null', async () => {
      api(auth).listUsers.mockResolvedValue(null)

      const result = await service.list(headers, {})

      expect(result).toEqual({ users: [], total: 0 })
    })
  })

  describe('get', () => {
    it('should find user by id via listUsers search', async () => {
      api(auth).listUsers.mockResolvedValue({
        users: [{ id: 'u1', name: 'Found', email: 'found@test.com', role: 'user', createdAt: new Date() }],
      })

      const result = await service.get(headers, 'u1')

      expect(api(auth).listUsers).toHaveBeenCalledWith({
        headers,
        query: { limit: 1, offset: 0, searchValue: 'u1', searchField: 'id' },
      })
      expect(result.id).toBe('u1')
    })

    it('should throw when user is not found', async () => {
      api(auth).listUsers.mockResolvedValue({ users: [] })

      await expect(service.get(headers, 'unknown')).rejects.toThrow('User not found: unknown')
    })

    it('should throw when listUsers returns null', async () => {
      api(auth).listUsers.mockResolvedValue(null)

      await expect(service.get(headers, 'u1')).rejects.toThrow('User not found: u1')
    })
  })

  describe('create', () => {
    it('should call createUser with input and normalize response', async () => {
      api(auth).createUser.mockResolvedValue({
        id: 'u-new',
        name: 'New User',
        email: 'new@test.com',
        role: 'user',
        createdAt: new Date(),
      })

      const result = await service.create(headers, { email: 'new@test.com', name: 'New User' })

      expect(api(auth).createUser).toHaveBeenCalledWith({
        headers,
        body: { email: 'new@test.com', name: 'New User', password: '', role: 'user' },
      })
      expect(result.id).toBe('u-new')
    })

    it('should pass password and role when provided', async () => {
      api(auth).createUser.mockResolvedValue({
        id: 'u-new',
        name: 'Admin',
        email: 'admin@test.com',
        role: 'admin',
        createdAt: new Date(),
      })

      await service.create(headers, { email: 'admin@test.com', name: 'Admin', password: 'secret123', role: 'admin' })

      expect(api(auth).createUser).toHaveBeenCalledWith({
        headers,
        body: { email: 'admin@test.com', name: 'Admin', password: 'secret123', role: 'admin' },
      })
    })
  })

  describe('update', () => {
    it('should call updateUser with userId and data', async () => {
      api(auth).updateUser.mockResolvedValue({
        id: 'u1',
        name: 'Updated',
        email: 'u1@test.com',
        role: 'user',
        createdAt: new Date(),
      })

      const result = await service.update(headers, 'u1', { name: 'Updated' })

      expect(api(auth).updateUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1', name: 'Updated' },
      })
      expect(result.name).toBe('Updated')
    })

    it('should only include defined fields in body', async () => {
      api(auth).updateUser.mockResolvedValue({
        id: 'u1',
        name: 'User',
        email: 'new@test.com',
        role: 'user',
        createdAt: new Date(),
      })

      await service.update(headers, 'u1', { email: 'new@test.com' })

      expect(api(auth).updateUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1', email: 'new@test.com' },
      })
    })
  })

  describe('ban', () => {
    it('should call banUser with reason and expiresIn', async () => {
      api(auth).banUser.mockResolvedValue({
        user: { id: 'u1', name: 'Banned', email: 'banned@test.com', role: 'user', banned: true, banReason: 'spam', createdAt: new Date() },
      })

      const result = await service.ban(headers, 'u1', 'spam', 3600)

      expect(api(auth).banUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1', banReason: 'spam', banExpiresIn: 3600 },
      })
      expect(result.banned).toBe(true)
    })

    it('should ban without reason or expiresIn', async () => {
      api(auth).banUser.mockResolvedValue({
        user: { id: 'u1', name: 'User', email: 'user@test.com', banned: true, createdAt: new Date() },
      })

      await service.ban(headers, 'u1')

      expect(api(auth).banUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1' },
      })
    })
  })

  describe('unban', () => {
    it('should call unbanUser and return normalized user', async () => {
      api(auth).unbanUser.mockResolvedValue({
        user: { id: 'u1', name: 'Unbanned', email: 'user@test.com', banned: false, createdAt: new Date() },
      })

      const result = await service.unban(headers, 'u1')

      expect(api(auth).unbanUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1' },
      })
      expect(result.banned).toBe(false)
    })
  })

  describe('remove', () => {
    it('should call removeUser and return true', async () => {
      api(auth).removeUser.mockResolvedValue({})

      const result = await service.remove(headers, 'u1')

      expect(api(auth).removeUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1' },
      })
      expect(result).toBe(true)
    })
  })

  describe('setRole', () => {
    it('should call setRole and return normalized user', async () => {
      api(auth).setRole.mockResolvedValue({
        user: { id: 'u1', name: 'User', email: 'user@test.com', role: 'admin', createdAt: new Date() },
      })

      const result = await service.setRole(headers, 'u1', 'admin')

      expect(api(auth).setRole).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1', role: 'admin' },
      })
      expect(result.role).toBe('admin')
    })
  })

  describe('listSessions', () => {
    it('should call listUserSessions and normalize sessions', async () => {
      api(auth).listUserSessions.mockResolvedValue({
        sessions: [
          { id: 's1', userId: 'u1', expiresAt: new Date('2026-12-31'), ipAddress: '127.0.0.1', userAgent: 'test', impersonatedBy: null, createdAt: new Date('2026-01-01') },
        ],
      })

      const result = await service.listSessions(headers, 'u1')

      expect(api(auth).listUserSessions).toHaveBeenCalledWith({
        headers,
        query: { userId: 'u1' },
      })
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(expect.objectContaining({ id: 's1', userId: 'u1' }))
    })

    it('should return empty array when no sessions', async () => {
      api(auth).listUserSessions.mockResolvedValue(null)

      const result = await service.listSessions(headers, 'u1')

      expect(result).toEqual([])
    })
  })

  describe('revokeSession', () => {
    it('should call revokeUserSession and return true', async () => {
      api(auth).revokeUserSession.mockResolvedValue({})

      const result = await service.revokeSession(headers, 'tok-abc')

      expect(api(auth).revokeUserSession).toHaveBeenCalledWith({
        headers,
        body: { sessionToken: 'tok-abc' },
      })
      expect(result).toBe(true)
    })
  })

  describe('revokeSessions', () => {
    it('should call revokeUserSessions and return true', async () => {
      api(auth).revokeUserSessions.mockResolvedValue({})

      const result = await service.revokeSessions(headers, 'u1')

      expect(api(auth).revokeUserSessions).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u1' },
      })
      expect(result).toBe(true)
    })
  })

  describe('impersonate', () => {
    it('should call impersonateUser and return true', async () => {
      api(auth).impersonateUser.mockResolvedValue({})

      const result = await service.impersonate(headers, 'u2')

      expect(api(auth).impersonateUser).toHaveBeenCalledWith({
        headers,
        body: { userId: 'u2' },
      })
      expect(result).toBe(true)
    })
  })

  describe('stopImpersonating', () => {
    it('should call stopImpersonating and return true', async () => {
      api(auth).stopImpersonating.mockResolvedValue({})

      const result = await service.stopImpersonating(headers)

      expect(api(auth).stopImpersonating).toHaveBeenCalledWith({
        headers,
      })
      expect(result).toBe(true)
    })
  })
})
