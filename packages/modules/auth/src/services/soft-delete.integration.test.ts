import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db'
import { DrizzleDb } from '@czo/kit/db'
import * as Email from '@czo/kit/email'
import { expect, layer } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Duration, Effect, Fiber, Layer, Stream } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { accounts, organizations, users } from '../database/schema'
import { InvalidCredentials, signIn } from '../http/credential'
import {
  ADMIN_HIERARCHY,
  ADMIN_STATEMENTS,
  ORGANIZATION_HIERARCHY,
  ORGANIZATION_STATEMENTS,
} from '../plugins/access'
import { DEFAULT_ACTOR_RESTRICTIONS } from '../plugins/actor'
import { seededAccessLayer } from '../testing/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Account from './account'
import * as Actor from './actor'
import * as Cookie from './cookie'
import * as AuthEventsMod from './events/auth'
import * as OrganizationEvents from './events/organization'
import * as UserEventsMod from './events/user'
import * as Organization from './organization'
import * as Password from './password'
import * as Session from './session'
import * as User from './user'

// ─── Test layer composition ───────────────────────────────────────────────
// Seed both the admin (so 'user'/'admin' roles validate) and organization
// (so 'org:*' roles validate) domains into the AccessService cache.
const AccessSeedLayer = seededAccessLayer(
  [
    { name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY },
    { name: 'organization', statements: ORGANIZATION_STATEMENTS, hierarchy: ORGANIZATION_HIERARCHY },
  ] as never,
  true,
)

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

const SessionLive = Session.layer.pipe(
  Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer, AuthEventsMod.layer)),
)

const UserLive = User.layer.pipe(
  Layer.provide(Layer.mergeAll(UserEventsMod.layer, AccessSeedLayer, Password.layer)),
)

const OrganizationLive = Organization.layer.pipe(
  Layer.provide(Layer.mergeAll(AccessSeedLayer, OrganizationEvents.layer)),
)

const AccountConfigLive = Account.makeAccountConfigLayer({ baseUrl: 'https://test.example.com', enumTimingBudget: Duration.zero })

const EmailMockLayer: Layer.Layer<Email.EmailService> = Layer.succeed(Email.EmailService, {
  send: () => Effect.void,
})

const TestLayer = Layer.mergeAll(
  UserLive,
  SessionLive,
  OrganizationLive,
  Account.layer.pipe(
    Layer.provide(Layer.mergeAll(
      SessionLive,
      UserLive,
      Password.layer,
      AuthEventsMod.layer,
      AccountConfigLive,
      EmailMockLayer,
    )),
  ),
  Password.layer,
  Actor.makeLayer(DEFAULT_ACTOR_RESTRICTIONS, true),
  AuthEventsMod.layer,
).pipe(Layer.provideMerge(AuthPostgresLayer))

// ─── Helpers ─────────────────────────────────────────────────────────────

function seedUser(over: Partial<{ email: string, name: string }> = {}) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const now = new Date()
    const rows = yield* db.insert(users).values({
      name: over.name ?? 'Test',
      email: over.email ?? `u-${Math.random()}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }).returning()
    return rows[0] as { id: number, email: string }
  })
}

function seedCredentialAccount(userId: number, plainPassword: string) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const pwd = yield* Password.PasswordService
    const hash = yield* pwd.hash(plainPassword)
    const now = new Date()
    yield* db.insert(accounts).values({
      userId,
      providerId: 'credential',
      accountId: String(userId),
      password: hash,
      createdAt: now,
      updatedAt: now,
    })
  })
}

function seedOrganization(slug: string) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const now = new Date()
    const rows = yield* db.insert(organizations).values({
      name: `Org-${slug}`,
      slug,
      createdAt: now,
      updatedAt: now,
    }).returning()
    return rows[0] as { id: number, slug: string }
  })
}

/** Soft-delete a user directly (set deletedAt) — simpler than the full deleteAccount flow. */
function softDelete(userId: number) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    yield* db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId))
  })
}

// ─── Suite ─────────────────────────────────────────────────────────────────

layer(TestLayer, { timeout: 120_000, excludeTestServices: true })('soft-delete filtering', (it) => {
  it.effect('UserService.findFirst({ where: { id } }) → UserNotFound for a soft-deleted user', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* softDelete(u.id)
      const userService = yield* User.UserService

      const err = yield* userService.findFirst({ where: { id: u.id } }).pipe(Effect.flip)
      expect(err._tag).toBe('UserNotFound')
    }))

  it.effect('UserService.findFirst({ where: { id }, excludeDeleted: false }) → returns the soft-deleted row', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* softDelete(u.id)
      const userService = yield* User.UserService

      const row = yield* userService.findFirst({ where: { id: u.id }, excludeDeleted: false })
      expect(row.id).toBe(u.id)
      expect(row.deletedAt).not.toBeNull()
    }))

  it.effect('UserService.findMany() excludes the soft-deleted user', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const live = yield* seedUser({ email: 'live@x.com' })
      const dead = yield* seedUser({ email: 'dead@x.com' })
      yield* softDelete(dead.id)
      const userService = yield* User.UserService

      const rows = yield* userService.findMany()
      const ids = rows.map(r => r.id)
      expect(ids).toContain(live.id)
      expect(ids).not.toContain(dead.id)
    }))

  it.effect('signIn with a soft-deleted user\'s credentials → InvalidCredentials', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser({ email: 'deleted-signin@x.com' })
      yield* seedCredentialAccount(u.id, 'Sup3r-Secret!')
      yield* softDelete(u.id)

      const err = yield* signIn({ email: 'deleted-signin@x.com', password: 'Sup3r-Secret!' }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(InvalidCredentials)
    }))

  it.effect('session resolution: a session whose user is soft-deleted no longer resolves', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      const session = yield* Session.SessionService
      const { token } = yield* session.create({ userId: u.id, actorType: 'user' })

      // Before deletion the session resolves.
      const before = yield* session.resolve(token)
      expect(before).not.toBeNull()

      yield* softDelete(u.id)
      // Drop the cache entry so the L3 lookup (which now filters deleted) runs.
      yield* session.invalidateCacheForUser(u.id)

      const after = yield* session.resolve(token)
      expect(after).toBeNull()
    }))

  it.effect('OrganizationService.addMember with a soft-deleted user → OrgUserNotFound', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* softDelete(u.id)
      const org = yield* seedOrganization(`org-${Math.random()}`)
      const orgService = yield* Organization.OrganizationService

      const err = yield* orgService.addMember({
        organizationId: org.id,
        userId: u.id,
        role: 'org:member',
      }).pipe(Effect.flip)
      expect(err._tag).toBe('OrgUserNotFound')
    }))

  it.effect('restoreAccount still finds + restores a soft-deleted user (exception regression guard)', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents

      // Delete via the real flow to obtain a raw restore token (carried on the event).
      const collector = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow
      yield* account.deleteAccount({ userId: u.id, currentPassword: 'OldPass1!' })
      const arr = yield* Fiber.join(collector)
      const del = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'AccountDeleted' }>
      expect(del._tag).toBe('AccountDeleted')

      const db = (yield* DrizzleDb) as Database<Relations>
      const deletedRow = yield* db.query.users.findFirst({ where: { id: u.id } })
      expect(deletedRow?.deletedAt).not.toBeNull()

      // restoreAccount must STILL see the soft-deleted user to clear deletedAt.
      yield* account.restoreAccount(del.token)

      const restored = yield* db.query.users.findFirst({ where: { id: u.id } })
      expect(restored?.deletedAt).toBeNull()
    }))

  it.effect('UserService.counts() reports per-bucket totals and excludes soft-deleted users', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const db = (yield* DrizzleDb) as Database<Relations>
      const now = new Date()
      yield* db.insert(users).values([
        { name: 'Admin', email: 'a@x.com', role: 'admin', emailVerified: true, createdAt: now, updatedAt: now },
        { name: 'Plain', email: 'p@x.com', role: 'user', emailVerified: true, createdAt: now, updatedAt: now },
        { name: 'Unverified', email: 'u@x.com', role: 'user', emailVerified: false, createdAt: now, updatedAt: now },
        { name: 'Banned', email: 'b@x.com', role: 'user', emailVerified: true, banned: true, createdAt: now, updatedAt: now },
        // Soft-deleted admin — must be excluded from every bucket.
        { name: 'Ghost', email: 'g@x.com', role: 'admin', emailVerified: true, createdAt: now, updatedAt: now, deletedAt: now },
      ])
      const userService = yield* User.UserService

      const counts = yield* userService.counts()
      // `all` is the non-admin bucket (Plain/Unverified/Banned), partitioning
      // live users with `admins` (Admin); the soft-deleted Ghost admin is excluded.
      expect(counts).toEqual({ all: 3, admins: 1, unverified: 1, banned: 1 })
    }))

  it.effect('OrganizationService.listMembers excludes a member whose user is soft-deleted', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const live = yield* seedUser({ email: 'member-live@x.com' })
      const dead = yield* seedUser({ email: 'member-dead@x.com' })
      const org = yield* seedOrganization(`org-${live.id}`)
      const orgService = yield* Organization.OrganizationService

      // Both join as members while live, then one user is soft-deleted.
      yield* orgService.addMember({ organizationId: org.id, userId: live.id, role: 'org:member' })
      yield* orgService.addMember({ organizationId: org.id, userId: dead.id, role: 'org:member' })
      yield* softDelete(dead.id)

      const rows = yield* orgService.listMembers(org.id)
      const userIds = rows.map(m => m.userId)
      expect(userIds).toContain(live.id)
      expect(userIds).not.toContain(dead.id)
    }))
})
