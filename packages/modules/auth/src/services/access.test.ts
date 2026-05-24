import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { AccessService, createAccessControl, layer } from './access'

describe('AccessService.authorize', () => {
  it.effect('returns true when granted covers required (AND)', () =>
    Effect.gen(function* () {
      const access = yield* AccessService
      const ok = yield* access.authorize(
        { posts: ['read', 'write'] },
        { posts: ['read'] },
      )
      expect(ok).toBe(true)
    }).pipe(Effect.provide(layer)))

  it.effect('returns false when granted is missing a required resource', () =>
    Effect.gen(function* () {
      const access = yield* AccessService
      const ok = yield* access.authorize(
        { posts: ['read'] },
        { users: ['read'] },
      )
      expect(ok).toBe(false)
    }).pipe(Effect.provide(layer)))

  it.effect('returns false when granted is missing a required action (AND default)', () =>
    Effect.gen(function* () {
      const access = yield* AccessService
      const ok = yield* access.authorize(
        { posts: ['read'] },
        { posts: ['read', 'write'] },
      )
      expect(ok).toBe(false)
    }).pipe(Effect.provide(layer)))

  it.effect('returns true under OR when at least one action matches', () =>
    Effect.gen(function* () {
      const access = yield* AccessService
      const ok = yield* access.authorize(
        { posts: ['read'] },
        { posts: ['read', 'write'] },
        'OR',
      )
      expect(ok).toBe(true)
    }).pipe(Effect.provide(layer)))

  it.effect('returns false when granted is null', () =>
    Effect.gen(function* () {
      const access = yield* AccessService
      const ok = yield* access.authorize(null, { posts: ['read'] })
      expect(ok).toBe(false)
    }).pipe(Effect.provide(layer)))

  it.effect('returns false when granted is undefined', () =>
    Effect.gen(function* () {
      const access = yield* AccessService
      const ok = yield* access.authorize(undefined, { posts: ['read'] })
      expect(ok).toBe(false)
    }).pipe(Effect.provide(layer)))
})

describe('createAccessControl (fork of better-auth/plugins/access)', () => {
  const statements = { user: ['create', 'read', 'update'], 'api-key': ['create'] } as const

  it('exposes statements + newRole on the AccessControl', () => {
    const ac = createAccessControl(statements)
    expect(ac.statements).toEqual(statements)
    expect(typeof ac.newRole).toBe('function')
  })

  it('newRole returns a Role with statements + authorize', () => {
    const role = createAccessControl(statements).newRole({ user: ['create'] })
    expect(role.statements).toEqual({ user: ['create'] })
    expect(typeof role.authorize).toBe('function')
  })

  it('Role.authorize: AND success when all required actions are granted', () => {
    const role = createAccessControl(statements).newRole({ user: ['create', 'read', 'update'] })
    expect(role.authorize({ user: ['create', 'read'] })).toEqual({ success: true, error: null })
  })

  it('Role.authorize: AND failure when a required action is missing', () => {
    const role = createAccessControl(statements).newRole({ user: ['read'] })
    const result = role.authorize({ user: ['create', 'read'] }, 'AND')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Missing actions on user/)
  })

  it('Role.authorize: OR success when at least one required action is granted', () => {
    const role = createAccessControl(statements).newRole({ user: ['read'] })
    expect(role.authorize({ user: ['create', 'read'] }, 'OR')).toEqual({ success: true, error: null })
  })

  it('Role.authorize: failure when required resource is absent from granted', () => {
    const role = createAccessControl(statements).newRole({ user: ['read'] })
    const result = role.authorize({ 'api-key': ['create'] }, 'AND')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Missing resource: api-key/)
  })
})
