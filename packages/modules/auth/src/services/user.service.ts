import type { AccessRole, Auth } from '@czo/auth/config'
import type { sessions, UserSchema } from '@czo/auth/schema'
import type { AuthRelations, BanUserInput, CreateUserInput, ImpersonateUserInput, UpdateUserInput, User } from '@czo/auth/types'
import type { Database } from '@czo/kit/db'
import type { AdminOptions } from 'better-auth/plugins'
import { eq, type InferInsertModel, type InferSelectModel } from 'drizzle-orm'
import { users } from '@czo/auth/schema'
import { mapAPIError } from './_internal/map-error'
import { deleteSessionCookie } from 'better-auth/cookies'
import { parseSessionOutput } from 'better-auth/db'
import { validateRole } from './utils/validate-roles'

// ─── Types ───────────────────────────────────────────────────────────

// export type User = InferSelectModel<UserSchema>
export type SessionRow = InferSelectModel<typeof sessions>
export type UserInsert = Pick<InferInsertModel<UserSchema>, 'email' | 'name' | 'role'> & { password: string }

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

// export interface CreateUserInput {
//   email: string
//   name: string
//   password?: string
//   role?: string | string[]
//   data?: Record<string, unknown>
// }

// export interface UpdateUserInput {
//   userId: string
//   data: Record<string, unknown>
// }

export interface SetRoleInput {
  userId: string
  role: string | string[]
}

export interface SetUserPasswordInput {
  userId: string
  newPassword: string
}

// export interface BanUserInput {
//   userId: string
//   banReason?: string
//   banExpiresIn?: number
// }

export type UserService = ReturnType<typeof createUserService>

interface CreateUserOptions {
  onUserExists?: (user: User) => Promise<never>
  onFailed?: () => Promise<never>
  onInvalidRole?: () => Promise<never>
}

interface UpdateUserOptions {
  onFailed?: () => Promise<never>
  onNotFound?: () => Promise<never>
  onInvalidRole?: () => Promise<never>
}

interface BanUserOptions {
  onFailed?: () => Promise<never>
  onNotFound?: () => Promise<never>
  onSelfBan?: () => Promise<never>
  onAlreadyBanned?: () => Promise<void>
  authUserId?: number
}

interface UnbanUserOptions {
  onFailed?: () => Promise<never>
  onNotFound?: () => Promise<never>
  onNotBanned?: () => Promise<void>
}

interface SetRoleOptions {
  onFailed?: () => Promise<never>
  onNotFound?: () => Promise<never>
  onInvalidRole?: () => Promise<never>
}

interface SetPasswordOptions {
  onFailed?: () => Promise<never>
  onNotFound?: () => Promise<never>
}

interface RemoveUserOptions {
  onFailed?: () => Promise<never>
  onNotFound?: () => Promise<never>
  onSelfRemove?: () => Promise<never>
  authUserId?: number
}

interface FindOneOptions {
  onNotFound?: () => Promise<void>
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createUserService(
  db: Database<AuthRelations>,
  auth: Auth,
  roles?: Record<string, AccessRole>,
) {
  
  const findFirst = async (config?: Parameters<typeof db.query.users.findFirst>[0], opts?: FindOneOptions) => {
    const data = await db.query.users.findFirst(config)

    if (!data) {
      if (opts?.onNotFound)
        opts.onNotFound()
      return null
    }

    return data
  }

  // const validateRole = (role: string | string[]) => {
  //   const _roles = Array.isArray(role) ? role : [role]

  //   for (const role of _roles) {
  //     if (roles && !roles[role])
  //       return false
  //   }
  //   return _roles.join(',') // store as comma-separated string
  // }

  const hashPassword = async (ctx: Awaited<typeof auth.$context> ,password: string): Promise<string> => {
    return await ctx.password.hash(password)
  }

  return {
    // ── Reads — internalAdapter ──

    async findMany(config?: Parameters<typeof db.query.users.findMany>[0]) {
      return db.query.users.findMany(config)
    },

    findFirst,

    // ── hasPermission — admin role check ──

    hasPermission(opts: {
      auth?: Auth
      userId: string
      permissions: Record<string, string[]>
      role?: string
      connector?: 'AND' | 'OR'
    }): boolean {
      const { userId, permissions, role, connector = 'AND' } = opts
      const adminOptions = (auth.options.plugins?.find(
        (p) => p.id === 'admin',
        // @ts-expect-error access plugin options type not exported, so we have to assert here
      ))?.options as AdminOptions | undefined

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

    async create(input: CreateUserInput, opts?: CreateUserOptions): Promise<User | null>  {
      const existing = await db.query.users.findFirst({ where: { email: input.email } })

      if (existing) {
        if (opts?.onUserExists)
          await opts.onUserExists(existing)
        return null
      }

      if (input.role) {
        const validRole = validateRole(input.role, roles)

        if (!validRole) {
          if (opts?.onInvalidRole) {
            await opts.onInvalidRole()
          }
          return null
        }

        input.role = validRole
      }

      const [user] = await db.insert(users).values({
        ...input,
        role: input.role as (string | undefined | null) ?? 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning()

      if (!user) {
        if (opts?.onFailed) {
          await opts.onFailed()
        } 
        return null
      }
        
      // If password provided, store credential via internalAdapter
      if (input.password) {
        try {
          const authContext = await auth.$context
          const hashedPassword = await hashPassword(authContext, input.password)
          await authContext.internalAdapter.linkAccount({
            accountId: String(user.id),
            providerId: 'credential',
            userId: String(user.id),
            password: hashedPassword,
          })
        }
        catch {
          // non-fatal: credential not stored but user was created
        }
      }

      return user
    },

    async update(id: number, input: UpdateUserInput, opts?: UpdateUserOptions): Promise<User | null> {
      const existing = await findFirst(
        { where: { id }},
        { onNotFound: opts?.onNotFound }
      )

      if (!existing) {
        return null
      }

      if (Object.keys(input).length === 0) {
        if (opts?.onFailed)
          await opts.onFailed()
        return null
      }

      if (input.role) {
        const validRole = validateRole(input.role, roles)

        if (!validRole) {
          if (opts?.onInvalidRole) {
            await opts.onInvalidRole()
          }
          return null
        }

        input.role = validRole
      }

      const [user] = await db.update(users).set({
        ...input,
        role: input.role as (string | undefined | null),
        updatedAt: new Date(),
      }).where(eq(users.id, id)).returning()

      if (!user) {
        if (opts?.onFailed)
          await opts.onFailed()
      }

      return user ?? null
    },

    async ban(id: number, input: BanUserInput, opts?: BanUserOptions): Promise<User | null> {

      const existing = await findFirst({ where: { id }}, { onNotFound: opts?.onNotFound})

      if (!existing) {
        return null
      }

      if (existing.banned) {
        if (opts?.onAlreadyBanned)
          await opts.onAlreadyBanned()
      }

      if (opts?.authUserId && existing.id === opts.authUserId) {
        if (opts?.onSelfBan)
          await opts.onSelfBan()
      }

      const [user] = await db.update(users).set({
        banned: true,
        banReason: input.reason ?? 'No reason provided',
        banExpires: typeof input.expiresIn === 'number' ? new Date(Date.now() + input.expiresIn * 1000) : null, // TODO: set default ban duration if not provided?
        updatedAt: new Date(),
      }).where(eq(users.id, id)).returning()

      if (!user) {
        if (opts?.onFailed)
          await opts.onFailed()
      }

      return user ?? null 
    },

    async unban(id: number, opts?: UnbanUserOptions): Promise<User | null> {

      const existing = await findFirst({ where: { id }}, { onNotFound: opts?.onNotFound})

      if (!existing) {
        return null
      }

      if (!existing.banned) {
        if (opts?.onNotBanned)
          await opts.onNotBanned()
      }

      const [user] = await db.update(users).set({
        banned: false,
        banReason: null,
        banExpires: null,
        updatedAt: new Date(),
      }).where(eq(users.id, id)).returning()

      if (!user) {
        if (opts?.onFailed)
          await opts.onFailed()
      }

      return user ?? null
    },

    async setRole(id: number, role: string | string[], opts?: SetRoleOptions): Promise<User | null> {

      const existing = await findFirst({ where: { id }}, { onNotFound: opts?.onNotFound})

      if (!existing) {
        return null
      }

      const validRole = validateRole(role, roles)

      if (!validRole) {
        if (opts?.onInvalidRole)
          await opts.onInvalidRole()
        return null
      }

      const [user] = await db.update(users).set({
        role: validRole,
        updatedAt: new Date(),
      }).where(eq(users.id, id)).returning()

      if (!user) {
        if (opts?.onFailed)
          await opts.onFailed()
      }

      return user ?? null
    },

    async setPassword(id: number, password: string, opts?: SetPasswordOptions): Promise<true | null> {

      const existing = await findFirst({ where: { id }}, { onNotFound: opts?.onNotFound})

      if (!existing) {
        return null
      }

      const authContext = await auth.$context
      const hashedPassword = await hashPassword(authContext, password)
      try {
        authContext.internalAdapter.updatePassword(String(id), hashedPassword)
        return true
      }
      catch { 
        if (opts?.onFailed)
          await opts.onFailed()
      }

      return null
    },

    async remove(id: number, opts?: RemoveUserOptions): Promise<{ success: boolean }> {

      const existing = await findFirst({ where: { id }}, { onNotFound: opts?.onNotFound})

      if (!existing) {
        return { success: false }
      }

      if (opts?.authUserId && existing.id === opts.authUserId) {
        if (opts?.onSelfRemove)
          await opts.onSelfRemove()
        return { success: false }
      }

      const ctx = await auth.$context

      try {
        await ctx.internalAdapter.deleteUser(String(id))

        return { success: true }
      } catch {
        if (opts?.onFailed)
          await opts.onFailed()
      }
        return { success: false }
    },

    // ── Sessions — internalAdapter ──

    async listSessions(id: number) {
      const ctx = await auth.$context
      const sessions = await ctx.internalAdapter.listSessions(String(id))

      return sessions.map((s) => parseSessionOutput(ctx.options, s))
    },

    async revokeSession(token: string) {
      const authContext = await auth.$context
      await authContext.internalAdapter.deleteSessions(token)

      return true;
    },

    async revokeSessions(id: number) {
      const authContext = await auth.$context
      await authContext.internalAdapter.deleteSessions(String(id))

      return true;
    },

    // ── Impersonation — session creation, better-auth's domain ──

    // async impersonate(id: number, input: ImpersonateUserInput, opts?: ImpersonateUserOptions) {
    //   const targetUser = await getById(id)

    //   if (!targetUser) {
    //     if (opts?.onNotFound)
    //       await opts.onNotFound()
    //     return null
    //   }

    //   // TODO : guard against impersonating admins if needed (requires role info in User model)

    //   const authContext = await auth.$context
    //   const session = await authContext.internalAdapter.createSession(
    //     String(targetUser.id),
    //     true,
    //     {
    //       impersonatedBy: String(input.byUserId),
    //       actor: input.actor,
    //       expiresAt: input.sessionDuration ? new Date(Date.now() + input.sessionDuration * 1000) : new Date(Date.now() + 60 * 60 * 1000), // default to 1 hour session if duration not provided
    //     }
    //   )

    //   if (!session) {
    //     if (opts?.onSessionFailed)
    //       await opts.onSessionFailed()
    //     return null
    //   }
      
    //   const authCookies = authContext.authCookies
    //   deleteSessionCookie(auth) // ensure any existing session cookie is cleared
    // },

    // async stopImpersonating(headers: Headers) {
    //   try {
    //     return await (auth.api as any).stopImpersonating({ headers })
    //   }
    //   catch (err) { mapAPIError(err, 'Session') }
    // },
  }
}
