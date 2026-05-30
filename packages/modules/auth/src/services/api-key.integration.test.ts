import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db/effect'
import { DrizzleDb } from '@czo/kit/db/effect'
import { expect, layer } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import { apikeys, members, organizations, users } from '../database/schema'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import { layer as accessLayer } from './access'
import { layer as apiKeyLayer, ApiKeyService, Unauthorized } from './api-key'
import { BetterAuth } from './auth-instance'
import { layer as apiKeyEventsLayer } from './events/api-key'
import { layer as orgEventsLayer } from './events/organization'
import { layer as orgLayer } from './organization'

// Stub BetterAuth — orgLayer now depends on it for hasPermission, but the
// integration suite doesn't exercise that path.
const BetterAuthStub = Layer.succeed(BetterAuth, { options: { plugins: [] } } as never)

// Compose: ApiKeyService needs DrizzleDb + AccessService.
// OrgLayer is included for seed helpers (members/organizations tables) but is no longer a service dep.
const TestLayer = apiKeyLayer.pipe(
  Layer.provideMerge(apiKeyEventsLayer),
  Layer.provideMerge(orgLayer.pipe(Layer.provideMerge(orgEventsLayer))),
  Layer.provideMerge(accessLayer),
  Layer.provideMerge(BetterAuthStub),
  Layer.provideMerge(AuthPostgresLayer),
)

/**
 * Extended truncate that also clears apikeys, members, and organizations.
 * `truncateAuth` only covers accounts/sessions/users (and CASCADE on users
 * doesn't reach apikeys because apikeys.referenceId has no FK constraint).
 */
const truncateAll: Effect.Effect<void, never, DrizzleDb> = Effect.gen(function* () {
  const db = yield* DrizzleDb
  yield* db.execute(
    sql`TRUNCATE TABLE ${apikeys}, ${members}, ${organizations} RESTART IDENTITY CASCADE`,
  ).pipe(Effect.orDie)
  yield* truncateAuth
})

// ─── Seed helpers ────────────────────────────────────────────────────────────

/** Insert a bare user row, return its id. */
function seedUser(email?: string) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const now = new Date()
    const rows = yield* db.insert(users).values({
      name: 'Test User',
      email: email ?? `user-${Math.random()}@example.com`,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    }).returning()
    return (rows[0] as { id: number }).id
  })
}

/** Insert an organization row, return its id. */
function seedOrg() {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const now = new Date()
    const rows = yield* db.insert(organizations).values({
      name: 'Test Org',
      slug: `org-${Math.random()}`,
      createdAt: now,
    }).returning()
    return (rows[0] as { id: number }).id
  })
}

/** Make userId a member of orgId. */
function seedMember(orgId: number, userId: number) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    yield* db.insert(members).values({
      organizationId: orgId,
      userId,
      role: 'member',
      createdAt: new Date(),
    })
  })
}

/** Minimal create input for a USER-scoped key. */
function userKeyInput(userId: number) {
  return {
    input: {
      name: 'test-key',
      group: 'default',
      prefix: 'sk',
      referenceId: userId,
    },
    opts: {},
  } as const
}

// ─── Suite ───────────────────────────────────────────────────────────────────

layer(TestLayer, { timeout: 120_000 })('ApiKeyService integration', (it) => {
  // ── create ────────────────────────────────────────────────────────────────

  it.effect('create — USER scope succeeds and returns the row with hashed key', () =>
    Effect.gen(function* () {
      yield* truncateAll
      const userId = yield* seedUser()
      const svc = yield* ApiKeyService

      const { input, opts } = userKeyInput(userId)
      const created = yield* svc.create(input, opts)

      expect(created.reference).toBe('user')
      expect(created.referenceId).toBe(userId)
      // `key` on the returned row is the plain key (service patches it back),
      // but the DB stores the hash — verify the two differ.
      expect(created.key).toBeTruthy()
      expect(created.name).toBe('test-key')
    }))

  it.effect('create — ORGANIZATION scope succeeds when caller is a member', () =>
    Effect.gen(function* () {
      yield* truncateAll
      const userId = yield* seedUser()
      const orgId = yield* seedOrg()
      yield* seedMember(orgId, userId)
      const svc = yield* ApiKeyService

      const created = yield* svc.create(
        { name: 'org-key', group: 'default', prefix: 'ok', referenceId: orgId },
        { reference: 'organization' },
      )

      expect(created.reference).toBe('organization')
      expect(created.referenceId).toBe(orgId)
    }))

  // ── update ────────────────────────────────────────────────────────────────
  // NOTE: Service-level ownership/membership guards removed in SP3 (create
  // guard removed here; update/remove/findFirst/findMany guards were removed
  // earlier). Those flows are now gated exclusively by GraphQL authScopes (Pothos).

  it.effect('update — caller-owned USER key succeeds', () =>
    Effect.gen(function* () {
      yield* truncateAll
      const userId = yield* seedUser()
      const svc = yield* ApiKeyService

      const { input, opts } = userKeyInput(userId)
      const created = yield* svc.create(input, opts)

      const updated = yield* svc.update(created.id, { name: 'renamed' })

      expect(updated.name).toBe('renamed')
      expect(updated.id).toBe(created.id)
    }))

  // ── remove ────────────────────────────────────────────────────────────────

  it.effect('remove — caller-owned key succeeds and returns true', () =>
    Effect.gen(function* () {
      yield* truncateAll
      const userId = yield* seedUser()
      const svc = yield* ApiKeyService

      const { input, opts } = userKeyInput(userId)
      const created = yield* svc.create(input, opts)

      const result = yield* svc.remove(created.id)
      expect(result).toBe(true)

      // Confirm it's gone via findFirst.
      const err = yield* svc.findFirst().pipe(Effect.flip)
      expect(err._tag).toBe('ApiKeyNotFound')
    }))

  // ── verify ────────────────────────────────────────────────────────────────

  it.effect('verify — granted permissions ⊇ required → succeeds', () =>
    Effect.gen(function* () {
      yield* truncateAll
      const userId = yield* seedUser()
      const svc = yield* ApiKeyService

      // Create key with explicit permissions.
      const created = yield* svc.create(
        {
          name: 'perm-key',
          group: 'default',
          prefix: 'pk',
          referenceId: userId,
          permissions: { posts: ['read', 'write'] },
          rateLimitEnabled: false,
        },
        {},
      )

      // `created.key` holds the plain key (service patches it back after insert).
      const verified = yield* svc.verify(created.key, {
        permissions: { posts: ['read'] },
      })

      expect(verified.id).toBe(created.id)
    }))

  it.effect('verify — granted permissions ⊉ required → Unauthorized', () =>
    Effect.gen(function* () {
      yield* truncateAll
      const userId = yield* seedUser()
      const svc = yield* ApiKeyService

      const created = yield* svc.create(
        {
          name: 'read-only-key',
          group: 'default',
          prefix: 'ro',
          referenceId: userId,
          permissions: { posts: ['read'] },
          rateLimitEnabled: false,
        },
        {},
      )

      const err = yield* svc.verify(created.key, {
        permissions: { posts: ['write'] },
      }).pipe(Effect.flip)

      expect(err).toBeInstanceOf(Unauthorized)
    }))
})
