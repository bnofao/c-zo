import type {
  AdminOptions,
  OrganizationOptions,
  OrganizationRole,
  Role,
} from 'better-auth/plugins'
import type { Auth } from './better-auth'
import { Effect, Layer } from 'effect'
import { AuthService, BetterAuth } from '../services'

// ─── Permission helpers (formerly in services/user-permissions + org-permissions) ───

interface UserPermissionInput {
  userId: string
  permissions: Record<string, string[]>
  role?: string
  connector?: 'AND' | 'OR'
}

function checkUserPermission(auth: Auth, input: UserPermissionInput): boolean {
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

interface OrgPermissionInput {
  orgId: string
  permissions: Record<string, string[]>
  role: string
  allowCreatorAllPermissions?: boolean
  useMemoryCache?: boolean
  connector?: 'AND' | 'OR'
}

// TODO: bound this cache (LRU / TTL). It grows one entry per organization and
// is never evicted — fine for a small tenant count, a slow leak otherwise.
// Carried over verbatim from the legacy auth service.
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

async function checkOrgPermission(auth: Auth, input: OrgPermissionInput): Promise<boolean> {
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
        // Corrupt data in the organizationRole table — surfaces as an Effect
        // defect (the Tag declares `E = never`), which is intentional: this
        // "should never happen" and we want it loud, not silently `false`.
        if (!isValidPermissionsRecord(parsed))
          throw new Error(`Invalid permissions for org role '${roleName}' (org ${orgId})`)
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

// ─── Layer ───────────────────────────────────────────────────────────

export const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const auth = yield* BetterAuth

    return AuthService.of({
      hasPermission: (ctx, permissions, options) =>
        Effect.promise(async () => {
          if (ctx.organizationId && ctx.role) {
            return checkOrgPermission(auth, {
              orgId: ctx.organizationId,
              permissions,
              role: ctx.role,
              ...options,
            })
          }

          return checkUserPermission(auth, {
            userId: ctx.userId,
            permissions,
            role: ctx.role,
            connector: options?.connector,
          })
        }),
    })
  }),
)
