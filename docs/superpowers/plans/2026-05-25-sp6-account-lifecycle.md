# SP6 — Account lifecycle (change-email + delete/restore-account) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the last 2 better-auth account self-service endpoints (`/change-email`, `/delete-user`) with native Effect services + GraphQL mutations + grace-period restore flow. Adds `users.deletedAt`, 4 `AccountService` methods, 4 GraphQL mutations, 4 `AuthEvent` variants, 3 new subscribers.

**Architecture:** Reuses SP5's `verifications` token model (sha256, `LIKE 'kind:%'`, atomic `DELETE RETURNING`). Two new token kinds: `change-email` (identifier encodes `userId` + `base64url(newEmail)`) and `account-restore` (identifier is `account-restore:{userId}`, TTL = grace period). `writeToken`/`consumeToken` helpers gain an optional `identifierOverride` and return `{ userId, identifier }`. New subscribers compose URLs from `AccountConfig.baseUrl`. Soft-delete sets `users.deletedAt = now`; the existing full `UNIQUE` constraint on `users.email` is kept (sign-up during grace returns `EmailAlreadyExists`; post-anonymization the deleted email becomes `'deleted-{id}@deleted.local'`, per-id unique).

**Tech Stack:** `effect@4.0.0-beta.70` (`Effect.fn`, `Effect.fnUntraced`, `Layer.effectDiscard`, `Stream.runForEach`), `drizzle-orm@1.0.0-rc.3` (RQBv2 + core builder `db.update/delete().where(and(eq, like, gt)).returning(...)`), Pothos (`@pothos/plugin-relay`, `@pothos/plugin-scope-auth`, `@pothos/plugin-errors`, `@pothos/plugin-validation`), `node:crypto` (`randomBytes`, `createHash`), `@effect/vitest` + Testcontainers Postgres via `AuthPostgresLayer`.

**Source spec:** `docs/superpowers/specs/2026-05-25-sp6-account-lifecycle-design.md`

---

## Conventions for every task

- **TDD** for Task 5 (`AccountService` methods, ~16 service tests) and Task 6 (subscribers, 3 tests). Other tasks are foundation / wiring / drop — `pnpm check-types` is the gate.
- **Test style — SP5 runnable pattern.** Integration tests use `@effect/vitest` (`describe` / `it.layer` / `it.effect` / `expect`) + `AuthPostgresLayer` + `truncateAuth` from `src/testing/postgres.ts`. Testcontainers spins its own Postgres per scope — NO `TEST_DATABASE_URL`. Pure unit tests use plain `vitest`. Do NOT import `@czo/kit/effect` (deleted in SP-C). Assert Effect failures with `Effect.flip` then `_tag` check or `instanceof`.
- **Real names — verified against current code, use these exactly:**
  - `AccountService` at `packages/modules/auth/src/services/account.ts`. SP5 contract has 5 methods: `requestPasswordReset`, `resetPassword`, `requestEmailVerification`, `verifyEmail`, `changePassword`. Task 5 extends with 4 more.
  - `AccountConfig` at the same file (Tag id `'@czo/auth/AccountConfig'`). SP5 fields: `passwordResetTtl`, `emailVerificationTtl`, `requireEmailVerification`, `sendVerificationOnSignUp`, `baseUrl`. Task 2 extends with `changeEmailTtl`, `gracePeriod`, `sendOldEmailNotificationOnChange`.
  - `AuthEvents` Tag at `packages/modules/auth/src/services/events/auth.ts:31`. `type AuthEvent` post-SP5 has 7 variants: `SignedUp | ImpersonationStarted | ImpersonationStopped | PasswordResetRequested | EmailVerificationRequested | PasswordChanged | EmailVerified`. Task 3 widens by 4.
  - `SessionService` post-SP5 contract methods: `create`, `resolve`, `revoke`, `revokeAllForUser`, `revokeAllForUserExcept`, `listForUser`, `invalidateCacheForUser`, `update`, `purgeExpired`, `setCookie`, `readSessionToken`. SP6 uses `revokeAllForUser` (deleteAccount) + `revokeAllForUserExcept` (confirmEmailChange) — both already exist.
  - `PasswordService` contract: `hash(plain)`, `verify(storedHash, plain)`. `PasswordHashFailed` lives in `services/user.ts` (NOT `services/password.ts` — `password.ts` re-imports it).
  - `users` table at `packages/modules/auth/src/database/schema.ts:5`. Columns include `id integer PK`, `name text NOT NULL`, `email text NOT NULL UNIQUE`, `emailVerified boolean NOT NULL`, `image text`, `twoFactorEnabled boolean`, `role text`, `banned boolean`, `banReason text`, `banExpires timestamp`, `createdAt timestamp`, `updatedAt timestamp`. Task 1 adds `deletedAt` (nullable timestamp). The existing full unique constraint on `email` is preserved.
  - `accounts` table same file: `userId integer`, `providerId text` (e.g. `'credential'`), `password text` nullable. `accounts.userId → users.id ON DELETE CASCADE` (verified).
  - `members` table: `organizationId integer`, `userId integer`, `role text` (`'owner'` | `'admin'` | `'member'`).
  - `verifications` table: `identifier text NOT NULL`, `value text NOT NULL`, `expiresAt timestamp`, `createdAt timestamp`, `updatedAt timestamp`. Reused by Task 4 with new kinds `change-email` and `account-restore`.
  - SP5 `writeToken` / `consumeToken` are closure-captured helpers inside `make` (account.ts). Task 4 extends both signatures.
  - `AccountDbFailed`, `InvalidPasswordResetToken`, `InvalidEmailVerificationToken`, `IncorrectCurrentPassword` already exist (SP5). Task 5 adds 4 more errors (no rename of existing).
  - `accountSubscribersLayer` post-SP5 dispatches `PasswordResetRequested` / `EmailVerificationRequested` / `SignedUp` via the `runSubscriber` helper. Task 6 extends with 3 more branches.
  - `BetterAuth` config in `layers/better-auth/index.ts`: `disabledPaths` already lists `/change-password` (SP4), the SP4 account block (`/change-email`, `/update-user`, `/delete-user`, `/list-accounts`, `/unlink-account`, `/account-info`), and the SP5 batch (`/forget-password`, `/reset-password`, `/verify-email`, `/send-verification-email`). SP6 does NOT add to this list. Task 8 instead strips dead config stubs from `layers/better-auth/user.ts` (`changeEmail` + `deleteUser` blocks that were placeholders for these now-disabled paths).
  - `EmailService` Tag at `@czo/kit/email` (Tag id `'@czo/kit/EmailService'`). `SendEmailInput` interface + `loggingLayer` default impl available.
  - `graphql/schema/account/{errors.ts, mutations.ts, index.ts}` from SP5. Task 7 extends `errors.ts` with 4 new `registerError` calls + `mutations.ts` with 4 new `relayMutationField` calls.
- **Commits:** do NOT commit during execution. `git add` (stage) only — one commit after Task 11 (no-commit-until-review preference). Never `git stash`.
- **Baseline:** post-SP-C `pnpm check-types` is `28` in `@czo/auth`. Each task must keep error count `<= 28`.
- **No `as any` if inference is correct** (project convention).
- **Effect 4.0.0-beta.70 specifics** (already learned in SP5): `Schema.String.check(Schema.isMinLength, ...)` (not `.pipe(Schema.minLength, ...)`); `Effect.forkChild` (not `Effect.fork`); DB ops on `@effect/sql-pg` Drizzle return Effects (use `dbErr()` wrapper, not `Effect.tryPromise`); `Effect.fnUntraced` for generator helpers; `Effect.fn(name)` for traced top-level methods.

---

## File Structure

**Modified:**
- `packages/modules/auth/src/database/schema.ts` — add `users.deletedAt` column (single nullable timestamp).
- `packages/modules/auth/migrations/<timestamp>_users_deleted_at_partial_unique/` — generated by `pnpm migrate:generate`.
- `packages/modules/auth/src/constants.ts` — `CHANGE_EMAIL_TTL`, `ACCOUNT_GRACE_PERIOD`.
- `packages/modules/auth/src/module.ts` — extend `AuthModuleConfig.account` (3 new fields) + pass them to `makeAccountConfigLayer`.
- `packages/modules/auth/src/services/events/auth.ts` — widen `AuthEvent` with 4 variants.
- `packages/modules/auth/src/services/account.ts` — extend `AccountConfig` (3 fields), `writeToken`/`consumeToken` (signature changes), `AccountService` contract (+4 methods), 4 new tagged errors, 4 new live impl methods, `subscribersLayer` (+3 handler branches).
- `packages/modules/auth/src/services/account.test.ts` — +16 service tests + 3 subscriber tests.
- `packages/modules/auth/src/graphql/schema/account/errors.ts` — register 4 new errors.
- `packages/modules/auth/src/graphql/schema/account/mutations.ts` — 4 new `relayMutationField` calls.
- `packages/modules/auth/src/layers/better-auth/user.ts` — strip dead `changeEmail` + `deleteUser` config blocks from `userConfig()`.

**New:** none (all existing files are extended in place).

**Unchanged:** sign-in / sign-up handlers, `UserService`, `OrganizationService` (sole-owner query is read-only inline in `AccountService`), all other services.

---

## Task 0: Baseline capture

**Files:** none modified.

- [ ] **Step 1: Capture baseline TypeScript error count**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: a number. Record as `BASELINE_TS`. Currently `28` post-SP-C. Each task must keep errors `<= BASELINE_TS`.

- [ ] **Step 2: Capture baseline test pass count**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -8
```

Expected: `17 passed (17)` files / `164 passed (164)` tests post-SP-C.

- [ ] **Step 3: Capture current HEAD SHA**

```bash
cd /workspace/c-zo && git rev-parse HEAD
```

Expected: a SHA. Currently `635d7a81` (SP-C commit).

No file changes, no staging.

---

## Task 1: Schema migration — `users.deletedAt`

**Files:**
- Modify: `packages/modules/auth/src/database/schema.ts`
- Create: `packages/modules/auth/migrations/<timestamp>_users_deleted_at/migration.sql`
- Create: `packages/modules/auth/migrations/<timestamp>_users_deleted_at/snapshot.json`

Scope note: the existing **full** `UNIQUE` constraint on `users.email` is kept. It is what enforces decision #8 of the spec (sign-up during grace returns `EmailAlreadyExists` via PG `23505`). Post-anonymization (future cron job sprint), each soft-deleted row's email will be rewritten to `'deleted-{id}@deleted.local'` — per-id unique, so the full constraint still holds.

- [ ] **Step 1: Add `deletedAt` column to `users` in schema.ts**

In `packages/modules/auth/src/database/schema.ts`, find the `users` table (line 5). Single change — append at the end of the column block (after `updatedAt`):

```ts
deletedAt: timestamp('deleted_at', { precision: 6, withTimezone: true }),
```

Do NOT touch the `email` column. Do NOT add a second `pgTable` argument. Match existing 2-space indent.

- [ ] **Step 2: Generate the migration**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm migrate:generate
```

Drizzle-kit reads the schema diff vs the last snapshot and writes `migrations/<timestamp>_<name>/migration.sql` + `snapshot.json`. If prompted for a name, use `users_deleted_at` (or accept the auto-name).

Expected SQL (verify by `cat` after generation):

```sql
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp(6) with time zone;
```

Single statement. Nothing else.

- [ ] **Step 3: Apply the migration to a fresh Testcontainers container (sanity)**

The migration is applied automatically by `AuthPostgresLayer` on the next test run. To confirm parse correctness:

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/account.test.ts 2>&1 | tail -10
```

Expected: SP5's 20 tests still pass (the new column is nullable, no impact on existing inserts).

- [ ] **Step 4: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= 28`.

- [ ] **Step 5: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/database/schema.ts packages/modules/auth/migrations/
```

DO NOT COMMIT.

---

## Task 2: Constants + `AuthModuleConfig.account` extension

**Files:**
- Modify: `packages/modules/auth/src/constants.ts`
- Modify: `packages/modules/auth/src/module.ts` (interface only — `makeAccountConfigLayer` call site updated in Task 9)

- [ ] **Step 1: Add account TTL constants**

In `packages/modules/auth/src/constants.ts`, append after `EMAIL_VERIFICATION_TTL`:

```ts
/** Default TTL for change-email tokens. Override via AuthModuleConfig.account.changeEmailTtl. */
export const CHANGE_EMAIL_TTL: Duration.Duration = Duration.hours(24)

/** Grace period for self-deleted accounts. = restore token TTL. Override via AuthModuleConfig.account.gracePeriod. */
export const ACCOUNT_GRACE_PERIOD: Duration.Duration = Duration.days(30)
```

- [ ] **Step 2: Extend `AuthModuleConfig.account` block in `module.ts`**

In `packages/modules/auth/src/module.ts`, find the `AuthModuleConfig.account` block. It currently has 2 fields (`passwordResetTtl`, `emailVerificationTtl`). Extend to 5:

```ts
readonly account?: {
  readonly passwordResetTtl?: Duration.Duration       // default 1h
  readonly emailVerificationTtl?: Duration.Duration   // default 24h
  readonly changeEmailTtl?: Duration.Duration         // default 24h
  readonly gracePeriod?: Duration.Duration            // default 30 days
  readonly sendOldEmailNotificationOnChange?: boolean // default true
}
```

Do NOT touch the wiring in `makeAccountConfigLayer` yet — that's Task 9.

- [ ] **Step 3: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= 28`.

- [ ] **Step 4: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/constants.ts packages/modules/auth/src/module.ts
```

---

## Task 3: `AuthEvent` widening (+4 variants)

**Files:**
- Modify: `packages/modules/auth/src/services/events/auth.ts`

- [ ] **Step 1: Add 4 variants to `AuthEvent` union**

In `packages/modules/auth/src/services/events/auth.ts`, the union currently ends after the SP5 `EmailVerified` variant. Append:

```ts
  | {
    readonly _tag: 'EmailChangeRequested'
    readonly userId: number
    readonly oldEmail: string
    readonly newEmail: string
    /** Raw token for the confirmation email body. Never persisted raw — only sha256(token) is. */
    readonly token: string
    readonly expiresAt: Date
  }
  | {
    readonly _tag: 'EmailChanged'
    readonly userId: number
    readonly oldEmail: string
    readonly newEmail: string
  }
  | {
    readonly _tag: 'AccountDeleted'
    readonly userId: number
    readonly email: string
    /** Raw restore token for the deletion notification email body. */
    readonly token: string
    readonly expiresAt: Date
  }
  | {
    readonly _tag: 'AccountRestored'
    readonly userId: number
  }
```

Match the indentation of the existing 7 variants (2-space, `| {` aligned with the type alias `=`).

- [ ] **Step 2: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= 28`. The union widening is additive — existing publishers still type-check. Existing single-variant readers (e.g. `event.email`, `event.token`) are already inside `_tag` narrows from earlier sprints; verify none broke by re-running tests:

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -6
```

Expected: `164 passed`.

- [ ] **Step 3: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/events/auth.ts
```

---

## Task 4: Token helper extension — `identifierOverride` + return shape

**Files:**
- Modify: `packages/modules/auth/src/services/account.ts`

This task makes a non-test contract change inside the closure: `writeToken` accepts an optional override identifier (so `change-email` can encode `newEmail`), and `consumeToken` returns `{ userId, identifier }` (so callers can decode extra segments). The 3 SP5 callers (`resetPassword`, `verifyEmail`, and any other use) are updated in the same task to keep things compiling.

- [ ] **Step 1: Update `writeToken` signature inside `make`**

In `packages/modules/auth/src/services/account.ts`, find `const writeToken = Effect.fnUntraced(function* (kind, userId, ttl) { ... })`. Change to:

```ts
const writeToken = Effect.fnUntraced(function* (
  kind: IdentifierKind,
  userId: number,
  ttl: Duration.Duration,
  identifierOverride?: string,
) {
  const identifier = identifierOverride ?? `${kind}:${userId}`
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS)

  const recent = yield* dbErr(
    db.select({ id: verifications.id })
      .from(verifications)
      .where(and(eq(verifications.identifier, identifier), gt(verifications.createdAt, cooldownCutoff)))
      .limit(1),
  )
  if (recent.length > 0) return null

  const raw = randomBytes(32).toString('base64url')
  const hashed = createHash('sha256').update(raw).digest('hex')
  const expiresAt = new Date(Date.now() + Duration.toMillis(ttl))
  const now = new Date()

  yield* dbErr(db.insert(verifications).values({
    identifier, value: hashed, expiresAt,
    createdAt: now, updatedAt: now,
  }))
  return raw
})
```

(If the SP5 implementation differs in `cooldown` lookup — `findFirst` vs `select` — keep whichever shape exists; only the `identifier` plumbing changes.)

- [ ] **Step 2: Extend `IdentifierKind` type**

In the same file, the existing `type IdentifierKind = 'password-reset' | 'email-verification'` becomes:

```ts
type IdentifierKind = 'password-reset' | 'email-verification' | 'change-email' | 'account-restore'
```

- [ ] **Step 3: Update `consumeToken` to return `{ userId, identifier }`**

Current shape returns `userId | null`. Change to:

```ts
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
  const parts = row.identifier.split(':')
  const userId = Number(parts[1])
  if (!Number.isFinite(userId)) return null
  return { userId, identifier: row.identifier }
})
```

- [ ] **Step 4: Update SP5 callers to use new shape**

Find every `yield* consumeToken(...)` in the file. SP5 had 2: inside `resetPassword` and `verifyEmail`. Each currently does:

```ts
const userId = yield* consumeToken('password-reset', input.token)
if (userId === null) return yield* Effect.fail(new InvalidPasswordResetToken())
// ... use userId
```

Change to:

```ts
const result = yield* consumeToken('password-reset', input.token)
if (result === null) return yield* Effect.fail(new InvalidPasswordResetToken())
const { userId } = result
// ... use userId unchanged
```

Same edit for `verifyEmail` (uses `InvalidEmailVerificationToken`).

- [ ] **Step 5: Verify SP5 tests still pass**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/account.test.ts 2>&1 | tail -10
```

Expected: `20 passed`. The SP5 flow contracts are unchanged from the caller's perspective.

- [ ] **Step 6: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= 28`.

- [ ] **Step 7: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/account.ts
```

---

## Task 5: `AccountService` extension — 4 new methods (TDD)

**Files:**
- Modify: `packages/modules/auth/src/services/account.ts` (errors + AccountConfig + contract + impl)
- Modify: `packages/modules/auth/src/services/account.test.ts` (+16 service tests)

### Step 1: Write the 16 failing tests (RED)

In `packages/modules/auth/src/services/account.test.ts`, the existing main block is `layer(TestLayer, { ... })('AccountService', (it) => { ... })` (SP5). Inside that block, append the 16 tests below. Some helpers needed at top of file:

**Helpers (add near `seedUser` if not already present):**

```ts
const seedOrganization = (slug: string, ownerUserId: number) =>
  Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const now = new Date()
    const [org] = yield* db.insert(organizations).values({
      name: `Org-${slug}`,
      slug,
      createdAt: now,
      updatedAt: now,
    }).returning()
    yield* db.insert(members).values({
      organizationId: (org as { id: number }).id,
      userId: ownerUserId,
      role: 'owner',
      createdAt: now,
    })
    return org as { id: number; slug: string }
  })
```

Also pre-import `organizations`, `members` from `'../database/schema'` at the top of the test file (alongside the existing `accounts, users, verifications` import).

**Tests — requestEmailChange (5):**

```ts
it.effect('requestEmailChange happy → publishes EmailChangeRequested with oldEmail+newEmail+token', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const u = yield* seedUser({ email: 'old@example.com' })
    yield* seedCredentialAccount(u.id, 'OldPass1!')

    const account = yield* Account.AccountService
    const events = yield* AuthEventsMod.AuthEvents
    const collected = yield* events.subscribe.pipe(
      Stream.take(1), Stream.runCollect, Effect.forkChild,
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
      Stream.take(1), Stream.runCollect, Effect.forkChild,
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
      Stream.take(1), Stream.runCollect, Effect.forkChild,
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
      Stream.take(1), Stream.runCollect, Effect.forkChild,
    )

    yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
    const arr = yield* Fiber.join(collected)
    const req = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>

    const err = yield* account.verifyEmail(req.token).pipe(Effect.flip)
    expect((err as { _tag: string })._tag).toBe('InvalidEmailVerificationToken')
  }))
```

**Tests — confirmEmailChange (5):**

```ts
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
      Stream.take(1), Stream.runCollect, Effect.forkChild,
    )
    yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
    const reqArr = yield* Fiber.join(reqCollect)
    const req = reqArr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>

    const chgCollect = yield* events.subscribe.pipe(
      Stream.take(1), Stream.runCollect, Effect.forkChild,
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
      token: 'bogus', currentSessionToken: 'whatever',
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
      Stream.take(1), Stream.runCollect, Effect.forkChild,
    )
    yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
    const arr = yield* Fiber.join(collected)
    const req = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>

    // Manually expire the verifications row.
    const db = (yield* DrizzleDb) as Database<Relations>
    yield* dbExec(db.update(verifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(like(verifications.identifier, 'change-email:%')))

    const err = yield* account.confirmEmailChange({
      token: req.token, currentSessionToken: 'whatever',
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
      Stream.take(1), Stream.runCollect, Effect.forkChild,
    )
    yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
    const arr = yield* Fiber.join(collected)
    const req = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>

    yield* account.confirmEmailChange({ token: req.token, currentSessionToken: null })
    const err = yield* account.confirmEmailChange({
      token: req.token, currentSessionToken: null,
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
      Stream.take(1), Stream.runCollect, Effect.forkChild,
    )
    yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
    const arr = yield* Fiber.join(collected)
    const req = arr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>

    yield* account.confirmEmailChange({ token: req.token, currentSessionToken: null })

    expect(yield* session.listForUser(u.id)).toHaveLength(0)
  }))
```

`dbExec` is a local helper to run a raw Drizzle update wrapped in `dbErr`. Add to the test file if not already present:

```ts
const dbExec = <A>(q: Promise<A>) => Effect.tryPromise({ try: () => q, catch: cause => new Error(String(cause)) })
```

(Or simpler — Drizzle queries on `@effect/sql-pg` already return Effects in production but the test seed uses Promise-shaped helpers; mirror what `seedUser` does.)

**Tests — deleteAccount (4):**

```ts
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
      Stream.take(1), Stream.runCollect, Effect.forkChild,
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
      userId: u.id, currentPassword: 'WrongPass1!',
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
      userId: u.id, currentPassword: 'OldPass1!',
    }).pipe(Effect.flip)
    expect((err as { _tag: string })._tag).toBe('CannotDeleteWithOwnedOrgs')
    expect((err as { orgIds: number[] }).orgIds).toEqual([org.id])

    const db = (yield* DrizzleDb) as Database<Relations>
    const row = yield* db.query.users.findFirst({ where: { id: u.id } })
    expect(row?.deletedAt).toBeNull()
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
```

`dbErrTest` is a test-local equivalent of the service-internal `dbErr`. Add near `dbExec`:

```ts
const dbErrTest = <A>(q: Promise<A>) => Effect.tryPromise({ try: () => q, catch: cause => new Error(String(cause)) })
```

**Tests — restoreAccount (2):**

```ts
it.effect('restoreAccount happy → deletedAt=null, AccountRestored event', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const u = yield* seedUser()
    yield* seedCredentialAccount(u.id, 'OldPass1!')
    const account = yield* Account.AccountService
    const events = yield* AuthEventsMod.AuthEvents

    // Delete first to get a restore token.
    const delCollect = yield* events.subscribe.pipe(
      Stream.take(1), Stream.runCollect, Effect.forkChild,
    )
    yield* account.deleteAccount({ userId: u.id, currentPassword: 'OldPass1!' })
    const delArr = yield* Fiber.join(delCollect)
    const del = delArr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'AccountDeleted' }>

    // Restore.
    const resCollect = yield* events.subscribe.pipe(
      Stream.take(1), Stream.runCollect, Effect.forkChild,
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
```

### Step 2: Run tests to verify RED

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/account.test.ts 2>&1 | tail -30
```

Expected: 16 FAILures with `Property 'requestEmailChange' does not exist`, etc. (or similar). The 20 SP5 tests still pass.

### Step 3: Add 4 new tagged errors in `account.ts`

After the SP5 `IncorrectCurrentPassword` error class, append:

```ts
export class InvalidEmailChangeToken extends Data.TaggedError('InvalidEmailChangeToken')<{}>() {
  readonly code = 'INVALID_EMAIL_CHANGE_TOKEN'
  get message() { return 'Email change token is invalid or expired' }
}

export class InvalidAccountRestoreToken extends Data.TaggedError('InvalidAccountRestoreToken')<{}>() {
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
```

### Step 4: Extend `AccountConfig` Tag service shape

Find `AccountConfig` class. Currently has 5 fields. Add 3:

```ts
export class AccountConfig extends Context.Service<
  AccountConfig,
  {
    readonly passwordResetTtl: Duration.Duration
    readonly emailVerificationTtl: Duration.Duration
    readonly requireEmailVerification: boolean
    readonly sendVerificationOnSignUp: boolean
    readonly baseUrl: string
    // SP6 additions:
    readonly changeEmailTtl: Duration.Duration
    readonly gracePeriod: Duration.Duration
    readonly sendOldEmailNotificationOnChange: boolean
  }
>()('@czo/auth/AccountConfig') {}
```

Update `makeAccountConfigLayer` to accept the new fields (with defaults from the constants added in Task 2):

```ts
export const makeAccountConfigLayer = (input: {
  passwordResetTtl?: Duration.Duration
  emailVerificationTtl?: Duration.Duration
  requireEmailVerification?: boolean
  sendVerificationOnSignUp?: boolean
  baseUrl: string
  changeEmailTtl?: Duration.Duration
  gracePeriod?: Duration.Duration
  sendOldEmailNotificationOnChange?: boolean
}): Layer.Layer<AccountConfig> =>
  Layer.succeed(AccountConfig, {
    passwordResetTtl: input.passwordResetTtl ?? PASSWORD_RESET_TTL,
    emailVerificationTtl: input.emailVerificationTtl ?? EMAIL_VERIFICATION_TTL,
    requireEmailVerification: input.requireEmailVerification ?? false,
    sendVerificationOnSignUp: input.sendVerificationOnSignUp ?? true,
    baseUrl: input.baseUrl,
    changeEmailTtl: input.changeEmailTtl ?? CHANGE_EMAIL_TTL,
    gracePeriod: input.gracePeriod ?? ACCOUNT_GRACE_PERIOD,
    sendOldEmailNotificationOnChange: input.sendOldEmailNotificationOnChange ?? true,
  })
```

Add to the existing constants import at top of `account.ts`:

```ts
import { ACCOUNT_GRACE_PERIOD, CHANGE_EMAIL_TTL, EMAIL_VERIFICATION_TTL, PASSWORD_RESET_TTL } from '../constants'
```

### Step 5: Extend `AccountService` contract

Add 4 method signatures to the existing `Context.Service` shape:

```ts
export class AccountService extends Context.Service<
  AccountService,
  {
    // ... existing SP5 methods ...
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
```

### Step 6: Add helper for credential-password check

Inside `make`, between the helpers and the flow handlers, add a private helper for the hybrid pwd check (used by `requestEmailChange` and `deleteAccount`):

```ts
/**
 * Hybrid password gate: if user has a credential account, verify the
 * provided currentPassword. If OAuth-only (no credential row), skip.
 * Returns `Effect<void, IncorrectCurrentPassword | AccountDbFailed>`.
 */
const verifyCredentialPasswordIfPresent = Effect.fnUntraced(function* (userId: number, currentPassword: string | undefined) {
  const account = yield* dbErr(
    db.query.accounts.findFirst({
      where: { userId, providerId: 'credential' },
    }),
  )
  if (!account || !account.password) return    // OAuth-only or no password set
  if (currentPassword === undefined)
    return yield* Effect.fail(new IncorrectCurrentPassword({ userId }))
  const ok = yield* passwords.verify(account.password, currentPassword)
  if (!ok) return yield* Effect.fail(new IncorrectCurrentPassword({ userId }))
})
```

### Step 7: Implement `requestEmailChange`

Add inside `make`, in the handlers block:

```ts
const requestEmailChange = Effect.fn('account.requestEmailChange')(function* (input: {
  userId: number
  currentPassword?: string
  newEmail: string
}) {
  const target = yield* users.findFirst({ where: { id: input.userId } }).pipe(
    Effect.orElseSucceed(() => null),
  )
  if (!target || target.deletedAt !== null) return

  yield* verifyCredentialPasswordIfPresent(input.userId, input.currentPassword)

  const newEmailEncoded = Buffer.from(input.newEmail, 'utf8').toString('base64url')
  const identifier = `change-email:${input.userId}:${newEmailEncoded}`
  const raw = yield* writeToken('change-email', input.userId, config.changeEmailTtl, identifier)
  if (raw === null) return

  yield* Effect.forkDetach(events.publish({
    _tag: 'EmailChangeRequested',
    userId: input.userId,
    oldEmail: target.email,
    newEmail: input.newEmail,
    token: raw,
    expiresAt: new Date(Date.now() + Duration.toMillis(config.changeEmailTtl)),
  }))
})
```

(`Buffer` is global in Node — no import needed.)

### Step 8: Implement `confirmEmailChange`

```ts
const confirmEmailChange = Effect.fn('account.confirmEmailChange')(function* (input: {
  token: string
  currentSessionToken: string | null
}) {
  const result = yield* consumeToken('change-email', input.token)
  if (result === null) return yield* Effect.fail(new InvalidEmailChangeToken())

  const parts = result.identifier.split(':')
  // identifier shape: change-email:{userId}:{base64url(newEmail)}
  const encoded = parts[2]
  if (!encoded) return yield* Effect.fail(new InvalidEmailChangeToken())
  const newEmail = Buffer.from(encoded, 'base64url').toString('utf8')

  // Capture oldEmail before update.
  const target = yield* dbErr(db.query.users.findFirst({ where: { id: result.userId } }))
  if (!target) return yield* Effect.fail(new InvalidEmailChangeToken())
  const oldEmail = target.email

  yield* dbErr(db.update(users)
    .set({ email: newEmail, emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, result.userId)))

  if (input.currentSessionToken !== null)
    yield* sessions.revokeAllForUserExcept(result.userId, input.currentSessionToken)
  else
    yield* sessions.revokeAllForUser(result.userId)

  yield* Effect.forkDetach(events.publish({
    _tag: 'EmailChanged',
    userId: result.userId,
    oldEmail,
    newEmail,
  }))
})
```

### Step 9: Implement `deleteAccount`

```ts
const deleteAccount = Effect.fn('account.deleteAccount')(function* (input: {
  userId: number
  currentPassword?: string
}) {
  const target = yield* dbErr(db.query.users.findFirst({ where: { id: input.userId } }))
  if (!target || target.deletedAt !== null) return    // idempotent

  yield* verifyCredentialPasswordIfPresent(input.userId, input.currentPassword)

  // Sole-owner check: find every org where the user is owner AND there's no other owner.
  // Two-step (simpler than a single SQL — no `HAVING` join in RQBv2 ergonomics):
  //   1. find all orgs where user is owner
  //   2. for each, count distinct owners — collect orgs where count = 1
  const ownerships = yield* dbErr(
    db.select({ orgId: members.organizationId }).from(members)
      .where(and(eq(members.userId, input.userId), eq(members.role, 'owner'))),
  )
  const soleOwnedOrgIds: number[] = []
  for (const { orgId } of ownerships) {
    const owners = yield* dbErr(
      db.select({ userId: members.userId }).from(members)
        .where(and(eq(members.organizationId, orgId), eq(members.role, 'owner'))),
    )
    if (owners.length === 1) soleOwnedOrgIds.push(orgId)
  }
  if (soleOwnedOrgIds.length > 0)
    return yield* Effect.fail(new CannotDeleteWithOwnedOrgs({ orgIds: soleOwnedOrgIds }))

  const now = new Date()
  yield* dbErr(db.update(users)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(users.id, input.userId)))

  yield* sessions.revokeAllForUser(input.userId)

  const restoreIdentifier = `account-restore:${input.userId}`
  const raw = yield* writeToken('account-restore', input.userId, config.gracePeriod, restoreIdentifier)
  if (raw === null) {
    // Cooldown collision impossible at delete-time (no prior token); failure here means infra issue.
    return yield* Effect.fail(new AccountDbFailed({ cause: new Error('failed to write restore token') }))
  }

  yield* Effect.forkDetach(events.publish({
    _tag: 'AccountDeleted',
    userId: input.userId,
    email: target.email,
    token: raw,
    expiresAt: new Date(Date.now() + Duration.toMillis(config.gracePeriod)),
  }))
})
```

Add `members` and `organizations` (latter not needed for SP6 impl but useful for tests) to the existing schema imports at top of `account.ts`:

```ts
import { accounts, members, users, verifications } from '../database/schema'
```

### Step 10: Implement `restoreAccount`

```ts
const restoreAccount = Effect.fn('account.restoreAccount')(function* (rawToken: string) {
  const result = yield* consumeToken('account-restore', rawToken)
  if (result === null) return yield* Effect.fail(new InvalidAccountRestoreToken())

  const target = yield* dbErr(db.query.users.findFirst({ where: { id: result.userId } }))
  if (!target) return yield* Effect.fail(new InvalidAccountRestoreToken())

  // Idempotent: already restored.
  if (target.deletedAt === null) {
    yield* Effect.forkDetach(events.publish({ _tag: 'AccountRestored', userId: result.userId }))
    return
  }

  // Future: detect anonymization (e.g. email matches `deleted-\\d+@deleted.local`) and fail
  // AccountUnrecoverable. SP6 ships the error type but the trigger requires the anonymize job.

  yield* dbErr(db.update(users)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(users.id, result.userId)))

  yield* Effect.forkDetach(events.publish({ _tag: 'AccountRestored', userId: result.userId }))
})
```

### Step 11: Return the new methods from `AccountService.of({...})`

Find the `return AccountService.of({ ... })` block at the bottom of `make`. Extend with:

```ts
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
```

### Step 12: Run tests, expect 36/36 PASS (20 SP5 + 16 SP6)

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/account.test.ts 2>&1 | tail -10
```

Expected: `Tests 36 passed (36)`.

### Step 13: check-types

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= 28`.

### Step 14: Stage

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/account.ts packages/modules/auth/src/services/account.test.ts
```

DO NOT COMMIT.

---

## Task 6: Subscribers extension (+3 handlers, TDD)

**Files:**
- Modify: `packages/modules/auth/src/services/account.ts` (3 new subscriber fns + dispatch branches)
- Modify: `packages/modules/auth/src/services/account.test.ts` (3 new subscriber tests in the `subscribersLayer` block)

### Step 1: Write the 3 failing subscriber tests (RED)

The existing SP5 subscriber block is `layer(TestLayerWithSubscribers, { ... })('AccountService.subscribersLayer', (it) => { ... })`. Append inside it:

```ts
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
      Stream.take(1), Stream.runCollect, Effect.forkChild,
    )

    yield* account.requestEmailChange({ userId: u.id, currentPassword: 'OldPass1!', newEmail: 'new@x.com' })
    const reqArr = yield* Fiber.join(collected)
    const req = reqArr[0] as Extract<AuthEventsMod.AuthEvent, { _tag: 'EmailChangeRequested' }>

    EmailMockState.sends.length = 0   // reset after request-side mail
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
```

### Step 2: Run tests, expect 3 FAIL

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/account.test.ts -t 'subscribersLayer' 2>&1 | tail -15
```

Expected: 3 FAILures (`EmailMockState.sends.length` is 0 — handlers aren't wired yet).

### Step 3: Add 3 new subscriber handlers in `account.ts`

After the SP5 `onSignedUp` handler, append:

```ts
const onEmailChangeRequested = Effect.fn('account.subscribers.email-change-requested')(
  function* (e: Extract<AuthEvent, { _tag: 'EmailChangeRequested' }>) {
    const config = yield* AccountConfig
    const email = yield* EmailService
    const url = `${config.baseUrl}/confirm-email-change?token=${e.token}`
    yield* email.send({
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
    if (!config.sendOldEmailNotificationOnChange) return
    const email = yield* EmailService
    yield* email.send({
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
    const email = yield* EmailService
    const url = `${config.baseUrl}/restore-account?token=${e.token}`
    yield* email.send({
      to: e.email,
      subject: 'Your account has been deleted',
      html: `<p>Your account is scheduled for deletion. You have until ${e.expiresAt.toISOString()} to restore it: <a href="${url}">${url}</a></p>`,
      text: `Restore: ${url}\nExpires ${e.expiresAt.toISOString()}`,
    })
  },
)
```

`AccountRestored` is observability-only; no handler needed.

### Step 4: Extend the `subscribersLayer` dispatch

The existing SP5 dispatch routes 3 events via `runSubscriber`. Extend with 3 new branches. Find the `Stream.runForEach(events.subscribe, (e) => …)` body. The current shape:

```ts
e._tag === 'PasswordResetRequested'      ? runSubscriber(e._tag, onPasswordResetRequested(e))
: e._tag === 'EmailVerificationRequested' ? runSubscriber(e._tag, onEmailVerificationRequested(e))
: e._tag === 'SignedUp'                   ? runSubscriber(e._tag, onSignedUp(e))
:                                           Effect.void
```

Change to:

```ts
e._tag === 'PasswordResetRequested'      ? runSubscriber(e._tag, onPasswordResetRequested(e))
: e._tag === 'EmailVerificationRequested' ? runSubscriber(e._tag, onEmailVerificationRequested(e))
: e._tag === 'SignedUp'                   ? runSubscriber(e._tag, onSignedUp(e))
: e._tag === 'EmailChangeRequested'       ? runSubscriber(e._tag, onEmailChangeRequested(e))
: e._tag === 'EmailChanged'               ? runSubscriber(e._tag, onEmailChanged(e))
: e._tag === 'AccountDeleted'             ? runSubscriber(e._tag, onAccountDeleted(e))
:                                           Effect.void
```

### Step 5: Run tests, expect 3 PASS

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/account.test.ts -t 'subscribersLayer' 2>&1 | tail -10
```

Expected: all subscriber tests pass (3 SP5 + 3 SP6 = 6 in that block).

### Step 6: Run full account suite

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/account.test.ts 2>&1 | tail -10
```

Expected: `Tests 39 passed (39)` (20 SP5 + 16 SP6 service + 3 SP5 subscriber + 3 SP6 subscriber — wait, the SP5 subscriber block has 3 tests + the no-auto-verify block has 1 = 4 SP5 subscriber tests; SP6 adds 3 to the main subscriber block. Total 20 + 16 + 3 + 3 + 1 = 43. Adjust if your count differs — exact number depends on whether the test runner counts the no-auto-verify block. The acceptance is "everything green, count matches prior + 19 new").

### Step 7: check-types

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= 28`.

### Step 8: Stage

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/account.ts packages/modules/auth/src/services/account.test.ts
```

---

## Task 7: GraphQL mutations + error registration

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/account/errors.ts` (+4 `registerError`)
- Modify: `packages/modules/auth/src/graphql/schema/account/mutations.ts` (+4 relay mutations)

### Step 1: Register 4 new Pothos errors

In `packages/modules/auth/src/graphql/schema/account/errors.ts`, extend the import and add 4 `registerError` calls:

```ts
import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { registerError } from '@czo/kit/graphql'
import {
  AccountUnrecoverable,
  CannotDeleteWithOwnedOrgs,
  IncorrectCurrentPassword,
  InvalidAccountRestoreToken,
  InvalidEmailChangeToken,
  InvalidEmailVerificationToken,
  InvalidPasswordResetToken,
} from '../../../services/account'

export function registerAccountErrors(builder: AuthGraphQLSchemaBuilder): void {
  registerError(builder, InvalidPasswordResetToken, { name: 'InvalidPasswordResetTokenError' })
  registerError(builder, InvalidEmailVerificationToken, { name: 'InvalidEmailVerificationTokenError' })
  registerError(builder, IncorrectCurrentPassword, { name: 'IncorrectCurrentPasswordError' })
  // SP6:
  registerError(builder, InvalidEmailChangeToken, { name: 'InvalidEmailChangeTokenError' })
  registerError(builder, InvalidAccountRestoreToken, { name: 'InvalidAccountRestoreTokenError' })
  registerError(builder, CannotDeleteWithOwnedOrgs, { name: 'CannotDeleteWithOwnedOrgsError' })
  registerError(builder, AccountUnrecoverable, { name: 'AccountUnrecoverableError' })
}
```

### Step 2: Add 4 new relay mutations

In `packages/modules/auth/src/graphql/schema/account/mutations.ts`, extend the import block:

```ts
import {
  AccountService,
  AccountUnrecoverable,
  CannotDeleteWithOwnedOrgs,
  IncorrectCurrentPassword,
  InvalidAccountRestoreToken,
  InvalidEmailChangeToken,
  InvalidEmailVerificationToken,
  InvalidPasswordResetToken,
} from '../../../services/account'
```

Then append inside `registerAccountMutations(builder)`, AFTER the SP5 `changePassword` mutation (last one):

```ts
builder.relayMutationField(
  'requestEmailChange',
  { inputFields: t => ({
      currentPassword: t.string({ required: false }),
      newEmail: t.string({ required: true, validate: z.email().transform(e => e.toLowerCase()) }),
  }) },
  {
    errors: { types: [IncorrectCurrentPassword] },
    authScopes: { auth: true },
    resolve: async (_root, { input }, ctx) => {
      const userId = Number(ctx.auth.user!.id)
      await ctx.runEffect(
        Effect.gen(function* () {
          yield* (yield* AccountService).requestEmailChange({
            userId,
            currentPassword: input.currentPassword ?? undefined,
            newEmail: input.newEmail,
          })
        }),
      )
      return { success: true }
    },
  },
  { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
)

builder.relayMutationField(
  'confirmEmailChange',
  { inputFields: t => ({
      token: t.string({ required: true }),
  }) },
  {
    errors: { types: [InvalidEmailChangeToken] },
    resolve: async (_root, { input }, ctx) => {
      const currentSessionToken = ctx.auth.session?.token ?? null
      await ctx.runEffect(
        Effect.gen(function* () {
          yield* (yield* AccountService).confirmEmailChange({
            token: input.token,
            currentSessionToken,
          })
        }),
      )
      return { success: true }
    },
  },
  { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
)

builder.relayMutationField(
  'deleteAccount',
  { inputFields: t => ({
      currentPassword: t.string({ required: false }),
  }) },
  {
    errors: { types: [IncorrectCurrentPassword, CannotDeleteWithOwnedOrgs] },
    authScopes: { auth: true },
    resolve: async (_root, { input }, ctx) => {
      const userId = Number(ctx.auth.user!.id)
      await ctx.runEffect(
        Effect.gen(function* () {
          yield* (yield* AccountService).deleteAccount({
            userId,
            currentPassword: input.currentPassword ?? undefined,
          })
        }),
      )
      return { success: true }
    },
  },
  { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
)

builder.relayMutationField(
  'restoreAccount',
  { inputFields: t => ({
      token: t.string({ required: true }),
  }) },
  {
    errors: { types: [InvalidAccountRestoreToken, AccountUnrecoverable] },
    resolve: async (_root, { input }, ctx) => {
      await ctx.runEffect(
        Effect.gen(function* () {
          yield* (yield* AccountService).restoreAccount(input.token)
        }),
      )
      return { success: true }
    },
  },
  { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
)
```

### Step 3: check-types

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= 28`.

### Step 4: Stage

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/graphql/schema/account/errors.ts packages/modules/auth/src/graphql/schema/account/mutations.ts
```

---

## Task 8: Strip dead better-auth `changeEmail` + `deleteUser` config stubs

**Files:**
- Modify: `packages/modules/auth/src/layers/better-auth/user.ts`

Scope note: both `/change-email` and `/delete-user` are **already** in `disabledPaths` (added in SP4 — verified at lines 107 and 109 of `layers/better-auth/index.ts`). No `disabledPaths` edit needed. What remains is the dead config in `userConfig()` — `changeEmail: { enabled: true, sendChangeEmailConfirmation: stub }` and `deleteUser: { enabled: true, sendDeleteAccountVerification + beforeDelete + afterDelete: stubs }`. Since the corresponding paths are disabled, better-auth never invokes those callbacks. They were placeholders waiting for SP6 — now native flows own that surface.

### Step 1: Remove the `changeEmail` and `deleteUser` blocks from `userConfig()`

In `packages/modules/auth/src/layers/better-auth/user.ts`, the `userConfig()` function currently returns:

```ts
export function userConfig(): BetterAuthOptions['user'] {
  return {
    modelName: 'users',
    fields: { /* ... */ },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async (_user, _request) => { },
    },
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification: async (_user, _request) => { },
      beforeDelete: async (_user, _request) => { },
      afterDelete: async (_user, _request) => { /* comment */ },
    },
  }
}
```

Reduce it to:

```ts
export function userConfig(): BetterAuthOptions['user'] {
  return {
    modelName: 'users',
    fields: {
      // emailVerified: 'email_verified',
      // createdAt: 'created_at',
      // updatedAt: 'updated_at',
    },
  }
}
```

Keep the commented-out `fields` notes (they were already dead but document the mapping convention).

### Step 2: Verify no stale references

```bash
grep -rn "/change-email\|/delete-user\|changeEmail\|deleteUser\|sendChangeEmailConfirmation\|sendDeleteAccountVerification" /workspace/c-zo/packages/modules/auth/src
```

Expected matches:
- `disabledPaths` entries for `/change-email` + `/delete-user` (kept — these stay disabled)
- `account.ts` references to `deleteAccount` / `requestEmailChange` etc. — these are the new SP6 service methods, not the stripped stubs
- No references to `sendChangeEmailConfirmation`, `sendDeleteAccountVerification`, `beforeDelete`, `afterDelete` (all removed)

### Step 3: check-types + tests

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -6
```

Expected: TS `<= 28`, all tests pass (~180+). `userConfig()`'s return type is `BetterAuthOptions['user']` which is a partial — dropping `changeEmail` and `deleteUser` keys is type-valid.

### Step 4: Stage

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/layers/better-auth/user.ts
```

---

## Task 9: Module wiring (forward SP6 fields to `AccountConfigLive`)

**Files:**
- Modify: `packages/modules/auth/src/module.ts`

### Step 1: Forward the 3 new fields in `makeAccountConfigLayer` call

In `packages/modules/auth/src/module.ts`, find the `AccountConfigLive = Account.makeAccountConfigLayer({ ... })` call (added in SP5, ~line 190). Extend the object literal with the 3 SP6 fields:

```ts
const AccountConfigLive = Account.makeAccountConfigLayer({
  baseUrl,
  requireEmailVerification: config.requireEmailVerification,
  sendVerificationOnSignUp: config.sendVerificationOnSignUp,
  passwordResetTtl: config.account?.passwordResetTtl,
  emailVerificationTtl: config.account?.emailVerificationTtl,
  // SP6 additions:
  changeEmailTtl: config.account?.changeEmailTtl,
  gracePeriod: config.account?.gracePeriod,
  sendOldEmailNotificationOnChange: config.account?.sendOldEmailNotificationOnChange,
})
```

Defaults are applied inside `makeAccountConfigLayer` (Task 5 Step 4). No other wiring change needed — `Account.layer` and `Account.subscribersLayer` are already in `Layer.mergeAll` from SP5.

### Step 2: check-types

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= 28`.

### Step 3: Run full test suite

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -6
```

Expected: all tests pass.

### Step 4: Stage

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/module.ts
```

---

## Task 10: Final review + user-approved commit

### Step 1: Verify scope

```bash
grep -rn "/change-email\|sendChangeEmailConfirmation\|sendDeleteAccountVerification" /workspace/c-zo/packages/modules/auth/src
```

Expected: `disabledPaths` entry + (possibly) deletion stubs in `others.ts`. No production handler.

```bash
grep -rn "deletedAt\|deleted_at" /workspace/c-zo/packages/modules/auth/src --include="*.ts"
```

Expected matches: `schema.ts` (column definition + partial index), `account.ts` (3 sites — `deleteAccount` set, `restoreAccount` clear, `requestEmailChange`/`deleteAccount` guard).

```bash
grep -rn "EmailChangeRequested\|AccountDeleted\|EmailChanged\|AccountRestored" /workspace/c-zo/packages/modules/auth/src
```

Expected: 4 variants in `events/auth.ts`; publishes in `account.ts` handlers; subscriber handlers + dispatch branches; tests.

### Step 2: Verify check-types and tests

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected:
- check-types `<= 28` (BASELINE_TS).
- Tests: pass count grew by **~19** (16 new service + 3 new subscriber) vs the SP-C post-baseline of 164. New total: **~183/183 passing**.

### Step 3: Review staged diff

```bash
cd /workspace/c-zo && git status && git diff --cached --stat
```

Verify scope: ~10 modified files + 1 new migration dir. Code diff ~600 LOC + spec+plan docs ~3500.

### Step 4: Wait for user review

Present a summary to the user, ask for review/commit approval. Do NOT commit autonomously.

When approved, commit with:

```bash
git commit -m "$(cat <<'EOF'
feat(auth): SP6 — native account lifecycle (change-email, delete/restore-account)

Replaces better-auth's /change-email and /delete-user endpoints with native
Effect services + GraphQL mutations. Adds 30-day grace period with self-
restore via token. Extends the SP5 token model to carry the new email in
the verifications.identifier.

Schema
- users.deletedAt timestamp NULL (soft-delete marker).
- Existing full UNIQUE constraint on users.email preserved — sign-up during
  grace returns EmailAlreadyExists via PG 23505 (existing mapping).
  Post-anonymization (future job sprint), the deleted row's email becomes
  'deleted-{id}@deleted.local' (per-id unique), so the constraint still holds.

AuthEvent +4 variants
- EmailChangeRequested { userId, oldEmail, newEmail, token, expiresAt }
- EmailChanged          { userId, oldEmail, newEmail }
- AccountDeleted        { userId, email, token, expiresAt }
- AccountRestored       { userId }

AccountService +4 methods
- requestEmailChange({ userId, currentPassword?, newEmail }): hybrid pwd
  check (verify if credential account exists, skip if OAuth-only),
  cooldown 60s, writes token kind 'change-email' with identifier
  'change-email:{userId}:{base64url(newEmail)}', publishes
  EmailChangeRequested.
- confirmEmailChange({ token, currentSessionToken }): consume token,
  decode newEmail from identifier, capture oldEmail, UPDATE users SET
  email = newEmail, emailVerified = true. Revokes other sessions
  (currentSessionToken non-null) or all (null). Publishes EmailChanged.
- deleteAccount({ userId, currentPassword? }): hybrid pwd check, sole-
  owner-of-orgs guard (CannotDeleteWithOwnedOrgs { orgIds }), sets
  users.deletedAt = now, revokes all sessions, writes restore token kind
  'account-restore' (TTL = config.gracePeriod, default 30 days),
  publishes AccountDeleted with the token in payload.
- restoreAccount(token): consume restore token, clear users.deletedAt,
  publish AccountRestored. Idempotent on already-restored users.

Token helpers
- writeToken gains optional identifierOverride parameter.
- consumeToken returns { userId, identifier } so callers can decode extra
  segments. SP5 call sites updated (resetPassword, verifyEmail).
- IdentifierKind extended with 'change-email' | 'account-restore'.

Tagged errors (4 new)
- InvalidEmailChangeToken, InvalidAccountRestoreToken (1-shot tokens).
- CannotDeleteWithOwnedOrgs { orgIds: readonly number[] }.
- AccountUnrecoverable (placeholder for post-anonymize-job restore
  attempts; SP6 ships the class, the trigger fires after a future cron
  job nulls PII).

accountSubscribersLayer +3 handlers
- onEmailChangeRequested → EmailService.send to **newEmail** with
  /confirm-email-change?token=… URL.
- onEmailChanged + config.sendOldEmailNotificationOnChange=true →
  EmailService.send to **oldEmail** notifying of the change
  (anti-takeover signal). Default on.
- onAccountDeleted → EmailService.send to **email** with
  /restore-account?token=… URL (single mail per delete; user keeps the
  link for the full grace period).

GraphQL
- 4 new Relay mutations: requestEmailChange, confirmEmailChange,
  deleteAccount, restoreAccount.
- Output uniform { success: Boolean! }.
- AuthScopes: requestEmailChange + deleteAccount require auth: true;
  confirmEmailChange + restoreAccount are public (token-bearing).
- 4 new Pothos errors registered.

Config (AuthModuleConfig.account additions)
- changeEmailTtl?: Duration (default 24h).
- gracePeriod?:    Duration (default 30 days).
- sendOldEmailNotificationOnChange?: boolean (default true).

Removals
- /change-email and /delete-user already in disabledPaths since SP4.
- Dead `changeEmail` + `deleteUser` config blocks stripped from
  layers/better-auth/user.ts (placeholders for now-disabled paths).

BREAKING CHANGES
- better-auth REST endpoints /change-email and /delete-user cease to
  exist. Clients must call the GraphQL mutations.
- AuthEvent discriminated union widens by 4 variants; consumers narrow
  on _tag before reading payload-specific fields.
- AccountService.consumeToken now returns { userId, identifier } not
  just userId. Internal-only refactor — public surface unchanged.

Spec: docs/superpowers/specs/2026-05-25-sp6-account-lifecycle-design.md
Plan: docs/superpowers/plans/2026-05-25-sp6-account-lifecycle.md
EOF
)"
```

---

## Self-review (executed by writer, fixed inline)

- **Spec coverage**: every spec section maps to a task — schema (T1), constants/config (T2/T9), AuthEvent (T3), token helpers (T4), service methods + errors (T5), subscribers (T6), GraphQL (T7), drop better-auth (T8), commit (T10). ✓
- **Placeholder scan**: no "TODO", no "TBD". All code blocks present. Test counts spelled out per block. ✓
- **Type consistency**: `confirmEmailChange` shape `{ token, currentSessionToken }` used identically in T5 (impl), T5 (tests), T6 (subscriber tests), T7 (resolver). `IdentifierKind` extended identically. `consumeToken` return shape change documented and propagated to SP5 call sites in T4. ✓
- **Test count**: T0 baseline 164 + 16 (T5) + 3 (T6) + 3 (T10) = 186 expected post-SP6. Stated in T11 acceptance. ✓
- **Effect API drift**: uses `Effect.fn`, `Effect.fnUntraced`, `Effect.forkChild`, `Effect.forkDetach`, `Effect.flip`, `Effect.orElseSucceed`, `Effect.tryPromise`, `dbErr` wrapper — all verified to exist in the codebase post-SP5. ✓
