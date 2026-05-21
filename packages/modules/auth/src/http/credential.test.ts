import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db'
import { DrizzleDb } from '@czo/kit/db/effect'
import { describe, expect, it, layer } from '@effect/vitest'
import { Effect, Fiber, Layer, Stream } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { accounts, users } from '../database/schema'
import { makeAuthActorServiceLive } from '../layers/actor'
import { DEFAULT_ACTOR_RESTRICTIONS } from '../plugins/actor'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import { EmailAlreadyRegistered, InvalidCredentials, signIn, signUp } from './credential'
import * as AuthEvents from '../services/events/auth'
import * as Cookie from '../services/cookie'
import * as Password from '../services/password'
import * as Session from '../services/session'

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

const TestLayer = Layer.mergeAll(
  Password.layer,
  Session.layer.pipe(Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer))),
  makeAuthActorServiceLive(DEFAULT_ACTOR_RESTRICTIONS, true),
  AuthEvents.layer,
).pipe(Layer.provideMerge(AuthPostgresLayer))

layer(TestLayer, { timeout: 120_000 })('credential signUp/signIn', (it) => {
  it.effect('signUp creates user + credential + session', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const result = yield* signUp({ email: 'ada@example.com', name: 'Ada', password: 'Sup3r-Secret!' })
      expect(result.user.email).toBe('ada@example.com')
      expect(result.cookie.name).toBe('czo.session')
      expect(result.cookie.value).not.toBe('')
      const db = (yield* DrizzleDb) as Database<Relations>
      const accts = yield* Effect.promise(() => db.select().from(accounts))
      expect(accts).toHaveLength(1)
      expect((accts[0] as { providerId: string }).providerId).toBe('credential')
    }))

  it.effect('signUp publishes a SignedUp event on AuthEvents', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const events = yield* AuthEvents.AuthEvents
      // Subscribe BEFORE signUp so the forkDetach'd publish is observed.
      const collector = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow
      yield* signUp({ email: 'evt@example.com', name: 'E', password: 'Sup3r-Secret!' })
      const collected = yield* Fiber.join(collector)
      const event = collected[0]!
      expect(event._tag).toBe('SignedUp')
      expect(event.email).toBe('evt@example.com')
    }))

  it.effect('signUp rejects a duplicate email → EmailAlreadyRegistered', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      yield* signUp({ email: 'dup@example.com', name: 'A', password: 'Sup3r-Secret!' })
      const err = yield* signUp({ email: 'dup@example.com', name: 'B', password: 'Sup3r-Secret!' })
        .pipe(Effect.flip)
      expect(err).toBeInstanceOf(EmailAlreadyRegistered)
      const db = (yield* DrizzleDb) as Database<Relations>
      expect(yield* Effect.promise(() => db.select().from(users))).toHaveLength(1)
    }))

  it.effect('signIn with the correct password succeeds', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      yield* signUp({ email: 'in@example.com', name: 'A', password: 'Sup3r-Secret!' })
      const result = yield* signIn({ email: 'in@example.com', password: 'Sup3r-Secret!' })
      expect(result.user.email).toBe('in@example.com')
    }))

  it.effect('signIn with a wrong password → InvalidCredentials', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      yield* signUp({ email: 'wp@example.com', name: 'A', password: 'Sup3r-Secret!' })
      const err = yield* signIn({ email: 'wp@example.com', password: 'wrong' }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(InvalidCredentials)
    }))

  it.effect('signIn for an unknown email → InvalidCredentials (no enumeration)', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const err = yield* signIn({ email: 'ghost@example.com', password: 'x' }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(InvalidCredentials)
    }))
})
