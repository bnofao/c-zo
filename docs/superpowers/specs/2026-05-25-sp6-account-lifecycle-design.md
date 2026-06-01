# SP6 — Account lifecycle (change-email + delete/restore-account) — Design

**Date:** 2026-05-25
**Status:** approved, ready for plan
**Source:** SP1–SP5 backlog item #3 (change-email flow) + #4 (self delete-user)

## Goal

Replace the last 2 better-auth account-self-service endpoints (`/change-email`, `/delete-user`) with native Effect services + GraphQL mutations. Add a complete account lifecycle: email change (with new-email verification), soft-delete with 30-day grace period, and self-restore via token. Reuse the SP5 token model (`verifications` table, sha256, `LIKE 'kind:%'` cross-kind guard) and SP5 service patterns (`Effect.fn`, subscribers, relay mutations) end-to-end.

## Background

After SP5, better-auth still owns 2 account endpoints:
- `/change-email` — request + verify email change
- `/delete-user` — self delete (also disabled in SP4 disabledPaths but no native replacement)

SP6 closes the loop. Once shipped, `@czo/auth` owns the full account lifecycle (sign-up → password reset → email verify → change password → change email → delete → restore). The only remaining better-auth account-side endpoints will be sign-in/sign-up (deferred — they pull in OAuth flows).

## Scope

In scope:
- 2 new GraphQL mutations for change-email (`requestEmailChange`, `confirmEmailChange`)
- 2 new GraphQL mutations for delete/restore (`deleteAccount`, `restoreAccount`)
- 1 additive schema migration (`users.deletedAt` nullable timestamp; existing full `UNIQUE` on `users.email` preserved)
- 4 new `AuthEvent` variants (`EmailChangeRequested`, `EmailChanged`, `AccountDeleted`, `AccountRestored`)
- 4 new `AccountService` methods + 5 new tagged errors
- 4 new subscribers in `accountSubscribersLayer`
- Strip dead `changeEmail` + `deleteUser` config blocks from `layers/better-auth/user.ts` (paths already disabled in SP4; callbacks were SP6 placeholders)

Out of scope:
- Anonymization job (T+30j PII nulling) — separate sprint with `purgeExpired` cron infra
- Admin hard-delete (separate)
- Admin-initiated email change (separate)
- Two-factor / OAuth changes
- Re-sign-up auto-restore (decision: refuse with `EmailAlreadyExists` during grace)

## Decisions log (brainstorm summary)

1. **change-email flow**: 2-step verify-via-NEW-email (better-auth default). Token sent to NEW email proves possession before commit.
2. **newEmail storage**: encoded in `verifications.identifier` as `change-email:{userId}:{base64url(newEmail)}`. Zero schema change on `verifications`. `LIKE 'change-email:%'` cross-kind guard still works.
3. **change-email password gate**: hybrid — verify `currentPassword` against `accounts(providerId='credential')` IF a credential account exists; skip otherwise. OAuth-only users proceed without password.
4. **change-email session policy**: `revokeAllForUserExcept(currentSessionToken)` at commit (mirrors SP5 `changePassword`). User stays signed in on the current device, other devices re-login.
5. **delete-user model**: soft delete (`users.deletedAt = now`). Anonymization deferred to future cron job (T+30j writes `'deleted-{id}@deleted.local'` + nulls name/image). SP6 only sets the marker.
6. **delete-user confirmation**: same hybrid pwd-if-credential policy as `requestEmailChange`.
7. **delete-user org-owner edge case**: refuse with `CannotDeleteWithOwnedOrgs { orgIds }` if user is sole owner of any organization. User must transfer ownership or delete the org first.
8. **email reuse during grace**: rely on the **existing full** `UNIQUE` constraint on `users.email`. The soft-deleted user keeps the original email row, so a new sign-up with the same email collides → `EmailAlreadyExists` (existing SP1 mapping of PG `23505`). User must use the restore link. Post-anonymization (future job), the deleted row's email is rewritten to `'deleted-{id}@deleted.local'` (per-id unique), freeing the original email for new sign-ups.
9. **restore-account flow**: token-based public mutation. At `deleteAccount` commit, a restore token is written (kind `account-restore`, TTL 30 days = grace period) and embedded in the deletion notification email. User clicks → `restoreAccount(token)` → `deletedAt = NULL`.

## Architecture

### Token kinds (2 new)

| kind | identifier format | TTL default | cooldown |
|---|---|---|---|
| `change-email` | `change-email:{userId}:{base64url(newEmail)}` | 24h (`AuthModuleConfig.account.changeEmailTtl`) | 60s |
| `account-restore` | `account-restore:{userId}` | 30 days (`AuthModuleConfig.account.gracePeriod`) | n/a (single token at delete-time) |

Cross-kind guard via `LIKE '{kind}:%'` in `consumeToken` works unchanged.

### Schema migration (additive)

```sql
ALTER TABLE users ADD COLUMN deleted_at timestamp(6) with time zone;
```

Single statement. The full `UNIQUE` constraint on `email` is intentionally kept (see decision #8). Future anonymization rewrites the deleted row's email to a per-id unique placeholder, preserving the constraint without conflict.

All FKs to `users.id` are already `ON DELETE CASCADE` (verified in `database/schema.ts`); soft-delete leaves them intact, which is what we want for restore.

### AuthEvent +4 variants

```ts
| {
    readonly _tag: 'EmailChangeRequested'
    readonly userId: number
    readonly oldEmail: string
    readonly newEmail: string
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
    /** Restore token (raw, for the deletion notification email body). */
    readonly token: string
    readonly expiresAt: Date
  }
| {
    readonly _tag: 'AccountRestored'
    readonly userId: number
  }
```

### `AccountService` contract extension (+4 methods)

```ts
requestEmailChange: (input: {
  readonly userId: number
  readonly currentPassword?: string
  readonly newEmail: string
}) => Effect.Effect<void, IncorrectCurrentPassword | AccountDbFailed>

confirmEmailChange: (input: {
  readonly token: string
  readonly currentSessionToken: string | null  // null = revoke all; non-null = revoke all except
}) => Effect.Effect<void, InvalidEmailChangeToken | AccountDbFailed | SessionStoreFailed>

deleteAccount: (input: {
  readonly userId: number
  readonly currentPassword?: string
}) => Effect.Effect<void, IncorrectCurrentPassword | CannotDeleteWithOwnedOrgs | AccountDbFailed | SessionStoreFailed>

restoreAccount: (token: string) =>
  Effect.Effect<void, InvalidAccountRestoreToken | AccountUnrecoverable | AccountDbFailed>
```

Implementation sketches:

**`requestEmailChange`**:
1. Look up target user by `userId`; if `deletedAt IS NOT NULL` → no-op (anti-information).
2. Look up `accounts({userId, providerId: 'credential'})`. If exists with `password` set → `passwords.verify(account.password, currentPassword)`; if false → `IncorrectCurrentPassword`. If no credential row → skip (OAuth-only).
3. `writeToken('change-email', userId, ttl, identifierOverride: 'change-email:{userId}:{base64url(newEmail)}')` — extend `writeToken` to accept an optional full-identifier override since the identifier carries data.
4. Publish `EmailChangeRequested { oldEmail: target.email, newEmail, ... }`.

**`confirmEmailChange`**:
1. `consumeToken('change-email', rawToken)` returns the full row's `identifier` (not just `userId`). Parse `userId` from `[1]` and `newEmail = atob(base64url([2]))`.
2. `db.update(users).set({ email: newEmail, emailVerified: true, updatedAt: now }).where(eq(id, userId))`. On PG `23505` (unique violation — someone signed up with that email between request and confirm) → `EmailChangeConflict` tagged error (new). Actually — simpler: surface as `InvalidEmailChangeToken` if we want anti-enum; or `AccountDbFailed` if we want signal. Decision: `AccountDbFailed { cause: { code: '23505' } }` — caller can introspect.
3. `sessions.revokeAllForUserExcept(userId, currentSessionToken)` if non-null; else `revokeAllForUser(userId)`.
4. Publish `EmailChanged { oldEmail: prev, newEmail }` (need to capture `prev` BEFORE the update — `SELECT … FOR UPDATE` or do a `findFirst` first).

**`deleteAccount`**:
1. Look up target user. If `deletedAt IS NOT NULL` → idempotent, no-op or `AccountAlreadyDeleted` (new error or silent — silent is simpler).
2. Same hybrid pwd check as above.
3. **Sole-owner check**: `db.select organizationId from members WHERE userId = ? AND role = 'owner'` → for each, count owners of that org. If any has count = 1 → collect those `orgIds` → `CannotDeleteWithOwnedOrgs { orgIds }`. (Per-org check needed because user can be owner of N orgs.)
4. `db.update(users).set({ deletedAt: now }).where(eq(id, userId))`.
5. `sessions.revokeAllForUser(userId)` (all devices, including current — user is now soft-deleted, can't sign in).
6. `writeToken('account-restore', userId, ttl: gracePeriod, identifier: 'account-restore:{userId}')`.
7. Publish `AccountDeleted { userId, email, token, expiresAt }`.

**`restoreAccount`**:
1. `consumeToken('account-restore', rawToken)` → returns `userId` or null.
2. If null → `InvalidAccountRestoreToken`.
3. Look up user. If `deletedAt IS NULL` → idempotent (already restored), publish `AccountRestored` and return.
4. **(Future)** If user is anonymized (`email LIKE 'deleted-%@deleted.local'`) → `AccountUnrecoverable`. SP6 ships the error class but the trigger only fires post-anonymize-job sprint.
5. `db.update(users).set({ deletedAt: null, updatedAt: now }).where(eq(id, userId))`.
6. Publish `AccountRestored { userId }`.

### Tagged errors (5 new)

```ts
export class InvalidEmailChangeToken extends Data.TaggedError('InvalidEmailChangeToken')<{}>() { … }
export class InvalidAccountRestoreToken extends Data.TaggedError('InvalidAccountRestoreToken')<{}>() { … }
export class CannotDeleteWithOwnedOrgs extends Data.TaggedError('CannotDeleteWithOwnedOrgs')<{
  readonly orgIds: readonly number[]
}> { … }
export class AccountUnrecoverable extends Data.TaggedError('AccountUnrecoverable')<{
  readonly userId: number
}> { … }
// IncorrectCurrentPassword reused from SP5.
```

### `accountSubscribersLayer` extension (+4 handlers)

```ts
const onEmailChangeRequested = Effect.fn('account.subscribers.email-change-requested')(
  function* (e: Extract<AuthEvent, { _tag: 'EmailChangeRequested' }>) {
    const config = yield* AccountConfig
    const email  = yield* EmailService
    const url    = `${config.baseUrl}/confirm-email-change?token=${e.token}`
    yield* email.send({
      to: e.newEmail,
      subject: 'Confirm your new email',
      html: `<p>Click to confirm: <a href="${url}">${url}</a></p><p>Expires ${e.expiresAt.toISOString()}</p>`,
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
    const email  = yield* EmailService
    const url    = `${config.baseUrl}/restore-account?token=${e.token}`
    yield* email.send({
      to: e.email,
      subject: 'Your account has been deleted',
      html: `<p>Your account is scheduled for deletion. You have until ${e.expiresAt.toISOString()} to restore it: <a href="${url}">${url}</a></p>`,
      text: `Restore: ${url}\nExpires ${e.expiresAt.toISOString()}`,
    })
  },
)

// onAccountRestored: log only (no email by default — restore is user-initiated, they know).
```

Handler dispatch in the existing `subscribersLayer` ternary gains 3 new branches (`EmailChangeRequested`, `EmailChanged`, `AccountDeleted`). `AccountRestored` is observability-only.

### GraphQL mutations (4 new)

All in `graphql/schema/account/mutations.ts` (extends SP5 file).

```ts
builder.relayMutationField('requestEmailChange',
  { inputFields: t => ({
      currentPassword: t.string({ required: false }),
      newEmail: t.string({ required: true, validate: z.email().transform(e => e.toLowerCase()) }),
  }) },
  {
    errors: { types: [IncorrectCurrentPassword] },
    authScopes: { auth: true },
    resolve: async (_root, { input }, ctx) => {
      const userId = Number(ctx.auth.user!.id)
      await ctx.runEffect(Effect.gen(function* () {
        yield* (yield* AccountService).requestEmailChange({
          userId,
          currentPassword: input.currentPassword ?? undefined,
          newEmail: input.newEmail,
        })
      }))
      return { success: true }
    },
  },
  { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
)

builder.relayMutationField('confirmEmailChange',
  { inputFields: t => ({ token: t.string({ required: true }) }) },
  {
    errors: { types: [InvalidEmailChangeToken] },
    resolve: async (_root, { input }, ctx) => {
      const currentSessionToken = ctx.auth.session?.token ?? null
      await ctx.runEffect(Effect.gen(function* () {
        yield* (yield* AccountService).confirmEmailChange({
          token: input.token,
          currentSessionToken,
        })
      }))
      return { success: true }
    },
  },
  { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
)

builder.relayMutationField('deleteAccount',
  { inputFields: t => ({ currentPassword: t.string({ required: false }) }) },
  {
    errors: { types: [IncorrectCurrentPassword, CannotDeleteWithOwnedOrgs] },
    authScopes: { auth: true },
    resolve: async (_root, { input }, ctx) => {
      const userId = Number(ctx.auth.user!.id)
      await ctx.runEffect(Effect.gen(function* () {
        yield* (yield* AccountService).deleteAccount({
          userId,
          currentPassword: input.currentPassword ?? undefined,
        })
      }))
      return { success: true }
    },
  },
  { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
)

builder.relayMutationField('restoreAccount',
  { inputFields: t => ({ token: t.string({ required: true }) }) },
  {
    errors: { types: [InvalidAccountRestoreToken, AccountUnrecoverable] },
    resolve: async (_root, { input }, ctx) => {
      await ctx.runEffect(Effect.gen(function* () {
        yield* (yield* AccountService).restoreAccount(input.token)
      }))
      return { success: true }
    },
  },
  { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
)
```

`registerAccountErrors` extends with the 4 new tagged errors registered as Pothos errors.

### `AuthModuleConfig` extension (additive)

```ts
account?: {
  passwordResetTtl?: Duration.Duration        // SP5
  emailVerificationTtl?: Duration.Duration    // SP5
  changeEmailTtl?: Duration.Duration          // SP6, default 24h
  gracePeriod?: Duration.Duration             // SP6, default 30 days (= restore token TTL)
  sendOldEmailNotificationOnChange?: boolean  // SP6, default true
}
```

New constants in `constants.ts`:

```ts
export const CHANGE_EMAIL_TTL = Duration.hours(24)
export const ACCOUNT_GRACE_PERIOD = Duration.days(30)
```

### Better-auth strip

In `layers/better-auth/index.ts`:
- No edit. Both `/change-email` and `/delete-user` are already in `disabledPaths` (SP4 account block, lines 107 and 109).

In `layers/better-auth/user.ts`:
- Strip the dead `changeEmail: { enabled, sendChangeEmailConfirmation }` block from `userConfig()` — placeholder callback that never fires since the path is disabled.
- Strip the dead `deleteUser: { enabled, sendDeleteAccountVerification, beforeDelete, afterDelete }` block for the same reason.
- Keep `modelName: 'users'` and the `fields` comment block.

### `users.email` SP1 sign-up handler

`signUpHandler` in `routes/auth/sign-up.ts` or `http/sign-up.ts` already maps PG `23505` (unique violation) to `EmailAlreadyExists`. The full `UNIQUE` constraint covers active AND soft-deleted rows, so sign-up during grace collides on the deleted user's row → same error → user sees "email already in use" (decision #8). No code change required.

## Token helpers extension

`writeToken(kind, userId, ttl)` currently builds `identifier = '${kind}:${userId}'`. For `change-email`, we need a richer identifier. Two options:

**A) Add optional `identifierOverride` parameter to `writeToken`**:
```ts
const writeToken = Effect.fnUntraced(function* (
  kind: IdentifierKind,
  userId: number,
  ttl: Duration.Duration,
  identifierOverride?: string,
) {
  const identifier = identifierOverride ?? `${kind}:${userId}`
  // ... rest unchanged
})
```
Caller for change-email: `writeToken('change-email', userId, ttl, `change-email:${userId}:${base64url(newEmail)}`)`.

**B) Add a separate `writeTokenWithIdentifier(identifier, ttl)` helper**.

Pick (A) — single helper, additive param, simpler.

Symmetric for `consumeToken(kind, raw)`: currently returns `userId` parsed from `identifier.split(':')[1]`. Extend to return `{ userId, identifier }` so caller can decode extra segments. Update SP5 callers to pull `userId` from the new shape (3 sites: `resetPassword`, `verifyEmail`, plus the new SP6 confirm). This is a contract change inside the closure — no public API impact.

## Tests (TDD ~16 new)

### `account.test.ts` extension

**requestEmailChange (5):**
1. happy → publishes `EmailChangeRequested` with `oldEmail` + `newEmail` + token
2. cooldown 60s (second call within 60s → no event)
3. OAuth-only (no credential account) → skips password check, succeeds
4. wrong currentPassword → `IncorrectCurrentPassword`
5. cross-kind: a `change-email` token cannot be consumed by `confirmEmailChange` of a different user (test the `identifier` parse rejects mismatched userId)

**confirmEmailChange (5):**
6. happy → users.email updated, emailVerified=true, other sessions revoked, current preserved, `EmailChanged` event with prev `oldEmail`
7. invalid token → `InvalidEmailChangeToken`
8. expired token → `InvalidEmailChangeToken`
9. already-consumed token → `InvalidEmailChangeToken` (one-shot)
10. when `currentSessionToken=null` → revokes ALL sessions

**deleteAccount (4):**
11. happy → users.deletedAt set, all sessions revoked, restore token written, `AccountDeleted` event with the token in payload
12. wrong pwd → `IncorrectCurrentPassword`
13. sole-owner of org → `CannotDeleteWithOwnedOrgs { orgIds: [orgId] }`, no deletedAt change
14. OAuth-only skip pwd → succeeds

**restoreAccount (2):**
15. happy → users.deletedAt=null, `AccountRestored` event
16. invalid/expired token → `InvalidAccountRestoreToken`

### Subscriber tests (3 new, in subscriber block)

17. `EmailChangeRequested` → mail to **newEmail** with URL `/confirm-email-change?token=…`
18. `EmailChanged` + `sendOldEmailNotificationOnChange=true` → mail to **oldEmail** "Your email was changed"
19. `AccountDeleted` → mail to **email** with URL `/restore-account?token=…`

### Schema test (1)

20. Partial unique index allows multiple `email='x@y'` rows when `deletedAt IS NOT NULL`; rejects multiple when `deletedAt IS NULL`. (Pure DB-level test using the Testcontainers layer.)

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Email race: user signs up `ada@x` between SP6 `requestEmailChange` and `confirmEmailChange` | At commit, `UPDATE users SET email=…` hits the full unique constraint → PG `23505` → `AccountDbFailed { cause }`. Caller can introspect. Acceptable: rare race, error path. |
| User loses restore email (only one sent at delete-time, no re-send) | Acceptable SP6 — admin can re-issue if needed. Future enhancement: `resendRestoreEmail` mutation gated on email-on-file ownership proof. |
| Sole-owner check race (org owner count changes between check and delete) | Wrap in a transaction. RR-isolation level keeps the count stable for the transaction. Drizzle `db.transaction` is available. |
| Soft-deleted user's `members` rows still appear in org member lists → "Deleted user" placeholder in UI | Frontend concern. Backend can filter `WHERE u.deletedAt IS NULL` in org member queries — add to `OrganizationService.listMembers` follow-up if needed. Out of SP6 scope. |
| Restore token leaks (30-day TTL is long) | Token is sha256-hashed in DB. Email is the only attack vector. Mitigation: rotate-on-restore (consume + delete), TTL bound, single-use (DELETE RETURNING). |
| `confirmEmailChange` with `currentSessionToken=null` revokes the user's own current session → user signed out from the device that confirmed | Intentional. The confirmation often happens from a fresh browser via the email link, where the user isn't signed in — `null` is normal and the user must sign in fresh after confirm. |
| Anonymization not shipped in SP6 → PII (email/name) lingers indefinitely for soft-deleted users until job sprint | Documented limitation. The grace period contract holds (restore works). GDPR exposure is bounded by the future job's delivery date. |
| `EmailChanged` notification email to oldEmail could be leveraged for harassment (changing email then triggering notif to victim) | The user needs `requestEmailChange` access — which requires being signed in as the original user. Not a public surface. Acceptable. |

## File layout

**Modified:**
- `packages/modules/auth/src/database/schema.ts` — add `deletedAt` column on `users` (single nullable timestamp)
- `packages/modules/auth/migrations/<timestamp>_users_deleted_at_partial_unique.sql` — generated migration
- `packages/modules/auth/src/services/account.ts` — extend `AccountService` contract + impl + subscribers, extend `writeToken`/`consumeToken` helpers, add 4 errors
- `packages/modules/auth/src/services/account.test.ts` — +16 service tests + 3 subscriber tests
- `packages/modules/auth/src/services/events/auth.ts` — widen `AuthEvent` by 4 variants
- `packages/modules/auth/src/constants.ts` — `CHANGE_EMAIL_TTL`, `ACCOUNT_GRACE_PERIOD`
- `packages/modules/auth/src/module.ts` — extend `AuthModuleConfig.account` interface + `AccountConfigLive` build
- `packages/modules/auth/src/graphql/schema/account/mutations.ts` — +4 relay mutations
- `packages/modules/auth/src/graphql/schema/account/errors.ts` — +4 `registerError` calls
- `packages/modules/auth/src/layers/better-auth/user.ts` — strip dead `changeEmail` + `deleteUser` config blocks from `userConfig()`

**Unchanged:** all sign-in / sign-up handlers, `OrganizationService` (sole-owner check is read-only), `UserService`.

## Execution order (suggested for plan)

1. **Task 0**: baseline capture (TS error count, test count, HEAD).
2. **Task 1**: schema migration (`deletedAt` column only).
3. **Task 2**: constants + `AuthModuleConfig.account` extension.
4. **Task 3**: `AuthEvent` widening (+4 variants).
5. **Task 4**: `writeToken` / `consumeToken` helper extension (identifierOverride + return shape change). Refactor 3 SP5 call sites.
6. **Task 5**: `AccountService` 4 new methods + 4 new errors (TDD, ~16 service tests).
7. **Task 6**: subscribers extension (+3 handlers, TDD ~3 subscriber tests).
8. **Task 7**: GraphQL mutations + errors (4 new).
9. **Task 8**: strip dead `changeEmail` + `deleteUser` config stubs from `layers/better-auth/user.ts`.
10. **Task 9**: module wiring (config defaults from constants).
11. **Task 10**: final review + user-approved commit.

Aim: keep `check-types` ≤ baseline (28 post-SP-C) and all tests passing after every task.

## Pointers to prior work

- Token CRUD pattern: `packages/modules/auth/src/services/account.ts` (SP5 — `writeToken`/`consumeToken`)
- Subscribers pattern: `account.ts` `subscribersLayer` (SP5) + `session.ts` `subscribersLayer` (SP4)
- GraphQL relay mutation pattern: `graphql/schema/account/mutations.ts` (SP5 — 5 mutations)
- Better-auth path disable: `layers/better-auth/index.ts` `disabledPaths` (SP3/4/5)
- AuthModuleConfig extension: `module.ts` (SP4b impersonation, SP5 account)
- Tagged error → Pothos error: `graphql/schema/account/errors.ts` (SP5 `registerError` calls)
- Effect Schema in tests / validators: `services/utils/password-schema.ts` (SP5)
