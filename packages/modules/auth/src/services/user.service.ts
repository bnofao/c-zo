import type { Auth } from '@czo/auth/config'
import type { AdminOptions } from 'better-auth/plugins'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { mapAPIError } from './_internal/map-error'

// ─── Types ───────────────────────────────────────────────────────────

export interface ListUsersParams {
  searchValue?: string
  searchField?: 'email' | 'name'
  searchOperator?: 'contains' | 'starts_with' | 'ends_with'
  limit?: number | string
  offset?: number | string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  filterField?: string
  filterValue?: string | number | boolean
  filterOperator?: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains'
}

export interface CreateUserInput {
  email: string
  name: string
  password?: string
  role?: string | string[]
  data?: Record<string, unknown>
}

export interface UpdateUserInput {
  userId: string
  data: Record<string, unknown>
}

export interface SetRoleInput {
  userId: string
  role: string | string[]
}

export interface SetUserPasswordInput {
  userId: string
  newPassword: string
}

export interface BanUserInput {
  userId: string
  banReason?: string
  banExpiresIn?: number
}

export type UserService = ReturnType<typeof createUserService>

// ─── Factory ─────────────────────────────────────────────────────────

export function createUserService(auth: Auth) {
  return {
    // ── Reads — via better-auth admin API ──

    async list(params: ListUsersParams, headers?: Headers) {
      try {
        return await (auth.api as any).listUsers({ headers, query: { ...params } })
      }
      catch (err) { mapAPIError(err, 'User') }
    },

    async get(userId: string, headers?: Headers) {
      try {
        return await (auth.api as any).getUser({ headers, query: { id: userId } })
      }
      catch (err) { mapAPIError(err, 'User') }
    },

    // ── hasPermission — admin role check ──

    hasPermission(opts: {
      userId: string
      permissions: Record<string, string[]>
      role?: string
      connector?: 'AND' | 'OR'
    }): boolean {
      const { userId, permissions, role, connector = 'AND' } = opts
      const adminOptions = auth.options.plugins?.find(
        (p: { id: string }) => p.id === 'admin',
      )?.options as AdminOptions | undefined

      if (adminOptions?.adminUserIds?.includes(userId)) return true
      if (!permissions) return false

      const roles = (role || adminOptions?.defaultRole || 'user').split(',')
      const acRoles = (adminOptions?.roles ?? {}) as Record<string, { authorize: (p: Record<string, string[]>, c: 'AND' | 'OR') => { success: boolean } } | undefined>
      for (const r of roles) {
        const acRole = acRoles[r]
        const result = acRole?.authorize(permissions, connector)
        if (result?.success) return true
      }
      return false
    },

    // ── Writes — via better-auth admin API ──

    async create(input: CreateUserInput, headers?: Headers) {
      try {
        const result = await (auth.api as any).createUser({ headers, body: input })
        await publishAuthEvent(AUTH_EVENTS.USER_REGISTERED, {
          userId: result.user.id,
          email: result.user.email,
        })
        return result.user
      }
      catch (err) { mapAPIError(err, 'User') }
    },

    async update(input: UpdateUserInput, headers?: Headers) {
      try {
        const result = await (auth.api as any).adminUpdateUser({
          headers,
          body: { userId: input.userId, data: input.data },
        })
        await publishAuthEvent(AUTH_EVENTS.USER_UPDATED, {
          userId: input.userId,
          changes: input.data,
        })
        return result
      }
      catch (err) { mapAPIError(err, 'User') }
    },

    async ban(input: BanUserInput, headers?: Headers) {
      try {
        const result = await (auth.api as any).banUser({ headers, body: input })
        await publishAuthEvent(AUTH_EVENTS.USER_BANNED, {
          userId: input.userId,
          bannedBy: 'admin',
          reason: input.banReason ?? null,
          expiresIn: input.banExpiresIn ?? null,
        })
        return result.user
      }
      catch (err) { mapAPIError(err, 'User') }
    },

    async unban(userId: string, headers?: Headers) {
      try {
        const result = await (auth.api as any).unbanUser({ headers, body: { userId } })
        await publishAuthEvent(AUTH_EVENTS.USER_UNBANNED, {
          userId,
          unbannedBy: 'admin',
        })
        return result.user
      }
      catch (err) { mapAPIError(err, 'User') }
    },

    async setRole(input: SetRoleInput, headers: Headers) {
      try {
        const result = await (auth.api as any).setRole({
          headers,
          body: { userId: input.userId, role: input.role },
        })
        return result.user
      }
      catch (err) { mapAPIError(err, 'User') }
    },

    async setPassword(input: SetUserPasswordInput, headers: Headers) {
      try {
        return await (auth.api as any).setUserPassword({
          headers,
          body: { userId: input.userId, newPassword: input.newPassword },
        })
      }
      catch (err) { mapAPIError(err, 'User') }
    },

    async remove(userId: string, headers?: Headers) {
      try {
        return await (auth.api as any).removeUser({ headers, body: { userId } })
      }
      catch (err) { mapAPIError(err, 'User') }
    },

    // ── Sessions & impersonation ──

    async listSessions(userId: string, headers?: Headers) {
      try {
        const result = await (auth.api as any).listUserSessions({ headers, body: { userId } })
        return result.sessions
      }
      catch (err) { mapAPIError(err, 'Session') }
    },

    async revokeSession(sessionToken: string, headers?: Headers) {
      try {
        return await (auth.api as any).revokeUserSession({ headers, body: { sessionToken } })
      }
      catch (err) { mapAPIError(err, 'Session') }
    },

    async revokeSessions(userId: string, headers?: Headers) {
      try {
        return await (auth.api as any).revokeUserSessions({ headers, body: { userId } })
      }
      catch (err) { mapAPIError(err, 'Session') }
    },

    async impersonate(userId: string, headers?: Headers) {
      try {
        return await (auth.api as any).impersonateUser({ headers, body: { userId } })
      }
      catch (err) { mapAPIError(err, 'User') }
    },

    async stopImpersonating(headers: Headers) {
      try {
        return await (auth.api as any).stopImpersonating({ headers })
      }
      catch (err) { mapAPIError(err, 'Session') }
    },
  }
}
