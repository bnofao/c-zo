import type { Effect as EffectT } from 'effect'
import { expectFailure, expectSuccess } from '@czo/kit/effect'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Access from './access'

const {
  AccessRegistryFrozen,
  AccessService,
  RolesHierarchyAlreadyRegistered,
  StatementProviderAlreadyRegistered,
  StatementResourceAlreadyRegistered,
} = Access

const ORG = {
  organization: ['read', 'update'],
  member: ['read', 'create'],
} as const

const ADMIN = {
  user: ['create', 'read'],
  session: ['read', 'list'],
} as const

const ORG_HIERARCHY = [
  { name: 'org:member', permissions: {} },
  { name: 'org:viewer', permissions: { organization: ['read'], member: ['read'] } },
  { name: 'org:admin', permissions: { organization: ['update'], member: ['create'] } },
] as const

const ADMIN_HIERARCHY = [
  { name: 'admin', permissions: { user: ['create', 'read'], session: ['read', 'list'] } },
] as const

function runSuccess<A>(fn: (svc: typeof AccessService.Service) => EffectT.Effect<A, any>) {
  return expectSuccess(
    Effect.gen(function* () {
      const svc = yield* AccessService
      return yield* fn(svc)
    }).pipe(Effect.provide(Access.layer)),
  )
}

function runFailure<T>(
  fn: (svc: typeof AccessService.Service) => EffectT.Effect<unknown, any>,
  Tag: { new (...args: any[]): T },
) {
  return expectFailure(
    Effect.gen(function* () {
      const svc = yield* AccessService
      return yield* fn(svc)
    }).pipe(Effect.provide(Access.layer)),
    Tag,
  )
}

describe('accessService layer', () => {
  describe('register', () => {
    it('registers a provider option and exposes its hierarchy', async () => {
      const hierarchies = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.register({ name: 'organization', statements: ORG, hierarchy: [...ORG_HIERARCHY] })
          return yield* svc.hierarchies
        }),
      )
      expect(hierarchies).toHaveLength(1)
      expect(hierarchies[0]!.name).toBe('organization')
    })

    it('fails on duplicate hierarchy registration', async () => {
      const err = await runFailure(svc =>
        Effect.gen(function* () {
          yield* svc.register({ name: 'organization', statements: ORG, hierarchy: [...ORG_HIERARCHY] })
          yield* svc.register({ name: 'organization', statements: ADMIN, hierarchy: [...ADMIN_HIERARCHY] })
        }), RolesHierarchyAlreadyRegistered)
      expect(err.message).toContain('"organization"')
    })

    it('fails on duplicate statement resource across providers', async () => {
      const err = await runFailure(svc =>
        Effect.gen(function* () {
          yield* svc.register({ name: 'organization', statements: ORG, hierarchy: [...ORG_HIERARCHY] })
          // re-uses `organization` resource key
          yield* svc.register({ name: 'other', statements: ORG, hierarchy: [{ name: 'x', permissions: {} }] })
        }), StatementResourceAlreadyRegistered)
      expect(err.message).toContain('organization')
    })

    it('fails when registry is frozen', async () => {
      const err = await runFailure(svc =>
        Effect.gen(function* () {
          yield* svc.freeze
          yield* svc.register({ name: 'organization', statements: ORG, hierarchy: [...ORG_HIERARCHY] })
        }), AccessRegistryFrozen)
      expect(err.message).toContain('registry is frozen')
    })

    it('fails on duplicate provider after buildRoles back-fills providers', async () => {
      const err = await runFailure(svc =>
        Effect.gen(function* () {
          yield* svc.register({ name: 'organization', statements: ORG, hierarchy: [...ORG_HIERARCHY] })
          yield* svc.buildRoles
          // second register with same name now also collides on _providers
          yield* svc.register({ name: 'organization', statements: ADMIN, hierarchy: [...ADMIN_HIERARCHY] })
        }), StatementProviderAlreadyRegistered)
      expect(err.message).toContain('"organization"')
    })
  })

  describe('buildRoles', () => {
    it('materializes roles from registered hierarchies and exposes them via role/roles', async () => {
      const { roleNames, viaRoles, viaLookup } = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.register({ name: 'organization', statements: ORG, hierarchy: [...ORG_HIERARCHY] })
          yield* svc.register({ name: 'admin', statements: ADMIN, hierarchy: [...ADMIN_HIERARCHY] })
          const built = yield* svc.buildRoles
          const all = yield* svc.roles
          const adminRole = yield* svc.role('admin')
          return {
            roleNames: Object.keys(built.roles),
            viaRoles: Object.keys(all),
            viaLookup: adminRole,
          }
        }),
      )
      expect(roleNames).toEqual(expect.arrayContaining(['org:member', 'org:viewer', 'org:admin', 'admin']))
      expect(viaRoles).toEqual(expect.arrayContaining(roleNames))
      expect(viaLookup).toBeDefined()
    })

    it('accumulates permissions down the hierarchy', async () => {
      const statements = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.register({ name: 'organization', statements: ORG, hierarchy: [...ORG_HIERARCHY] })
          yield* svc.buildRoles
          return yield* svc.statements
        }),
      )
      expect(Object.keys(statements)).toEqual(expect.arrayContaining(['organization', 'member']))
    })
  })

  describe('freeze / isFrozen', () => {
    it('starts unfrozen and becomes frozen after freeze', async () => {
      const [before, after] = await runSuccess(svc =>
        Effect.gen(function* () {
          const a = yield* svc.isFrozen
          yield* svc.freeze
          const b = yield* svc.isFrozen
          return [a, b] as const
        }),
      )
      expect(before).toBe(false)
      expect(after).toBe(true)
    })

    it('still allows reads after freeze', async () => {
      const hierarchies = await runSuccess(svc =>
        Effect.gen(function* () {
          yield* svc.register({ name: 'organization', statements: ORG, hierarchy: [...ORG_HIERARCHY] })
          yield* svc.freeze
          return yield* svc.hierarchies
        }),
      )
      expect(hierarchies).toHaveLength(1)
    })
  })

  describe('role lookup', () => {
    it('returns undefined for unknown role names', async () => {
      const role = await runSuccess(svc => svc.role('nope'))
      expect(role).toBeUndefined()
    })
  })
})
