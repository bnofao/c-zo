import type { Database } from '@czo/kit/db'
import type { Relations } from '@czo/auth/relations'
import type { ActorProviderFailed } from '../services/actor'
import { DrizzleDb } from '@czo/kit/db/effect'
import { Data, Effect } from 'effect'
import { accounts, users } from '../database/schema'
import { AuthActorService } from '../services/actor'
import { PasswordHashFailed } from '../services/user'
import * as AuthEvents from '../services/events/auth'
import * as Cookie from '../services/cookie'
import * as Password from '../services/password'
import * as Session from '../services/session'

const CREDENTIAL_PROVIDER = 'credential'

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

/** Wrap a DB promise — any failure becomes `CredentialDbFailed`. */
const tryDb = <A>(f: () => Promise<A>) =>
  Effect.tryPromise({ try: f, catch: cause => new CredentialDbFailed({ cause }) })

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

type CredentialError =
  | EmailAlreadyRegistered | InvalidCredentials | ActorTypeNotAllowed
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
  CredentialResult, CredentialError,
  Password.PasswordService | Session.SessionService | AuthActorService | DrizzleDb | AuthEvents.AuthEvents
> {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const password = yield* Password.PasswordService
    const session = yield* Session.SessionService

    // Fail fast: reject an already-registered email BEFORE the (deliberately
    // expensive) Argon2 hash. The `users.email` unique constraint is still the
    // race-proof backstop in the transaction's `catch` below — this pre-check
    // is an optimisation + clean control flow, not a substitute for it.
    const existing = yield* tryDb(() => db.query.users.findFirst({ where: { email: input.email } }))
    if (existing)
      return yield* Effect.fail(new EmailAlreadyRegistered({ email: input.email }))

    const passwordHash = yield* password.hash(input.password)

    // user + credential account in ONE transaction → no orphan user. Integrity
    // under a concurrent same-email race is guaranteed by the `users.email`
    // unique constraint (the insert is rejected, the txn rolls back); the
    // pre-check above maps the normal "email taken" case to EmailAlreadyRegistered.
    const user = yield* tryDb(() => db.transaction(async (tx) => {
      const now = new Date()
      const [u] = await tx.insert(users).values({
        name: input.name, email: input.email, emailVerified: false,
        createdAt: now, updatedAt: now,
      }).returning()
      if (!u)
        throw new Error('user insert returned no row')
      await tx.insert(accounts).values({
        userId: u.id, accountId: String(u.id), providerId: CREDENTIAL_PROVIDER,
        password: passwordHash, createdAt: now, updatedAt: now,
      })
      return u
    }))

    // Membership is checked ONLY when the caller explicitly requested an actor
    // type — a fresh sign-up with no actorType has nothing to validate, and the
    // default-`'user'` session would otherwise always fail the check (a brand-
    // new user holds no actor-type memberships).
    if (input.actorType)
      yield* assertActorType(user.id, input.actorType)

    const { token, session: sessionRow } = yield* session.create({
      userId: user.id,
      actorType: input.actorType,
    })
    const cookie = session.setCookie(token)

    // SignedUp — fire-and-forget: a domain-event subscriber must never block or
    // fail signUp. Emitted post-commit, so the event reflects persisted state.
    // `actorType` is read off the persisted row (`SessionService` defaults it).
    const events = yield* AuthEvents.AuthEvents
    yield* Effect.forkDetach(events.publish({
      _tag: 'SignedUp', userId: user.id, email: user.email, actorType: sessionRow.actorType,
    }))

    return { session: sessionRow, user, token, cookie }
  })
}

// ─── signIn ──────────────────────────────────────────────────────────────

export function signIn(input: SignInInput): Effect.Effect<
  CredentialResult, CredentialError,
  Password.PasswordService | Session.SessionService | AuthActorService | DrizzleDb
> {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const password = yield* Password.PasswordService
    const session = yield* Session.SessionService

    const user = yield* tryDb(() => db.query.users.findFirst({ where: { email: input.email } }))
    if (!user)
      return yield* Effect.fail(new InvalidCredentials())

    // RQBv2 — the `where` object filters by userId AND providerId, so the
    // credential row is already scoped (no post-query narrowing needed).
    const credential = yield* tryDb(() => db.query.accounts.findFirst({
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
