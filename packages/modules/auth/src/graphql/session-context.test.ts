import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db'
import { DrizzleDb } from '@czo/kit/db'
import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { users } from '../database/schema'
import * as Cookie from '../services/cookie'
import * as AuthEventsMod from '../services/events/auth'
import * as Session from '../services/session'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import { makeSessionContextContributor } from './session-context'

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

const TestLayer = Session.layer.pipe(
  Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer, AuthEventsMod.layer)),
  Layer.provideMerge(AuthPostgresLayer),
)

const contribute = makeSessionContextContributor()

layer(TestLayer, { timeout: 120_000 })('session-context contributor', (it) => {
  it.effect('no cookie → anonymous { auth: { session: null } }', () =>
    Effect.gen(function* () {
      const ctx = yield* contribute({ request: new Request('http://x') })
      expect((ctx as any).auth).toEqual({ session: null })
    }))

  it.effect('valid cookie → { auth: { session, user } }', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const db = (yield* DrizzleDb) as Database<Relations>
      const now = new Date()
      const [u] = yield* db.insert(users).values({
        name: 'Ada',
        email: 'ada@example.com',
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      }).returning()
      const { token } = yield* (yield* Session.SessionService).create({ userId: (u as any).id, actorType: 'user' })
      const ctx = yield* contribute({
        request: new Request('http://x', { headers: { cookie: `czo.session=${token}` } }),
      })
      expect((ctx as any).auth.user.id).toBe((u as any).id)
    }))
})
