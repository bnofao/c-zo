import type {
  AccessHierarchyProvider,
  AccessProviderOption,
  AccessRole,
  AccessStatementProvider,
  BuiltRoles,
  Statements,
} from '../services'
import { createAccessControl } from 'better-auth/plugins/access'
import { Effect, Layer } from 'effect'
import {
  AccessRegistryFrozen,
  AccessService,
  roleBuilder,
  RolesHierarchyAlreadyRegistered,
  StatementProviderAlreadyRegistered,
  StatementResourceAlreadyRegistered,
} from '../services'

/** Initial access provider options the registry is seeded with at construction. */
export type InitialAccessOptions = readonly AccessProviderOption<Statements>[]

/**
 * Build the `AccessService` Live layer, seeded with `initialOptions`.
 *
 * Holds the statement / hierarchy / provider registries as closure-local
 * mutable `Map`s — per-runtime singleton. `register` fails with tagged errors
 * once frozen or on duplicate name/resource (boot-time developer errors, not
 * surfaced via GraphQL). `buildRoles` materializes the better-auth AC + roles
 * AND back-fills `_providers` so subsequent `role` / `roles` lookups succeed.
 *
 * @param initialOptions - provider options seeded at construction
 * @param freezeOnInit   - when true, the registry is frozen immediately
 */
export function makeAccessServiceLive(
  initialOptions: InitialAccessOptions = [],
  freezeOnInit = false,
) {
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
    })
  })
}

/** Convenience: empty, unfrozen registry (handy in tests). */
export const AccessServiceLive = makeAccessServiceLive()
