import type { Session, User } from 'better-auth'
import type { SessionWithImpersonatedBy, UserWithRole } from 'better-auth/plugins'
import type { Auth } from '../config/auth'
import { APIError } from 'better-auth'

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
  data?: Record<string, any>
}

export interface BanUserInput {
  userId: string
  banReason?: string
  banExpiresIn?: number
}

export interface UserService {
  list: (params: ListUsersParams, headers?: Headers) => Promise<{
    users: UserWithRole[]
    total: number
    limit?: number
    offset?: number
  } | {
    users: never []
    total: number
  }>
  get: (userId: string, headers?: Headers) => Promise<UserWithRole>
  create: (input: CreateUserInput, headers?: Headers) => Promise<UserWithRole>
  update: (userId: string, data: Record<string, any>, headers?: Headers) => Promise<UserWithRole>
  ban: (input: BanUserInput, headers?: Headers) => Promise<UserWithRole>
  unban: (userId: string, headers?: Headers) => Promise<UserWithRole>
  remove: (userId: string, headers?: Headers) => Promise<{ success: boolean }>
  setRole: (userId: string, role: string | string[], headers: Headers) => Promise<UserWithRole>
  listSessions: (userId: string, headers?: Headers) => Promise<SessionWithImpersonatedBy[]>
  revokeSession: (sessionToken: string, headers?: Headers) => Promise<{ success: boolean }>
  revokeSessions: (userId: string, headers?: Headers) => Promise<{ success: boolean }>
  impersonate: (userId: string, headers?: Headers) => Promise<{ session: Session, user: UserWithRole }>
  stopImpersonating: (headers: Headers) => Promise<{ session: Session & Record<string, any>, user: User & Record<string, any> }>
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createUserService(auth: Auth): UserService {
  async function list(params: ListUsersParams, headers?: Headers) {
    try {
      return await auth.api.listUsers({
        headers,
        query: { ...params },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to list users: ${e.message}`)
      }
      throw e
    }
  }

  async function get(userId: string, headers?: Headers) {
    try {
      return await auth.api.getUser({
        headers,
        query: { id: userId },
      })
    }
    catch {
      throw new Error(`User not found: ${userId}`)
    }
  }

  async function create(input: CreateUserInput, headers?: Headers) {
    try {
      const result = await auth.api.createUser({
        headers,
        body: input as any,
      })

      return result.user
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to create user: ${e.message}`)
      }
      throw e
    }
  }

  async function update(userId: string, data: Record<string, any>, headers?: Headers) {
    try {
      return await auth.api.adminUpdateUser({
        headers,
        body: { userId, data },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to update user: ${e.message}`)
      }
      throw e
    }
  }

  async function ban(input: BanUserInput, headers?: Headers) {
    try {
      const result = await auth.api.banUser({
        headers,
        body: input,
      })

      return result.user
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to ban user: ${e.message}`)
      }
      throw e
    }
  }

  async function unban(userId: string, headers?: Headers) {
    try {
      const result = await auth.api.unbanUser({
        headers,
        body: { userId },
      })

      return result.user
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to unban user: ${e.message}`)
      }
      throw e
    }
  }

  async function remove(userId: string, headers?: Headers) {
    try {
      return await auth.api.removeUser({
        headers,
        body: { userId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to remove user: ${e.message}`)
      }
      throw e
    }
  }

  async function setRole(userId: string, role: string | string[], headers: Headers) {
    try {
      const result = await auth.api.setRole({
        headers,
        body: { userId, role: role as any },
      })

      return result.user
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to set role: ${e.message}`)
      }
      throw e
    }
  }

  async function listSessions(userId: string, headers?: Headers) {
    try {
      const result = await auth.api.listUserSessions({
        headers,
        body: { userId },
      })

      return result.sessions
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to list sessions: ${e.message}`)
      }
      throw e
    }
  }

  async function revokeSession(sessionToken: string, headers?: Headers) {
    try {
      return await auth.api.revokeUserSession({
        headers,
        body: { sessionToken },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to revoke session: ${e.message}`)
      }
      throw e
    }
  }

  async function revokeSessions(userId: string, headers?: Headers) {
    try {
      return await auth.api.revokeUserSessions({
        headers,
        body: { userId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to revoke sessions: ${e.message}`)
      }
      throw e
    }
  }

  async function impersonate(userId: string, headers?: Headers) {
    try {
      return await auth.api.impersonateUser({
        headers,
        body: { userId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to impersonate user: ${e.message}`)
      }
      throw e
    }
  }

  async function stopImpersonating(headers: Headers) {
    try {
      return await auth.api.stopImpersonating({
        headers,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to stop impersonating: ${e.message}`)
      }
      throw e
    }
  }

  return {
    list,
    get,
    create,
    update,
    ban,
    unban,
    remove,
    setRole,
    listSessions,
    revokeSession,
    revokeSessions,
    impersonate,
    stopImpersonating,
  }
}
