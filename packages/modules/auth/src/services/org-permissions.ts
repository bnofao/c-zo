import type { Auth } from '@czo/auth/config'
import type { OrganizationOptions, OrganizationRole, Role } from 'better-auth/plugins'

const cacheOrgRoles = new Map<string, { [x: string]: Role<Record<string, string[]>> | undefined }>()

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

export interface HasPermissionForOrgInput {
  orgId: string
  permissions: Record<string, string[]>
  role: string
  allowCreatorAllPermissions?: boolean
  useMemoryCache?: boolean
  connector?: 'AND' | 'OR'
}

/**
 * Permission check against better-auth's organization-plugin config, with
 * optional DB read for dynamic access-control roles.
 *
 * Async because the dynamic ACL path queries the better-auth adapter.
 * Extracted from `OrganizationService.hasPermission` so the auth facade can
 * call it without depending on the Effect Tag.
 */
export async function hasPermissionForOrg(
  auth: Auth,
  input: HasPermissionForOrgInput,
): Promise<boolean> {
  const {
    orgId,
    permissions,
    role,
    allowCreatorAllPermissions,
    useMemoryCache = false,
    connector = 'AND',
  } = input

  const orgOptions = auth.options?.plugins?.find(
    (p: { id: string }) => p.id === 'organization',
    // @ts-expect-error organization plugin options type is not exported by better-auth
  )?.options as OrganizationOptions | undefined

  let acRoles: { [x: string]: Role<Record<string, string[]>> | undefined } = {
    ...(orgOptions?.roles || {}),
  }

  if (orgOptions?.dynamicAccessControl?.enabled && orgOptions?.ac && !useMemoryCache) {
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
        if (!isValidPermissionsRecord(parsed))
          throw new Error(`Invalid permissions for role ${roleName}`)
        // @ts-expect-error newRole accepts the parsed shape we just validated
        acRoles[roleName] = orgOptions.ac.newRole(parsed)
      }
    }
  }

  if (useMemoryCache)
    acRoles = cacheOrgRoles.get(orgId) || acRoles
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
    if (result?.success)
      return true
  }
  return false
}
