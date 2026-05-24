import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db/effect'
import { DrizzleDb } from '@czo/kit/db/effect'
import { expect, layer } from '@effect/vitest'
import { Duration, Effect, Fiber, Layer, Stream } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { users } from '../database/schema'
import { ADMIN_HIERARCHY, ADMIN_STATEMENTS } from '../plugins/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Access from './access'
import { BetterAuth } from './auth-instance'
import * as Cookie from './cookie'
import * as AuthEventsMod from './events/auth'
import * as UserEventsMod from './events/user'
import * as Impersonation from './impersonation'
import * as Session from './session'
import * as User from './user'

// ─── Test layer composition ───────────────────────────────────────────────

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

const authStub = {
  options: {},
  $context: Promise.resolve({
    options: {},
    password: { hash: async (p: string) => `hashed:${p}` },
    internalAdapter: {
      linkAccount: async () => ({}),
      updatePassword: async () => ({}),
      deleteUser: async () => ({}),
    },
  }),
} as never
const BetterAuthLive = Layer.succeed(BetterAuth, authStub)

const AccessSeedLayer = Access.makeLayer(
  [{ name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY }],
  true,
)
const SessionLive = Session.layer.pipe(
  Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer)),
)
const UserLive = User.layer.pipe(
  Layer.provide(Layer.mergeAll(UserEventsMod.layer, BetterAuthLive, AccessSeedLayer)),
)
const ImpersonationConfigLive = Impersonation.makeImpersonationConfigLayer({})
const ImpersonationConfigAllowAdmin = Impersonation.makeImpersonationConfigLayer({
  allowImpersonateAdmin: true,
})

const TestLayer = Impersonation.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(
    SessionLive,
    UserLive,
    AuthEventsMod.layer,
    ImpersonationConfigLive,
  )),
  Layer.provideMerge(AuthPostgresLayer),
)

const TestLayerAllowAdmin = Impersonation.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(
    SessionLive,
    UserLive,
    AuthEventsMod.layer,
    ImpersonationConfigAllowAdmin,
  )),
  Layer.provideMerge(AuthPostgresLayer),
)

// ─── Helpers ──────────────────────────────────────────────────────────────

const seedUser = (overrides: { role?: string, banned?: boolean, email?: string } = {}) =>
  Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const now = new Date()
    const rows = yield* db.insert(users).values({
      name: 'Test',
      email: overrides.email ?? `user-${Math.random()}@example.com`,
      emailVerified: false,
      role: overrides.role ?? 'user',
      banned: overrides.banned ?? false,
      createdAt: now,
      updatedAt: now,
    }).returning()
    return (rows[0] as { id: number }).id
  })

// ─── Main suite ───────────────────────────────────────────────────────────

layer(TestLayer, { timeout: 120_000, excludeTestServices: true })('impersonationService', (it) => {
  // 1. Happy path
  it.effect('start: admin → user creates child session with parent linkage', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'user' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService

      const admin = yield* sessions.create({ userId: adminId })
      const child = yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: targetId,
      })

      expect(child.session.userId).toBe(targetId)
      expect(child.session.parentToken).toBe(admin.token)
      expect(child.session.impersonatedBy).toBe(String(adminId))
      expect(child.user.id).toBe(targetId)
    }))

  // 2. Guard: cannot impersonate self
  it.effect('start: cannot impersonate self → CannotImpersonateSelf', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService
      const admin = yield* sessions.create({ userId: adminId })

      const err = yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: adminId,
      }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(Impersonation.CannotImpersonateSelf)
    }))

  // 3. Guard: cannot impersonate another admin (by default)
  it.effect('start: cannot impersonate another admin by default → CannotImpersonateAdmin', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'admin' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService
      const admin = yield* sessions.create({ userId: adminId })

      const err = yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: targetId,
      }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(Impersonation.CannotImpersonateAdmin)
    }))

  // 4. Guard: cannot impersonate banned user
  it.effect('start: cannot impersonate banned user → CannotImpersonateBannedUser', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'user', banned: true })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService
      const admin = yield* sessions.create({ userId: adminId })

      const err = yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: targetId,
      }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(Impersonation.CannotImpersonateBannedUser)
    }))

  // 5. Guard: target user not found
  it.effect('start: unknown target → UserNotFound', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService
      const admin = yield* sessions.create({ userId: adminId })

      const err = yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: 999_999,
      }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(User.UserNotFound)
    }))

  // 6. Guard: cannot chain impersonation
  it.effect('start: cannot start from an impersonation session → CannotChainImpersonation', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'user' })
      const secondTargetId = yield* seedUser({ role: 'user' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService

      const admin = yield* sessions.create({ userId: adminId })
      const child = yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: targetId,
      })

      // Try chaining: pass the child session's token as the adminToken.
      const err = yield* imp.start({
        adminId,
        adminToken: child.session.token,
        targetUserId: secondTargetId,
      }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(Impersonation.CannotChainImpersonation)
    }))

  // 7. Guard: TTL too long
  it.effect('start: ttl > maxTtl → ImpersonationTtlTooLong', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'user' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService
      const admin = yield* sessions.create({ userId: adminId })

      const err = yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: targetId,
        ttl: Duration.hours(24),
      }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(Impersonation.ImpersonationTtlTooLong)
    }))

  // 8. Default TTL applied when not specified
  it.effect('start: default ttl is applied when ttl not specified', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'user' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService
      const admin = yield* sessions.create({ userId: adminId })

      const before = Date.now()
      const child = yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: targetId,
      })
      const after = Date.now()
      const expiresMs = child.session.expiresAt.getTime()
      // Default is 1 hour.
      const oneHourMs = Duration.toMillis(Duration.hours(1))
      expect(expiresMs).toBeGreaterThanOrEqual(before + oneHourMs - 1000)
      expect(expiresMs).toBeLessThanOrEqual(after + oneHourMs + 1000)
    }))

  // 9. stop: happy path
  it.effect('stop: revokes child session and returns parent session + admin user', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'user' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService

      const admin = yield* sessions.create({ userId: adminId })
      const child = yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: targetId,
      })

      const restored = yield* imp.stop(child.session.token)
      expect(restored.session.token).toBe(admin.token)
      expect(restored.user.id).toBe(adminId)
    }))

  // 10. stop: current session is not an impersonation
  it.effect('stop: not an impersonation session → ImpersonationNotActive', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService
      const admin = yield* sessions.create({ userId: adminId })

      const err = yield* imp.stop(admin.token).pipe(Effect.flip)
      expect(err).toBeInstanceOf(Impersonation.ImpersonationNotActive)
    }))

  // 11. parent session is suspended while child exists
  it.effect('start: parent session is suspended (resolve null) while child exists', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'user' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService

      const admin = yield* sessions.create({ userId: adminId })
      yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: targetId,
      })

      expect(yield* sessions.resolve(admin.token)).toBeNull()
    }))

  // 12. parent session is restored after stop
  it.effect('stop: parent session resolves again after impersonation ends', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'user' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService

      const admin = yield* sessions.create({ userId: adminId })
      const child = yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: targetId,
      })
      yield* imp.stop(child.session.token)

      const resolved = yield* sessions.resolve(admin.token)
      expect(resolved).not.toBeNull()
      expect(resolved?.session.token).toBe(admin.token)
    }))

  // 13. FK cascade: revoking the admin token deletes the child
  it.effect('cascade: revoking the admin session deletes the child impersonation session', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'user' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService

      const admin = yield* sessions.create({ userId: adminId })
      const child = yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: targetId,
      })

      yield* sessions.revoke(admin.token)
      expect(yield* sessions.listForUser(targetId)).toHaveLength(0)
      expect(yield* sessions.resolve(child.session.token)).toBeNull()
    }))

  // 14. event published on start
  it.effect('start: publishes ImpersonationStarted event', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'user' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService
      const events = yield* AuthEventsMod.AuthEvents

      const collector = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow

      const admin = yield* sessions.create({ userId: adminId })
      yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: targetId,
        reason: 'investigating',
      })

      const collected = yield* Fiber.join(collector)
      const event = collected[0]!
      expect(event._tag).toBe('ImpersonationStarted')
      if (event._tag !== 'ImpersonationStarted')
        throw new Error('expected ImpersonationStarted')
      expect(event.adminId).toBe(adminId)
      expect(event.targetUserId).toBe(targetId)
      expect(event.reason).toBe('investigating')
    }))

  // 15. event published on stop
  it.effect('stop: publishes ImpersonationStopped event', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'user' })
      const sessions = yield* Session.SessionService
      const imp = yield* Impersonation.ImpersonationService
      const events = yield* AuthEventsMod.AuthEvents

      const admin = yield* sessions.create({ userId: adminId })
      const child = yield* imp.start({
        adminId,
        adminToken: admin.token,
        targetUserId: targetId,
      })

      // Take 1 — the next event after start (which already fired).
      const collector = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow

      yield* imp.stop(child.session.token)

      const collected = yield* Fiber.join(collector)
      const event = collected[0]!
      expect(event._tag).toBe('ImpersonationStopped')
      if (event._tag !== 'ImpersonationStopped')
        throw new Error('expected ImpersonationStopped')
      expect(event.adminId).toBe(adminId)
      expect(event.targetUserId).toBe(targetId)
    }))
})

// ─── Allow-admin-on-admin suite ───────────────────────────────────────────

layer(TestLayerAllowAdmin, { timeout: 120_000, excludeTestServices: true })(
  'impersonationService (allowImpersonateAdmin = true)',
  (it) => {
    it.effect('start: admin → admin is permitted when allowImpersonateAdmin is true', () =>
      Effect.gen(function* () {
        yield* truncateAuth
        const adminId = yield* seedUser({ role: 'admin' })
        const targetId = yield* seedUser({ role: 'admin' })
        const sessions = yield* Session.SessionService
        const imp = yield* Impersonation.ImpersonationService
        const admin = yield* sessions.create({ userId: adminId })

        const child = yield* imp.start({
          adminId,
          adminToken: admin.token,
          targetUserId: targetId,
        })
        expect(child.session.userId).toBe(targetId)
      }))
  },
)
