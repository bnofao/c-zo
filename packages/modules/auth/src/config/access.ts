import type { Role, Subset } from 'better-auth/plugins/access'
import { createAccessControl } from 'better-auth/plugins/access'

// ─── Core Types ──────────────────────────────────────────────────────

export type Statements = Record<string, readonly string[]>

export type RolePermissions<S extends Statements> = {
  [K in keyof S]?: S[K][number][]
}

export type AccessRole<S extends Statements = Statements> = Role<S>

// ─── Provider ────────────────────────────────────────────────────────

export interface AccessStatementProvider<
  S extends Statements = Statements,
  R extends string = string,
> {
  name: string
  roles: Record<R, AccessRole<S>>
}

export interface AccessProviderOption<
  S extends Statements = Statements,
  R extends string = string,
> {
  name: string
  statements: S
  hierarchy: Record<R, RolePermissions<S>>[]
}

export interface AccessHierarchyProvider<
  S extends Statements = Statements,
  R extends string = string,
> {
  name: string
  hierarchy: Record<R, RolePermissions<S>>[]
}

// ─── Permission Check ────────────────────────────────────────────────

export interface PermissionCheckContext {
  userId: string
  organizationId?: string
}

// ─── Role builder ────────────────────────────────────────────────

export interface RoleBuilder<S extends Statements> {
  statements: S
  ac: ReturnType<typeof createAccessControl<S>>
  createHierarchy: <const N extends string>(
    hierarchy: { name: N, permissions: RolePermissions<S> }[],
  ) => Record<N, AccessRole<S>>
}

export function mergePermissions<S extends Statements>(
  base: Partial<{ [K in keyof S]: S[K][number][] }>,
  additions: Partial<{ [K in keyof S]: S[K][number][] }>,
): { [K in keyof S]?: S[K][number][] } {
  const allKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(additions),
  ])

  const merged: Record<string, string[]> = {}

  for (const key of allKeys) {
    const baseActions = (base as Record<string, string[]>)[key] ?? []
    const addActions = (additions as Record<string, string[]>)[key] ?? []
    merged[key] = [...new Set([...baseActions, ...addActions])]
  }

  return merged as { [K in keyof S]?: S[K][number][] }
}

export function roleBuilder<const S extends Statements>(ac: ReturnType<typeof createAccessControl<S>>): RoleBuilder<S> {
  return {
    statements: ac.statements,
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

// ─── Factory ─────────────────────────────────────────────────────────

export type AccessService = ReturnType<typeof createAccessService>

export function createAccessService() {
  const _statements = new Map<string, readonly string[]>()
  const _hierarchies = new Map<string, AccessHierarchyProvider>()
  const _providers = new Map<string, AccessStatementProvider>()
  let frozen = false

  function register<S extends Statements, R extends string>(
    option: AccessProviderOption<S, R>,
  ): void {
    if (frozen) {
      throw new Error(`Cannot register statements "${option.name}" — registry is frozen`)
    }

    if (_providers.has(option.name)) {
      throw new Error(`Statement provider "${option.name}" is already registered`)
    }

    if (_hierarchies.has(option.name)) {
      throw new Error(`Roles hierarchy for "${option.name}" is already registered`)
    }

    for (const [resource, permissions] of Object.entries(option.statements)) {
      if (_statements.has(resource)) {
        throw new Error(`Statement resource "${resource}" is already registered`)
      }

      _statements.set(resource, permissions)
    }

    _hierarchies.set(option.name, { name: option.name, hierarchy: option.hierarchy })
  }

  function providers(): AccessStatementProvider[] {
    return [..._providers.values()]
  }

  function hierarchies(): AccessHierarchyProvider[] {
    return [..._hierarchies.values()]
  }

  function role(name: string): AccessRole | undefined {
    for (const provider of _providers.values()) {
      if (name in provider.roles) {
        return provider.roles[name]
      }
    }
    return undefined
  }

  function roles(): Record<string, AccessRole> {
    const roleMap: Record<string, AccessRole> = {}

    for (const provider of _providers.values()) {
      for (const [roleName, role] of Object.entries(provider.roles)) {
        roleMap[roleName] = role
      }
    }

    return roleMap
  }

  function freeze(): void {
    frozen = true
  }

  function isFrozen(): boolean {
    return frozen
  }

  function statements() {
    return Object.fromEntries(_statements.entries())
  }

  function buildRoles() {
    const ac = createAccessControl(statements())
    const builder = roleBuilder(ac)
    let roles = {} as Record<string, AccessRole<any>>

    for (const [name, hierarchy] of _hierarchies.entries()) {
      const _roles = builder.createHierarchy(hierarchy as any)
      roles = Object.assign(roles, _roles)
      _providers.set(
        name,
        {
          name,
          roles: _roles,
        },
      )
    }

    return { ac, roles }
  }

  return {
    register,
    providers,
    hierarchies,
    role,
    roles,
    freeze,
    isFrozen,
    buildRoles,
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

export function useAccessService(): AccessService {
  return ((useAccessService as any).__instance__ ??= createAccessService())
}
