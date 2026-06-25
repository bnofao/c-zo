import { DrizzleDb } from '@czo/kit/db'
import { layer } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect, Layer, Redacted } from 'effect'
import { expect } from 'vitest'
import { accounts, users } from '../database/schema'
import { ADMIN_HIERARCHY, ADMIN_STATEMENTS } from '../plugins/access'
import { seededAccessLayer } from '../testing/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Access from './access'
import * as UserEvents from './events/user'
import { ensureInitialAdmin } from './initial-admin'
import * as Password from './password'
import * as User from './user'

const AccessLive = seededAccessLayer(
  [{ name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY }],
  false,
)
const TestLayer = User.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(Password.layer, UserEvents.layer, AccessLive)),
  Layer.provideMerge(AuthPostgresLayer),
)

const EMAIL = 'admin@life.dev'
// `email`/`password` are secrets in the API — pass them wrapped.
const ADMIN = { email: Redacted.make(EMAIL), name: 'Admin', password: Redacted.make('DevAdmin1!') }

layer(TestLayer, { timeout: 120_000 })('ensureInitialAdmin', (it) => {
  it.effect('creates the admin with role=admin, emailVerified, credential', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const res = yield* ensureInitialAdmin(ADMIN)
      expect(res.created).toBe(true)

      const db = yield* DrizzleDb
      const rows = yield* db.select().from(users).where(eq(users.email, EMAIL))
      expect(rows).toHaveLength(1)
      expect((rows[0] as { role: string }).role).toBe('admin')
      expect((rows[0] as { emailVerified: boolean }).emailVerified).toBe(true)

      const accts = yield* db.select().from(accounts)
      expect(accts).toHaveLength(1)
      expect((accts[0] as { providerId: string }).providerId).toBe('credential')
    }))

  it.effect('is idempotent — second run skips, one user remains', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      yield* ensureInitialAdmin(ADMIN)
      const res2 = yield* ensureInitialAdmin(ADMIN)
      expect(res2.created).toBe(false)

      const db = yield* DrizzleDb
      const rows = yield* db.select().from(users).where(eq(users.email, EMAIL))
      expect(rows).toHaveLength(1)
    }))

  it.effect('leaves a pre-existing user untouched', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users_ = yield* User.UserService
      yield* users_.create({ email: EMAIL, name: 'Original', password: 'Existing1!' })

      const res = yield* ensureInitialAdmin(ADMIN)
      expect(res.created).toBe(false)

      const db = yield* DrizzleDb
      const rows = yield* db.select().from(users).where(eq(users.email, EMAIL))
      expect(rows).toHaveLength(1)
      expect((rows[0] as { name: string }).name).toBe('Original')
    }))

  it.effect('honors a custom role from the frozen registry', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const res = yield* ensureInitialAdmin({ ...ADMIN, role: 'admin:manager' })
      expect(res.created).toBe(true)

      const db = yield* DrizzleDb
      const rows = yield* db.select().from(users).where(eq(users.email, EMAIL))
      expect((rows[0] as { role: string }).role).toBe('admin:manager')
    }))

  it.effect('propagates InvalidRole for an unknown role', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const err = yield* ensureInitialAdmin({ ...ADMIN, role: 'not-a-role' }).pipe(Effect.flip)
      expect(err._tag).toBe('InvalidRole')
    }))
})

// ─── Regression: CLI bare-startup scenario ────────────────────────────────────
// The seed:admin CLI calls `startup` (onStart hooks) but NOT `started` (onStarted
// hooks). In production, `onStarted` is the only place `access.buildRoles` runs,
// so the `_providers` cache is empty and every role lookup returns false → InvalidRole.
// This block reproduces that failure path and proves that calling `buildRoles`
// directly (the CLI fix) recovers it.

const BareAccessLayer = Access.makeLayer(
  [{ name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY }],
  false,
)
const CliTestLayer = User.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(Password.layer, UserEvents.layer, BareAccessLayer)),
  Layer.provideMerge(AuthPostgresLayer),
)

layer(CliTestLayer, { timeout: 120_000 })('ensureInitialAdmin — CLI bare-startup regression', (it) => {
  it.effect(
    'fails with InvalidRole before buildRoles, succeeds after (reproduces seed:admin fix)',
    () =>
      Effect.gen(function* () {
        yield* truncateAuth

        // 1. Before buildRoles: _providers is empty → ensureInitialAdmin fails with InvalidRole.
        const err = yield* ensureInitialAdmin(ADMIN).pipe(Effect.flip)
        expect(err._tag).toBe('InvalidRole')

        // 2. After buildRoles: role cache is populated → ensureInitialAdmin succeeds.
        yield* (yield* Access.AccessService).buildRoles
        const res = yield* ensureInitialAdmin(ADMIN)
        expect(res.created).toBe(true)
      }),
  )
})
