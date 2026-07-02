import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db'
import type { ActorProviderFailed } from '../services/actor'
import type * as Cookie from '../services/cookie'
import type { PasswordHashFailed } from '../services/user'
import { describeDbError, DrizzleDb } from '@czo/kit/db'
import { Data, Effect } from 'effect'
import { AuthActorService } from '../services/actor'
import * as AuthEvents from '../services/events/auth'
import * as Password from '../services/password'
import * as Session from '../services/session'
import * as User from '../services/user'
import { CREDENTIAL_PROVIDER } from '../services/utils/credential-account'

// ─── Tagged errors ───────────────────────────────────────────────────────

export class EmailAlreadyRegistered extends Data.TaggedError('EmailAlreadyRegistered')<{
  readonly email: string
}> {
  readonly code = 'EMAIL_ALREADY_REGISTERED'
  get message() { return `Email ${this.email} is already registered` }
}

export class InvalidCredentials extends Data.TaggedError('InvalidCredentials') {
  readonly code = 'INVALID_CREDENTIALS'
  get message() { return 'Invalid email or password' }
}

export class ActorTypeNotAllowed extends Data.TaggedError('ActorTypeNotAllowed')<{
  readonly actorType: string
}> {
  readonly code = 'ACTOR_TYPE_NOT_ALLOWED'
  get message() { return `Actor type "${this.actorType}" is not allowed for this user` }
}

export class CredentialDbFailed extends Data.TaggedError('CredentialDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'CREDENTIAL_DB_FAILED'
  get message() { return 'Credential database operation failed' }
}

/**
 * Wrap a DB Effect — any failure becomes `CredentialDbFailed`. Before wrapping,
 * log the *real* driver error: drizzle's `EffectDrizzleQueryError.message` only
 * echoes the SQL (`"Failed query: …"`), so `describeDbError` unwraps `.cause` to
 * the leaf Postgres error (SQLSTATE + message + detail) and surfaces it.
 */
function dbErr<A, E>(eff: Effect.Effect<A, E>) {
  return eff.pipe(
    Effect.tapError(cause => Effect.logError(`auth credential DB op failed: ${describeDbError(cause)}`)),
    Effect.mapError(cause => new CredentialDbFailed({ cause })),
  )
}

// ─── Inputs ──────────────────────────────────────────────────────────────

export interface SignUpInput {
  readonly email: string
  readonly name: string
  readonly password: string
  readonly actorType?: string
}

export interface SignInInput {
  readonly email: string
  readonly password: string
  readonly actorType?: string
}

export type CredentialResult = Session.ResolvedSession & {
  readonly token: string
  readonly cookie: Cookie.Cookie
}

type CredentialError
  = | EmailAlreadyRegistered | InvalidCredentials | ActorTypeNotAllowed
    | PasswordHashFailed | ActorProviderFailed | Session.SessionStoreFailed | CredentialDbFailed

// ─── Helper: actor-type validation (unregistered type → allowed) ─────────

function assertActorType(userId: number, actorType: string) {
  return Effect.gen(function* () {
    const actor = yield* AuthActorService
    const registered = yield* actor.registeredActors
    if (!registered.includes(actorType))
      return
    // `AuthActorService` keys actors by string user id.
    const ok = yield* actor.hasActorType(String(userId), actorType)
    if (!ok)
      return yield* Effect.fail(new ActorTypeNotAllowed({ actorType }))
  })
}

// ─── signUp ──────────────────────────────────────────────────────────────

export function signUp(input: SignUpInput): Effect.Effect<
  CredentialResult,
  CredentialError,
  User.UserService | Session.SessionService | AuthActorService | AuthEvents.AuthEvents
> {
  return Effect.gen(function* () {
    const users = yield* User.UserService
    const session = yield* Session.SessionService

    // Single source of truth for user + credential creation (transactional,
    // applies default roles). create's existence check runs before the Argon2
    // hash, so a taken email still fails before the expensive hash.
    const user = yield* users.create({
      name: input.name,
      email: input.email,
      password: input.password,
    }).pipe(
      Effect.catchTag('UserAlreadyExists', () => Effect.fail(new EmailAlreadyRegistered({ email: input.email }))),
      Effect.catchTag('InvalidRole', cause => Effect.fail(new CredentialDbFailed({ cause }))),
      // Unreachable: sign-up is a system call (no actorId) — the delegation
      // guard is skipped — but `create`'s error channel is static.
      Effect.catchTag('RoleAssignmentDenied', cause => Effect.fail(new CredentialDbFailed({ cause }))),
      Effect.catchTag('CredentialLinkFailed', e => Effect.fail(new CredentialDbFailed({ cause: e.cause }))),
      Effect.catchTag('UserDbFailed', e => Effect.fail(new CredentialDbFailed({ cause: e.cause }))),
    )

    if (input.actorType)
      yield* assertActorType(user.id, input.actorType)

    const { token, session: sessionRow } = yield* session.create({
      userId: user.id,
      actorType: input.actorType,
    })
    const cookie = session.setCookie(token)

    // SignedUp — fire-and-forget, post-commit. Drives account.onSignedUp
    // (verification email). `UserCreated` (from create) has no subscriber.
    const events = yield* AuthEvents.AuthEvents
    yield* Effect.forkDetach(events.publish({
      _tag: 'SignedUp',
      userId: user.id,
      email: user.email,
      actorType: sessionRow.actorType,
    }))

    return { session: sessionRow, user, token, cookie }
  })
}

// ─── signIn ──────────────────────────────────────────────────────────────

export function signIn(input: SignInInput): Effect.Effect<
  CredentialResult,
  CredentialError,
  Password.PasswordService | Session.SessionService | AuthActorService | DrizzleDb
> {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const password = yield* Password.PasswordService
    const session = yield* Session.SessionService

    // Soft-deleted accounts must NOT sign in — filter `deletedAt IS NULL`.
    const user = yield* dbErr(db.query.users.findFirst({ where: { email: input.email, deletedAt: { isNull: true } } }))
    if (!user)
      return yield* Effect.fail(new InvalidCredentials())

    // RQBv2 — the `where` object filters by userId AND providerId, so the
    // credential row is already scoped (no post-query narrowing needed).
    const credential = yield* dbErr(db.query.accounts.findFirst({
      where: { userId: user.id, providerId: CREDENTIAL_PROVIDER },
    }))
    if (!credential?.password)
      return yield* Effect.fail(new InvalidCredentials())

    const ok = yield* password.verify(credential.password, input.password)
    if (!ok)
      return yield* Effect.fail(new InvalidCredentials())

    if (input.actorType)
      yield* assertActorType(user.id, input.actorType)

    const { token, session: sessionRow } = yield* session.create({
      userId: user.id,
      actorType: input.actorType,
    })
    return { session: sessionRow, user, token, cookie: session.setCookie(token) }
  })
}
