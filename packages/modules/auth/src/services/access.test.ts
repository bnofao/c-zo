import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { AccessService, layer } from './access'

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
