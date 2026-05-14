import type { AccessRole } from '../access'

export function validateRole(role: string | string[], roles?: Record<string, AccessRole>) {
  const _roles = Array.isArray(role) ? role : [role]

  for (const role of _roles) {
    if (roles && !roles[role])
      return false
  }
  return _roles.join(',') // store as comma-separated string
}
