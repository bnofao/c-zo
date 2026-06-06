# Auth hardening — B11 + B13 + B14 (design)

**Date:** 2026-06-06
**Branch:** `feat/b11-b13-b14-auth-hardening`
**Backlog:** B11 (`NoCredentialAccount` error), B13 (anti-enumeration timing), B14 (Bearer token rotation header). Three independent low-priority auth-robustness items, bundled into one PR (B11+B13 share `account.ts`; B14 adds a small kit seam + touches `session-context.ts`).

## Why these don't conflict

B11 surfaces credential-account status on **authenticated self-service** mutations (the caller already knows their own account). B13 hardens **unauthenticated email-enumeration** vectors. Different threat surfaces — no tension.

---

## B11 — `NoCredentialAccount` tagged error (changePassword only)

### Problem
`AccountService.changePassword` fails with `UserNotFound` when the user has no `accounts(providerId='credential')` row (an OAuth-only user). The user *exists* — `UserNotFound` is misleading, and the frontend can't show a dedicated "you signed up with a social provider, set a password first" message.

### Decision & scope
**`changePassword` only.** `requestEmailChange` and `deleteAccount` use `verifyCredentialPasswordIfPresent`, which correctly *skips* the password check for OAuth-only users so they can still change email / delete their account. Raising an error there would **block** those users from legitimate operations — so they are intentionally left unchanged.

### Change
- New tagged error in `services/account.ts`, beside the other account errors:
  ```ts
  export class NoCredentialAccount extends Data.TaggedError('NoCredentialAccount')<{ readonly userId: number }> {
    readonly code = 'NO_CREDENTIAL_ACCOUNT'
    get message() { return 'User has no credential account (password-based sign-in is unavailable)' }
  }
  ```
- In `changePassword` (the `acctRows[0]` empty branch): replace `Effect.fail(new UserNotFound())` with `Effect.fail(new NoCredentialAccount({ userId: input.userId }))`. Update the method's declared error type from `UserNotFound | …` to `NoCredentialAccount | …` (`UserNotFound` is no longer reachable from `changePassword`).
- GraphQL: register the error in `graphql/schema/account/errors.ts` (`registerError(builder, NoCredentialAccount, { name: 'NoCredentialAccountError' })`); in `graphql/schema/account/mutations.ts` change the `changePassword` `errors.types` from `[UserNotFound, IncorrectCurrentPassword, PasswordHashFailed]` to `[NoCredentialAccount, IncorrectCurrentPassword, PasswordHashFailed]`.

### Tests
- Integration: an OAuth-only user (no credential account) calling `changePassword` → fails `NoCredentialAccount` (was `UserNotFound`). A credential user with a wrong current password still → `IncorrectCurrentPassword` (unchanged).

---

## B13 — Constant-time response on the `request*` flows

### Problem
`requestPasswordReset(email)`, `requestEmailVerification(userId)`, `requestEmailChange({…})` return faster when the target doesn't exist (a single lookup) than when it does (lookup + token insert; the email publish is already `forkDetach`'d, so it's off the response path). The ~one-query delta lets an attacker probe account existence by timing.

### Decision & mechanism
**Constant-time pad to a configurable budget.** A reusable helper pads every branch (success *and* failure) up to a fixed wall-clock budget before returning, so existence is not inferable from latency.

- New helper in `services/account.ts` (module-private):
  ```ts
  // Pad an effect to a fixed wall-clock budget so its latency carries no signal
  // about which branch ran (anti-enumeration). Uses Clock so timing is testable.
  const constantTime = <A, E, R>(budget: Duration.Duration, self: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const start = yield* Clock.currentTimeMillis
      const exit = yield* Effect.exit(self)
      const elapsed = (yield* Clock.currentTimeMillis) - start
      const remaining = Duration.toMillis(budget) - elapsed
      if (remaining > 0)
        yield* Effect.sleep(Duration.millis(remaining))
      return yield* exit
    })
  ```
- Wrap the three flows' bodies with `constantTime(config.enumTimingBudget, …)`. (Keep the existing `Effect.fn` span wrappers on the outside so traces still name the operation.)

### Config (new tunable → `authConfig`, per project convention)
- `index.ts` `authConfig` Effect.gen block: `const enumTimingBudgetMs = yield* Config.int('AUTH_ENUM_TIMING_BUDGET_MS').pipe(Config.withDefault(250))`; thread `enumTimingBudget: Duration.millis(cfg.enumTimingBudgetMs)` into `makeAccountConfigLayer({ … })`.
- `AccountConfig` gains `readonly enumTimingBudget: Duration.Duration`; `makeAccountConfigLayer` gains an optional `enumTimingBudget?` with a default const `ENUM_TIMING_BUDGET = Duration.millis(250)`.

### Tests
- Use `@effect/vitest`'s `TestClock`: a `requestPasswordReset` for a non-existent email and for an existing user both advance to the same budget (assert the padding fires; no real wall-clock wait). Since the flows use `Clock`/`Effect.sleep`, `TestClock.adjust` drives them deterministically — verify the effect does not complete before the budget and completes at it.

---

## B14 — Rotated-token response header for Bearer clients

### Problem
On impersonation walk-up, `resolve` returns a session whose `token` differs from the incoming one. `graphql/session-context.ts` propagates it via `ctx.setCookie` only. A pure-Bearer client (API/mobile, no cookie jar) ignores Set-Cookie and keeps presenting the stale child token.

### Decision
Emit the rotated token in an `X-Session-Token` response header **only when the incoming token came from the `Authorization: Bearer` header** (cookie clients already get Set-Cookie; don't expose the token in a header for them). This needs a generic response-header seam in kit (today kit only exposes `setCookie`).

### Change
1. **kit — add a `setHeader` seam** (mirrors the existing `setCookie`/`pendingCookies` wiring in `packages/kit/src/module/app.ts`):
   - In the Yoga `context` factory: a `pendingHeaders: Array<[string, string]>` and a `setHeader = (name, value) => { pendingHeaders.push([name, value]) }`, assigned onto `initialContext` and returned on the per-request context (next to `setCookie`).
   - In the response hook that appends queued `set-cookie` values, also `response.headers.append(name, value)` for each queued header.
   - `packages/kit/src/graphql/builder.ts`: add `readonly setHeader: (name: string, value: string) => void` to `GraphQLContextMap` (beside `setCookie`). Type the Yoga generics' context shape to carry `pendingHeaders?` alongside `pendingCookies?`.
2. **auth — use it on rotation** (`graphql/session-context.ts`):
   - Track the source: `const fromHeader = session.readBearerToken(ctx.request?.headers.get('authorization'))`; `const token = fromHeader ?? session.readSessionToken(cookie)`.
   - On rotation (`resolved.session.token !== token`): keep `ctx.setCookie(…)`; additionally, if `fromHeader != null && ctx.setHeader`, `ctx.setHeader('X-Session-Token', resolved.session.token)`. Update the file's doc comment (the current note says the Bearer client "ignores the Set-Cookie, but queueing it is harmless" — replace with the new behavior).

### Tests
- kit: a small test that a contributor calling `ctx.setHeader('X-Session-Token', 'v')` results in the value on the outgoing response headers (mirror the existing setCookie test, if any; otherwise an `assembleApp`/yoga-fetch assertion).
- auth e2e: drive an impersonation child to expiry so a walk-up occurs, send the request with `Authorization: Bearer <childToken>`, and assert the response carries `X-Session-Token: <parentToken>` (and that a cookie-sourced request does **not** get the header). If reproducing the walk-up in e2e is heavy, fall back to a `session-context` unit test that injects a `resolve` returning a rotated token and asserts `setHeader` is called iff the source was Bearer.

---

## Out of scope
- B11 broadening to `requestEmailChange`/`deleteAccount` (would block OAuth-only users).
- B13 per-mutation rate limiting (covered by B12, already shipped) — this is purely timing-channel normalization.
- B14 client-side re-adoption docs (frontend/SDK concern, not this module).

## Files touched
- `packages/modules/auth/src/services/account.ts` — `NoCredentialAccount`, `constantTime`, wrap 3 flows, `changePassword` error, `AccountConfig.enumTimingBudget`.
- `packages/modules/auth/src/index.ts` — `AUTH_ENUM_TIMING_BUDGET_MS` config thread.
- `packages/modules/auth/src/graphql/schema/account/{errors,mutations}.ts` — register + union swap.
- `packages/kit/src/module/app.ts`, `packages/kit/src/graphql/builder.ts` — `setHeader` seam.
- `packages/modules/auth/src/graphql/session-context.ts` — Bearer-sourced rotation header.
- Tests: `account` integration (B11 + B13 via TestClock), kit `setHeader` test, `session-context` unit (B14).

## Verification
- `pnpm --filter @czo/auth check-types|lint|test`, `pnpm --filter @czo/kit check-types|lint|test`.
- B13 via `TestClock` (no real waits). B11 via integration. B14 via unit (+ e2e if cheap).
