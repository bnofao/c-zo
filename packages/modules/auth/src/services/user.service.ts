import type { Auth } from '@czo/auth/config'
import type { Database } from '@czo/kit/db'
import type { AdminOptions } from 'better-auth/plugins'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { eq } from 'drizzle-orm'
import { sessions, users } from '../database/schema'
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

export function createUserService(db: Database, auth: Auth) {
  return {
    // ── Reads — Drizzle direct ──

    async list(params: ListUsersParams, _headers?: Headers) {
      const rows = await db.select().from(users)
      const limit = params.limit ? Number(params.limit) : undefined
      const offset = params.offset ? Number(params.offset) : 0

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
      const paginated = limit !== undefined ? filtered.slice(offset, offset + limit) : filtered.slice(offset)
      return { users: paginated as any[], total, limit, offset }
    },

    async get(userId: string, _headers?: Headers) {
      const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!row)
        throw new Error(`User not found: ${userId}`)
      return row as any
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

    // ── Writes — Drizzle direct ──

    async create(input: CreateUserInput, _headers?: Headers) {
      const id = crypto.randomUUID()
      const now = new Date()

      let hashedPassword: string | undefined
      if (input.password) {
        try {
          const ctx = await auth.$context
          hashedPassword = await ctx.password.hash(input.password)
        }
        catch {
          // fallback: keep password undefined (no credential stored)
        }
      }

      const role = Array.isArray(input.role) ? input.role[0] : (input.role ?? 'user')

      const [row] = await db.insert(users).values({
        id,
        email: input.email,
        name: input.name,
        role: role ?? 'user',
        emailVerified: false,
        banned: false,
        createdAt: now,
        updatedAt: now,
        ...(input.data as Record<string, unknown>),
      }).returning()

      if (!row)
        throw new Error('Failed to create user')

      // If password provided, store it in the accounts table via better-auth's internal adapter
      if (hashedPassword) {
        const accountId = crypto.randomUUID()
        await db.insert(
          (await import('../database/schema')).accounts,
        ).values({
          id: accountId,
          accountId: id,
          providerId: 'credential',
          userId: id,
          password: hashedPassword,
          createdAt: now,
          updatedAt: now,
        }).onConflictDoNothing()
      }

      await publishAuthEvent(AUTH_EVENTS.USER_REGISTERED, {
        userId: row.id,
        email: row.email,
      })

      return row as any
    },

    async update(input: UpdateUserInput, _headers?: Headers) {
      const { userId, data } = input
      const now = new Date()

      const [row] = await db.update(users)
        .set({ ...data as any, updatedAt: now })
        .where(eq(users.id, userId))
        .returning()

      if (!row)
        throw new Error(`User not found: ${userId}`)

      await publishAuthEvent(AUTH_EVENTS.USER_UPDATED, {
        userId,
        changes: data,
      })

      return row as any
    },

    async ban(input: BanUserInput, _headers?: Headers) {
      const { userId, banReason, banExpiresIn } = input
      const now = new Date()
      const banExpires = banExpiresIn ? new Date(Date.now() + banExpiresIn * 1000) : null

      const [row] = await db.update(users)
        .set({
          banned: true,
          banReason: banReason ?? null,
          banExpires: banExpires ?? undefined,
          updatedAt: now,
        })
        .where(eq(users.id, userId))
        .returning()

      if (!row)
        throw new Error(`User not found: ${userId}`)

      // Cascade session revocation — better-auth's domain
      try {
        await (auth.api as any).revokeUserSessions({ body: { userId } })
      }
      catch {
        // non-fatal: sessions may already be expired
      }

      await publishAuthEvent(AUTH_EVENTS.USER_BANNED, {
        userId,
        bannedBy: 'admin',
        reason: banReason ?? null,
        expiresIn: banExpiresIn ?? null,
      })

      return row as any
    },

    async unban(userId: string, _headers?: Headers) {
      const now = new Date()

      const [row] = await db.update(users)
        .set({
          banned: false,
          banReason: null,
          banExpires: null,
          updatedAt: now,
        })
        .where(eq(users.id, userId))
        .returning()

      if (!row)
        throw new Error(`User not found: ${userId}`)

      await publishAuthEvent(AUTH_EVENTS.USER_UNBANNED, {
        userId,
        unbannedBy: 'admin',
      })

      return row as any
    },

    async setRole(input: SetRoleInput, _headers?: Headers) {
      const { userId, role } = input
      const now = new Date()
      const roleStr = Array.isArray(role) ? role.join(',') : role

      const [row] = await db.update(users)
        .set({ role: roleStr, updatedAt: now })
        .where(eq(users.id, userId))
        .returning()

      if (!row)
        throw new Error(`User not found: ${userId}`)

      return row as any
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

    async remove(userId: string, _headers?: Headers) {
      // Cascade session revoke first
      try {
        await (auth.api as any).revokeUserSessions({ body: { userId } })
      }
      catch {
        // non-fatal
      }

      await db.delete(users).where(eq(users.id, userId))

      return { success: true }
    },

    // ── Sessions — Drizzle direct reads, better-auth writes ──

    async listSessions(userId: string, _headers?: Headers) {
      return db.select().from(sessions).where(eq(sessions.userId, userId))
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
