import type { Auth } from '@czo/auth/config'
import type { AdminOptions } from 'better-auth/plugins'

export interface HasPermissionInput {
  userId: string
  permissions: Record<string, string[]>
  role?: string
  connector?: 'AND' | 'OR'
}

/**
 * Pure permission check against better-auth's admin-plugin config.
 *
 * Extracted from `UserService` so callers (auth facade, scopes) can run it
 * synchronously without depending on the full Effect Tag — `hasPermission`
 * has no DB or async work, only reads `auth.options.plugins`.
 */
export function hasPermissionForUser(auth: Auth, input: HasPermissionInput): boolean {
  const { userId, permissions, role, connector = 'AND' } = input

  const adminOptions = (auth.options.plugins?.find(
    p => p.id === 'admin',
    // @ts-expect-error admin plugin options type is not exported by better-auth
  ))?.options as AdminOptions | undefined

  if (adminOptions?.adminUserIds?.includes(userId))
    return true
  if (!permissions)
    return false

  const roles = (role || adminOptions?.defaultRole || 'user').split(',')
  const acRoles = (adminOptions?.roles ?? {}) as Record<
    string,
    { authorize: (p: Record<string, string[]>, c: 'AND' | 'OR') => { success: boolean } } | undefined
  >
  for (const r of roles) {
    const result = acRoles[r]?.authorize(permissions, connector)
    if (result?.success)
      return true
  }
  return false
}
