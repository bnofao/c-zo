import type { AdminOptions, OrganizationOptions, OrganizationRole, Role } from 'better-auth/plugins'
import type { Auth } from '../config/auth'
import { APIError } from 'better-auth'

// ─── Types ───────────────────────────────────────────────────────────

export type AuthService = ReturnType<typeof createAuthService>

export interface PermissionCheckContext {
  userId: string
  organizationId?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────

const cacheOrgRoles = new Map<
  string,
  { [x: string]: Role<Record<string, string[]>> | undefined }
>()

function isValidPermissionsRecord(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  for (const [key, actions] of Object.entries(value)) {
    if (typeof key !== 'string')
      return false
    if (!Array.isArray(actions))
      return false
    if (!actions.every((a: unknown) => typeof a === 'string'))
      return false
  }
  return true
}

async function _adminHasPermission(
  auth: Auth,
  userId: string,
  permissions: { [key: string]: string[] },
  role?: string,
  connector: 'AND' | 'OR' = 'AND',
) {
  const adminOptions = auth?.options?.plugins?.find(
    (p: { id: string }) => p.id === 'admin',
  )?.options as AdminOptions | undefined

  if (adminOptions?.adminUserIds?.includes(userId)) {
    return true
  }

  if (!permissions) {
    return false
  }

  const roles = (role || adminOptions?.defaultRole || 'user').split(',')
  const acRoles = adminOptions?.roles || {}
  for (const r of roles) {
    const acRole = acRoles[r as keyof typeof acRoles]
    const result = acRole?.authorize(permissions, connector)
    if (result?.success) {
      return true
    }
  }
  return false
}

async function _orgMemberHasPermission(
  auth: Auth,
  orgId: string,
  permissions: { [key: string]: string[] },
  role: string,
  allowCreatorAllPermissions?: boolean,
  useMemoryCache = false,
  connector: 'AND' | 'OR' = 'AND',
) {
  const orgOptions = auth?.options?.plugins?.find(
    (p: { id: string }) => p.id === 'organization',
  )?.options as OrganizationOptions | undefined

  let acRoles: { [x: string]: Role<Record<string, string[]>> | undefined } = {
    ...(orgOptions?.roles || {}),
  }

  if (
    orgOptions?.dynamicAccessControl?.enabled
    && orgOptions?.ac
    && !useMemoryCache
  ) {
    const dbRoles = await (await auth?.$context)?.adapter.findMany<
        OrganizationRole & { permission: string }
    >({
      model: 'organizationRole',
      where: [{ field: 'organizationId', value: orgId }],
    })

    if (dbRoles) {
      for (const { role: roleName, permission: permissionsString } of dbRoles) {
        if (roleName in acRoles)
          continue

        const parsed: unknown = JSON.parse(permissionsString)
        if (!isValidPermissionsRecord(parsed)) {
          throw new Error(`Invalid permissions for role ${roleName}`)
        }

        acRoles[roleName] = orgOptions.ac.newRole(parsed)
      }
    }
  }

  if (useMemoryCache) {
    acRoles = cacheOrgRoles.get(orgId) || acRoles
  }
  cacheOrgRoles.set(orgId, acRoles)

  if (!permissions)
    return false

  const roles = role.split(',')
  const creatorRole = orgOptions?.creatorRole || 'owner'
  const isCreator = roles.includes(creatorRole)

  if (isCreator && allowCreatorAllPermissions)
    return true

  for (const r of roles) {
    const acRole = acRoles[r as keyof typeof acRoles]
    const result = acRole?.authorize(permissions, connector)
    if (result?.success) {
      return true
    }
  }
  return false
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createAuthService(auth: Auth) {
  async function getSession(headers: Headers) {
    try {
      return await auth.api.getSession({ headers })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
      }
      throw e
    }
  }

  async function listSessions(headers: Headers) {
    try {
      return await auth.api.listSessions({ headers })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        // todo : throw appropriate error
      }
      throw e
    }
  }

  async function hasPermission(
    ctx: PermissionCheckContext,
    permissions: { [key: string]: string[] },
    role?: string,
    options?: {
      allowCreatorAllPermissions?: boolean
      useMemoryCache?: boolean
      connector?: 'AND' | 'OR'
    },
  ): Promise<boolean> {
    if (ctx.organizationId && role) {
      return _orgMemberHasPermission(
        auth,
        ctx.organizationId,
        permissions,
        role,
        options?.allowCreatorAllPermissions,
        options?.useMemoryCache,
        options?.connector,
      )
    }
    return _adminHasPermission(
      auth,
      ctx.userId,
      permissions,
      role,
      options?.connector,
    )
  }

  return {
    getSession,
    listSessions,
    hasPermission,
  }
}
