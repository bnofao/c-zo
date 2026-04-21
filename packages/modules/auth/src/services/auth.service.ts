import type { AccessRole, Auth } from '@czo/auth/config'
import type { Relations } from '@czo/auth/relations'
import type { AccountSchema, SessionSchema } from '@czo/auth/schema'
import type { Database } from '@czo/kit/db'
import type { AccessControl, AdminOptions, OrganizationOptions, OrganizationRole, Role } from 'better-auth/plugins'
import type { OrganizationService } from './organization.service'
import type { UserService } from './user.service'
import { Repository } from '@czo/kit/db'
import { APIError } from 'better-auth'

// ─── Types ───────────────────────────────────────────────────────────

export type AuthService = ReturnType<typeof createAuthService>

export interface PermissionCheckContext {
  userId: string
  organizationId?: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
  revokeOtherSessions?: boolean
}

export interface ChangeEmailInput {
  newEmail: string
  callbackURL?: string
}

export interface UpdateProfileInput {
  name?: string
  image?: string
}

export interface DeleteAccountInput {
  password?: string
  callbackURL?: string
}

export interface UnlinkAccountInput {
  providerId: string
  accountId?: string
}

export interface EnableTwoFactorInput {
  password: string
  issuer?: string
}

export interface VerifyTotpInput {
  code: string
  trustDevice?: boolean
}

export interface VerifyOtpInput {
  code: string
  trustDevice?: boolean
}

export interface VerifyBackupCodeInput {
  code: string
  disableSession?: boolean
  trustDevice?: boolean
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
  const orgOptions = auth.options?.plugins?.find(
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

export function createAuthService_(auth: Auth) {
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
        throw new Error(`Failed to list sessions: ${e.message}`)
      }
      throw e
    }
  }

  // ─── Self-service: Account ──────────────────────────────────────

  async function changePassword(input: ChangePasswordInput, headers: Headers) {
    try {
      return await auth.api.changePassword({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to change password: ${e.message}`)
      }
      throw e
    }
  }

  async function changeEmail(input: ChangeEmailInput, headers: Headers) {
    try {
      return await auth.api.changeEmail({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to change email: ${e.message}`)
      }
      throw e
    }
  }

  async function updateProfile(input: UpdateProfileInput, headers: Headers) {
    try {
      return await auth.api.updateUser({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to update profile: ${e.message}`)
      }
      throw e
    }
  }

  async function deleteAccount(input: DeleteAccountInput, headers: Headers) {
    try {
      return await auth.api.deleteUser({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to delete account: ${e.message}`)
      }
      throw e
    }
  }

  async function listAccounts(headers: Headers) {
    try {
      return await auth.api.listUserAccounts({ headers })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to list accounts: ${e.message}`)
      }
      throw e
    }
  }

  async function unlinkAccount(input: UnlinkAccountInput, headers: Headers) {
    try {
      return await auth.api.unlinkAccount({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to unlink account: ${e.message}`)
      }
      throw e
    }
  }

  async function accountInfo(headers: Headers) {
    try {
      return await auth.api.accountInfo({ headers })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to get account info: ${e.message}`)
      }
      throw e
    }
  }

  // ─── Self-service: Sessions ─────────────────────────────────────

  async function revokeSession(token: string, headers: Headers) {
    try {
      return await auth.api.revokeSession({
        headers,
        body: { token },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to revoke session: ${e.message}`)
      }
      throw e
    }
  }

  async function revokeOtherSessions(headers: Headers) {
    try {
      return await auth.api.revokeOtherSessions({ headers })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to revoke other sessions: ${e.message}`)
      }
      throw e
    }
  }

  // ─── Self-service: Two-Factor ────────────────────────────────────

  async function getTotpUri(password: string, headers: Headers) {
    try {
      return await auth.api.getTOTPURI({
        headers,
        body: { password },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to get TOTP URI: ${e.message}`)
      }
      throw e
    }
  }

  async function enableTwoFactor(input: EnableTwoFactorInput, headers: Headers) {
    try {
      return await auth.api.enableTwoFactor({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to enable two-factor: ${e.message}`)
      }
      throw e
    }
  }

  async function disableTwoFactor(password: string, headers: Headers) {
    try {
      return await auth.api.disableTwoFactor({
        headers,
        body: { password },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to disable two-factor: ${e.message}`)
      }
      throw e
    }
  }

  async function verifyTotp(input: VerifyTotpInput, headers: Headers) {
    try {
      return await auth.api.verifyTOTP({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to verify TOTP: ${e.message}`)
      }
      throw e
    }
  }

  async function sendOtp(headers: Headers) {
    try {
      return await auth.api.sendTwoFactorOTP({
        headers,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to send OTP: ${e.message}`)
      }
      throw e
    }
  }

  async function verifyOtp(input: VerifyOtpInput, headers: Headers) {
    try {
      return await auth.api.verifyTwoFactorOTP({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to verify OTP: ${e.message}`)
      }
      throw e
    }
  }

  async function verifyBackupCode(input: VerifyBackupCodeInput, headers: Headers) {
    try {
      return await auth.api.verifyBackupCode({
        headers,
        body: input,
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to verify backup code: ${e.message}`)
      }
      throw e
    }
  }

  async function generateBackupCodes(password: string, headers: Headers) {
    try {
      return await auth.api.generateBackupCodes({
        headers,
        body: { password },
      })
    }
    catch (e: unknown) {
      if (e instanceof APIError) {
        throw new Error(`Failed to generate backup codes: ${e.message}`)
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
    changePassword,
    changeEmail,
    updateProfile,
    deleteAccount,
    listAccounts,
    unlinkAccount,
    accountInfo,
    revokeSession,
    revokeOtherSessions,
    getTotpUri,
    enableTwoFactor,
    disableTwoFactor,
    verifyTotp,
    sendOtp,
    verifyOtp,
    verifyBackupCode,
    generateBackupCodes,
    hasPermission,
  }
}

class AccountRepository extends Repository<{ accounts: AccountSchema }, Relations, AccountSchema, 'accounts'> {
  get model() {
    return 'accounts' as const
  }
}

class SessionRepository extends Repository<{ sessions: SessionSchema }, Relations, SessionSchema, 'sessions'> {
  get model() {
    return 'sessions' as const
  }
}

export function createAuthService(
  db: Database,
  auth: Auth,
  organizationService: OrganizationService,
  userService: UserService,
  acc: AccessControl,
  roles?: Record<string, AccessRole>,
) {
  return {
    account: AccountRepository.buildService([db]),
    session: SessionRepository.buildService([db], { exclude: ['create', 'update', 'restore', 'delete']}),
    hasPermission: async (opts: {
      ctx: PermissionCheckContext
      permissions: { [key: string]: string[] }
      role?: string
      options?: {
        allowCreatorAllPermissions?: boolean
        useMemoryCache?: boolean
        connector?: 'AND' | 'OR'
      }
    }) => opts.ctx.organizationId && opts.role
      ? await organizationService.hasPermission({
          auth,
          orgId: opts.ctx.organizationId,
          permissions: opts.permissions,
          role: opts.role,
          allowCreatorAllPermissions: opts.options?.allowCreatorAllPermissions,
          useMemoryCache: opts.options?.useMemoryCache,
          connector: opts.options?.connector,
        })
      : userService.hasPermission({
          auth,
          userId: opts.ctx.userId,
          permissions: opts.permissions,
          role: opts.role,
          connector: opts.options?.connector,
        }),
    getSession: (headers: Headers) => auth.api.getSession({ headers }),
    accessControl: acc,
    roles,
  }
}
