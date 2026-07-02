import type { RoleHierarchy } from '../components/users-query'

/**
 * Client-side mirror of the backend's delegated-admin role guard (see
 * @czo/auth `guardRoleChange`). Like `rbac.ts`, this is a UX gate only — the
 * GraphQL API remains the security boundary. Note the client registry excludes
 * the org / api-key domains, so this is a best-effort approximation there.
 */

export function csvRoles(role: string | null | undefined): string[] {
  return role ? role.split(',').map(s => s.trim()).filter(Boolean) : []
}

/** Domain → highest tier index held, resolved from the registry hierarchies. */
export function heldTiers(hierarchies: RoleHierarchy[], roles: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const h of hierarchies) {
    h.tiers.forEach((tier, idx) => {
      if (roles.includes(tier.name))
        m.set(h.name, Math.max(m.get(h.name) ?? idx, idx))
    })
  }
  return m
}

/**
 * Seniority rule: the target holds a strictly higher tier than the actor in a
 * domain they BOTH hold — the actor cannot administer them at all.
 */
export function targetOutranksActor(hierarchies: RoleHierarchy[], actorRoles: string[], targetRoles: string[]): boolean {
  const actor = heldTiers(hierarchies, actorRoles)
  const target = heldTiers(hierarchies, targetRoles)
  for (const [domain, targetTier] of target) {
    const actorTier = actor.get(domain)
    if (actorTier !== undefined && actorTier < targetTier)
      return true
  }
  return false
}
