import type { Effect } from 'effect'
import { Context } from 'effect'

export interface PermissionCheckContext {
  userId: string
  organizationId?: string
  role?: string
}

export interface PermissionCheckOptions {
  allowCreatorAllPermissions?: boolean
  useMemoryCache?: boolean
  connector?: 'AND' | 'OR'
}

/**
 * AuthService — permission dispatcher.
 *
 * Routes permission checks against better-auth's admin / organization plugin
 * options, depending on whether `ctx.organizationId` + `ctx.role` are
 * present. Returned as an Effect for runtime consistency with the rest of
 * the auth Tags; never fails (returns `false` on missing permissions).
 *
 * The actual checks are implemented inline in `layers/auth.ts` (the helpers
 * formerly in `services/{user,org}-permissions.ts` are colocated with the
 * layer impl since they have no other consumers).
 */
export class AuthService extends Context.Tag('@czo/auth/AuthService')<
  AuthService,
  {
    readonly hasPermission: (
      ctx: PermissionCheckContext,
      permissions: Record<string, string[]>,
      options?: PermissionCheckOptions,
    ) => Effect.Effect<boolean, never>
  }
>() {}
