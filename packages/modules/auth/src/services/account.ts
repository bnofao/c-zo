import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db/effect'
import type { SendEmailInput } from '@czo/kit/email'
import type { AuthEvent } from './events/auth'
import type { SessionStoreFailed } from './session'
import type { PasswordHashFailed } from './user'
import { createHash, randomBytes } from 'node:crypto'
import { DrizzleDb } from '@czo/kit/db/effect'
import { EmailService } from '@czo/kit/email'
import { and, count, eq, gt, like } from 'drizzle-orm'
import { Context, Data, Duration, Effect, Layer, Option, Stream } from 'effect'
import { ACCOUNT_GRACE_PERIOD, CHANGE_EMAIL_TTL, EMAIL_VERIFICATION_TTL, PASSWORD_RESET_TTL } from '../constants'
import { accounts, members, users, verifications } from '../database/schema'
import { AuthEvents } from './events/auth'
import { PasswordService } from './password'
import { SessionService } from './session'
import { UserNotFound, UserService } from './user'
import { CREDENTIAL_PROVIDER, updateCredentialPassword } from './utils/credential-account'

// ─── Tagged errors ──────────────────────────────────────────────────────

export class AccountDbFailed extends Data.TaggedError('AccountDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'ACCOUNT_DB_FAILED'
  get message() { return 'Account store operation failed' }
}

export class InvalidPasswordResetToken extends Data.TaggedError('InvalidPasswordResetToken') {
  readonly code = 'INVALID_PASSWORD_RESET_TOKEN'
  get message() { return 'Password reset token is invalid or expired' }
}

export class InvalidEmailVerificationToken extends Data.TaggedError('InvalidEmailVerificationToken') {
  readonly code = 'INVALID_EMAIL_VERIFICATION_TOKEN'
  get message() { return 'Email verification token is invalid or expired' }
}

export class IncorrectCurrentPassword extends Data.TaggedError('IncorrectCurrentPassword')<{
  readonly userId: number
}> {
  readonly code = 'INCORRECT_CURRENT_PASSWORD'
  get message() { return 'Current password is incorrect' }
}

export class InvalidEmailChangeToken extends Data.TaggedError('InvalidEmailChangeToken') {
  readonly code = 'INVALID_EMAIL_CHANGE_TOKEN'
  get message() { return 'Email change token is invalid or expired' }
}

export class InvalidAccountRestoreToken extends Data.TaggedError('InvalidAccountRestoreToken') {
  readonly code = 'INVALID_ACCOUNT_RESTORE_TOKEN'
  get message() { return 'Account restore token is invalid or expired' }
}

export class CannotDeleteWithOwnedOrgs extends Data.TaggedError('CannotDeleteWithOwnedOrgs')<{
  readonly orgIds: readonly number[]
}> {
  readonly code = 'CANNOT_DELETE_WITH_OWNED_ORGS'
  get message() { return 'Cannot delete account while sole owner of one or more organizations' }
}

export class AccountUnrecoverable extends Data.TaggedError('AccountUnrecoverable')<{
  readonly userId: number
}> {
  readonly code = 'ACCOUNT_UNRECOVERABLE'
  get message() { return 'Account is no longer recoverable (grace period elapsed)' }
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
    readonly changeEmailTtl: Duration.Duration
    readonly gracePeriod: Duration.Duration
    readonly sendOldEmailNotificationOnChange: boolean
  }
>()('@czo/auth/AccountConfig') {}

export function makeAccountConfigLayer(input: {
  passwordResetTtl?: Duration.Duration
  emailVerificationTtl?: Duration.Duration
  requireEmailVerification?: boolean
  sendVerificationOnSignUp?: boolean
  baseUrl: string
  changeEmailTtl?: Duration.Duration
  gracePeriod?: Duration.Duration
  sendOldEmailNotificationOnChange?: boolean
}): Layer.Layer<AccountConfig> {
  return Layer.succeed(AccountConfig, {
    passwordResetTtl: input.passwordResetTtl ?? PASSWORD_RESET_TTL,
    emailVerificationTtl: input.emailVerificationTtl ?? EMAIL_VERIFICATION_TTL,
    requireEmailVerification: input.requireEmailVerification ?? false,
    sendVerificationOnSignUp: input.sendVerificationOnSignUp ?? true,
    baseUrl: input.baseUrl,
    changeEmailTtl: input.changeEmailTtl ?? CHANGE_EMAIL_TTL,
    gracePeriod: input.gracePeriod ?? ACCOUNT_GRACE_PERIOD,
    sendOldEmailNotificationOnChange: input.sendOldEmailNotificationOnChange ?? true,
  })
}

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

    readonly requestEmailChange: (input: {
      readonly userId: number
      readonly currentPassword?: string
      readonly newEmail: string
    }) => Effect.Effect<void, IncorrectCurrentPassword | AccountDbFailed>

    readonly confirmEmailChange: (input: {
      readonly token: string
      readonly currentSessionToken: string | null
    }) => Effect.Effect<void, InvalidEmailChangeToken | AccountDbFailed | SessionStoreFailed>

    readonly deleteAccount: (input: {
      readonly userId: number
      readonly currentPassword?: string
    }) => Effect.Effect<void, IncorrectCurrentPassword | CannotDeleteWithOwnedOrgs | AccountDbFailed | SessionStoreFailed>

    readonly restoreAccount: (token: string) =>
    Effect.Effect<void, InvalidAccountRestoreToken | AccountUnrecoverable | AccountDbFailed>
  }
>()('@czo/auth/AccountService') {}

// ─── Internals ──────────────────────────────────────────────────────────

type IdentifierKind = 'password-reset' | 'email-verification' | 'change-email' | 'account-restore'

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
     *
     * `identifierOverride` lets callers encode extra context in the identifier
     * (e.g. `change-email:{userId}:{base64url(newEmail)}`). When omitted the
     * default `${kind}:${userId}` is used.
     */
    const writeToken = Effect.fnUntraced(function* (
      kind: IdentifierKind,
      userId: number,
      ttl: Duration.Duration,
      identifierOverride?: string,
    ) {
      const identifier = identifierOverride ?? `${kind}:${userId}`
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

      if (recent !== null)
        return null

      const raw = randomBytes(32).toString('base64url')
      const hashed = createHash('sha256').update(raw).digest('hex')
      const expiresAt = new Date(Date.now() + Duration.toMillis(ttl))
      const now = new Date()

      yield* dbErr(
        db.insert(verifications).values({
          identifier,
          value: hashed,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        }),
      )
      return raw
    })

    /**
     * Delete a verification token if valid (right kind, not expired).
     * Returns `{ userId, identifier }` extracted from the row, or null if invalid.
     * Caller can decode extra segments from `identifier` when applicable
     * (e.g. `change-email:{userId}:{base64url(newEmail)}`).
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
      if (!row)
        return null
      const userId = Number(row.identifier.split(':')[1])
      if (!Number.isFinite(userId))
        return null
      return { userId, identifier: row.identifier }
    })

    // ── flow handlers ──

    const requestPasswordReset = Effect.fn('account.requestPasswordReset')(function* (email: string) {
      const target = yield* usersSvc.findFirst({ where: { email } }).pipe(
        Effect.orElseSucceed(() => null),
      )
      if (!target)
        return
      const raw = yield* writeToken('password-reset', target.id, config.passwordResetTtl)
      if (raw === null)
        return
      yield* Effect.forkDetach(events.publish({
        _tag: 'PasswordResetRequested',
        userId: target.id,
        email: target.email,
        token: raw,
        expiresAt: new Date(Date.now() + Duration.toMillis(config.passwordResetTtl)),
      }))
    })

    /**
     * Update the `credential` provider password for a user. Uses the shared
     * `updateCredentialPassword` helper (same row shape as `UserService.setPassword`
     * and `http/credential.ts` signUp). Replaces the prior call to
     * `UserService.setPassword` inside AccountService flows so this module no
     * longer depends on `better-auth.$context.internalAdapter.updatePassword`.
     *
     * Updates 0 rows if the user has no credential account (OAuth-only).
     * Call sites already gate on credential presence before invoking.
     */
    const setCredentialPassword = Effect.fnUntraced(function* (userId: number, plainPassword: string) {
      const hashed = yield* passwords.hash(plainPassword)
      yield* dbErr(updateCredentialPassword(db, userId, hashed))
    })

    const resetPassword = Effect.fn('account.resetPassword')(function* (input: { token: string, newPassword: string }) {
      const result = yield* consumeToken('password-reset', input.token)
      if (result === null)
        return yield* Effect.fail(new InvalidPasswordResetToken())
      const { userId } = result

      yield* setCredentialPassword(userId, input.newPassword)

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
      if (!target)
        return
      if (target.emailVerified)
        return
      const raw = yield* writeToken('email-verification', target.id, config.emailVerificationTtl)
      if (raw === null)
        return
      yield* Effect.forkDetach(events.publish({
        _tag: 'EmailVerificationRequested',
        userId: target.id,
        email: target.email,
        token: raw,
        expiresAt: new Date(Date.now() + Duration.toMillis(config.emailVerificationTtl)),
      }))
    })

    const verifyEmail = Effect.fn('account.verifyEmail')(function* (token: string) {
      const result = yield* consumeToken('email-verification', token)
      if (result === null)
        return yield* Effect.fail(new InvalidEmailVerificationToken())
      const { userId } = result

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
      userId: number
      currentSessionToken: string
      currentPassword: string
      newPassword: string
    }) {
      // Find the credential account row for this user.
      const acctRows = yield* dbErr(
        db.select({
          password: accounts.password,
        }).from(accounts)
          .where(and(
            eq(accounts.userId, input.userId),
            eq(accounts.providerId, CREDENTIAL_PROVIDER),
          ))
          .limit(1),
      )
      const acct = acctRows[0] ?? null
      if (!acct || !acct.password)
        return yield* Effect.fail(new UserNotFound())

      const ok = yield* passwords.verify(acct.password, input.currentPassword)
      if (!ok)
        return yield* Effect.fail(new IncorrectCurrentPassword({ userId: input.userId }))

      yield* setCredentialPassword(input.userId, input.newPassword)

      yield* sessions.revokeAllForUserExcept(input.userId, input.currentSessionToken)

      yield* Effect.forkDetach(events.publish({
        _tag: 'PasswordChanged',
        userId: input.userId,
        reason: 'self-change',
      }))
    })

    // ── Private helper: verify credential password if user has one ──

    const verifyCredentialPasswordIfPresent = Effect.fnUntraced(function* (
      userId: number,
      currentPassword: string | undefined,
    ) {
      // Check if user has a credential account
      const acctRows = yield* dbErr(
        db.select({ password: accounts.password })
          .from(accounts)
          .where(and(
            eq(accounts.userId, userId),
            eq(accounts.providerId, CREDENTIAL_PROVIDER),
          ))
          .limit(1),
      )
      const acct = acctRows[0] ?? null
      // If no credential account, skip password check (OAuth-only user)
      if (!acct || !acct.password)
        return
      // If credential account exists but no password provided, fail
      if (!currentPassword)
        return yield* Effect.fail(new IncorrectCurrentPassword({ userId }))
      const ok = yield* passwords.verify(acct.password, currentPassword)
      if (!ok)
        return yield* Effect.fail(new IncorrectCurrentPassword({ userId }))
    })

    // ── requestEmailChange ──

    const requestEmailChange = Effect.fn('account.requestEmailChange')(function* (input: {
      userId: number
      currentPassword?: string
      newEmail: string
    }) {
      // Find the user to get old email
      const target = yield* usersSvc.findFirst({ where: { id: input.userId } }).pipe(
        Effect.orElseSucceed(() => null),
      )
      if (!target)
        return
      if (target.deletedAt !== null)
        return // soft-deleted: no-op, anti-information

      yield* verifyCredentialPasswordIfPresent(input.userId, input.currentPassword)

      // Encode newEmail into the identifier so confirmEmailChange can decode it
      const encoded = Buffer.from(input.newEmail).toString('base64url')
      const identifier = `change-email:${input.userId}:${encoded}`
      const raw = yield* writeToken('change-email', input.userId, config.changeEmailTtl, identifier)
      if (raw === null)
        return

      yield* Effect.forkDetach(events.publish({
        _tag: 'EmailChangeRequested',
        userId: input.userId,
        oldEmail: target.email,
        newEmail: input.newEmail,
        token: raw,
        expiresAt: new Date(Date.now() + Duration.toMillis(config.changeEmailTtl)),
      }))
    })

    // ── confirmEmailChange ──

    const confirmEmailChange = Effect.fn('account.confirmEmailChange')(function* (input: {
      token: string
      currentSessionToken: string | null
    }) {
      const result = yield* consumeToken('change-email', input.token)
      if (result === null)
        return yield* Effect.fail(new InvalidEmailChangeToken())

      const { userId, identifier } = result
      // identifier format: change-email:{userId}:{base64url(newEmail)}
      const parts = identifier.split(':')
      const encodedEmail = parts[2]
      if (!encodedEmail)
        return yield* Effect.fail(new InvalidEmailChangeToken())
      const newEmail = Buffer.from(encodedEmail, 'base64url').toString('utf8')

      // Capture old email before update
      const userRow = yield* usersSvc.findFirst({ where: { id: userId } }).pipe(
        Effect.orElseSucceed(() => null),
      )
      if (!userRow)
        return yield* Effect.fail(new InvalidEmailChangeToken())
      const oldEmail = userRow.email

      // Update email and mark verified
      yield* dbErr(
        db.update(users)
          .set({ email: newEmail, emailVerified: true, updatedAt: new Date() })
          .where(eq(users.id, userId)),
      )

      // Revoke all sessions except current (or all if null)
      if (input.currentSessionToken !== null) {
        yield* sessions.revokeAllForUserExcept(userId, input.currentSessionToken)
      }
      else {
        yield* sessions.revokeAllForUser(userId)
      }

      yield* Effect.forkDetach(events.publish({
        _tag: 'EmailChanged',
        userId,
        oldEmail,
        newEmail,
      }))
    })

    // ── deleteAccount ──

    const deleteAccount = Effect.fn('account.deleteAccount')(function* (input: {
      userId: number
      currentPassword?: string
    }) {
      // 1. Fetch BEFORE any mutation.
      const target = yield* usersSvc.findFirst({ where: { id: input.userId } }).pipe(
        Effect.orElseSucceed(() => null),
      )
      if (!target)
        return // unknown user: no-op
      if (target.deletedAt !== null)
        return // idempotent: already soft-deleted

      // 2. Hybrid pwd check.
      yield* verifyCredentialPasswordIfPresent(input.userId, input.currentPassword)

      // 3. Sole-owner check.
      const ownerMemberships = yield* dbErr(
        db.select({ organizationId: members.organizationId })
          .from(members)
          .where(and(
            eq(members.userId, input.userId),
            eq(members.role, 'owner'),
          )),
      )

      if (ownerMemberships.length > 0) {
        const soleOwnedOrgIds: number[] = []
        for (const m of ownerMemberships) {
          const ownerCountRows = yield* dbErr(
            db.select({ cnt: count() })
              .from(members)
              .where(and(
                eq(members.organizationId, m.organizationId),
                eq(members.role, 'owner'),
              )),
          )
          const ownerCount = ownerCountRows[0]?.cnt ?? 0
          if (ownerCount <= 1)
            soleOwnedOrgIds.push(m.organizationId)
        }
        if (soleOwnedOrgIds.length > 0)
          return yield* Effect.fail(new CannotDeleteWithOwnedOrgs({ orgIds: soleOwnedOrgIds }))
      }

      // 4. Soft-delete.
      const now = new Date()
      yield* dbErr(
        db.update(users)
          .set({ deletedAt: now, updatedAt: now })
          .where(eq(users.id, input.userId)),
      )

      // 5. Revoke all sessions.
      yield* sessions.revokeAllForUser(input.userId)

      // 6. Write restore token.
      // The default identifier (account-restore:{userId}) is what we want — no override needed.
      // Cooldown invariant: raw === null only if a restore token was written for this user within
      // the last 60s (delete→restore→delete cycle within cooldown). In that case skip the event;
      // the existing in-flight restore token still works.
      const raw = yield* writeToken('account-restore', input.userId, config.gracePeriod)
      if (raw === null)
        return

      // 7. Publish.
      yield* Effect.forkDetach(events.publish({
        _tag: 'AccountDeleted',
        userId: input.userId,
        email: target.email,
        token: raw,
        expiresAt: new Date(Date.now() + Duration.toMillis(config.gracePeriod)),
      }))
    })

    // ── restoreAccount ──

    const restoreAccount = Effect.fn('account.restoreAccount')(function* (token: string) {
      const result = yield* consumeToken('account-restore', token)
      if (result === null)
        return yield* Effect.fail(new InvalidAccountRestoreToken())

      const { userId } = result

      const target = yield* dbErr(db.query.users.findFirst({ where: { id: userId } }))
      if (!target)
        return yield* Effect.fail(new InvalidAccountRestoreToken())

      // Idempotent: already restored. Publish + return without touching the row.
      if (target.deletedAt === null) {
        yield* Effect.forkDetach(events.publish({ _tag: 'AccountRestored', userId }))
        return
      }

      // Future: detect anonymization (e.g. email matches `deleted-\d+@deleted.local`) and fail
      // AccountUnrecoverable. SP6 ships the error type but the trigger requires the anonymize job
      // — that's why AccountUnrecoverable is exported but never raised from this impl yet.

      yield* dbErr(
        db.update(users)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(eq(users.id, userId)),
      )

      yield* Effect.forkDetach(events.publish({
        _tag: 'AccountRestored',
        userId,
      }))
    })

    return AccountService.of({
      requestPasswordReset,
      resetPassword,
      requestEmailVerification,
      verifyEmail,
      changePassword,
      requestEmailChange,
      confirmEmailChange,
      deleteAccount,
      restoreAccount,
    })
  }),
)

// ─── Subscribers ─────────────────────────────────────────────────────────

// EmailService is an OPTIONAL dependency: the module doesn't provide one by
// default, so `R` stays clean. When the host app provides an `EmailService`
// layer, emails are sent; otherwise we log and skip. Probing via
// `Effect.serviceOption` keeps `EmailService` out of every subscriber's `R`.
function sendEmail(input: SendEmailInput) {
  return Effect.serviceOption(EmailService).pipe(
    Effect.flatMap(Option.match({
      onNone: () =>
        Effect.logInfo('email.skipped (no EmailService configured)', {
          to: input.to,
          subject: input.subject,
        }),
      onSome: email => email.send(input),
    })),
  )
}

const onPasswordResetRequested = Effect.fn('account.subscribers.password-reset')(
  function* (e: Extract<AuthEvent, { _tag: 'PasswordResetRequested' }>) {
    const config = yield* AccountConfig
    const resetUrl = `${config.baseUrl}/reset-password?token=${e.token}`
    yield* sendEmail({
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
    const verifyUrl = `${config.baseUrl}/verify-email?token=${e.token}`
    yield* sendEmail({
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
    if (!config.sendVerificationOnSignUp)
      return
    const account = yield* AccountService
    yield* account.requestEmailVerification(e.userId)
  },
)

const onEmailChangeRequested = Effect.fn('account.subscribers.email-change-requested')(
  function* (e: Extract<AuthEvent, { _tag: 'EmailChangeRequested' }>) {
    const config = yield* AccountConfig
    const url = `${config.baseUrl}/confirm-email-change?token=${e.token}`
    yield* sendEmail({
      to: e.newEmail,
      subject: 'Confirm your new email',
      html: `<p>Click to confirm your new email: <a href="${url}">${url}</a></p><p>Expires ${e.expiresAt.toISOString()}</p>`,
      text: `Confirm: ${url}\nExpires ${e.expiresAt.toISOString()}`,
    })
  },
)

const onEmailChanged = Effect.fn('account.subscribers.email-changed')(
  function* (e: Extract<AuthEvent, { _tag: 'EmailChanged' }>) {
    const config = yield* AccountConfig
    if (!config.sendOldEmailNotificationOnChange)
      return
    yield* sendEmail({
      to: e.oldEmail,
      subject: 'Your account email was changed',
      html: `<p>Your account email was changed to <strong>${e.newEmail}</strong>. If this wasn't you, contact support immediately.</p>`,
      text: `Your account email was changed to ${e.newEmail}. If this wasn't you, contact support.`,
    })
  },
)

const onAccountDeleted = Effect.fn('account.subscribers.account-deleted')(
  function* (e: Extract<AuthEvent, { _tag: 'AccountDeleted' }>) {
    const config = yield* AccountConfig
    const url = `${config.baseUrl}/restore-account?token=${e.token}`
    yield* sendEmail({
      to: e.email,
      subject: 'Your account has been deleted',
      html: `<p>Your account is scheduled for deletion. You have until ${e.expiresAt.toISOString()} to restore it: <a href="${url}">${url}</a></p>`,
      text: `Restore: ${url}\nExpires ${e.expiresAt.toISOString()}`,
    })
  },
)

function runSubscriber(tag: string, eff: Effect.Effect<void, unknown, AccountConfig | AccountService>) {
  return Effect.orDie(eff).pipe(
    Effect.catchCause(cause =>
      Effect.logError(`account subscriber failed for ${tag}`, cause)),
  )
}

export const subscribersLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const events = yield* AuthEvents
    yield* Effect.forkScoped(
      Stream.runForEach(events.subscribe, e =>
        e._tag === 'PasswordResetRequested'
          ? runSubscriber(e._tag, onPasswordResetRequested(e))
          : e._tag === 'EmailVerificationRequested'
            ? runSubscriber(e._tag, onEmailVerificationRequested(e))
            : e._tag === 'SignedUp'
              ? runSubscriber(e._tag, onSignedUp(e))
              : e._tag === 'EmailChangeRequested'
                ? runSubscriber(e._tag, onEmailChangeRequested(e))
                : e._tag === 'EmailChanged'
                  ? runSubscriber(e._tag, onEmailChanged(e))
                  : e._tag === 'AccountDeleted'
                    ? runSubscriber(e._tag, onAccountDeleted(e))
                    : Effect.void),
    )
  }),
)
