import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db'
import { DrizzleDb } from '@czo/kit/db'
import { describe, expect, it, layer } from '@effect/vitest'
import { Duration, Effect, Layer } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { users } from '../database/schema'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Cookie from './cookie'
import * as AuthEventsMod from './events/auth'
import * as UserEventsMod from './events/user'
import * as Session from './session'

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

// SessionService provided over the Testcontainers Postgres + memory persistence.
const TestLayer = Session.layer.pipe(
  Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer, AuthEventsMod.layer)),
  Layer.provideMerge(AuthPostgresLayer),
)

/** Insert a user, return its id. */
const seedUser = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const now = new Date()
  const rows = yield* db.insert(users).values({
    name: 'Ada',
    email: `ada-${Math.random()}@example.com`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  }).returning()
  return (rows[0] as { id: number }).id
})

// `excludeTestServices: true` so we run against the real wall clock — the
// `listForUser` ordering test relies on `Effect.sleep` producing distinct
// `createdAt` timestamps, which requires real time. No test in this suite
// needs `TestClock`.
layer(TestLayer, { timeout: 120_000, excludeTestServices: true })('sessionService', (it) => {
  it.effect('create → resolve round-trips the session + user', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      const { token } = yield* svc.create({ userId, actorType: 'user' })
      const resolved = yield* svc.resolve(token)
      expect(resolved?.session.userId).toBe(userId)
      expect(resolved?.user.id).toBe(userId)
    }))

  it.effect('resolve returns null for an unknown token', () =>
    Effect.gen(function* () {
      const resolved = yield* (yield* Session.SessionService).resolve('does-not-exist')
      expect(resolved).toBeNull()
    }))

  it.effect('revoke makes a subsequent resolve return null', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      const { token } = yield* svc.create({ userId, actorType: 'user' })
      yield* svc.revoke(token)
      expect(yield* svc.resolve(token)).toBeNull()
    }))

  it.effect('purgeExpired deletes expired rows and returns the count', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      yield* svc.create({ userId, actorType: 'user', expiresIn: Duration.seconds(-1) })
      expect(yield* svc.purgeExpired()).toBeGreaterThanOrEqual(1)
    }))

  it.effect('setCookie / readSessionToken round-trip the token', () =>
    Effect.gen(function* () {
      const svc = yield* Session.SessionService
      const cookie = svc.setCookie('tok-roundtrip')
      expect(svc.readSessionToken(`${cookie.name}=${cookie.value}`)).toBe('tok-roundtrip')
    }))

  it.effect('readBearerToken extracts a Bearer token (case-insensitive scheme)', () =>
    Effect.gen(function* () {
      const svc = yield* Session.SessionService
      expect(svc.readBearerToken('Bearer tok-abc')).toBe('tok-abc')
      expect(svc.readBearerToken('bearer tok-abc')).toBe('tok-abc')
      expect(svc.readBearerToken('Bearer   tok-abc  ')).toBe('tok-abc')
    }))

  it.effect('readBearerToken returns null for absent/other-scheme/empty headers', () =>
    Effect.gen(function* () {
      const svc = yield* Session.SessionService
      expect(svc.readBearerToken(null)).toBeNull()
      expect(svc.readBearerToken(undefined)).toBeNull()
      expect(svc.readBearerToken('')).toBeNull()
      expect(svc.readBearerToken('Basic dXNlcjpwYXNz')).toBeNull()
      expect(svc.readBearerToken('Bearer')).toBeNull()
      expect(svc.readBearerToken('Bearer   ')).toBeNull()
    }))

  it.effect('update patches a session field and the next resolve sees it', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      const { token } = yield* svc.create({ userId })
      yield* svc.update(token, { activeOrganizationId: '42' })
      const resolved = yield* svc.resolve(token)
      expect(resolved?.session.activeOrganizationId).toBe('42')
    }))

  it.effect('listForUser returns active sessions ordered by createdAt desc', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      const first = yield* svc.create({ userId, actorType: 'user' })
      yield* Effect.sleep(Duration.millis(50))
      const second = yield* svc.create({ userId, actorType: 'user' })
      const list = yield* svc.listForUser(userId)
      expect(list).toHaveLength(2)
      expect(list[0]?.token).toBe(second.token)
      expect(list[1]?.token).toBe(first.token)
    }))

  it.effect('listForUser excludes expired sessions', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      yield* svc.create({ userId, actorType: 'user' })
      yield* svc.create({ userId, actorType: 'user', expiresIn: Duration.seconds(-1) })
      const list = yield* svc.listForUser(userId)
      expect(list).toHaveLength(1)
    }))

  it.effect('listForUser returns empty array when user has no sessions', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      const list = yield* svc.listForUser(userId)
      expect(list).toEqual([])
    }))

  it.effect('invalidateCacheForUser drops cache entries but keeps DB sessions', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      const created = yield* svc.create({ userId, actorType: 'user' })
      const before = yield* svc.resolve(created.token)
      expect(before).not.toBeNull()

      yield* svc.invalidateCacheForUser(userId)

      expect(yield* svc.listForUser(userId)).toHaveLength(1)
      const after = yield* svc.resolve(created.token)
      expect(after).not.toBeNull()
      expect(after?.session.token).toBe(created.token)
    }))

  it.effect('invalidateCacheForUser is a no-op for users with no sessions', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      yield* svc.invalidateCacheForUser(userId)
    }))

  // ─── SP4b: impersonation parent/child linkage ──────────────────────────
  it.effect('parent session remains resolvable while a live child exists', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser
      const targetId = yield* seedUser
      const svc = yield* Session.SessionService

      const admin = yield* svc.create({ userId: adminId, actorType: 'user' })

      yield* svc.create({
        userId: targetId,
        actorType: 'user',
        impersonatedBy: adminId,
        parentToken: admin.token,
      })

      yield* svc.invalidateCacheForUser(adminId)
      const resolved = yield* svc.resolve(admin.token)
      expect(resolved).not.toBeNull()
      expect(resolved?.session.token).toBe(admin.token)
    }))

  it.effect('FK cascade: revoking admin token deletes child impersonation session', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser
      const targetId = yield* seedUser
      const svc = yield* Session.SessionService

      const admin = yield* svc.create({ userId: adminId, actorType: 'user' })
      const child = yield* svc.create({
        userId: targetId,
        actorType: 'user',
        impersonatedBy: adminId,
        parentToken: admin.token,
      })

      yield* svc.revoke(admin.token)
      expect(yield* svc.listForUser(targetId)).toHaveLength(0)
      expect(yield* svc.resolve(child.token)).toBeNull()
    }))
})

// ─── subscribersLayer ───────────────────────────────────────────────────

const TestLayerWithSubscribers = Session.subscribersLayer.pipe(
  Layer.provideMerge(UserEventsMod.layer),
  Layer.provideMerge(TestLayer),
)

layer(TestLayerWithSubscribers, { timeout: 120_000, excludeTestServices: true })('subscribersLayer', (it) => {
  it.effect('revokes all sessions on UserBanned event', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      const events = yield* UserEventsMod.UserEvents

      yield* svc.create({ userId, actorType: 'user' })
      expect(yield* svc.listForUser(userId)).toHaveLength(1)

      yield* events.publish({
        _tag: 'UserBanned',
        userId,
        bannedBy: null,
        reason: 'test',
        expires: null,
      })
      yield* Effect.sleep(Duration.millis(200))

      expect(yield* svc.listForUser(userId)).toHaveLength(0)
    }))

  it.effect('invalidates session cache on UserRoleChanged (downgrade)', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      const events = yield* UserEventsMod.UserEvents

      const created = yield* svc.create({ userId, actorType: 'user' })
      yield* svc.resolve(created.token) // warm cache

      yield* events.publish({
        _tag: 'UserRoleChanged',
        userId,
        previousRole: 'admin',
        newRole: 'user',
        changedBy: null,
      })
      yield* Effect.sleep(Duration.millis(200))

      expect(yield* svc.listForUser(userId)).toHaveLength(1)
      const after = yield* svc.resolve(created.token)
      expect(after).not.toBeNull()
    }))

  it.effect('invalidates cache on UserRoleChanged (upgrade direction too)', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      const events = yield* UserEventsMod.UserEvents

      yield* svc.create({ userId, actorType: 'user' })

      yield* events.publish({
        _tag: 'UserRoleChanged',
        userId,
        previousRole: 'user',
        newRole: 'admin',
        changedBy: null,
      })
      yield* Effect.sleep(Duration.millis(200))

      expect(yield* svc.listForUser(userId)).toHaveLength(1)
    }))

  it.effect('revokeAllForUserExcept revokes all sessions except the specified token', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService

      const _s1 = yield* svc.create({ userId, actorType: 'user' })
      const s2 = yield* svc.create({ userId, actorType: 'user' })
      const _s3 = yield* svc.create({ userId, actorType: 'user' })
      expect(yield* svc.listForUser(userId)).toHaveLength(3)

      yield* svc.revokeAllForUserExcept(userId, s2.token)

      const remaining = yield* svc.listForUser(userId)
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.token).toBe(s2.token)
    }))

  it.effect('revokeAllForUserExcept with non-existent exceptToken revokes all sessions', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService

      yield* svc.create({ userId, actorType: 'user' })
      yield* svc.create({ userId, actorType: 'user' })
      yield* svc.revokeAllForUserExcept(userId, 'this-token-does-not-exist')
      expect(yield* svc.listForUser(userId)).toHaveLength(0)
    }))

  it.effect('revokeAllForUserExcept with user having only the exceptToken is a no-op', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService

      const only = yield* svc.create({ userId, actorType: 'user' })
      yield* svc.revokeAllForUserExcept(userId, only.token)
      const remaining = yield* svc.listForUser(userId)
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.token).toBe(only.token)
    }))
})

// A broken DB → SessionStoreFailed (separate suite — no container needed).
describe('sessionService — infra failure', () => {
  it.effect('create on a broken DB fails with SessionStoreFailed', () =>
    Effect.gen(function* () {
      const err = yield* (yield* Session.SessionService)
        .create({ userId: 1, actorType: 'user' })
        .pipe(Effect.flip)
      expect(err).toBeInstanceOf(Session.SessionStoreFailed)
    }).pipe(Effect.provide(Session.layer.pipe(Layer.provide(Layer.mergeAll(
      Layer.succeed(DrizzleDb, {
        insert: () => ({
          values: () => ({
            returning: () => Effect.fail(new Error('db down')),
          }),
        }),
      } as never),
      Persistence.layerMemory,
      cookieLayer,
      AuthEventsMod.layer,
    ))))))
})
