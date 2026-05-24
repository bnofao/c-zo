import type {
  AdminOptions,
} from 'better-auth/plugins'
import type { Auth } from './better-auth'
import { Effect, Layer } from 'effect'
import { AuthService, BetterAuth } from '../services'
import { checkOrgPermission } from '../services/organization'

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
