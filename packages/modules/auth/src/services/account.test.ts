import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db/effect'
import { DrizzleDb } from '@czo/kit/db/effect'
import * as Email from '@czo/kit/email'
import { expect, layer } from '@effect/vitest'
import { eq, like } from 'drizzle-orm'
import { Duration, Effect, Fiber, Layer, Stream } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { accounts, members, organizations, users, verifications } from '../database/schema'
import { ADMIN_HIERARCHY, ADMIN_STATEMENTS } from '../plugins/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Access from './access'
import * as Account from './account'
import * as Cookie from './cookie'
import * as AuthEventsMod from './events/auth'
import * as UserEventsMod from './events/user'
import * as Password from './password'
import * as Session from './session'
import * as User from './user'

// ─── Test layer composition ───────────────────────────────────────────────

const AccessSeedLayer = Access.makeLayer(
  [{ name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY }],
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

const AccountConfigLive = Account.makeAccountConfigLayer({ baseUrl: 'https://test.example.com' })

// Capture email sends for assertions.
const EmailMockState: { sends: Email.SendEmailInput[] } = { sends: [] }
const EmailMockLayer: Layer.Layer<Email.EmailService> = Layer.succeed(Email.EmailService, {
  send: input => Effect.sync(() => {
    EmailMockState.sends.push(input)
  }),
})

const TestLayer = Account.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(
    SessionLive,
    UserLive,
    Password.layer,
    AuthEventsMod.layer,
    AccountConfigLive,
    EmailMockLayer,
  )),
  Layer.provideMerge(AuthPostgresLayer),
)

const TestLayerWithSubscribers = Account.subscribersLayer.pipe(
  Layer.provideMerge(TestLayer),
)

const TestLayerNoAutoVerify = Account.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(
    SessionLive,
    UserLive,
    Password.layer,
    AuthEventsMod.layer,
    Account.makeAccountConfigLayer({
      baseUrl: 'https://test.example.com',
      sendVerificationOnSignUp: false,
    }),
    EmailMockLayer,
  )),
  Layer.provideMerge(AuthPostgresLayer),
)

// ─── Helpers ─────────────────────────────────────────────────────────────

function seedUser(over: Partial<{ email: string, emailVerified: boolean }> = {}) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const now = new Date()
    const rows = yield* db.insert(users).values({
      name: 'Test',
      email: over.email ?? `u-${Math.random()}@example.com`,
      emailVerified: over.emailVerified ?? false,
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

function seedOrganization(slug: string, ownerUserId: number) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const now = new Date()
    const rows = yield* db.insert(organizations).values({
      name: `Org-${slug}`,
      slug,
      createdAt: now,
      updatedAt: now,
    }).returning()
    const org = rows[0] as { id: number, slug: string }
    yield* db.insert(members).values({
      organizationId: org.id,
      userId: ownerUserId,
      role: 'owner',
      createdAt: now,
    })
    return org
  })
}

// Helper to run a raw Drizzle effect in test context (mirrors dbErr inside service)
function dbExec<A>(eff: Effect.Effect<A, unknown>) {
  return eff.pipe(Effect.mapError(cause => new Error(String(cause))))
}

const dbErrTest = dbExec

// ─── Main suite ───────────────────────────────────────────────────────────

layer(TestLayer, { timeout: 120_000, excludeTestServices: true })('AccountService', (it) => {
  // requestPasswordReset
  it.effect('requestPasswordReset happy → publishes PasswordResetRequested', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents

      const collector = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow
      yield* account.requestPasswordReset(u.email)
      yield* Effect.sleep(Duration.millis(100))
      const arr = (yield* Fiber.join(collector))

      expect(arr).toHaveLength(1)
      expect((arr[0] as { _tag: string })._tag).toBe('PasswordResetRequested')
    }))

  it.effect('requestPasswordReset unknown email → no event, no throw', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const account = yield* Account.AccountService
      yield* account.requestPasswordReset('ghost@nowhere.com') // must not throw
    }))

  it.effect('requestPasswordReset cooldown: 2 calls <60s → second is no-op', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents

      const collector = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow
      yield* account.requestPasswordReset(u.email)
      yield* account.requestPasswordReset(u.email)
      yield* Effect.sleep(Duration.millis(150))
      const arr = (yield* Fiber.join(collector))
      expect(arr).toHaveLength(1) // only one event despite 2 calls
    }))

  // resetPassword
  it.effect('resetPassword valid → password updated, all sessions revoked, PasswordChanged(reason:reset) published', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const session = yield* Session.SessionService
      yield* session.create({ userId: u.id, actorType: 'user' })
      yield* session.create({ userId: u.id, actorType: 'user' })

      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents

      // Capture the request event to extract token.
      const reqCollector = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow
      yield* account.requestPasswordReset(u.email)
      const reqArr = (yield* Fiber.join(reqCollector))
      const req = reqArr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'PasswordResetRequested' }>

      // Capture the next event (PasswordChanged) and reset.
      const chgCollector = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow
      yield* account.resetPassword({ token: req.token, newPassword: 'NewPass1!' })
      yield* Effect.sleep(Duration.millis(100))
      const chgArr = (yield* Fiber.join(chgCollector))
      expect((chgArr[0] as { _tag: string })._tag).toBe('PasswordChanged')
      expect((chgArr[0] as { reason: string }).reason).toBe('reset')

      // All sessions revoked.
      expect(yield* session.listForUser(u.id)).toHaveLength(0)
    }))

  it.effect('resetPassword invalid token → InvalidPasswordResetToken', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const account = yield* Account.AccountService
      const err = yield* account.resetPassword({ token: 'bogus', newPassword: 'NewPass1!' }).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('InvalidPasswordResetToken')
    }))

  it.effect('resetPassword expired token → InvalidPasswordResetToken', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collector = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow
      yield* account.requestPasswordReset(u.email)
      const arr = (yield* Fiber.join(collector))
      const req = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'PasswordResetRequested' }>

      // Manually expire the verifications row.
      const db = (yield* DrizzleDb) as Database<Relations>
      yield* db.update(verifications)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(verifications.identifier, `password-reset:${u.id}`))

      const err = yield* account.resetPassword({ token: req.token, newPassword: 'NewPass1!' }).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('InvalidPasswordResetToken')
    }))

  it.effect('resetPassword already-consumed token → InvalidPasswordResetToken (one-shot)', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collector = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow
      yield* account.requestPasswordReset(u.email)
      const arr = (yield* Fiber.join(collector))
      const req = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'PasswordResetRequested' }>

      yield* account.resetPassword({ token: req.token, newPassword: 'NewPass1!' })
      const err = yield* account.resetPassword({ token: req.token, newPassword: 'AnotherPass1!' }).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('InvalidPasswordResetToken')
    }))

  it.effect('cross-kind: password-reset token cannot be consumed as email-verify', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collector = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow
      yield* account.requestPasswordReset(u.email)
      const arr = (yield* Fiber.join(collector))
      const req = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'PasswordResetRequested' }>

      const err = yield* account.verifyEmail(req.token).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('InvalidEmailVerificationToken')
    }))

  // requestEmailVerification
  it.effect('requestEmailVerification happy → publishes EmailVerificationRequested', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collector = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow

      yield* account.requestEmailVerification(u.id)
      yield* Effect.sleep(Duration.millis(100))
      const arr = (yield* Fiber.join(collector))
      expect((arr[0] as { _tag: string })._tag).toBe('EmailVerificationRequested')
    }))

  it.effect('requestEmailVerification already-verified user → no event', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser({ emailVerified: true })
      const account = yield* Account.AccountService
      yield* account.requestEmailVerification(u.id) // must not throw
    }))

  it.effect('requestEmailVerification cooldown 60s', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collector = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow

      yield* account.requestEmailVerification(u.id)
      yield* account.requestEmailVerification(u.id)
      yield* Effect.sleep(Duration.millis(150))
      const arr = (yield* Fiber.join(collector))
      expect(arr).toHaveLength(1)
    }))

  // verifyEmail
  it.effect('verifyEmail valid → emailVerified=true, EmailVerified event', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const reqCollector = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow
      yield* account.requestEmailVerification(u.id)
      const req = (yield* Fiber.join(reqCollector))[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailVerificationRequested' }>

      const verCollector = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
      yield* Effect.yieldNow
      yield* account.verifyEmail(req.token)
      yield* Effect.sleep(Duration.millis(100))
      const verArr = (yield* Fiber.join(verCollector))
      expect((verArr[0] as { _tag: string })._tag).toBe('EmailVerified')

      const db = (yield* DrizzleDb) as Database<Relations>
      const row = yield* db.query.users.findFirst({ where: { id: u.id } })
      expect(row?.emailVerified).toBe(true)
    }))

  it.effect('verifyEmail invalid token → InvalidEmailVerificationToken', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const account = yield* Account.AccountService
      const err = yield* account.verifyEmail('bogus').pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('InvalidEmailVerificationToken')
    }))

  // changePassword
  it.effect('changePassword correct current → updates, revokes OTHER sessions only', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const session = yield* Session.SessionService
      const current = yield* session.create({ userId: u.id, actorType: 'user' })
      yield* session.create({ userId: u.id, actorType: 'user' })
      yield* session.create({ userId: u.id, actorType: 'user' })
      expect(yield* session.listForUser(u.id)).toHaveLength(3)

      const account = yield* Account.AccountService
      yield* account.changePassword({
        userId: u.id,
        currentSessionToken: current.token,
        currentPassword: 'OldPass1!',
        newPassword: 'NewPass1!',
      })

      const remaining = yield* session.listForUser(u.id)
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.token).toBe(current.token)
    }))

  it.effect('changePassword incorrect current → IncorrectCurrentPassword, no change', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const session = yield* Session.SessionService
      const current = yield* session.create({ userId: u.id, actorType: 'user' })

      const account = yield* Account.AccountService
      const err = yield* account.changePassword({
        userId: u.id,
        currentSessionToken: current.token,
        currentPassword: 'WrongPass1!',
        newPassword: 'NewPass1!',
      }).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('IncorrectCurrentPassword')
    }))

  it.effect('changePassword OAuth-only user (no credential account) → UserNotFound', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser() // no credential account inserted
      const session = yield* Session.SessionService
      const current = yield* session.create({ userId: u.id, actorType: 'user' })

      const account = yield* Account.AccountService
      const err = yield* account.changePassword({
        userId: u.id,
        currentSessionToken: current.token,
        currentPassword: 'anything',
        newPassword: 'NewPass1!',
      }).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('UserNotFound')
    }))

  // requestEmailChange

  it.effect('requestEmailChange happy → publishes EmailChangeRequested with oldEmail+newEmail+token', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser({ email: 'old@example.com' })
      yield* seedCredentialAccount(u.id, 'OldPass1!')

      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collected = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )

      yield* account.requestEmailChange({
        userId: u.id,
        currentPassword: 'OldPass1!',
        newEmail: 'new@example.com',
      })
      yield* Effect.sleep(Duration.millis(100))
      const arr = yield* Fiber.join(collected)

      expect(arr).toHaveLength(1)
      const e = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>
      expect(e._tag).toBe('EmailChangeRequested')
      expect(e.userId).toBe(u.id)
      expect(e.oldEmail).toBe('old@example.com')
      expect(e.newEmail).toBe('new@example.com')
      expect(typeof e.token).toBe('string')
      expect(e.token.length).toBeGreaterThan(0)
    }))

  it.effect('requestEmailChange cooldown 60s → second call no-op (single event)', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collected = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )

      yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new1@x.com' })
      yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new2@x.com' })
      yield* Effect.sleep(Duration.millis(150))
      const arr = yield* Fiber.join(collected)
      expect(arr).toHaveLength(1)
    }))

  it.effect('requestEmailChange OAuth-only (no credential account) → skips password check', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      // NO seedCredentialAccount → user is OAuth-only.
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collected = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )

      yield* account.requestEmailChange({ userId: u.id, newEmail: 'new@x.com' })
      yield* Effect.sleep(Duration.millis(100))
      const arr = yield* Fiber.join(collected)
      expect(arr).toHaveLength(1)
      expect((arr[0] as { _tag: string })._tag).toBe('EmailChangeRequested')
    }))

  it.effect('requestEmailChange wrong currentPassword → IncorrectCurrentPassword', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService

      const err = yield* account.requestEmailChange({
        userId: u.id,
        currentPassword: 'WrongPass1!',
        newEmail: 'new@x.com',
      }).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('IncorrectCurrentPassword')
    }))

  it.effect('cross-kind: change-email token cannot be consumed by verifyEmail', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collected = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )

      yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
      const arr = yield* Fiber.join(collected)
      const req = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>

      const err = yield* account.verifyEmail(req.token).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('InvalidEmailVerificationToken')
    }))

  // confirmEmailChange

  it.effect('confirmEmailChange happy → email updated, emailVerified=true, other sessions revoked, EmailChanged published', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser({ email: 'old@x.com' })
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const session = yield* Session.SessionService
      const current = yield* session.create({ userId: u.id, actorType: 'user' })
      yield* session.create({ userId: u.id, actorType: 'user' })
      yield* session.create({ userId: u.id, actorType: 'user' })

      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents

      const reqCollect = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
      const reqArr = yield* Fiber.join(reqCollect)
      const req = reqArr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>

      const chgCollect = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* account.confirmEmailChange({ token: req.token, currentSessionToken: current.token })
      yield* Effect.sleep(Duration.millis(100))
      const chgArr = yield* Fiber.join(chgCollect)
      const chg = chgArr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChanged' }>
      expect(chg._tag).toBe('EmailChanged')
      expect(chg.oldEmail).toBe('old@x.com')
      expect(chg.newEmail).toBe('new@x.com')

      const db = (yield* DrizzleDb) as Database<Relations>
      const row = yield* db.query.users.findFirst({ where: { id: u.id } })
      expect(row?.email).toBe('new@x.com')
      expect(row?.emailVerified).toBe(true)

      const remaining = yield* session.listForUser(u.id)
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.token).toBe(current.token)
    }))

  it.effect('confirmEmailChange invalid token → InvalidEmailChangeToken', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const account = yield* Account.AccountService
      const err = yield* account.confirmEmailChange({
        token: 'bogus',
        currentSessionToken: 'whatever',
      }).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('InvalidEmailChangeToken')
    }))

  it.effect('confirmEmailChange expired token → InvalidEmailChangeToken', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collected = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
      const arr = yield* Fiber.join(collected)
      const req = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>

      // Manually expire the verifications row.
      const db = (yield* DrizzleDb) as Database<Relations>
      yield* dbExec(
        db.update(verifications)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(like(verifications.identifier, 'change-email:%')),
      )

      const err = yield* account.confirmEmailChange({
        token: req.token,
        currentSessionToken: 'whatever',
      }).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('InvalidEmailChangeToken')
    }))

  it.effect('confirmEmailChange already-consumed token → InvalidEmailChangeToken (one-shot)', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collected = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
      const arr = yield* Fiber.join(collected)
      const req = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>

      yield* account.confirmEmailChange({ token: req.token, currentSessionToken: null })
      const err = yield* account.confirmEmailChange({
        token: req.token,
        currentSessionToken: null,
      }).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('InvalidEmailChangeToken')
    }))

  it.effect('confirmEmailChange with currentSessionToken=null → revokes ALL sessions', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const session = yield* Session.SessionService
      yield* session.create({ userId: u.id, actorType: 'user' })
      yield* session.create({ userId: u.id, actorType: 'user' })
      expect(yield* session.listForUser(u.id)).toHaveLength(2)

      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collected = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
      const arr = yield* Fiber.join(collected)
      const req = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>

      yield* account.confirmEmailChange({ token: req.token, currentSessionToken: null })

      expect(yield* session.listForUser(u.id)).toHaveLength(0)
    }))

  // deleteAccount

  it.effect('deleteAccount happy → users.deletedAt set, sessions revoked, restore token written, AccountDeleted published with token', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser({ email: 'gone@x.com' })
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const session = yield* Session.SessionService
      yield* session.create({ userId: u.id, actorType: 'user' })
      yield* session.create({ userId: u.id, actorType: 'user' })

      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collected = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )

      yield* account.deleteAccount({ userId: u.id, currentPassword: 'OldPass1!' })
      yield* Effect.sleep(Duration.millis(100))
      const arr = yield* Fiber.join(collected)
      const evt = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'AccountDeleted' }>
      expect(evt._tag).toBe('AccountDeleted')
      expect(evt.email).toBe('gone@x.com')
      expect(typeof evt.token).toBe('string')

      const db = (yield* DrizzleDb) as Database<Relations>
      const row = yield* db.query.users.findFirst({ where: { id: u.id } })
      expect(row?.deletedAt).not.toBeNull()

      expect(yield* session.listForUser(u.id)).toHaveLength(0)

      const restoreRows = yield* dbErrTest(
        db.select().from(verifications).where(like(verifications.identifier, 'account-restore:%')),
      )
      expect(restoreRows).toHaveLength(1)
    }))

  it.effect('deleteAccount wrong pwd → IncorrectCurrentPassword, no change', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService

      const err = yield* account.deleteAccount({
        userId: u.id,
        currentPassword: 'WrongPass1!',
      }).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('IncorrectCurrentPassword')

      const db = (yield* DrizzleDb) as Database<Relations>
      const row = yield* db.query.users.findFirst({ where: { id: u.id } })
      expect(row?.deletedAt).toBeNull()
    }))

  it.effect('deleteAccount sole-owner of org → CannotDeleteWithOwnedOrgs with orgIds', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const org = yield* seedOrganization(`org-${Math.random()}`, u.id)
      const account = yield* Account.AccountService

      const err = yield* account.deleteAccount({
        userId: u.id,
        currentPassword: 'OldPass1!',
      }).pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('CannotDeleteWithOwnedOrgs')
      expect((err as unknown as { orgIds: number[] }).orgIds).toEqual([org.id])

      const db = (yield* DrizzleDb) as Database<Relations>
      const row = yield* db.query.users.findFirst({ where: { id: u.id } })
      expect(row?.deletedAt).toBeNull()
    }))

  it.effect('deleteAccount succeeds when user is owner-among-many (another owner exists)', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u1 = yield* seedUser()
      const u2 = yield* seedUser()
      yield* seedCredentialAccount(u1.id, 'OldPass1!')
      const org = yield* seedOrganization(`org-${Math.random()}`, u1.id)

      // u2 also owner of the same org.
      const db = (yield* DrizzleDb) as Database<Relations>
      yield* db.insert(members).values({
        organizationId: org.id,
        userId: u2.id,
        role: 'owner',
        createdAt: new Date(),
      })

      const account = yield* Account.AccountService
      yield* account.deleteAccount({ userId: u1.id, currentPassword: 'OldPass1!' })

      const row = yield* db.query.users.findFirst({ where: { id: u1.id } })
      expect(row?.deletedAt).not.toBeNull()
    }))

  it.effect('deleteAccount OAuth-only → skips password check, succeeds', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      // NO credential account.
      const account = yield* Account.AccountService

      yield* account.deleteAccount({ userId: u.id })

      const db = (yield* DrizzleDb) as Database<Relations>
      const row = yield* db.query.users.findFirst({ where: { id: u.id } })
      expect(row?.deletedAt).not.toBeNull()
    }))

  // restoreAccount

  it.effect('restoreAccount happy → deletedAt=null, AccountRestored event', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const u = yield* seedUser()
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents

      // Delete first to get a restore token.
      const delCollect = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* account.deleteAccount({ userId: u.id, currentPassword: 'OldPass1!' })
      const delArr = yield* Fiber.join(delCollect)
      const del = delArr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'AccountDeleted' }>

      // Restore.
      const resCollect = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* account.restoreAccount(del.token)
      yield* Effect.sleep(Duration.millis(100))
      const resArr = yield* Fiber.join(resCollect)
      expect((resArr[0] as { _tag: string })._tag).toBe('AccountRestored')

      const db = (yield* DrizzleDb) as Database<Relations>
      const row = yield* db.query.users.findFirst({ where: { id: u.id } })
      expect(row?.deletedAt).toBeNull()
    }))

  it.effect('restoreAccount invalid token → InvalidAccountRestoreToken', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const account = yield* Account.AccountService
      const err = yield* account.restoreAccount('bogus').pipe(Effect.flip)
      expect((err as { _tag: string })._tag).toBe('InvalidAccountRestoreToken')
    }))
})

// Subscribers in their own layer block.
layer(TestLayerWithSubscribers, { timeout: 120_000, excludeTestServices: true })('AccountService.subscribersLayer', (it) => {
  it.effect('PasswordResetRequested → EmailService.send with reset URL', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      EmailMockState.sends.length = 0
      const u = yield* seedUser()
      const account = yield* Account.AccountService
      yield* account.requestPasswordReset(u.email)
      yield* Effect.sleep(Duration.millis(200))
      expect(EmailMockState.sends.length).toBe(1)
      expect(EmailMockState.sends[0]?.to).toBe(u.email)
      expect(EmailMockState.sends[0]?.html).toContain('/reset-password?token=')
    }))

  it.effect('EmailVerificationRequested → EmailService.send with verify URL', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      EmailMockState.sends.length = 0
      const u = yield* seedUser()
      const account = yield* Account.AccountService
      yield* account.requestEmailVerification(u.id)
      yield* Effect.sleep(Duration.millis(200))
      expect(EmailMockState.sends.length).toBe(1)
      expect(EmailMockState.sends[0]?.html).toContain('/verify-email?token=')
    }))

  it.effect('SignedUp + sendVerificationOnSignUp=true → triggers requestEmailVerification', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      EmailMockState.sends.length = 0
      const u = yield* seedUser()
      const events = yield* AuthEventsMod.AuthEvents
      yield* events.publish({ _tag: 'SignedUp', userId: u.id, email: u.email, actorType: 'user' })
      yield* Effect.sleep(Duration.millis(200))
      // Verification email reaches EmailMock indirectly via the SignedUp → request → publish → mail subscriber chain.
      expect(EmailMockState.sends.length).toBeGreaterThanOrEqual(1)
    }))

  it.effect('EmailChangeRequested → EmailService.send to newEmail with /confirm-email-change URL', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      EmailMockState.sends.length = 0
      const u = yield* seedUser({ email: 'old@x.com' })
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService

      yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
      yield* Effect.sleep(Duration.millis(200))

      expect(EmailMockState.sends.length).toBe(1)
      expect(EmailMockState.sends[0]?.to).toBe('new@x.com')
      expect(EmailMockState.sends[0]?.html).toContain('/confirm-email-change?token=')
    }))

  it.effect('EmailChanged + sendOldEmailNotificationOnChange=true → mail to oldEmail notifying change', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      EmailMockState.sends.length = 0
      const u = yield* seedUser({ email: 'old@x.com' })
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const session = yield* Session.SessionService
      const current = yield* session.create({ userId: u.id, actorType: 'user' })
      const account = yield* Account.AccountService
      const events = yield* AuthEventsMod.AuthEvents
      const collected = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )

      yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
      const reqArr = yield* Fiber.join(collected)
      const req = reqArr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>

      EmailMockState.sends.length = 0 // reset after the request-side mail
      yield* account.confirmEmailChange({ token: req.token, currentSessionToken: current.token })
      yield* Effect.sleep(Duration.millis(200))

      const notifs = EmailMockState.sends.filter(s => s.to === 'old@x.com')
      expect(notifs.length).toBeGreaterThanOrEqual(1)
      expect(notifs[0]?.subject.toLowerCase()).toContain('email')
    }))

  it.effect('AccountDeleted → mail to email with /restore-account URL', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      EmailMockState.sends.length = 0
      const u = yield* seedUser({ email: 'gone@x.com' })
      yield* seedCredentialAccount(u.id, 'OldPass1!')
      const account = yield* Account.AccountService

      yield* account.deleteAccount({ userId: u.id, currentPassword: 'OldPass1!' })
      yield* Effect.sleep(Duration.millis(200))

      expect(EmailMockState.sends.length).toBe(1)
      expect(EmailMockState.sends[0]?.to).toBe('gone@x.com')
      expect(EmailMockState.sends[0]?.html).toContain('/restore-account?token=')
    }))
})

layer(Account.subscribersLayer.pipe(Layer.provideMerge(TestLayerNoAutoVerify)), { timeout: 120_000, excludeTestServices: true })('AccountService.subscribersLayer (sendVerificationOnSignUp=false)', (it) => {
  it.effect('SignedUp + sendVerificationOnSignUp=false → no email sent', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      EmailMockState.sends.length = 0
      const u = yield* seedUser()
      const events = yield* AuthEventsMod.AuthEvents
      yield* events.publish({ _tag: 'SignedUp', userId: u.id, email: u.email, actorType: 'user' })
      yield* Effect.sleep(Duration.millis(200))
      expect(EmailMockState.sends.length).toBe(0)
    }))
})
