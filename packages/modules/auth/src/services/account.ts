import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, like } from 'drizzle-orm'
import { Context, Data, Duration, Effect, Layer, Stream } from 'effect'
import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db/effect'
import { DrizzleDb } from '@czo/kit/db/effect'
import { EmailService } from '@czo/kit/email'
import { EMAIL_VERIFICATION_TTL, PASSWORD_RESET_TTL } from '../constants'
import { accounts, users, verifications } from '../database/schema'
import { AuthEvents, type AuthEvent } from './events/auth'
import { PasswordService } from './password'
import { SessionService } from './session'
import type { SessionStoreFailed } from './session'
import { UserNotFound, UserService } from './user'
import type { PasswordHashFailed } from './user'

// ─── Tagged errors ──────────────────────────────────────────────────────

export class AccountDbFailed extends Data.TaggedError('AccountDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'ACCOUNT_DB_FAILED'
  get message() { return 'Account store operation failed' }
}

export class InvalidPasswordResetToken extends Data.TaggedError('InvalidPasswordResetToken')<{}> {
  readonly code = 'INVALID_PASSWORD_RESET_TOKEN'
  get message() { return 'Password reset token is invalid or expired' }
}

export class InvalidEmailVerificationToken extends Data.TaggedError('InvalidEmailVerificationToken')<{}> {
  readonly code = 'INVALID_EMAIL_VERIFICATION_TOKEN'
  get message() { return 'Email verification token is invalid or expired' }
}

export class IncorrectCurrentPassword extends Data.TaggedError('IncorrectCurrentPassword')<{
  readonly userId: number
}> {
  readonly code = 'INCORRECT_CURRENT_PASSWORD'
  get message() { return 'Current password is incorrect' }
}

// ─── Config Tag ─────────────────────────────────────────────────────────

export class AccountConfig extends Context.Service<
  AccountConfig,
  {
    readonly passwordResetTtl: Duration.Duration
    readonly emailVerificationTtl: Duration.Duration
    readonly requireEmailVerification: boolean
    readonly sendVerificationOnSignUp: boolean
    readonly baseUrl: string
  }
>()('@czo/auth/AccountConfig') {}

export const makeAccountConfigLayer = (input: {
  passwordResetTtl?: Duration.Duration
  emailVerificationTtl?: Duration.Duration
  requireEmailVerification?: boolean
  sendVerificationOnSignUp?: boolean
  baseUrl: string
}): Layer.Layer<AccountConfig> =>
  Layer.succeed(AccountConfig, {
    passwordResetTtl: input.passwordResetTtl ?? PASSWORD_RESET_TTL,
    emailVerificationTtl: input.emailVerificationTtl ?? EMAIL_VERIFICATION_TTL,
    requireEmailVerification: input.requireEmailVerification ?? false,
    sendVerificationOnSignUp: input.sendVerificationOnSignUp ?? true,
    baseUrl: input.baseUrl,
  })

// ─── Service contract ───────────────────────────────────────────────────

export class AccountService extends Context.Service<
  AccountService,
  {
    readonly requestPasswordReset: (email: string) => Effect.Effect<void, AccountDbFailed>
    readonly resetPassword: (input: {
      readonly token: string
      readonly newPassword: string
    }) => Effect.Effect<void, InvalidPasswordResetToken | PasswordHashFailed | AccountDbFailed | SessionStoreFailed>
    readonly requestEmailVerification: (userId: number) => Effect.Effect<void, AccountDbFailed>
    readonly verifyEmail: (token: string) => Effect.Effect<void, InvalidEmailVerificationToken | AccountDbFailed>
    readonly changePassword: (input: {
      readonly userId: number
      readonly currentSessionToken: string
      readonly currentPassword: string
      readonly newPassword: string
    }) => Effect.Effect<void, UserNotFound | IncorrectCurrentPassword | PasswordHashFailed | AccountDbFailed | SessionStoreFailed>
  }
>()('@czo/auth/AccountService') {}

// ─── Internals ──────────────────────────────────────────────────────────

type IdentifierKind = 'password-reset' | 'email-verification'

const COOLDOWN_MS = 60_000

// ─── Live layer ─────────────────────────────────────────────────────────

export const layer = Layer.effect(
  AccountService,
  Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const usersSvc = yield* UserService
    const passwords = yield* PasswordService
    const sessions = yield* SessionService
    const events = yield* AuthEvents
    const config = yield* AccountConfig

    const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
      eff.pipe(Effect.mapError((cause): AccountDbFailed => new AccountDbFailed({ cause })))

    // ── token CRUD (private helpers, captured in closure) ──

    /**
     * Insert a verification token for the given kind+userId.
     * Returns null if a recent token already exists (cooldown window).
     * Returns the raw (unhashed) token on success.
     */
    const writeToken = Effect.fnUntraced(function* (kind: IdentifierKind, userId: number, ttl: Duration.Duration) {
        const identifier = `${kind}:${userId}`
        const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS)

        // Check for a recent token (cooldown). Use select() so we can filter on createdAt.
        const recent = yield* dbErr(
          db.select({ id: verifications.id }).from(verifications)
            .where(and(
              eq(verifications.identifier, identifier),
              gt(verifications.createdAt, cooldownCutoff),
            ))
            .limit(1),
        ).pipe(Effect.map(rows => rows[0] ?? null))

        if (recent !== null) return null

        const raw = randomBytes(32).toString('base64url')
        const hashed = createHash('sha256').update(raw).digest('hex')
        const expiresAt = new Date(Date.now() + Duration.toMillis(ttl))
        const now = new Date()

        yield* dbErr(
          db.insert(verifications).values({
            identifier, value: hashed, expiresAt,
            createdAt: now, updatedAt: now,
          }),
        )
        return raw
    })

    /**
     * Delete a verification token if valid (right kind, not expired).
     * Returns the userId extracted from the identifier, or null if invalid.
     */
    const consumeToken = Effect.fnUntraced(function* (kind: IdentifierKind, rawToken: string) {
        const hashed = createHash('sha256').update(rawToken).digest('hex')
        const now = new Date()
        const rows = yield* dbErr(
          db.delete(verifications)
            .where(and(
              eq(verifications.value, hashed),
              like(verifications.identifier, `${kind}:%`),
              gt(verifications.expiresAt, now),
            ))
            .returning({ identifier: verifications.identifier }),
        )
        const row = rows[0]
        if (!row) return null
        const userId = Number(row.identifier.split(':')[1])
        if (!Number.isFinite(userId)) return null
        return userId
    })

    // ── flow handlers ──

    const requestPasswordReset = Effect.fn('account.requestPasswordReset')(function* (email: string) {
      const target = yield* usersSvc.findFirst({ where: { email } }).pipe(
        Effect.orElseSucceed(() => null),
      )
      if (!target) return
      const raw = yield* writeToken('password-reset', target.id, config.passwordResetTtl)
      if (raw === null) return
      yield* Effect.forkDetach(events.publish({
        _tag: 'PasswordResetRequested',
        userId: target.id,
        email: target.email,
        token: raw,
        expiresAt: new Date(Date.now() + Duration.toMillis(config.passwordResetTtl)),
      }))
    })

    const resetPassword = Effect.fn('account.resetPassword')(function* (input: { token: string, newPassword: string }) {
      const userId = yield* consumeToken('password-reset', input.token)
      if (userId === null)
        return yield* Effect.fail(new InvalidPasswordResetToken())

      yield* usersSvc.setPassword(userId, input.newPassword).pipe(
        Effect.catchTag('UserNotFound', () => Effect.fail(new InvalidPasswordResetToken())),
        Effect.catchTag('UserDbFailed', (err) => Effect.fail(new AccountDbFailed({ cause: err.cause }))),
      )

      yield* sessions.revokeAllForUser(userId)

      yield* Effect.forkDetach(events.publish({
        _tag: 'PasswordChanged',
        userId,
        reason: 'reset',
      }))
    })

    const requestEmailVerification = Effect.fn('account.requestEmailVerification')(function* (userId: number) {
      const target = yield* usersSvc.findFirst({ where: { id: userId } }).pipe(
        Effect.orElseSucceed(() => null),
      )
      if (!target) return
      if (target.emailVerified) return
      const raw = yield* writeToken('email-verification', target.id, config.emailVerificationTtl)
      if (raw === null) return
      yield* Effect.forkDetach(events.publish({
        _tag: 'EmailVerificationRequested',
        userId: target.id,
        email: target.email,
        token: raw,
        expiresAt: new Date(Date.now() + Duration.toMillis(config.emailVerificationTtl)),
      }))
    })

    const verifyEmail = Effect.fn('account.verifyEmail')(function* (token: string) {
      const userId = yield* consumeToken('email-verification', token)
      if (userId === null)
        return yield* Effect.fail(new InvalidEmailVerificationToken())

      yield* dbErr(
        db.update(users)
          .set({ emailVerified: true, updatedAt: new Date() })
          .where(eq(users.id, userId)),
      )

      yield* Effect.forkDetach(events.publish({
        _tag: 'EmailVerified',
        userId,
      }))
    })

    const changePassword = Effect.fn('account.changePassword')(function* (input: {
      userId: number, currentSessionToken: string, currentPassword: string, newPassword: string,
    }) {
      // Find the credential account row for this user.
      const acctRows = yield* dbErr(
        db.select({
          password: accounts.password,
        }).from(accounts)
          .where(and(
            eq(accounts.userId, input.userId),
            eq(accounts.providerId, 'credential'),
          ))
          .limit(1),
      )
      const acct = acctRows[0] ?? null
      if (!acct || !acct.password)
        return yield* Effect.fail(new UserNotFound())

      const ok = yield* passwords.verify(acct.password, input.currentPassword)
      if (!ok)
        return yield* Effect.fail(new IncorrectCurrentPassword({ userId: input.userId }))

      yield* usersSvc.setPassword(input.userId, input.newPassword).pipe(
        Effect.catchTag('UserNotFound', () => Effect.fail(new UserNotFound())),
        Effect.catchTag('UserDbFailed', (err) => Effect.fail(new AccountDbFailed({ cause: err.cause }))),
      )

      yield* sessions.revokeAllForUserExcept(input.userId, input.currentSessionToken)

      yield* Effect.forkDetach(events.publish({
        _tag: 'PasswordChanged',
        userId: input.userId,
        reason: 'self-change',
      }))
    })

    return AccountService.of({
      requestPasswordReset,
      resetPassword,
      requestEmailVerification,
      verifyEmail,
      changePassword,
    })
  }),
)

// ─── Subscribers ─────────────────────────────────────────────────────────

const onPasswordResetRequested = Effect.fn('account.subscribers.password-reset')(
  function* (e: Extract<AuthEvent, { _tag: 'PasswordResetRequested' }>) {
    const config = yield* AccountConfig
    const email = yield* EmailService
    const resetUrl = `${config.baseUrl}/reset-password?token=${e.token}`
    yield* email.send({
      to: e.email,
      subject: 'Reset your password',
      html: `<p>Click to reset: <a href="${resetUrl}">${resetUrl}</a></p><p>Expires ${e.expiresAt.toISOString()}</p>`,
      text: `Reset: ${resetUrl}\nExpires ${e.expiresAt.toISOString()}`,
    })
  },
)

const onEmailVerificationRequested = Effect.fn('account.subscribers.email-verification')(
  function* (e: Extract<AuthEvent, { _tag: 'EmailVerificationRequested' }>) {
    const config = yield* AccountConfig
    const email = yield* EmailService
    const verifyUrl = `${config.baseUrl}/verify-email?token=${e.token}`
    yield* email.send({
      to: e.email,
      subject: 'Verify your email',
      html: `<p>Click to verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
      text: `Verify: ${verifyUrl}`,
    })
  },
)

const onSignedUp = Effect.fn('account.subscribers.signed-up')(
  function* (e: Extract<AuthEvent, { _tag: 'SignedUp' }>) {
    const config = yield* AccountConfig
    if (!config.sendVerificationOnSignUp) return
    const account = yield* AccountService
    yield* account.requestEmailVerification(e.userId)
  },
)

const runSubscriber = (tag: string, eff: Effect.Effect<void, unknown, AccountConfig | EmailService | AccountService>) =>
  Effect.orDie(eff).pipe(
    Effect.catchCause(cause =>
      Effect.logError(`account subscriber failed for ${tag}`, cause)),
  )

export const subscribersLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const events = yield* AuthEvents
    yield* Effect.forkScoped(
      Stream.runForEach(events.subscribe, (e) =>
        e._tag === 'PasswordResetRequested'     ? runSubscriber(e._tag, onPasswordResetRequested(e))
        : e._tag === 'EmailVerificationRequested' ? runSubscriber(e._tag, onEmailVerificationRequested(e))
        : e._tag === 'SignedUp'                   ? runSubscriber(e._tag, onSignedUp(e))
        :                                           Effect.void),
    )
  }),
)
