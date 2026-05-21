import type { createAccessControl, Role, Subset } from 'better-auth/plugins/access'
import type { Effect } from 'effect'
import { Context, Data } from 'effect'

// ─── Core types ──────────────────────────────────────────────────────

export type Statements = Record<string, readonly string[]>

export type RolePermissions<S extends Statements> = {
  [K in keyof S]?: S[K][number][]
}

export type AccessRole<S extends Statements = Statements> = Role<S>

export interface AccessStatementProvider<
  S extends Statements = Statements,
  R extends string = string,
> {
  name: string
  roles: Record<R, AccessRole<S>>
}

export interface HierarchyLevel<S extends Statements = Statements> {
  name: string
  permissions: RolePermissions<S>
}

export interface AccessProviderOption<
  S extends Statements = Statements,
> {
  name: string
  statements: S
  hierarchy: HierarchyLevel<S>[]
}

export interface AccessHierarchyProvider<
  S extends Statements = Statements,
> {
  name: string
  hierarchy: HierarchyLevel<S>[]
}

export interface RoleBuilder<S extends Statements> {
  statements: S
  ac: ReturnType<typeof createAccessControl<S>>
  createHierarchy: <const N extends string>(
    hierarchy: { name: N, permissions: RolePermissions<S> }[],
  ) => Record<N, AccessRole<S>>
}

// ─── Pure helpers ────────────────────────────────────────────────────

export function mergePermissions<S extends Statements>(
  base: Partial<{ [K in keyof S]: S[K][number][] }>,
  additions: Partial<{ [K in keyof S]: S[K][number][] }>,
): { [K in keyof S]?: S[K][number][] } {
  const allKeys = new Set([...Object.keys(base), ...Object.keys(additions)])
  const merged: Record<string, string[]> = {}
  for (const key of allKeys) {
    const baseActions = (base as Record<string, string[]>)[key] ?? []
    const addActions = (additions as Record<string, string[]>)[key] ?? []
    merged[key] = [...new Set([...baseActions, ...addActions])]
  }
  return merged as { [K in keyof S]?: S[K][number][] }
}

export function roleBuilder<const S extends Statements>(
  ac: ReturnType<typeof createAccessControl<S>>,
): RoleBuilder<S> {
  return {
    statements: ac.statements,
    ac,
    createHierarchy(hierarchy) {
      const roles = {} as Record<string, AccessRole<S>>
      let accumulated: RolePermissions<S> = {}
      for (const level of hierarchy) {
        accumulated = mergePermissions<S>(accumulated, level.permissions)
        // Subset<keyof S, S> is structurally equivalent to S at instantiation,
        // but TS can't prove it at the generic level — safe to cast.
        roles[level.name] = ac.newRole(accumulated as Subset<keyof S, S>) as unknown as AccessRole<S>
      }
      return roles
    },
  }
}

// ─── Tagged errors (boot-time, never surfaced via GraphQL) ───────────

export class AccessRegistryFrozen extends Data.TaggedError('AccessRegistryFrozen')<{
  readonly subject: string
}> {
  readonly code = 'ACCESS_REGISTRY_FROZEN'
  get message() {
    return `Cannot register ${this.subject} — registry is frozen`
  }
}

export class StatementProviderAlreadyRegistered extends Data.TaggedError('StatementProviderAlreadyRegistered')<{
  readonly providerName: string
}> {
  readonly code = 'STATEMENT_PROVIDER_ALREADY_REGISTERED'
  get message() {
    return `Statement provider "${this.providerName}" is already registered`
  }
}

export class RolesHierarchyAlreadyRegistered extends Data.TaggedError('RolesHierarchyAlreadyRegistered')<{
  readonly providerName: string
}> {
  readonly code = 'ROLES_HIERARCHY_ALREADY_REGISTERED'
  get message() {
    return `Roles hierarchy for "${this.providerName}" is already registered`
  }
}

export class StatementResourceAlreadyRegistered extends Data.TaggedError('StatementResourceAlreadyRegistered')<{
  readonly resource: string
}> {
  readonly code = 'STATEMENT_RESOURCE_ALREADY_REGISTERED'
  get message() {
    return `Statement resource "${this.resource}" is already registered`
  }
}

export type AccessRegistryError
  = | AccessRegistryFrozen
    | StatementProviderAlreadyRegistered
    | RolesHierarchyAlreadyRegistered
    | StatementResourceAlreadyRegistered

// ─── Service contract (Effect Tag) ───────────────────────────────────

export interface BuiltRoles {
  readonly ac: ReturnType<typeof createAccessControl<Statements>>
  readonly roles: Record<string, AccessRole>
}

export class AccessService extends Context.Service<
  AccessService,
  {
    readonly register: <S extends Statements>(
      option: AccessProviderOption<S>,
    ) => Effect.Effect<void, AccessRegistryError>

    readonly providers: Effect.Effect<readonly AccessStatementProvider[]>
    readonly hierarchies: Effect.Effect<readonly AccessHierarchyProvider[]>
    readonly role: (name: string) => Effect.Effect<AccessRole | undefined>
    readonly roles: Effect.Effect<Record<string, AccessRole>>
    readonly statements: Effect.Effect<Record<string, readonly string[]>>

    readonly freeze: Effect.Effect<void>
    readonly isFrozen: Effect.Effect<boolean>

    /**
     * Materializes the AC + roles from registered hierarchies. Also back-fills
     * `providers` so subsequent `role` / `roles` lookups succeed. Idempotent in
     * effect — calling twice rebuilds from the current statements/hierarchies.
     */
    readonly buildRoles: Effect.Effect<BuiltRoles>
  }
>()('@czo/auth/AccessService') {}
