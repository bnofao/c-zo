import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db'
import { DrizzleDb } from '@czo/kit/db'
import { expect, it, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { users } from '../database/schema'
import { ApiKeyService } from '../services/api-key'
import * as Cookie from '../services/cookie'
import * as AuthEventsMod from '../services/events/auth'
import * as Session from '../services/session'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import { makeAuthContextContributor } from './session-context'

// The contributor's `R` now includes `ApiKeyService` (api-key header branch).
// None of these tests send an `x-api-key` header, so `verify` is never called —
// a stub whose methods throw if reached satisfies the requirement.
const apiKeyStub = Layer.succeed(
  ApiKeyService,
  new Proxy({}, {
    get() {
      throw new Error('ApiKeyService not expected in session-context tests')
    },
  }) as unknown as ApiKeyService['Service'],
)

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

const TestLayer = Session.layer.pipe(
  Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer, AuthEventsMod.layer)),
  Layer.provideMerge(AuthPostgresLayer),
  Layer.merge(apiKeyStub),
)

const contribute = makeAuthContextContributor()

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

// ── B14: rotated-token response header for Bearer clients ──────────────────

function stubSession(rotatedTo: string) {
  return Layer.succeed(Session.SessionService, {
    readBearerToken: (h?: string | null) =>
      h && h.toLowerCase().startsWith('bearer ') ? h.slice(7) : null,
    readSessionToken: (cookie: string) => {
      const m = /czo\.session=([^;]+)/.exec(cookie)
      return m ? m[1] : null
    },
    resolve: (_token: string) =>
      Effect.succeed({ session: { token: rotatedTo, impersonatedBy: null }, user: { id: 1 } }),
    setCookie: (token: string) => ({ serialize: () => `czo.session=${token}` }),
  } as unknown as Session.SessionService['Service'])
}

it.effect('Bearer-sourced rotation sets X-Session-Token AND the cookie', () =>
  Effect.gen(function* () {
    const headers: Array<[string, string]> = []
    const cookies: string[] = []
    yield* contribute({
      request: new Request('http://x', { headers: { authorization: 'Bearer child-token' } }),
      setCookie: (s: string) => { cookies.push(s) },
      setHeader: (n: string, v: string) => { headers.push([n, v]) },
    }).pipe(Effect.provide(Layer.merge(stubSession('parent-token'), apiKeyStub)))
    expect(headers).toContainEqual(['X-Session-Token', 'parent-token'])
    expect(cookies.length).toBe(1)
  }))

it.effect('cookie-sourced rotation sets only the cookie, NOT X-Session-Token', () =>
  Effect.gen(function* () {
    const headers: Array<[string, string]> = []
    const cookies: string[] = []
    yield* contribute({
      request: new Request('http://x', { headers: { cookie: 'czo.session=child-token' } }),
      setCookie: (s: string) => { cookies.push(s) },
      setHeader: (n: string, v: string) => { headers.push([n, v]) },
    }).pipe(Effect.provide(Layer.merge(stubSession('parent-token'), apiKeyStub)))
    expect(headers.length).toBe(0)
    expect(cookies.length).toBe(1)
  }))
