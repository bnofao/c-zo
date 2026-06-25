import type { CredentialLinkFailed, InvalidRole, PasswordHashFailed, UserDbFailed } from './user'
import { describeDbError } from '@czo/kit/db'
import { Config, Effect, Redacted } from 'effect'
import { UserService } from './user'

// ─── Types ───────────────────────────────────────────────────────────────

export interface EnsureInitialAdminInput {
  /** Secret — kept wrapped, unwrapped only at the create sink. */
  readonly email: Redacted.Redacted<string>
  readonly name: string
  /** Secret — kept wrapped, unwrapped only at the create sink. */
  readonly password: Redacted.Redacted<string>
  /** Platform role(s); CSV/array. Defaults to `'admin'`. Validated by UserService. */
  readonly role?: string | string[]
}

export interface EnsureInitialAdminResult {
  readonly created: boolean
  /** Carried wrapped so callers never log it in clear. */
  readonly email: Redacted.Redacted<string>
}

export type EnsureInitialAdminError
  = | CredentialLinkFailed
    | InvalidRole
    | PasswordHashFailed
    | UserDbFailed

export interface InitialAdminSettings {
  /** Secret; empty wrapped value ⇒ unset. */
  readonly email: Redacted.Redacted<string>
  /** Secret; empty wrapped value ⇒ unset. */
  readonly password: Redacted.Redacted<string>
  readonly name: string
  /** CSV; default 'admin'. */
  readonly role: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const DEV_DEFAULT_EMAIL = 'admin@life.dev'
const DEV_DEFAULT_PASSWORD = 'DevAdmin1!'

/** Walk an error's `cause` chain for a Postgres unique-violation (SQLSTATE 23505). */
function isUniqueViolation(cause: unknown): boolean {
  const seen = new Set<unknown>()
  let err: unknown = cause
  while (err && typeof err === 'object' && !seen.has(err)) {
    if ((err as { code?: unknown }).code === '23505')
      return true
    seen.add(err)
    err = (err as { cause?: unknown }).cause
  }
  return false
}

// ─── Config ─────────────────────────────────────────────────────────────────

/**
 * Reads `INITIAL_ADMIN_*` from the environment. Only in local development
 * (`NODE_ENV === 'development'`, the default when unset) does an unset
 * email/password fall back to the dev defaults; in production AND under test
 * (`NODE_ENV === 'test'`, vitest's default) they stay empty so callers no-op.
 * Gating on `=== 'development'` (not `!== 'production'`) keeps the boot seed
 * from injecting an admin into every Testcontainers e2e boot, which would shift
 * auto-increment user ids and break harnesses that assume a sequential id.
 * Empty = unset.
 */
export const InitialAdminConfig = Effect.gen(function* () {
  const nodeEnv = yield* Config.string('NODE_ENV').pipe(Config.withDefault('development'))
  const isDev = nodeEnv === 'development'
  // `Config.redacted` keeps the raw value out of logs/spans (mirrors how
  // DATABASE_URL is read in packages/kit/src/db/index.ts).
  const emailRaw = yield* Config.redacted('INITIAL_ADMIN_EMAIL').pipe(Config.withDefault(Redacted.make('')))
  const passwordRaw = yield* Config.redacted('INITIAL_ADMIN_PASSWORD').pipe(Config.withDefault(Redacted.make('')))
  const name = yield* Config.string('INITIAL_ADMIN_NAME').pipe(Config.withDefault('Admin'))
  const role = yield* Config.string('INITIAL_ADMIN_ROLE').pipe(Config.withDefault('admin'))
  // Unwrap only to apply the empty/dev-default branch, then re-wrap.
  const email = Redacted.value(emailRaw) || (isDev ? DEV_DEFAULT_EMAIL : '')
  const password = Redacted.value(passwordRaw) || (isDev ? DEV_DEFAULT_PASSWORD : '')
  return {
    email: Redacted.make(email),
    password: Redacted.make(password),
    name,
    role,
  } satisfies InitialAdminSettings
})

// ─── Core ─────────────────────────────────────────────────────────────────

/**
 * Idempotently ensure the initial admin exists (ensure-by-email). Creates the
 * user (role default `'admin'`, `emailVerified: true`) when missing; treats
 * `UserAlreadyExists` and the multi-replica unique-violation race as a skip.
 * Genuine errors (InvalidRole, credential/hash failures, other DB errors)
 * propagate — each caller decides escalation.
 */
export function ensureInitialAdmin(input: EnsureInitialAdminInput): Effect.Effect<EnsureInitialAdminResult, EnsureInitialAdminError, UserService> {
  return Effect.gen(function* () {
    const users = yield* UserService
    const result = yield* users.create({
      // Unwrap the secrets ONLY here, at the create sink.
      email: Redacted.value(input.email),
      name: input.name,
      password: Redacted.value(input.password),
      role: input.role ?? 'admin',
      emailVerified: true,
    }).pipe(
      Effect.map((): EnsureInitialAdminResult => ({ created: true, email: input.email })),
      Effect.catchTag('UserAlreadyExists', () =>
        Effect.succeed<EnsureInitialAdminResult>({ created: false, email: input.email })),
      Effect.catchTag('UserDbFailed', e =>
        isUniqueViolation(e.cause)
          ? Effect.succeed<EnsureInitialAdminResult>({ created: false, email: input.email })
          : Effect.logError(`initial admin create failed: ${describeDbError(e.cause)}`).pipe(
              Effect.andThen(Effect.fail(e)),
            )),
    )
    // Never log the address in clear (it's a secret).
    yield* Effect.logInfo(
      result.created ? 'initial admin created' : 'initial admin already exists — skipping',
    )
    return result
  })
}
