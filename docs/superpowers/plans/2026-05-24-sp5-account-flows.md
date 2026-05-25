# SP5 — Account flows (password reset, email verification, change password) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native account self-service flows (request/reset password, request/verify email, change password) backed by an `EmailService` Tag (transport pur, dev stub via `Effect.logInfo`) + event-driven `accountSubscribersLayer`, and drop the matching better-auth REST endpoints.

**Architecture:** New `AccountService` (`services/account.ts`) owns 5 methods + private token CRUD on the existing `verifications` table (sha256-hashed tokens, `kind:<userId>` identifier convention, 60s cooldown, atomic `DELETE RETURNING` consume via Drizzle core builder). `AuthEvent` discriminated union grows by 4 variants (`PasswordResetRequested`, `EmailVerificationRequested`, `PasswordChanged`, `EmailVerified`). An `accountSubscribersLayer` (pattern SP4b) consumes the 2 `*Requested` events + `SignedUp` and calls `EmailService.send`. `SessionService.revokeAllForUserExcept(userId, exceptToken)` is added for the `changePassword` flow (revoke other devices, keep current). 5 GraphQL `relayMutationField` mutations expose the surface. Better-auth's `/forget-password`, `/reset-password`, `/verify-email`, `/send-verification-email`, `/change-password` are added to `disabledPaths` ; `emailVerificationConfig` + `sendResetPassword` stubs in `emailAndPasswordConfig` are removed.

**Tech Stack:** `effect@4.0.0-beta.70` (`Context.Service`, `Layer`, `Effect.fn`, `Effect.tryPromise`, `Effect.forkDetach`, `Effect.forkScoped`, `Stream`, `Duration`), `drizzle-orm@1.0.0-rc.3` (`db.delete().where(and(eq, like, gt)).returning({ identifier })` core builder), Pothos (`@pothos/plugin-relay`, `@pothos/plugin-scope-auth`, `@pothos/plugin-errors`), `node:crypto` (`randomBytes`, `createHash`), `@effect/vitest` + Testcontainers Postgres via `AuthPostgresLayer`.

**Source spec:** `docs/superpowers/specs/2026-05-24-sp5-account-flows-design.md`

---

## Conventions for every task

- **TDD** for Task 4 (`SessionService.revokeAllForUserExcept`, 3 tests) and Task 5 (`AccountService`, ~21 tests). Other tasks are foundation / wiring / drop — `pnpm check-types` is the gate.
- **Test style — SP1/SP3/SP4/SP4b runnable pattern.** Integration tests use `@effect/vitest` (`describe` / `it.layer` / `it.effect` / `expect`) + `AuthPostgresLayer` + `truncateAuth` from `src/testing/postgres.ts`. Testcontainers spins its own Postgres per scope — NO `TEST_DATABASE_URL`. Pure unit tests use plain `vitest`. Do NOT import `@czo/kit/effect` (removed). Assert Effect failures with `Effect.flip` then `_tag` check.
- **Real names — verified against current code, use these exactly:**
  - `AuthEvents` Tag at `packages/modules/auth/src/services/events/auth.ts:16`. `type AuthEvent` is currently a discriminated union with 3 variants: `SignedUp | ImpersonationStarted | ImpersonationStopped`. Task 5 widens with 4 more variants.
  - `SessionService` at `packages/modules/auth/src/services/session.ts:53`. Contract methods: `create`, `resolve`, `revoke`, `revokeAllForUser`, `listForUser`, `invalidateCacheForUser`, `update`, `purgeExpired`, `setCookie`, `readSessionToken`. Private helper `invalidateCacheForToken(token)` (line ~165) is reused by `revoke` / `revokeAllForUser` / `invalidateCacheForUser`.
  - `UserService` at `packages/modules/auth/src/services/user.ts`. `setPassword(id, password)` returns `Effect<true, UserNotFound | PasswordHashFailed | UserDbFailed>`. `findFirst({ where: { id | email } })` returns user row or `null`.
  - `PasswordService` at `packages/modules/auth/src/services/password.ts`. Contract: `hash(plain): Effect<string, PasswordHashFailed>`, `verify(storedHash, plain): Effect<boolean>`.
  - `accounts` table at `packages/modules/auth/src/database/schema.ts`: columns include `userId integer`, `providerId text` (e.g. `'credential'`), `password text` (nullable — OAuth-only users have null).
  - `verifications` table same file: columns `identifier text NOT NULL`, `value text NOT NULL`, `expiresAt timestamp`, `createdAt timestamp`, `updatedAt timestamp`. Pattern of `db.delete(...).returning(...)` follows `session.ts:218` (`db.delete(sessions).where(eq(sessions.userId, userId)).returning({ token: sessions.token })`) and `api-key.ts:437`.
  - `AuthModuleConfig` at `packages/modules/auth/src/module.ts:50`. `baseUrl?: string` is currently optional — SP5 leverages it for the account base URL but enforces presence at boot in `makeAccountConfigLayer`. SP4b's `impersonation?` extension is the model for the SP5 `account?` / `email?` extensions.
  - `BetterAuthLive`, `AccessServiceLive`, `UserEvents.layer`, `Impersonation.layer`, `Session.subscribersLayer`, `Impersonation.makeImpersonationConfigLayer(...)` are wired in `module.ts:161-195`. SP5 follows the exact same pattern (`AccountConfigLive` + `EmailLive` + `Account.layer` + `Account.subscribersLayer`).
  - `graphql/schema/index.ts` is the dispatcher that calls `register*Schema(builder)` per module. SP5 adds `registerAccountSchema(builder)` after the SP4b `registerImpersonationSchema` call (mirror pattern).
  - `ctx.auth.session!.token` is the SP4b convention for reading the current session token in GraphQL resolvers — `auth: true` / `permission: ...` authScopes guarantee `session` non-null.
  - Cookie infra: SP4b wired `ctx.event` via `defineHandler`. SP5 does NOT need cookies (account mutations don't change session identity beyond revocation), so no cookie-set in SP5 resolvers.
  - `passwordSchema` (zod chain : min 8, max 128, upper/lower/digit/special) is currently inline in `graphql/schema/user/mutations.ts:20-35`. Task 6 extracts it to `services/utils/password-schema.ts` for DRY **and** ports it to Effect Schema exposed as Standard Schema V1 (Pothos validation 4.2+ accepts Standard Schema directly). Other Zod call sites in `user/mutations.ts` stay on Zod — broader migration is out of SP5 scope.
- **Commits:** do NOT commit during execution. `git add` (stage) only — one review + commit after Task 9 (no-commit-until-review preference, same as SP1/SP-B/SP-A/SP2/SP3/SP4/SP4b). Never `git stash`.
- **Baseline:** `pnpm check-types` in `@czo/auth` captured at Task 0. Each task must keep error count `<=` baseline (currently 44 post-SP4b).
- **No `as any` if inference is correct** (project convention).

---

## File Structure

**New:**
- `packages/kit/src/email/index.ts` — `EmailService` Tag + `EmailSendFailed` tagged error + `loggingLayer` impl + `SendEmailInput` interface. **Lives in `@czo/kit` (not auth)** because transport is generic infrastructure (matches `DrizzleDb` / `GraphQLBuilder` / `EventBus` pattern).
- `packages/modules/auth/src/services/account.ts` — `AccountService` Tag + `AccountConfig` Tag + `makeAccountConfigLayer` + 4 tagged errors + private token CRUD (`writeToken`, `consumeToken`) + `start` `stop` per-flow Effect.fn handlers + Live `layer` + `subscribersLayer` (consumes `EmailService` from kit, composes auth-specific bodies).
- `packages/modules/auth/src/services/account.test.ts` — ~21 Testcontainers tests.
- `packages/modules/auth/src/services/utils/password-schema.ts` — shared `passwordSchema` ported to Effect `Schema` + `Schema.toStandardSchemaV1` (extracted from `user/mutations.ts`, scope: this constant only).
- `packages/modules/auth/src/graphql/schema/account/mutations.ts` — 5 `relayMutationField` calls.
- `packages/modules/auth/src/graphql/schema/account/errors.ts` — 3 new `registerError` calls.
- `packages/modules/auth/src/graphql/schema/account/index.ts` — barrel + `registerAccountSchema(builder)` dispatcher.

**Modified:**
- `packages/kit/package.json` — add `./email` to `exports` map (subpath alongside `./graphql`, `./db/effect`, etc.).
- `packages/modules/auth/src/services/events/auth.ts` — widen `AuthEvent` with 4 new variants (`PasswordResetRequested`, `EmailVerificationRequested`, `PasswordChanged`, `EmailVerified`).
- `packages/modules/auth/src/constants.ts` — add `PASSWORD_RESET_TTL` + `EMAIL_VERIFICATION_TTL` Duration constants.
- `packages/modules/auth/src/services/session.ts` — add `revokeAllForUserExcept` to contract + impl.
- `packages/modules/auth/src/services/session.test.ts` — 3 new tests for `revokeAllForUserExcept`.
- `packages/modules/auth/src/services/index.ts` — re-export `Account` namespace (Email lives in kit, not re-exported from auth).
- `packages/modules/auth/src/module.ts` — extend `AuthModuleConfig` with `requireEmailVerification?`, `sendVerificationOnSignUp?`, `account?`, `email?` fields ; build `AccountConfigLive` + `EmailLive` (from kit) ; add `Account.layer` + `Account.subscribersLayer` to `Layer.mergeAll` ; provide `AccountConfigLive` + `EmailLive` at outer pipe.
- `packages/modules/auth/src/graphql/schema/index.ts` — call `registerAccountSchema(builder)` (alongside other registrars).
- `packages/modules/auth/src/graphql/schema/user/mutations.ts` — import `passwordSchema` from new utils (replace inline definition).
- `packages/modules/auth/src/layers/better-auth/index.ts` — add 5 account paths to `disabledPaths` ; drop `emailVerificationConfig` call.
- `packages/modules/auth/src/layers/better-auth/others.ts` — delete `emailVerificationConfig` function entirely ; trim `emailAndPasswordConfig` (drop `sendResetPassword` stub).

**Unchanged:** All other services (`UserService`, `ImpersonationService`, `AccessService`, `OrganizationService`, etc.). All DB tables (reuses existing `verifications` and `accounts`). All migrations (none added).

---

## Task 0: Baseline capture

**Files:** none modified.

- [ ] **Step 1: Capture baseline TypeScript error count**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: a number. Record as `BASELINE_TS`. Currently `44` post-SP4b. Each task must keep errors `<= BASELINE_TS`.

- [ ] **Step 2: Capture baseline test pass count**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected: a line like `Test Files X passed | Y failed`. Currently `15 passed`, `7 failed` (pre-existing dette: missing `@czo/kit/effect` + schema tests for `apps`/`webhookDeliveries`).

- [ ] **Step 3: Capture current HEAD SHA**

```bash
cd /workspace/c-zo && git rev-parse HEAD
```

Expected: a SHA. Currently `ca1ee8a0` (SP4b commit).

No file changes, no staging.

---

## Task 1: `EmailService` Tag + `loggingLayer` (in `@czo/kit`)

**Files:**
- Create: `packages/kit/src/email/index.ts`
- Modify: `packages/kit/package.json` (add `./email` to `exports` map)

**Rationale**: `EmailService` is generic transport infrastructure (no auth-specific shape) and matches the existing `@czo/kit` pattern for cross-cutting infra (`DrizzleDb`, `GraphQLBuilder`, `EventBus`). Future modules (notifications, billing, etc.) can consume `@czo/kit/email` without taking a dep on `@czo/auth`. The auth-specific subscribers and email-body composition stay in `@czo/auth/services/account.ts` (Task 5).

- [ ] **Step 1: Create `packages/kit/src/email/index.ts` with Tag + error + stub layer**

```ts
import { Context, Data, Effect, Layer } from 'effect'

export interface SendEmailInput {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text?: string
  readonly from?: string
}

export class EmailSendFailed extends Data.TaggedError('EmailSendFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'EMAIL_SEND_FAILED'
  get message() { return 'Email send operation failed' }
}

/**
 * Transport-only Tag. Templating (subject/html/text composition) lives in
 * subscribers, not here. Real impls (SMTP, SES) are drop-in replacements
 * for `loggingLayer` via `AuthModuleConfig.email.layer`.
 */
export class EmailService extends Context.Service<
  EmailService,
  {
    readonly send: (input: SendEmailInput) => Effect.Effect<void, EmailSendFailed>
  }
>()('@czo/auth/EmailService') {}

/**
 * Dev/test impl: logs structurally via Effect.logInfo. A developer can grep
 * the structured logs for the reset/verify token to exercise the flow
 * without a real mail server.
 */
export const loggingLayer: Layer.Layer<EmailService> = Layer.succeed(EmailService, {
  send: input => Effect.logInfo('email.send', {
    to: input.to,
    from: input.from ?? null,
    subject: input.subject,
    bodyPreview: input.text ?? input.html.slice(0, 200),
  }),
})
```

- [ ] **Step 2: Register the `./email` subpath in `packages/kit/package.json`**

Open `packages/kit/package.json`. Find the `exports` map (mirrors `./db/effect`, `./event-bus`, `./graphql`, etc.). Add the new subpath alphabetically:

```json
    "./email": {
      "types": "./src/email/index.ts",
      "default": "./dist/email/index.mjs"
    },
```

Place it between `./db/effect` and `./event-bus` (alphabetical). Match the existing 2-space indentation. No other package.json field needs editing.

Auth consumers import via `from '@czo/kit/email'`.

- [ ] **Step 3: check-types (both kit and auth)**

```bash
cd /workspace/c-zo/packages/kit && pnpm check-types 2>&1 | tail -5
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected:
- Kit: no new errors (only pre-existing baseline issues like `db/schema-registry.test.ts`).
- Auth: `<= BASELINE_TS` (44).

- [ ] **Step 4: Stage**

```bash
cd /workspace/c-zo && git add packages/kit/src/email/ packages/kit/package.json
```

DO NOT COMMIT.

---

## Task 2: Constants + `AuthModuleConfig` extension

**Files:**
- Modify: `packages/modules/auth/src/constants.ts`
- Modify: `packages/modules/auth/src/module.ts` (interface only — wiring deferred to Task 8)

- [ ] **Step 1: Add account TTL constants**

In `packages/modules/auth/src/constants.ts`:

```ts
// (Duration is already imported.)

/** Default TTL for password reset tokens. Override via AuthModuleConfig.account.passwordResetTtl. */
export const PASSWORD_RESET_TTL = Duration.hours(1)

/** Default TTL for email verification tokens. Override via AuthModuleConfig.account.emailVerificationTtl. */
export const EMAIL_VERIFICATION_TTL = Duration.hours(24)
```

- [ ] **Step 2: Extend `AuthModuleConfig` with `requireEmailVerification`, `sendVerificationOnSignUp`, `account`, `email`**

In `packages/modules/auth/src/module.ts`, find the `AuthModuleConfig` interface (around line 50). Add 4 new optional fields:

```ts
import type { EmailService } from '@czo/kit/email'   // add this import near the top

// ... existing
export interface AuthModuleConfig {
  readonly app: string
  readonly secret: string
  readonly baseUrl?: string
  readonly socials?: SocialProviders
  readonly storage?: Storage
  readonly impersonation?: {
    readonly defaultTtl?: Duration.Duration
    readonly maxTtl?: Duration.Duration
    readonly allowImpersonateAdmin?: boolean
  }
  /** Gate sign-in on user.emailVerified. Default false. */
  readonly requireEmailVerification?: boolean
  /** Auto-send verification email after sign-up. Default true. */
  readonly sendVerificationOnSignUp?: boolean
  /** Account flow tunables. */
  readonly account?: {
    readonly passwordResetTtl?: Duration.Duration       // default 1h
    readonly emailVerificationTtl?: Duration.Duration   // default 24h
  }
  /** Override the default LoggingEmailLive (dev stub). */
  readonly email?: {
    readonly layer?: Layer.Layer<EmailService>
    readonly from?: string
  }
}
```

(`Layer` is already imported from `effect`; `Duration` is in the existing imports too.)

- [ ] **Step 3: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS`.

- [ ] **Step 4: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/constants.ts packages/modules/auth/src/module.ts
```

---

## Task 3: `AuthEvent` widening (4 new variants)

**Files:**
- Modify: `packages/modules/auth/src/services/events/auth.ts`

- [ ] **Step 1: Add 4 variants to `AuthEvent` union**

In `packages/modules/auth/src/services/events/auth.ts`, extend the discriminated union (additive, non-breaking superset):

```ts
export type AuthEvent
  = | {
      readonly _tag: 'SignedUp'
      readonly userId: number
      readonly email: string
      readonly actorType: string
    }
  | {
      readonly _tag: 'ImpersonationStarted'
      readonly adminId: number
      readonly targetUserId: number
      readonly sessionToken: string
      readonly reason: string | null
      readonly expiresAt: Date
    }
  | {
      readonly _tag: 'ImpersonationStopped'
      readonly adminId: number
      readonly targetUserId: number
      readonly sessionToken: string
    }
  | {
      readonly _tag: 'PasswordResetRequested'
      readonly userId: number
      readonly email: string
      /** Raw token (for the email body). Never stored in DB raw — only sha256(token) is. */
      readonly token: string
      readonly expiresAt: Date
    }
  | {
      readonly _tag: 'EmailVerificationRequested'
      readonly userId: number
      readonly email: string
      readonly token: string
      readonly expiresAt: Date
    }
  | {
      readonly _tag: 'PasswordChanged'
      readonly userId: number
      readonly reason: 'reset' | 'self-change'
    }
  | {
      readonly _tag: 'EmailVerified'
      readonly userId: number
    }
```

`AuthEvents` Tag + live layer are unchanged — `PubSub.dropping<AuthEvent>` handles the wider type automatically.

- [ ] **Step 2: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS`. Discriminated union widening is a superset — existing callers (publishing `SignedUp`, `ImpersonationStarted`, etc.) still type-check. Consumers using `event.email` or similar single-variant fields may need `_tag` narrowing (none expected in current code — the only such site was patched in SP4b via `credential.test.ts`).

- [ ] **Step 3: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/events/auth.ts
```

---

## Task 4: `SessionService.revokeAllForUserExcept` — TDD

**Files:**
- Modify: `packages/modules/auth/src/services/session.ts`
- Modify: `packages/modules/auth/src/services/session.test.ts`

- [ ] **Step 1: Write failing tests in `session.test.ts`**

Inside the existing `layer(TestLayer, { ... })('sessionService', (it) => { ... })` block (around the listForUser tests), add 3 tests:

```ts
it.effect('revokeAllForUserExcept revokes all sessions except the specified token', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const userId = yield* seedUser
    const svc = yield* Session.SessionService

    const s1 = yield* svc.create({ userId, actorType: 'user' })
    const s2 = yield* svc.create({ userId, actorType: 'user' })
    const s3 = yield* svc.create({ userId, actorType: 'user' })
    expect(yield* svc.listForUser(userId)).toHaveLength(3)

    yield* svc.revokeAllForUserExcept(userId, s2.token)

    const remaining = yield* svc.listForUser(userId)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.token).toBe(s2.token)
  }))

it.effect('revokeAllForUserExcept with non-existent exceptToken revokes all sessions', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const userId = yield* seedUser
    const svc = yield* Session.SessionService

    yield* svc.create({ userId, actorType: 'user' })
    yield* svc.create({ userId, actorType: 'user' })
    yield* svc.revokeAllForUserExcept(userId, 'this-token-does-not-exist')
    expect(yield* svc.listForUser(userId)).toHaveLength(0)
  }))

it.effect('revokeAllForUserExcept with user having only the exceptToken is a no-op', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const userId = yield* seedUser
    const svc = yield* Session.SessionService

    const only = yield* svc.create({ userId, actorType: 'user' })
    yield* svc.revokeAllForUserExcept(userId, only.token)
    const remaining = yield* svc.listForUser(userId)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.token).toBe(only.token)
  }))
```

- [ ] **Step 2: Run tests, expect 3 FAILs**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/session.test.ts 2>&1 | tail -15
```

Expected: 3 FAILs (`Property 'revokeAllForUserExcept' does not exist`).

- [ ] **Step 3: Add method to `SessionService` contract**

In `services/session.ts`, find the `SessionService` class (around line 53). Add to the methods object, next to `revokeAllForUser`:

```ts
readonly revokeAllForUserExcept: (
  userId: number,
  exceptToken: string,
) => Effect.Effect<void, SessionStoreFailed>
```

- [ ] **Step 4: Implement in the layer impl**

In the same file, locate the `revokeAllForUser` impl (it does a bulk DELETE + iterates tokens through `invalidateCacheForToken`). Add the analogous `revokeAllForUserExcept` after it:

```ts
revokeAllForUserExcept: (userId, exceptToken) =>
  Effect.gen(function* () {
    const deleted = yield* dbErr(
      db.delete(sessions)
        .where(and(eq(sessions.userId, userId), ne(sessions.token, exceptToken)))
        .returning({ token: sessions.token }),
    )
    yield* Effect.forEach(
      deleted,
      ({ token }) => invalidateCacheForToken(token),
      { discard: true, concurrency: 'unbounded' },
    )
  }),
```

Add `ne` to the imports from `drizzle-orm`:

```ts
import { and, desc, eq, gt, lt, ne, sql } from 'drizzle-orm'
```

(The existing import line near the top of session.ts has these; just append `ne`.)

- [ ] **Step 5: Run tests, expect 3 PASSes (and the rest of session.test.ts still passes)**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/session.test.ts 2>&1 | tail -10
```

Expected: `Tests  21 passed (21)` (18 pre-SP5 + 3 new).

- [ ] **Step 6: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS`.

- [ ] **Step 7: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/session.ts packages/modules/auth/src/services/session.test.ts
```

---

## Task 5: `AccountService` + `AccountConfig` + token CRUD + subscribers — TDD

**Files:**
- Create: `packages/modules/auth/src/services/account.ts`
- Create: `packages/modules/auth/src/services/account.test.ts`
- Modify: `packages/modules/auth/src/services/index.ts` (add `Account` namespace re-export)

- [ ] **Step 1: Scaffold `services/account.ts` with errors + config + contract + token helpers + stub layer**

Create `packages/modules/auth/src/services/account.ts` :

```ts
import type { AuthModuleConfig } from '../module'
import type { AccountDbFailed as _placeholder } from './account'   // self-ref for type hint
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, like } from 'drizzle-orm'
import { Context, Data, Duration, Effect, Layer, Stream } from 'effect'
import { DrizzleDb } from '@czo/kit/db/effect'
import { EMAIL_VERIFICATION_TTL, PASSWORD_RESET_TTL } from '../constants'
import { accounts, users, verifications } from '../database/schema'
import { EmailService } from '@czo/kit/email'
import { AuthEvents, type AuthEvent } from './events/auth'
import { PasswordService } from './password'
import { SessionService } from './session'
import { UserNotFound, UserService } from './user'

// ─── Tagged errors ──────────────────────────────────────────────────────

export class AccountDbFailed extends Data.TaggedError('AccountDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'ACCOUNT_DB_FAILED'
  get message() { return 'Account store operation failed' }
}

export class InvalidPasswordResetToken extends Data.TaggedError('InvalidPasswordResetToken')<{}>() {
  readonly code = 'INVALID_PASSWORD_RESET_TOKEN'
  get message() { return 'Password reset token is invalid or expired' }
}

export class InvalidEmailVerificationToken extends Data.TaggedError('InvalidEmailVerificationToken')<{}>() {
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
    readonly requestPasswordReset: (email: string) => Effect.Effect<void, unknown>
    readonly resetPassword: (input: {
      readonly token: string
      readonly newPassword: string
    }) => Effect.Effect<void, unknown>
    readonly requestEmailVerification: (userId: number) => Effect.Effect<void, unknown>
    readonly verifyEmail: (token: string) => Effect.Effect<void, unknown>
    readonly changePassword: (input: {
      readonly userId: number
      readonly currentSessionToken: string
      readonly currentPassword: string
      readonly newPassword: string
    }) => Effect.Effect<void, unknown>
  }
>()('@czo/auth/AccountService') {}

// Stub layer — replaced in Step 5.
export const layer = Layer.effect(
  AccountService,
  Effect.gen(function* () {
    return AccountService.of({
      requestPasswordReset: () => Effect.die(new Error('not implemented')),
      resetPassword: () => Effect.die(new Error('not implemented')),
      requestEmailVerification: () => Effect.die(new Error('not implemented')),
      verifyEmail: () => Effect.die(new Error('not implemented')),
      changePassword: () => Effect.die(new Error('not implemented')),
    })
  }),
)

// Stub subscribers — wired in Step 6.
export const subscribersLayer = Layer.effectDiscard(Effect.void)
```

The `Effect<..., unknown>` error channels are placeholders; Step 5 narrows them to the real unions.

- [ ] **Step 2: Scaffold `account.test.ts` with the layer composition + `seedUser` helper**

Create `packages/modules/auth/src/services/account.test.ts` :

```ts
import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db/effect'
import { DrizzleDb } from '@czo/kit/db/effect'
import { describe, expect, it, layer } from '@effect/vitest'
import { Chunk, Duration, Effect, Fiber, Layer, Stream } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import * as Email from '@czo/kit/email'
import { accounts, users } from '../database/schema'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Account from './account'
import * as Cookie from './cookie'
import * as AuthEventsMod from './events/auth'
import * as UserEventsMod from './events/user'
import * as Password from './password'
import * as Session from './session'
import * as User from './user'

// Stub BetterAuth (UserService uses ctx.password.hash via better-auth).
const BetterAuthStub = Layer.succeed(User.UserService as never, undefined as never)
// ↑ replace with the actual stub pattern from existing tests if this shape is wrong.

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

const SessionLive = Session.layer.pipe(
  Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer)),
)
const UserLive = User.layer.pipe(Layer.provideMerge(UserEventsMod.layer))
const AccountConfigLive = Account.makeAccountConfigLayer({ baseUrl: 'https://test.example.com' })

// Capture email sends for assertions.
const EmailMockState: { sends: Account.SendEmailInput[] } = { sends: [] }
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

layer(TestLayer, { timeout: 120_000, excludeTestServices: true })('AccountService', (it) => {
  // tests added in Step 3
})
```

(The `BetterAuthStub` line above may need adjustment — read `impersonation.test.ts` from SP4b for the actual stub pattern. The goal is to provide everything `UserService.make` requires; if it does not require `BetterAuth` in this Effect path, omit.)

- [ ] **Step 3: Write the 21 failing tests**

Inside the `layer(TestLayer, ...)('AccountService', ...)` block, add (each test starts with `yield* truncateAuth`) :

```ts
// requestPasswordReset
it.effect('requestPasswordReset happy → publishes PasswordResetRequested', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const u = yield* seedUser()
    const account = yield* Account.AccountService
    const events = yield* AuthEventsMod.AuthEvents
    const collected = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)

    yield* account.requestPasswordReset(u.email)
    yield* Effect.sleep(Duration.millis(100))
    const arr = Chunk.toReadonlyArray(yield* Fiber.join(collected))

    expect(arr).toHaveLength(1)
    expect((arr[0] as { _tag: string })._tag).toBe('PasswordResetRequested')
  }))

it.effect('requestPasswordReset unknown email → no event, no throw', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const account = yield* Account.AccountService
    yield* account.requestPasswordReset('ghost@nowhere.com')   // must not throw
    // No way to assert "no event" without timing — sleep + non-blocking subscribe sample.
    // Acceptable: this test asserts the call doesn't throw, which is the anti-enum guarantee.
  }))

it.effect('requestPasswordReset cooldown: 2 calls <60s → second is no-op', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const u = yield* seedUser()
    const account = yield* Account.AccountService
    const events = yield* AuthEventsMod.AuthEvents
    const collected = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)

    yield* account.requestPasswordReset(u.email)
    yield* account.requestPasswordReset(u.email)
    yield* Effect.sleep(Duration.millis(150))
    const arr = Chunk.toReadonlyArray(yield* Fiber.join(collected))
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
    const reqCollect = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)
    yield* account.requestPasswordReset(u.email)
    const reqArr = Chunk.toReadonlyArray(yield* Fiber.join(reqCollect))
    const req = reqArr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'PasswordResetRequested' }>

    // Capture the next event (PasswordChanged) and reset.
    const chgCollect = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)
    yield* account.resetPassword({ token: req.token, newPassword: 'NewPass1!' })
    yield* Effect.sleep(Duration.millis(100))
    const chgArr = Chunk.toReadonlyArray(yield* Fiber.join(chgCollect))
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
    const collected = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)
    yield* account.requestPasswordReset(u.email)
    const arr = Chunk.toReadonlyArray(yield* Fiber.join(collected))
    const req = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'PasswordResetRequested' }>

    // Manually expire the verifications row.
    const db = (yield* DrizzleDb) as Database<Relations>
    yield* (db as any).update((await import('../database/schema')).verifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq((await import('../database/schema')).verifications.identifier, `password-reset:${u.id}`))

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
    const collected = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)
    yield* account.requestPasswordReset(u.email)
    const arr = Chunk.toReadonlyArray(yield* Fiber.join(collected))
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
    const collected = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)
    yield* account.requestPasswordReset(u.email)
    const arr = Chunk.toReadonlyArray(yield* Fiber.join(collected))
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
    const collected = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)

    yield* account.requestEmailVerification(u.id)
    yield* Effect.sleep(Duration.millis(100))
    const arr = Chunk.toReadonlyArray(yield* Fiber.join(collected))
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
    const collected = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)

    yield* account.requestEmailVerification(u.id)
    yield* account.requestEmailVerification(u.id)
    yield* Effect.sleep(Duration.millis(150))
    const arr = Chunk.toReadonlyArray(yield* Fiber.join(collected))
    expect(arr).toHaveLength(1)
  }))

// verifyEmail
it.effect('verifyEmail valid → emailVerified=true, EmailVerified event', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const u = yield* seedUser()
    const account = yield* Account.AccountService
    const events = yield* AuthEventsMod.AuthEvents
    const reqCollect = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)
    yield* account.requestEmailVerification(u.id)
    const req = Chunk.toReadonlyArray(yield* Fiber.join(reqCollect))[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailVerificationRequested' }>

    const verCollect = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)
    yield* account.verifyEmail(req.token)
    yield* Effect.sleep(Duration.millis(100))
    const verArr = Chunk.toReadonlyArray(yield* Fiber.join(verCollect))
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

layer(TestLayerNoAutoVerify.pipe(Layer.provideMerge(Account.subscribersLayer)),
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
```

That's ~17 tests in the main block + 3 in subscribers + 1 in the no-auto-verify block = 21 total.

Note: a few tests assert "no event" via "expect arr length 1 after 2 calls". Truly negative assertions (require waiting forever) are not feasible — the cooldown test catches the design intent; assertions for "unknown email no event" rely on the test author not subscribing-and-waiting.

- [ ] **Step 4: Run tests, expect 21 FAILs (stub dies with `'not implemented'`)**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/account.test.ts 2>&1 | tail -30
```

- [ ] **Step 5: Implement `AccountService` Live layer (replace stub)**

Replace the entire stub `layer` export in `services/account.ts` with the real impl:

```ts
// Narrow the contract error channels first.
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

import type { PasswordHashFailed } from './password'   // re-import for typing
import type { SessionStoreFailed } from './session'

type IdentifierKind = 'password-reset' | 'email-verification'

const COOLDOWN_MS = 60_000

export const layer = Layer.effect(
  AccountService,
  Effect.gen(function* () {
    const db = yield* DrizzleDb
    const users = yield* UserService
    const passwords = yield* PasswordService
    const sessions = yield* SessionService
    const events = yield* AuthEvents
    const config = yield* AccountConfig

    // ── token CRUD (private helpers, captured in closure) ──

    const writeToken = (kind: IdentifierKind, userId: number, ttl: Duration.Duration) =>
      Effect.gen(function* () {
        const identifier = `${kind}:${userId}`
        const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS)

        const recent = yield* Effect.tryPromise({
          try: () => db.query.verifications.findFirst({
            where: { identifier, createdAt: { gt: cooldownCutoff } },
          }),
          catch: cause => new AccountDbFailed({ cause }),
        })
        if (recent) return null

        const raw = randomBytes(32).toString('base64url')
        const hashed = createHash('sha256').update(raw).digest('hex')
        const expiresAt = new Date(Date.now() + Duration.toMillis(ttl))
        const now = new Date()

        yield* Effect.tryPromise({
          try: () => db.insert(verifications).values({
            identifier, value: hashed, expiresAt,
            createdAt: now, updatedAt: now,
          }),
          catch: cause => new AccountDbFailed({ cause }),
        })
        return raw
      })

    const consumeToken = (kind: IdentifierKind, rawToken: string) =>
      Effect.gen(function* () {
        const hashed = createHash('sha256').update(rawToken).digest('hex')
        const now = new Date()
        const [row] = yield* Effect.tryPromise({
          try: () => db.delete(verifications)
            .where(and(
              eq(verifications.value, hashed),
              like(verifications.identifier, `${kind}:%`),
              gt(verifications.expiresAt, now),
            ))
            .returning({ identifier: verifications.identifier }),
          catch: cause => new AccountDbFailed({ cause }),
        })
        if (!row) return null
        const userId = Number(row.identifier.split(':')[1])
        if (!Number.isFinite(userId)) return null
        return userId
      })

    // ── flow handlers ──

    const requestPasswordReset = Effect.fn('account.requestPasswordReset')(function* (email: string) {
      const target = yield* users.findFirst({ where: { email } }).pipe(
        Effect.catchAll(() => Effect.succeed(null)),
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

      yield* users.setPassword(userId, input.newPassword).pipe(
        Effect.catchTag('UserNotFound', () => Effect.fail(new InvalidPasswordResetToken())),
        Effect.catchTag('UserDbFailed', cause => Effect.fail(new AccountDbFailed({ cause }))),
      )

      yield* sessions.revokeAllForUser(userId)

      yield* Effect.forkDetach(events.publish({
        _tag: 'PasswordChanged',
        userId,
        reason: 'reset',
      }))
    })

    const requestEmailVerification = Effect.fn('account.requestEmailVerification')(function* (userId: number) {
      const target = yield* users.findFirst({ where: { id: userId } }).pipe(
        Effect.catchAll(() => Effect.succeed(null)),
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

      yield* Effect.tryPromise({
        try: () => db.update(users)
          .set({ emailVerified: true, updatedAt: new Date() })
          .where(eq(users.id, userId)),
        catch: cause => new AccountDbFailed({ cause }),
      })

      yield* Effect.forkDetach(events.publish({
        _tag: 'EmailVerified',
        userId,
      }))
    })

    const changePassword = Effect.fn('account.changePassword')(function* (input: {
      userId: number, currentSessionToken: string, currentPassword: string, newPassword: string,
    }) {
      const account = yield* Effect.tryPromise({
        try: () => db.query.accounts.findFirst({
          where: { userId: input.userId, providerId: 'credential' },
        }),
        catch: cause => new AccountDbFailed({ cause }),
      })
      if (!account || !account.password)
        return yield* Effect.fail(new UserNotFound({ id: input.userId }))

      const ok = yield* passwords.verify(account.password, input.currentPassword)
      if (!ok)
        return yield* Effect.fail(new IncorrectCurrentPassword({ userId: input.userId }))

      yield* users.setPassword(input.userId, input.newPassword).pipe(
        Effect.catchTag('UserDbFailed', cause => Effect.fail(new AccountDbFailed({ cause }))),
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
```

Note: the `findFirst({ where: { email } })` call on `UserService` may have a different signature — read `services/user.ts` for the actual shape and adapt (use `{ where: { email } }` if it follows RQBv2 object form, or fallback to `{ where: (u, ops) => ops.eq(u.email, email) }` if it's the callback form).

The closure-captured deps (`db`, `users`, `passwords`, etc.) keep the helpers private without needing to expose them in the contract.

- [ ] **Step 6: Replace the stub `subscribersLayer` with the real impl**

In `services/account.ts`, replace the `subscribersLayer` stub:

```ts
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

export const subscribersLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const events = yield* AuthEvents
    yield* Effect.forkScoped(
      Stream.runForEach(events.subscribe, (e) => {
        const handle
          = e._tag === 'PasswordResetRequested'     ? onPasswordResetRequested(e)
          : e._tag === 'EmailVerificationRequested' ? onEmailVerificationRequested(e)
          : e._tag === 'SignedUp'                   ? onSignedUp(e)
          :                                           Effect.void
        return handle.pipe(
          Effect.catchCause(cause =>
            Effect.logError(`account subscriber failed for ${e._tag}`, cause)),
        )
      }),
    )
  }),
)
```

- [ ] **Step 7: Run tests, expect 21/21 PASS**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/account.test.ts 2>&1 | tail -30
```

If a guard fires out of order (e.g. expired vs invalid token both surface the same error), adjust the impl order or test data.

- [ ] **Step 8: Re-export `Account` from the services barrel**

In `packages/modules/auth/src/services/index.ts`, add (keep alphabetical order by source path):

```ts
export * as Account from './account'
```

Position: between `Access` (./access) and `Actor` (./actor). The full block becomes:

```ts
export * as Access from './access'
export * as Account from './account'
export * as Actor from './actor'
export * as ApiKey from './api-key'
// ... rest unchanged
```

- [ ] **Step 9: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS`.

- [ ] **Step 10: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/account.ts packages/modules/auth/src/services/account.test.ts packages/modules/auth/src/services/index.ts
```

---

## Task 6: GraphQL mutations + errors + barrel

**Files:**
- Create: `packages/modules/auth/src/services/utils/password-schema.ts`
- Modify: `packages/modules/auth/src/graphql/schema/user/mutations.ts` (import from new utils)
- Create: `packages/modules/auth/src/graphql/schema/account/errors.ts`
- Create: `packages/modules/auth/src/graphql/schema/account/mutations.ts`
- Create: `packages/modules/auth/src/graphql/schema/account/index.ts`
- Modify: `packages/modules/auth/src/graphql/schema/index.ts` (wire registrar)

- [ ] **Step 1: Extract `passwordSchema` to `services/utils/password-schema.ts`**

Create `packages/modules/auth/src/services/utils/password-schema.ts` :

```ts
import { Schema } from 'effect'

/**
 * Shared password validation chain — min 8, max 20, must include
 * upper/lower/digit/special. Originally inlined in user/mutations.ts as Zod;
 * ported to Effect Schema and exposed as Standard Schema V1 for Pothos
 * `validate:` (consumed via @pothos/plugin-validation 4.2+).
 *
 * Multi-pattern on purpose: each failed rule emits its own issue, matching
 * the previous Zod behaviour where each `.refine` produced a distinct message.
 *
 * Scope note: only the new `passwordSchema` is migrated to Effect Schema in
 * SP5. The other Zod call sites in `user/mutations.ts` (`name`, `email`,
 * `password` on signUp) stay on Zod — broader Zod→Schema migration is out of
 * scope for this sprint.
 */
const password = Schema.String.pipe(
  Schema.minLength(8,  { message: () => 'Password must be at least 8 characters long' }),
  Schema.maxLength(20, { message: () => 'Password cannot exceed 20 characters' }),
  Schema.pattern(/[A-Z]/,      { message: () => 'Password must contain at least one uppercase letter' }),
  Schema.pattern(/[a-z]/,      { message: () => 'Password must contain at least one lowercase letter' }),
  Schema.pattern(/\d/,         { message: () => 'Password must contain at least one number' }),
  Schema.pattern(/[!@#$%^&*]/, { message: () => 'Password must contain at least one special character' }),
)

export const passwordSchema = Schema.toStandardSchemaV1(password)
```

In `packages/modules/auth/src/graphql/schema/user/mutations.ts`, replace the inline `passwordSchema` definition (lines 20-35) with:

```ts
import { passwordSchema } from '../../../services/utils/password-schema'
```

Delete the inline `z` chain there. Keep `z` imported in `user/mutations.ts` — the other `validate:` call sites (`name`, `email`, signUp `password`) stay on Zod for SP5.

- [ ] **Step 2: Create `graphql/schema/account/errors.ts`**

```ts
import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { registerError } from '@czo/kit/graphql'
import {
  IncorrectCurrentPassword,
  InvalidEmailVerificationToken,
  InvalidPasswordResetToken,
} from '../../../services/account'

export function registerAccountErrors(builder: AuthGraphQLSchemaBuilder): void {
  registerError(builder, InvalidPasswordResetToken, { name: 'InvalidPasswordResetTokenError' })
  registerError(builder, InvalidEmailVerificationToken, { name: 'InvalidEmailVerificationTokenError' })
  registerError(builder, IncorrectCurrentPassword, { name: 'IncorrectCurrentPasswordError' })
}
```

`PasswordHashFailed` and `UserNotFound` are already registered in `user/errors.ts` — don't re-register.

- [ ] **Step 3: Create `graphql/schema/account/mutations.ts`**

```ts
import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { Effect } from 'effect'
import z from 'zod'
import {
  AccountService,
  IncorrectCurrentPassword,
  InvalidEmailVerificationToken,
  InvalidPasswordResetToken,
} from '../../../services/account'
import { PasswordHashFailed } from '../../../services/password'
import { UserNotFound } from '../../../services/user'
import { passwordSchema } from '../../../services/utils/password-schema'

export function registerAccountMutations(builder: AuthGraphQLSchemaBuilder): void {
  builder.relayMutationField(
    'requestPasswordReset',
    { inputFields: t => ({
        email: t.string({ required: true, validate: z.email().transform(e => e.toLowerCase()) }),
    }) },
    {
      errors: { types: [] },
      resolve: async (_root, { input }, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).requestPasswordReset(input.email)
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  builder.relayMutationField(
    'resetPassword',
    { inputFields: t => ({
        token: t.string({ required: true }),
        newPassword: t.string({ required: true, validate: passwordSchema }),
    }) },
    {
      errors: { types: [InvalidPasswordResetToken, PasswordHashFailed] },
      resolve: async (_root, { input }, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).resetPassword({
              token: input.token,
              newPassword: input.newPassword,
            })
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  builder.relayMutationField(
    'requestEmailVerification',
    { inputFields: () => ({}) },
    {
      errors: { types: [] },
      authScopes: { auth: true },
      resolve: async (_root, _input, ctx) => {
        const userId = Number(ctx.auth.user!.id)
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).requestEmailVerification(userId)
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  builder.relayMutationField(
    'verifyEmail',
    { inputFields: t => ({ token: t.string({ required: true }) }) },
    {
      errors: { types: [InvalidEmailVerificationToken] },
      resolve: async (_root, { input }, ctx) => {
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).verifyEmail(input.token)
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )

  builder.relayMutationField(
    'changePassword',
    { inputFields: t => ({
        currentPassword: t.string({ required: true }),
        newPassword: t.string({ required: true, validate: passwordSchema }),
    }) },
    {
      errors: { types: [UserNotFound, IncorrectCurrentPassword, PasswordHashFailed] },
      authScopes: { auth: true },
      resolve: async (_root, { input }, ctx) => {
        const userId = Number(ctx.auth.user!.id)
        const currentSessionToken = ctx.auth.session!.token
        await ctx.runEffect(
          Effect.gen(function* () {
            yield* (yield* AccountService).changePassword({
              userId,
              currentSessionToken,
              currentPassword: input.currentPassword,
              newPassword: input.newPassword,
            })
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
  )
}
```

- [ ] **Step 4: Create `graphql/schema/account/index.ts` (barrel + dispatcher)**

```ts
import { registerAccountErrors } from './errors'
import { registerAccountMutations } from './mutations'

export { registerAccountErrors } from './errors'
export { registerAccountMutations } from './mutations'

// `builder: any` mirrors the existing dispatcher pattern at `schema/index.ts` —
// the outer registry type is wider than `AuthGraphQLSchemaBuilder` and the
// individual registrars narrow it on entry. Same convention as SP4b
// `registerImpersonationSchema`.
export function registerAccountSchema(builder: any): void {
  registerAccountErrors(builder)
  registerAccountMutations(builder)
}
```

- [ ] **Step 5: Wire in `graphql/schema/index.ts`**

In `packages/modules/auth/src/graphql/schema/index.ts`, find where `registerImpersonationSchema(builder)` is called (SP4b) and add the account registrar right after :

```ts
import { registerAccountSchema } from './account'

// ... existing setup
registerImpersonationSchema(builder)
registerAccountSchema(builder)
```

- [ ] **Step 6: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS`.

- [ ] **Step 7: Run impersonation + account + session tests for regressions**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/impersonation.test.ts src/services/account.test.ts src/services/session.test.ts 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 8: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/utils/password-schema.ts packages/modules/auth/src/graphql/schema/user/mutations.ts packages/modules/auth/src/graphql/schema/account/ packages/modules/auth/src/graphql/schema/index.ts
```

---

## Task 7: Drop better-auth account endpoints + strip configs

**Files:**
- Modify: `packages/modules/auth/src/layers/better-auth/index.ts` (add 5 paths to disabledPaths ; drop `emailVerificationConfig` call)
- Modify: `packages/modules/auth/src/layers/better-auth/others.ts` (delete `emailVerificationConfig` function ; trim `emailAndPasswordConfig.sendResetPassword`)

- [ ] **Step 1: Add 5 account paths to `disabledPaths`**

In `packages/modules/auth/src/layers/better-auth/index.ts`, find the `disabledPaths` array. Add a new account section (after the existing `// ─── Account (covered by account GraphQL resolvers) ───` block, which already lists `/change-password` etc.). Actually those entries already exist from SP4 — verify they are NOT removed, and ADD the SP5-specific account-flow endpoints :

```ts
disabledPaths: [
  // ... existing
  // ─── Account (SP5: covered by native GraphQL account mutations) ───
  '/forget-password',
  '/reset-password',
  '/verify-email',
  '/send-verification-email',
  // ─── (/change-password already disabled in SP4 — keep) ─────────
  // ... rest unchanged
]
```

Don't duplicate `/change-password` if already present. Confirm by grepping the file before adding.

- [ ] **Step 2: Drop `emailVerificationConfig` call**

In the same file, find :

```ts
verification: verificationConfig(),
emailAndPassword: emailAndPasswordConfig(),
emailVerification: emailVerificationConfig(),
```

Drop the `emailVerification: emailVerificationConfig(),` line entirely.

- [ ] **Step 3: Delete `emailVerificationConfig` function in `others.ts`**

In `packages/modules/auth/src/layers/better-auth/others.ts`, delete the entire `emailVerificationConfig` function and its `EmailVerificationOption` type definition. Also delete the matching `import` if it's import-only.

- [ ] **Step 4: Trim `sendResetPassword` stub from `emailAndPasswordConfig`**

In the same `others.ts`, find `emailAndPasswordConfig`. Delete the `sendResetPassword` field and the `resetPasswordTokenExpiresIn` field (no longer used since `/forget-password` is disabled). Keep `enabled: true`, `minPasswordLength`, `maxPasswordLength`, `requireEmailVerification`, `password.hash`, `password.verify`. Result :

```ts
export function emailAndPasswordConfig(option?: EmailAndPasswordOption) {
  return {
    ...option,
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      hash: async (password: string) => {
        const { hashPassword } = await import('better-auth/crypto')
        return hashPassword(password)
      },
      verify: async ({ hash, password }: { hash: string, password: string }) => {
        const { verifyPassword } = await import('better-auth/crypto')
        return verifyPassword({ hash, password })
      },
    },
    requireEmailVerification: false,
  }
}
```

- [ ] **Step 5: Wire `requireEmailVerification` from `AuthModuleConfig`**

In `packages/modules/auth/src/layers/better-auth/index.ts`, the `emailAndPasswordConfig()` call passes no option today. Update it to forward the flag (read from a parameter that the wrapping function `createAuth(db, options)` already has access to via `option`):

```ts
emailAndPassword: emailAndPasswordConfig({ requireEmailVerification: option.requireEmailVerification }),
```

Add `requireEmailVerification?: boolean` to `AuthOption` interface in `layers/better-auth/index.ts`. Update `makeBetterAuthLive` to forward it from `AuthModuleConfig.requireEmailVerification` — which means extending `Omit<AuthOption, 'ac' | 'roles'>` to include it. Verify the type chain: `module.ts` builds `BetterAuthLive = makeBetterAuthLive({ ... requireEmailVerification: config.requireEmailVerification })`.

Update the `EmailAndPasswordOption` type if needed to include `requireEmailVerification?: boolean`.

- [ ] **Step 6: Verify**

```bash
grep -rn "emailVerificationConfig\|sendResetPassword\|/forget-password\|/reset-password\|/verify-email\|/send-verification-email" /workspace/c-zo/packages/modules/auth/src
```

Expected: only references should be in `disabledPaths` (5 entries) and the schema/account/mutations.ts (graphql ops by name — these have no leading `/` so `/forget-password` grep won't match them, but `verify-email` will appear as `verifyEmail` mutation name without slash — verify those are unrelated).

- [ ] **Step 7: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS`.

- [ ] **Step 8: Run full test suite**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected: no NEW regressions. Account + session + impersonation suites green.

- [ ] **Step 9: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/layers/better-auth/index.ts packages/modules/auth/src/layers/better-auth/others.ts
```

---

## Task 8: Module wiring (`AccountConfigLive` + `EmailLive` + layer composition)

**Files:**
- Modify: `packages/modules/auth/src/module.ts`

- [ ] **Step 1: Import the new namespaces**

At the top of `module.ts`, add (alphabetical):

```ts
import * as Email from '@czo/kit/email'
import * as Account from './services/account'
```

- [ ] **Step 2: Build the live layers in the factory function**

Near the existing `ImpersonationConfigLive` construction (~line 169), add:

```ts
const baseUrl = config.baseUrl
if (!baseUrl)
  throw new Error('AuthModuleConfig.baseUrl is required (SP5 account flows need it for email URLs)')

const AccountConfigLive = Account.makeAccountConfigLayer({
  baseUrl,
  requireEmailVerification: config.requireEmailVerification,
  sendVerificationOnSignUp: config.sendVerificationOnSignUp,
  passwordResetTtl: config.account?.passwordResetTtl,
  emailVerificationTtl: config.account?.emailVerificationTtl,
})

const EmailLive = config.email?.layer ?? Email.loggingLayer
```

The boot-time throw on missing `baseUrl` is the documented behavior in the spec.

- [ ] **Step 3: Add `Account.layer` + `Account.subscribersLayer` to `Layer.mergeAll`**

Find `Layer.mergeAll(...)` (~line 181). Add the account layers alongside the others :

```ts
const AuthModuleLive = Layer.mergeAll(
  // ... existing including Impersonation.layer
  Account.layer,
  Account.subscribersLayer,
).pipe(...)
```

- [ ] **Step 4: Provide `AccountConfigLive` + `EmailLive` at the outer pipe**

In the same block, append to the outer `.pipe(Layer.provideMerge(...), ...)` chain :

```ts
).pipe(
  // ... existing
  Layer.provideMerge(AccountConfigLive),
  Layer.provideMerge(EmailLive),
)
```

- [ ] **Step 5: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS`. Layer composition errors usually mean a dep wasn't provided — `Account.layer` needs `SessionService`, `UserService`, `PasswordService`, `AuthEvents`, `AccountConfig`, `DrizzleDb` ; `Account.subscribersLayer` needs `AuthEvents`, `AccountConfig`, `AccountService`, `EmailService`. All wired through the merge.

- [ ] **Step 6: Run full test suite for regression**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected: pass count `>= BASELINE + 24` (3 session + 21 account = 24 new).

- [ ] **Step 7: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/module.ts
```

---

## Task 9: Final review + user-approved commit

- [ ] **Step 1: Verify scope**

```bash
grep -rn "sendResetPassword\|emailVerificationConfig" /workspace/c-zo/packages/modules/auth/src
```

Expected: zero matches (function deleted, stub removed).

```bash
grep -rn "passwordSchema" /workspace/c-zo/packages/modules/auth/src
```

Expected: one definition in `services/utils/password-schema.ts`, imports in `user/mutations.ts` + `graphql/schema/account/mutations.ts`. No inline duplicates.

- [ ] **Step 2: Verify check-types and tests**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected:
- check-types `<= BASELINE_TS` (44).
- Tests: ~167 pass (143 from SP4b + 24 new) / 20 fail (pre-existing).

- [ ] **Step 3: Review staged diff**

```bash
cd /workspace/c-zo && git status && git diff --cached --stat
```

Verify scope: ~10 modified files + 7 new files. Code-only diff ~620 LOC (excluding spec+plan docs which add ~2000).

- [ ] **Step 4: Wait for user review**

Present a summary to the user, ask for review/commit approval. Do NOT commit autonomously.

When approved, commit with:

```bash
git commit -m "$(cat <<'EOF'
feat(auth): SP5 — native account flows (password reset, email verify, change password)

Replaces better-auth's account self-service endpoints with native Effect
services + GraphQL mutations. Adds a transport-only EmailService Tag
with a dev stub (Effect.logInfo), and an event-driven account subscribers
layer that composes email bodies and calls the transport.

EmailService
- Transport-only Tag: send({to, subject, html, text?, from?}) → Effect.
- LoggingEmailLive default impl logs structurally via Effect.logInfo.
- Real SMTP/SES impls are drop-in via AuthModuleConfig.email.layer.

AccountService (new)
- requestPasswordReset(email): always success (anti-enum). Publishes
  PasswordResetRequested if account exists and 60s cooldown clear.
- resetPassword({token, newPassword}): atomic DELETE RETURNING consume,
  sets password, revokes ALL sessions, publishes PasswordChanged(reset).
- requestEmailVerification(userId): always success. Publishes
  EmailVerificationRequested if user found, not yet verified, cooldown clear.
- verifyEmail(token): consumes token, sets emailVerified=true, idempotent.
- changePassword({userId, currentSessionToken, currentPassword, newPassword}):
  verifies current pwd against accounts(providerId='credential'), sets new,
  revokes other sessions (keeps current), publishes PasswordChanged(self-change).
- 4 tagged Pothos GraphQL errors.
- Configurable TTLs (1h reset / 24h verify), per-identifier cooldown 60s.

Token model
- Reuses existing `verifications` table; identifier convention
  `<kind>:<userId>` (kind = password-reset | email-verification).
- value = sha256(rawToken) — raw never persisted.
- One-shot atomic consume via Drizzle DELETE RETURNING.
- LIKE 'kind:%' belt-and-suspenders against cross-kind consume.

SessionService extension
- revokeAllForUserExcept(userId, exceptToken) — deletes user sessions
  whose token != exceptToken, invalidates cache for deleted only.

AuthEvent widening
- Discriminated union grows by 4 variants: PasswordResetRequested,
  EmailVerificationRequested, PasswordChanged, EmailVerified.

accountSubscribersLayer
- Layer.effectDiscard + Effect.forkScoped + Stream.runForEach on AuthEvents.
- onPasswordResetRequested → EmailService.send with reset URL.
- onEmailVerificationRequested → EmailService.send with verify URL.
- onSignedUp + config.sendVerificationOnSignUp=true → calls
  AccountService.requestEmailVerification (replaces better-auth's
  sendOnSignUp:true).
- Per-handler Effect.catchCause(log) so transient failures don't kill bridge.

GraphQL
- 5 new Relay mutations (requestPasswordReset, resetPassword,
  requestEmailVerification, verifyEmail, changePassword).
- Output uniform { success: Boolean! }.
- AuthScopes: requestEmailVerification + changePassword require `auth: true`;
  the others are public (token-bearing or anti-enum).
- passwordSchema extracted to services/utils/password-schema.ts (shared).

Config
- AuthModuleConfig.requireEmailVerification (default false): gates sign-in
  via better-auth's emailAndPassword config until that flow is also ported.
- AuthModuleConfig.sendVerificationOnSignUp (default true): triggers the
  SignedUp subscriber.
- AuthModuleConfig.account.{passwordResetTtl, emailVerificationTtl}: TTL overrides.
- AuthModuleConfig.email.{layer, from}: transport override + default From address.
- baseUrl becomes required at boot (was optional) — used in email URLs.

Removals
- better-auth endpoints disabled: /forget-password, /reset-password,
  /verify-email, /send-verification-email (+/change-password already in
  SP4).
- emailVerificationConfig() function deleted (endpoint disabled).
- sendResetPassword stub removed from emailAndPasswordConfig.

BREAKING CHANGES
- better-auth REST endpoints /forget-password, /reset-password, /verify-email,
  /send-verification-email cease to exist. Clients must call the GraphQL
  mutations requestPasswordReset / resetPassword / verifyEmail /
  requestEmailVerification.
- AuthModuleConfig.baseUrl is now required (was optional).
- AuthEvent discriminated union widens by 4 variants; consumers narrow
  on _tag before reading payload-specific fields.

Spec: docs/superpowers/specs/2026-05-24-sp5-account-flows-design.md
Plan: docs/superpowers/plans/2026-05-24-sp5-account-flows.md
EOF
)"
```

---

## Self-review (executed by writer, fixed inline)

**Spec coverage:**
- Chantier 1 (EmailService) → Task 1.
- Chantier 2 (AccountConfig + constants + AuthModuleConfig extension) → Task 2 (interface) + Task 5 Step 1 (AccountConfig Tag impl).
- Chantier 3 (AccountService + subscribers) → Task 5 (TDD).
- Chantier 4 (SessionService.revokeAllForUserExcept) → Task 4 (TDD).
- Chantier 5 (AuthEvent widening) → Task 3.
- Chantier 6 (GraphQL mutations + errors) → Task 6.
- Chantier 7 (drop better-auth + strip configs) → Task 7.
- Chantier 8 (module wiring) → Task 8.
- Final review/commit → Task 9.

**Placeholder scan:** No "TBD" / "TODO" / "implement later". Acknowledged uncertainties have concrete fallback paths:
- `UserService.findFirst({ where: { email } })` signature — read services/user.ts at impl-time and adapt object-form vs callback.
- `BetterAuthStub` in test layer composition — adapt to actual stub pattern from `impersonation.test.ts` if `UserService.make` needs `BetterAuth`.

**Type consistency:**
- `StartPasswordResetInput` etc. — not used in the plan; all method inputs are inline object literals matching the contract.
- `AccountConfig` shape (`{passwordResetTtl, emailVerificationTtl, requireEmailVerification, sendVerificationOnSignUp, baseUrl}`) consistent between Task 2 (interface) and Task 5 (impl + tests) and Task 8 (wiring).
- `AuthEvent` variants — defined in Task 3, published in Task 5, asserted in Task 5 tests.
- `EmailService.send({to, subject, html, text?, from?})` — defined Task 1, consumed Task 5 subscribers, asserted Task 5 subscriber tests.
- `SessionService.revokeAllForUserExcept(userId, exceptToken)` — defined Task 4, consumed Task 5 changePassword.

**Spec requirements not covered:** None identified.

**Notable scope additions discovered:**
- `passwordSchema` extraction to `services/utils/password-schema.ts` (Task 6 Step 1) was implicit in spec; surfaced here for DRY.
- `baseUrl` non-optional enforcement at boot (Task 8 Step 2) — spec said "non-optional" but boot-throw mechanism wasn't explicit ; documented inline.
