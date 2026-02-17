import type { Auth } from '../config/auth.config'

// ─── Types ───────────────────────────────────────────────────────────

export interface AdminUserData {
  id: string
  name: string
  email: string
  role: string
  banned: boolean
  banReason: string | null
  banExpires: Date | string | null
  createdAt: Date | string
}

export interface UserSessionData {
  id: string
  userId: string
  expiresAt: Date | string
  ipAddress: string | null
  userAgent: string | null
  impersonatedBy: string | null
  createdAt: Date | string
}

export interface UserService {
  list: (
    headers: Headers,
    params: { limit?: number, offset?: number, search?: string },
  ) => Promise<{ users: AdminUserData[], total: number }>
  get: (headers: Headers, userId: string) => Promise<AdminUserData>
  create: (
    headers: Headers,
    input: { email: string, name: string, password?: string, role?: string },
  ) => Promise<AdminUserData>
  update: (
    headers: Headers,
    userId: string,
    data: { name?: string, email?: string },
  ) => Promise<AdminUserData>
  ban: (headers: Headers, userId: string, reason?: string, expiresIn?: number) => Promise<AdminUserData>
  unban: (headers: Headers, userId: string) => Promise<AdminUserData>
  remove: (headers: Headers, userId: string) => Promise<boolean>
  setRole: (headers: Headers, userId: string, role: string) => Promise<AdminUserData>
  listSessions: (headers: Headers, userId: string) => Promise<UserSessionData[]>
  revokeSession: (headers: Headers, sessionToken: string) => Promise<boolean>
  revokeSessions: (headers: Headers, userId: string) => Promise<boolean>
  impersonate: (headers: Headers, userId: string) => Promise<boolean>
  stopImpersonating: (headers: Headers) => Promise<boolean>
}

// ─── Helpers ─────────────────────────────────────────────────────────

function normalizeUser(u: Record<string, unknown>): AdminUserData {
  return {
    id: u.id as string,
    name: u.name as string,
    email: u.email as string,
    role: (u.role as string) ?? 'user',
    banned: (u.banned as boolean) ?? false,
    banReason: (u.banReason as string) ?? null,
    banExpires: (u.banExpires as Date | string) ?? null,
    createdAt: u.createdAt as Date | string,
  }
}

function normalizeSession(s: Record<string, unknown>): UserSessionData {
  return {
    id: s.id as string,
    userId: s.userId as string,
    expiresAt: s.expiresAt as Date | string,
    ipAddress: (s.ipAddress as string) ?? null,
    userAgent: (s.userAgent as string) ?? null,
    impersonatedBy: (s.impersonatedBy as string) ?? null,
    createdAt: s.createdAt as Date | string,
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createUserService(auth: Auth): UserService {
  async function list(
    headers: Headers,
    params: { limit?: number, offset?: number, search?: string },
  ) {
    const result = await auth.api.listUsers({
      headers,
      query: {
        limit: params.limit ?? 10,
        offset: params.offset ?? 0,
        ...(params.search ? { searchValue: params.search, searchField: 'email' as const } : {}),
      },
    })

    return {
      users: (result?.users ?? []).map(u => normalizeUser(u as unknown as Record<string, unknown>)),
      total: result?.total ?? 0,
    }
  }

  async function get(headers: Headers, userId: string) {
    const result = await (auth.api as Record<string, (...args: unknown[]) => Promise<unknown>>).listUsers({
      headers,
      query: { limit: 1, offset: 0, searchValue: userId, searchField: 'id' as const },
    }) as { users?: Record<string, unknown>[] } | null

    const user = result?.users?.[0]
    if (!user) {
      throw new Error(`User not found: ${userId}`)
    }

    return normalizeUser(user)
  }

  async function create(
    headers: Headers,
    input: { email: string, name: string, password?: string, role?: string },
  ) {
    const result = await auth.api.createUser({
      headers,
      body: {
        email: input.email,
        name: input.name,
        password: input.password ?? '',
        role: input.role ?? 'user',
      },
    })

    return normalizeUser(result as unknown as Record<string, unknown>)
  }

  async function update(
    headers: Headers,
    userId: string,
    data: { name?: string, email?: string },
  ) {
    const body: Record<string, unknown> = { userId }
    if (data.name !== undefined)
      body.name = data.name
    if (data.email !== undefined)
      body.email = data.email

    const result = await (auth.api as Record<string, (...args: unknown[]) => Promise<unknown>>).updateUser({
      headers,
      body,
    }) as Record<string, unknown>

    return normalizeUser(result)
  }

  async function ban(headers: Headers, userId: string, reason?: string, expiresIn?: number) {
    const result = await auth.api.banUser({
      headers,
      body: {
        userId,
        ...(reason ? { banReason: reason } : {}),
        ...(expiresIn ? { banExpiresIn: expiresIn } : {}),
      },
    })

    return normalizeUser(result?.user as unknown as Record<string, unknown>)
  }

  async function unban(headers: Headers, userId: string) {
    const result = await auth.api.unbanUser({
      headers,
      body: { userId },
    })

    return normalizeUser(result?.user as unknown as Record<string, unknown>)
  }

  async function remove(headers: Headers, userId: string) {
    await auth.api.removeUser({
      headers,
      body: { userId },
    })
    return true
  }

  async function setRole(headers: Headers, userId: string, role: string) {
    const result = await auth.api.setRole({
      headers,
      body: { userId, role: role as 'user' | 'admin' },
    })

    return normalizeUser(result?.user as unknown as Record<string, unknown>)
  }

  async function listSessions(headers: Headers, userId: string) {
    const result = await (auth.api as Record<string, (...args: unknown[]) => Promise<unknown>>).listUserSessions({
      headers,
      query: { userId },
    }) as { sessions?: Record<string, unknown>[] } | null

    return (result?.sessions ?? []).map(normalizeSession)
  }

  async function revokeSession(headers: Headers, sessionToken: string) {
    await auth.api.revokeUserSession({
      headers,
      body: { sessionToken },
    })
    return true
  }

  async function revokeSessions(headers: Headers, userId: string) {
    await auth.api.revokeUserSessions({
      headers,
      body: { userId },
    })
    return true
  }

  async function impersonate(headers: Headers, userId: string) {
    await auth.api.impersonateUser({
      headers,
      body: { userId },
    })
    return true
  }

  async function stopImpersonatingFn(headers: Headers) {
    await auth.api.stopImpersonating({
      headers,
    })
    return true
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
    stopImpersonating: stopImpersonatingFn,
  }
}
