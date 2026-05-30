import { Context, Data, Effect, Layer } from 'effect'

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
  ac: AccessControl<S>
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

// ─── Forked from better-auth/plugins/access (drop-in surface) ────────

export interface AuthorizeResult { success: boolean, error: string | null }

function authorizePermissions<S extends Statements>(
  granted: RolePermissions<S> | null | undefined,
  required: RolePermissions<S>,
  connector: 'AND' | 'OR' = 'AND',
): AuthorizeResult {
  if (!granted)
    return { success: false, error: 'No permissions granted' }
  for (const [resource, actions] of Object.entries(required) as [string, string[]][]) {
    const grantedActions = (granted as Record<string, string[]>)[resource]
    if (!grantedActions)
      return { success: false, error: `Missing resource: ${resource}` }
    const hasAll = actions.every(a => grantedActions.includes(a))
    const hasAny = actions.some(a => grantedActions.includes(a))
    if (connector === 'AND' && !hasAll)
      return { success: false, error: `Missing actions on ${resource}` }
    if (connector === 'OR' && !hasAny)
      return { success: false, error: `No matching action on ${resource}` }
  }
  return { success: true, error: null }
}

export interface Role<S extends Statements = Statements> {
  readonly statements: RolePermissions<S>
  readonly authorize: (
    required: RolePermissions<S>,
    connector?: 'AND' | 'OR',
  ) => AuthorizeResult
}

export interface AccessControl<S extends Statements> {
  readonly statements: S
  readonly newRole: (permissions: RolePermissions<S>) => Role<S>
}

export function createAccessControl<const S extends Statements>(
  statements: S,
): AccessControl<S> {
  return {
    statements,
    newRole: permissions => ({
      statements: permissions,
      authorize: (required, connector = 'AND') =>
        authorizePermissions(permissions, required, connector),
    }),
  }
}

export function roleBuilder<const S extends Statements>(
  ac: AccessControl<S>,
): RoleBuilder<S> {
  return {
    statements: ac.statements,
    ac,
    createHierarchy(hierarchy) {
      const roles = {} as Record<string, AccessRole<S>>
      let accumulated: RolePermissions<S> = {}
      for (const level of hierarchy) {
        accumulated = mergePermissions<S>(accumulated, level.permissions)
        roles[level.name] = ac.newRole(accumulated)
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
  readonly ac: AccessControl<Statements>
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

    /**
     * Ad-hoc role-permission check: does `granted` cover `required`?
     *
     * Delegates to the local `authorizePermissions` helper (forked from
     * better-auth's `role(granted).authorize(...)` set-inclusion algorithm,
     * MIT). The full registered roles/hierarchies surface (`role`, `roles`,
     * `buildRoles`) also uses the local fork — `@czo/auth` no longer depends
     * on `better-auth/plugins/access` at runtime.
     */
    readonly authorize: (
      granted: RolePermissions<Statements> | null | undefined,
      required: RolePermissions<Statements>,
      connector?: 'AND' | 'OR',
    ) => Effect.Effect<boolean>
  }
>()('@czo/auth/AccessService') {}

// ─── Layer ───────────────────────────────────────────────────────────

/** Initial access provider options the registry is seeded with at construction. */
export type InitialAccessOptions = readonly AccessProviderOption<Statements>[]

/**
 * Parameterized layer — seed the access registry and optionally freeze it at
 * boot.
 */
export function makeLayer(
  initialOptions: InitialAccessOptions = [],
  freezeOnInit = false,
): Layer.Layer<AccessService> {
  return Layer.sync(AccessService, () => {
    const _statements = new Map<string, readonly string[]>()
    const _hierarchies = new Map<string, AccessHierarchyProvider>()
    const _providers = new Map<string, AccessStatementProvider>()

    // Seed from initialOptions. Duplicate detection mirrors the runtime
    // `register` checks: same provider name, same hierarchy name, or same
    // statement resource across providers all throw — these are boot-time
    // configuration errors, so failing fast at construction is correct.
    for (const option of initialOptions) {
      if (_hierarchies.has(option.name))
        throw new Error(`Roles hierarchy for "${option.name}" is already registered`)
      for (const resource of Object.keys(option.statements)) {
        if (_statements.has(resource))
          throw new Error(`Statement resource "${resource}" is already registered`)
      }
      for (const [resource, permissions] of Object.entries(option.statements))
        _statements.set(resource, permissions as readonly string[])
      _hierarchies.set(option.name, { name: option.name, hierarchy: option.hierarchy })
    }

    let frozen = freezeOnInit

    return AccessService.of({
      register: option =>
        Effect.gen(function* () {
          if (frozen)
            return yield* Effect.fail(new AccessRegistryFrozen({ subject: `statements "${option.name}"` }))
          if (_providers.has(option.name))
            return yield* Effect.fail(new StatementProviderAlreadyRegistered({ providerName: option.name }))
          if (_hierarchies.has(option.name))
            return yield* Effect.fail(new RolesHierarchyAlreadyRegistered({ providerName: option.name }))

          for (const resource of Object.keys(option.statements)) {
            if (_statements.has(resource))
              return yield* Effect.fail(new StatementResourceAlreadyRegistered({ resource }))
          }

          for (const [resource, permissions] of Object.entries(option.statements))
            _statements.set(resource, permissions as readonly string[])

          _hierarchies.set(option.name, { name: option.name, hierarchy: option.hierarchy })
        }),

      providers: Effect.sync(() => [..._providers.values()]),

      hierarchies: Effect.sync(() => [..._hierarchies.values()]),

      role: name =>
        Effect.sync(() => {
          for (const provider of _providers.values()) {
            if (name in provider.roles)
              return provider.roles[name]
          }
          return undefined
        }),

      roles: Effect.sync(() => {
        const map: Record<string, AccessRole> = {}
        for (const provider of _providers.values()) {
          for (const [roleName, role] of Object.entries(provider.roles))
            map[roleName] = role
        }
        return map
      }),

      statements: Effect.sync(() => Object.fromEntries(_statements.entries())),

      freeze: Effect.sync(() => {
        frozen = true
      }),

      isFrozen: Effect.sync(() => frozen),

      buildRoles: Effect.sync((): BuiltRoles => {
        const ac = createAccessControl(Object.fromEntries(_statements.entries()))
        const builder = roleBuilder(ac)
        let roles: Record<string, AccessRole> = {}
        for (const [name, hierarchy] of _hierarchies.entries()) {
          const _roles = builder.createHierarchy(hierarchy.hierarchy as any)
          roles = Object.assign(roles, _roles)
          _providers.set(name, { name, roles: _roles })
        }
        return { ac, roles }
      }),

      authorize: (granted, required, connector = 'AND') =>
        Effect.sync(() => authorizePermissions(granted, required, connector).success),
    })
  })
}

/** Default layer — empty, unfrozen registry. */
export const layer = makeLayer()
