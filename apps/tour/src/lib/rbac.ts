import type { MeUser } from '../server/auth.server'

/**
 * Client-side RBAC gate. Checks the viewer's effective permissions — which are
 * resolved authoritatively by the backend's AccessService from the user's CSV
 * roles (cumulative hierarchies) and delivered via `me.permissions`. This is a
 * UX gate only; the GraphQL API remains the security boundary.
 *
 * Type-only import of `MeUser` is erased at build, so this stays client-safe.
 */
export function can(
  me: Pick<MeUser, 'permissions'> | null | undefined,
  resource: string,
  action: string,
): boolean {
  if (!me)
    return false
  const group = me.permissions.find(p => p.resource === resource)
  return group ? group.actions.includes(action) : false
}
