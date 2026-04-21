import type { Auth } from '@czo/auth/config'
import type { AdminOptions } from 'better-auth/plugins'
import type { InferSelectModel } from 'drizzle-orm'
import type { sessions, users } from '../database/schema'
import { mapAPIError } from './_internal/map-error'

// ─── Types ───────────────────────────────────────────────────────────

export type UserRow = InferSelectModel<typeof users>
export type SessionRow = InferSelectModel<typeof sessions>

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
    // ── Reads — internalAdapter ──

    async list(params: ListUsersParams): Promise<{ users: UserRow[], total: number, limit?: number, offset: number }> {
      const ctx = await auth.$context
      const limit = params.limit ? Number(params.limit) : undefined
      const offset = params.offset ? Number(params.offset) : 0

      // Build where clauses for better-auth's internalAdapter
      const rows = await ctx.internalAdapter.listUsers(
        limit,
        offset,
      ) as UserRow[]

      // Apply search filtering in memory (internalAdapter.listUsers doesn't support text search)
      let filtered = rows
      if (params.searchValue && params.searchField) {
        const field = params.searchField
        const value = params.searchValue.toLowerCase()
        filtered = rows.filter((u) => {
          const col = u[field as keyof typeof u] as string | null
          if (!col)
            return false
          const op = params.searchOperator ?? 'contains'
          if (op === 'contains')
            return col.toLowerCase().includes(value)
          if (op === 'starts_with')
            return col.toLowerCase().startsWith(value)
          if (op === 'ends_with')
            return col.toLowerCase().endsWith(value)
          return false
        })
      }

      const total = filtered.length
      return { users: filtered, total, limit, offset }
    },

    async get(userId: string): Promise<UserRow> {
      const ctx = await auth.$context
      const row = await ctx.internalAdapter.findUserById(userId) as UserRow | null
      if (!row)
        throw new Error(`User not found: ${userId}`)
      return row
    },

    // ── hasPermission — admin role check ──

    hasPermission(opts: {
      auth?: Auth
      userId: string
      permissions: Record<string, string[]>
      role?: string
      connector?: 'AND' | 'OR'
    }): boolean {
      const { userId, permissions, role, connector = 'AND' } = opts
      const adminOptions = auth.options.plugins?.find(
        (p: { id: string }) => p.id === 'admin',
      )?.options as AdminOptions | undefined

      if (adminOptions?.adminUserIds?.includes(userId))
        return true
      if (!permissions)
        return false

      const roles = (role || adminOptions?.defaultRole || 'user').split(',')
      const acRoles = (adminOptions?.roles ?? {}) as Record<string, { authorize: (p: Record<string, string[]>, c: 'AND' | 'OR') => { success: boolean } } | undefined>
      for (const r of roles) {
        const acRole = acRoles[r]
        const result = acRole?.authorize(permissions, connector)
        if (result?.success)
          return true
      }
      return false
    },

    // ── Writes — internalAdapter ──

    async create(input: CreateUserInput): Promise<UserRow> {
      const ctx = await auth.$context

      const role = Array.isArray(input.role) ? input.role[0] : (input.role ?? 'user')

      const row = await ctx.internalAdapter.createUser<UserRow>({
        email: input.email,
        name: input.name,
        role: role ?? 'user',
        emailVerified: false,
        banned: false,
        ...(input.data as Record<string, unknown>),
      })

      if (!row)
        throw new Error('Failed to create user')

      // If password provided, store credential via internalAdapter
      if (input.password) {
        try {
          const hashedPassword = await ctx.password.hash(input.password)
          await ctx.internalAdapter.createAccount({
            accountId: row.id,
            providerId: 'credential',
            userId: row.id,
            password: hashedPassword,
          })
        }
        catch {
          // non-fatal: credential not stored but user was created
        }
      }

      return row
    },

    async update(input: UpdateUserInput): Promise<UserRow> {
      const { userId, data } = input
      const ctx = await auth.$context

      const row = await ctx.internalAdapter.updateUser<UserRow>(userId, data)

      if (!row)
        throw new Error(`User not found: ${userId}`)

      return row
    },

    async ban(input: BanUserInput): Promise<UserRow> {
      const { userId, banReason, banExpiresIn } = input
      const banExpires = banExpiresIn ? new Date(Date.now() + banExpiresIn * 1000) : null
      const ctx = await auth.$context

      const row = await ctx.internalAdapter.updateUser<UserRow>(userId, {
        banned: true,
        banReason: banReason ?? null,
        banExpires: banExpires ?? undefined,
        updatedAt: new Date(),
      })

      if (!row)
        throw new Error(`User not found: ${userId}`)

      // Cascade session revocation — better-auth's domain
      try {
        await ctx.internalAdapter.deleteSessions(userId)
      }
      catch {
        // non-fatal: sessions may already be expired
      }

      return row
    },

    async unban(userId: string): Promise<UserRow> {
      const ctx = await auth.$context

      const row = await ctx.internalAdapter.updateUser<UserRow>(userId, {
        banned: false,
        banReason: null,
        banExpires: null,
        updatedAt: new Date(),
      })

      if (!row)
        throw new Error(`User not found: ${userId}`)

      return row
    },

    async setRole(input: SetRoleInput): Promise<UserRow> {
      const { userId, role } = input
      const roleStr = Array.isArray(role) ? role.join(',') : role
      const ctx = await auth.$context

      const row = await ctx.internalAdapter.updateUser<UserRow>(userId, {
        role: roleStr,
        updatedAt: new Date(),
      })

      if (!row)
        throw new Error(`User not found: ${userId}`)

      return row
    },

    async setPassword(input: SetUserPasswordInput, headers: Headers) {
      // Password change involves credential verification by better-auth — keep as wrap
      try {
        return await (auth.api as any).setUserPassword({
          headers,
          body: { userId: input.userId, newPassword: input.newPassword },
        })
      }
      catch (err) { mapAPIError(err, 'User') }
    },

    async remove(userId: string): Promise<{ success: boolean }> {
      const ctx = await auth.$context

      // Cascade session revoke first
      try {
        await ctx.internalAdapter.deleteSessions(userId)
      }
      catch {
        // non-fatal
      }

      await ctx.internalAdapter.deleteUser(userId)

      return { success: true }
    },

    // ── Sessions — internalAdapter ──

    async listSessions(userId: string): Promise<SessionRow[]> {
      const ctx = await auth.$context
      return ctx.internalAdapter.listSessions(userId) as Promise<SessionRow[]>
    },

    async revokeSession(sessionToken: string, headers?: Headers) {
      // Cookie invalidation is better-auth's domain
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

    // ── Impersonation — session creation, better-auth's domain ──

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
