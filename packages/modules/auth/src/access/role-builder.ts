import type { Subset } from 'better-auth/plugins/access'
import type { AccessRole, RolePermissions, Statements } from './types'
import { createAccessControl } from 'better-auth/plugins/access'
import { mergePermissions } from './merge-permissions'

export interface RoleBuilder<S extends Statements> {
  statements: S
  ac: ReturnType<typeof createAccessControl<S>>
  createHierarchy: <const N extends string>(
    hierarchy: { name: N, permissions: RolePermissions<S> }[],
  ) => Record<N, AccessRole<S>>
}

export function createRoleBuilder<const S extends Statements>(statements: S): RoleBuilder<S> {
  const ac = createAccessControl(statements)

  return {
    statements,
    ac,
    createHierarchy(hierarchy) {
      const roles = {} as Record<string, AccessRole<S>>
      let accumulated: RolePermissions<S> = {}

      for (const level of hierarchy) {
        accumulated = mergePermissions<S>(accumulated, level.permissions)
        // Subset<keyof S, S> is structurally equivalent to S at instantiation,
        // but TS can't prove it at the generic level — safe to cast
        roles[level.name] = ac.newRole(accumulated as Subset<keyof S, S>) as unknown as AccessRole<S>
      }

      return roles
    },
  }
}
