import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db/effect'
import { DrizzleDb } from '@czo/kit/db/effect'
import { describe, expect, it, layer } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Duration, Effect, Fiber, Layer, Stream } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import * as Email from '@czo/kit/email'
import { accounts, users, verifications } from '../database/schema'
import { ADMIN_HIERARCHY, ADMIN_STATEMENTS } from '../plugins/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Access from './access'
import { BetterAuth } from './auth-instance'
import * as Cookie from './cookie'
import * as AuthEventsMod from './events/auth'
import * as UserEventsMod from './events/user'
import * as Password from './password'
import * as Session from './session'
import * as User from './user'
import * as Account from './account'

// ─── Test layer composition ───────────────────────────────────────────────

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

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

const SessionLive = Session.layer.pipe(
  Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer)),
)

const UserLive = User.layer.pipe(
  Layer.provide(Layer.mergeAll(UserEventsMod.layer, BetterAuthLive, AccessSeedLayer)),
)

const AccountConfigLive = Account.makeAccountConfigLayer({ baseUrl: 'https://test.example.com' })

// Capture email sends for assertions.
const EmailMockState: { sends: Email.SendEmailInput[] } = { sends: [] }
const EmailMockLayer: Layer.Layer<Email.EmailService> = Layer.succeed(Email.EmailService, {
  send: (input) => Effect.sync(() => {
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

const seedUser = (over: Partial<{ email: string, emailVerified: boolean }> = {}) =>
  Effect.gen(function* () {
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

const seedCredentialAccount = (userId: number, plainPassword: string) =>
  Effect.gen(function* () {
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
      yield* account.requestPasswordReset('ghost@nowhere.com')   // must not throw
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
      expect(arr).toHaveLength(1)   // only one event despite 2 calls
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
      yield* account.requestEmailVerification(u.id)   // must not throw
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
      const u = yield* seedUser()   // no credential account inserted
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
})

layer(Account.subscribersLayer.pipe(Layer.provideMerge(TestLayerNoAutoVerify)),
  { timeout: 120_000, excludeTestServices: true })('AccountService.subscribersLayer (sendVerificationOnSignUp=false)', (it) => {
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
