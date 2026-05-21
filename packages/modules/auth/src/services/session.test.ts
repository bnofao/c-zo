import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db'
import { DrizzleDb } from '@czo/kit/db/effect'
import { describe, expect, it, layer } from '@effect/vitest'
import { Duration, Effect, Layer } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { users } from '../database/schema'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Cookie from './cookie'
import * as Session from './session'

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

// SessionService provided over the Testcontainers Postgres + memory persistence.
const TestLayer = Session.layer.pipe(
  Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer)),
  Layer.provideMerge(AuthPostgresLayer),
)

/** Insert a user, return its id. */
const seedUser = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const now = new Date()
  const rows = yield* Effect.promise(() => db.insert(users).values({
    name: 'Ada', email: `ada-${Math.random()}@example.com`,
    emailVerified: false, createdAt: now, updatedAt: now,
  }).returning())
  return (rows[0] as { id: number }).id
})

layer(TestLayer, { timeout: 120_000 })('sessionService', (it) => {
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
      Layer.succeed(DrizzleDb, { insert: () => { throw new Error('db down') } } as never),
      Persistence.layerMemory,
      cookieLayer,
    ))))))
})
