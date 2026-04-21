import type { Auth } from '@czo/auth/config'
import type { AdminOptions } from 'better-auth/plugins'
import type { OrganizationService } from './organization.service'
import type { UserService } from './user.service'
import { mapAPIError } from './_internal/map-error'

// ─── Types ───────────────────────────────────────────────────────────

export interface PermissionCheckContext {
  userId: string
  organizationId?: string
  role?: string
}

export type AuthService = ReturnType<typeof createAuthService>

// ─── Factory ─────────────────────────────────────────────────────────

export function createAuthService(
  auth: Auth,
  userService: UserService,
  organizationService: OrganizationService,
) {
  return {
    // ── Session ──

    async getSession(headers: Headers) {
      try {
        return await auth.api.getSession({ headers })
      }
      catch (err) {
        mapAPIError(err, 'Session')
      }
    },

    // ── Access control getters ──

    get accessControl() {
      return (auth.options as any).ac
    },

    get roles() {
      return (auth.options as any).roles
    },

    // ── hasPermission dispatcher ──

    async hasPermission(
      ctx: PermissionCheckContext,
      permissions: Record<string, string[]>,
      options?: {
        allowCreatorAllPermissions?: boolean
        useMemoryCache?: boolean
        connector?: 'AND' | 'OR'
      },
    ): Promise<boolean> {
      if (ctx.organizationId && ctx.role) {
        return organizationService.hasPermission(
          ctx.organizationId,
          permissions,
          ctx.role,
          options,
        )
      }

      return userService.hasPermission({
        userId: ctx.userId,
        permissions,
        role: ctx.role,
        connector: options?.connector,
      })
    },

    // ── Admin shortcuts (preserved for backwards compat) ──

    isAdminUser(userId: string): boolean {
      const adminOptions = auth.options.plugins?.find(
        (p: { id: string }) => p.id === 'admin',
      )?.options as AdminOptions | undefined
      return adminOptions?.adminUserIds?.includes(userId) ?? false
    },
  }
}
