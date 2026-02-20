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

export interface UserService {
  list: (headers: Headers, params: ListUsersParams) => Promise<{
    users: UserWithRole[]
    total: number
    limit?: number
    offset?: number
  } | {
    users: never []
    total: number
  }>
  get: (headers: Headers, userId: string) => Promise<UserWithRole>
  create: (headers: Headers, input: CreateUserInput) => Promise<UserWithRole>
  update: (headers: Headers, userId: string, data: Record<string, any>) => Promise<UserWithRole>
  ban: (headers: Headers, userId: string, reason?: string, expiresIn?: number) => Promise<UserWithRole>
  unban: (headers: Headers, userId: string) => Promise<UserWithRole>
  remove: (headers: Headers, userId: string) => Promise<{ success: boolean }>
  setRole: (headers: Headers, userId: string, role: string | string[]) => Promise<UserWithRole>
  listSessions: (headers: Headers, userId: string) => Promise<SessionWithImpersonatedBy[]>
  revokeSession: (headers: Headers, sessionToken: string) => Promise<{ success: boolean }>
  revokeSessions: (headers: Headers, userId: string) => Promise<{ success: boolean }>
  impersonate: (headers: Headers, userId: string) => Promise<{ session: Session, user: UserWithRole }>
  stopImpersonating: (headers: Headers) => Promise<{ session: Session & Record<string, any>, user: User & Record<string, any> }>
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createUserService(auth: Auth): UserService {
  async function list(
    headers: Headers,
    params: ListUsersParams,
  ) {
    try {
      return await auth.api.listUsers({
        headers,
        query: { ...params },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
      }
      throw e
    }
  }

  async function get(headers: Headers, userId: string) {
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

  async function create(
    headers: Headers,
    input: CreateUserInput,
  ) {
    try {
      const result = await auth.api.createUser({
        headers,
        body: {
          email: input.email,
          name: input.name,
          password: input.password,
          role: input.role as any,
          data: input.data,
        },
      })

      return result.user
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
      }
      throw e
    }
  }

  async function update(
    headers: Headers,
    userId: string,
    data: Record<string, any>,
  ) {
    try {
      return await auth.api.adminUpdateUser({
        headers,
        body: { userId, data },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
      }
      throw e
    }
  }

  async function ban(headers: Headers, userId: string, reason?: string, expiresIn?: number) {
    try {
      const result = await auth.api.banUser({
        headers,
        body: {
          userId,
          banReason: reason,
          banExpiresIn: expiresIn,
        },
      })

      return result.user
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
      }
      throw e
    }
  }

  async function unban(headers: Headers, userId: string) {
    try {
      const result = await auth.api.unbanUser({
        headers,
        body: { userId },
      })

      return result.user
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
      }
      throw e
    }
  }

  async function remove(headers: Headers, userId: string) {
    try {
      return await auth.api.removeUser({
        headers,
        body: { userId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
      }
      throw e
    }
  }

  async function setRole(headers: Headers, userId: string, role: string | string[]) {
    try {
      const result = await auth.api.setRole({
        headers,
        body: { userId, role: role as any },
      })

      return result.user
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
      }
      throw e
    }
  }

  async function listSessions(headers: Headers, userId: string) {
    try {
      const result = await auth.api.listUserSessions({
        headers,
        body: { userId },
      })

      return result.sessions
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
      }
      throw e
    }
  }

  async function revokeSession(headers: Headers, sessionToken: string) {
    try {
      return await auth.api.revokeUserSession({
        headers,
        body: { sessionToken },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
      }
      throw e
    }
  }

  async function revokeSessions(headers: Headers, userId: string) {
    try {
      return await auth.api.revokeUserSessions({
        headers,
        body: { userId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
      }
      throw e
    }
  }

  async function impersonate(headers: Headers, userId: string) {
    try {
      return await auth.api.impersonateUser({
        headers,
        body: { userId },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
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
        // todo : throw appropriate error
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
