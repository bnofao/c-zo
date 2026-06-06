# Auth Hardening (B11 + B13 + B14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three independent auth-robustness items — B11 (`NoCredentialAccount` error on `changePassword`), B13 (constant-time response on the account-enumeration flows), B14 (rotated-token response header for Bearer clients).

**Architecture:** B11 swaps a misleading `UserNotFound` for a dedicated tagged error on one mutation. B13 adds a module-private `constantTime` helper (`Clock`/`Effect.sleep`, `TestClock`-driven) wrapping the three `request*` flows, with the budget threaded through `authConfig`. B14 adds a generic `setHeader` seam to kit's Yoga context (mirroring the existing `setCookie`), then has the session-context contributor emit `X-Session-Token` on rotation when the token came from `Authorization: Bearer`.

**Tech Stack:** Effect 4 (`Data.TaggedError`, `Clock`, `Effect.sleep`, `TestClock`, `Config`, `Duration`), Pothos errors plugin, `@effect/vitest`, Testcontainers Postgres.

**Spec:** `docs/superpowers/specs/2026-06-06-b11-b13-b14-auth-hardening-design.md`

> **Commit policy (project rule, overrides "frequent commits"):** Do NOT `git commit` autonomously. Each task's final step **stages** with `git add`. A single commit happens at the end (Task 7) only after the user reviews. Branch: `feat/b11-b13-b14-auth-hardening` (create it before Task 1 if not already on it).

---

## File Structure

- `packages/modules/auth/src/services/account.ts` — add `NoCredentialAccount`; `changePassword` fails it instead of `UserNotFound`; add `enumTimingBudget` to `AccountConfig`/`makeAccountConfigLayer`; wrap the 3 flows with `constantTime`.
- `packages/modules/auth/src/services/utils/constant-time.ts` (NEW) — the `constantTime` helper (single responsibility, unit-tested).
- `packages/modules/auth/src/services/utils/constant-time.test.ts` (NEW) — `TestClock` unit tests.
- `packages/modules/auth/src/constants.ts` — `ENUM_TIMING_BUDGET` default.
- `packages/modules/auth/src/index.ts` — thread `AUTH_ENUM_TIMING_BUDGET_MS`.
- `packages/modules/auth/src/graphql/schema/account/{errors,mutations}.ts` — register + union swap.
- `packages/modules/auth/src/services/account.integration.test.ts` (or the existing account test file) — B11 integration test.
- `packages/kit/src/module/app.ts`, `packages/kit/src/graphql/builder.ts` — `setHeader` seam.
- `packages/modules/auth/src/graphql/session-context.ts` — Bearer-sourced rotation header.
- `packages/modules/auth/src/graphql/session-context.test.ts` — B14 unit test (stubbed SessionService).

---

## Task 1: B11 — `NoCredentialAccount` (service layer)

**Files:** Modify `packages/modules/auth/src/services/account.ts`. Test in the account integration test file (find it: `ls packages/modules/auth/src/services/account*.test.ts`; if none, the soft-delete integration test composes the same layers — create `account-changepassword.integration.test.ts` mirroring `soft-delete.integration.test.ts`'s layer setup).

- [ ] **Step 1: Write the failing integration test**

In a `*.integration.test.ts` that boots the AccountService over `AuthPostgresLayer` (mirror `soft-delete.integration.test.ts` — same `TestLayer`, `seedUser`, and a `seedCredentialAccount` helper). Add:

```ts
it.effect('changePassword on an OAuth-only user (no credential account) → NoCredentialAccount', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const u = yield* seedUser({ email: 'oauth-only@x.com' }) // NO seedCredentialAccount
    const account = yield* Account.AccountService
    const session = yield* Session.SessionService
    const { token } = yield* session.create({ userId: u.id, actorType: 'user' })

    const err = yield* account.changePassword({
      userId: u.id,
      currentSessionToken: token,
      currentPassword: 'whatever',
      newPassword: 'New-Passw0rd!',
    }).pipe(Effect.flip)

    expect(err._tag).toBe('NoCredentialAccount')
  }))
```

- [ ] **Step 2: Run, confirm it fails**

Run: `pnpm --filter @czo/auth test <that test file> -t "NoCredentialAccount"`
Expected: FAIL — currently the no-credential branch fails `UserNotFound`, so `err._tag` is `'UserNotFound'` (or `NoCredentialAccount` is undefined).

- [ ] **Step 3: Add the tagged error**

In `account.ts`, beside the other account errors (after `AccountUnrecoverable`, ~line 64-70), add:

```ts
export class NoCredentialAccount extends Data.TaggedError('NoCredentialAccount')<{
  readonly userId: number
}> {
  readonly code = 'NO_CREDENTIAL_ACCOUNT'
  get message() { return 'User has no credential account (password-based sign-in is unavailable)' }
}
```

- [ ] **Step 4: Swap the failure in `changePassword`**

In `account.ts`, in `changePassword`, change the no-credential branch (currently `if (!acct || !acct.password) return yield* Effect.fail(new UserNotFound())`) to:

```ts
      if (!acct || !acct.password)
        return yield* Effect.fail(new NoCredentialAccount({ userId: input.userId }))
```

Update the `changePassword` declared return type in the service interface (currently `Effect.Effect<void, UserNotFound | IncorrectCurrentPassword | PasswordHashFailed | AccountDbFailed | SessionStoreFailed>`) to replace `UserNotFound` with `NoCredentialAccount`:

```ts
    }) => Effect.Effect<void, NoCredentialAccount | IncorrectCurrentPassword | PasswordHashFailed | AccountDbFailed | SessionStoreFailed>
```

- [ ] **Step 5: Remove the now-unused `UserNotFound` import (if unused)**

`UserNotFound` was only used by `changePassword` in this file. Confirm: `grep -n "UserNotFound" packages/modules/auth/src/services/account.ts` → should now show only the import line. If so, change `import { UserNotFound, UserService } from './user'` to `import { UserService } from './user'`. If `grep` shows other live uses, leave the import.

- [ ] **Step 6: Run the test, confirm pass**

Run: `pnpm --filter @czo/auth test <that test file> -t "NoCredentialAccount"`
Expected: PASS. Also run the whole file to confirm no regression.

- [ ] **Step 7: Type-check + lint + stage**

Run: `pnpm --filter @czo/auth check-types && pnpm --filter @czo/auth lint --fix`
```bash
git add packages/modules/auth/src/services/account.ts packages/modules/auth/src/services/<test file>
```

---

## Task 2: B11 — GraphQL wiring

**Files:** Modify `packages/modules/auth/src/graphql/schema/account/errors.ts`, `packages/modules/auth/src/graphql/schema/account/mutations.ts`.

- [ ] **Step 1: Register the error**

In `errors.ts`: import `NoCredentialAccount` from `../../../services/account` (match the existing import style in that file), and inside the register function add:

```ts
  registerError(builder, NoCredentialAccount, { name: 'NoCredentialAccountError' })
```

- [ ] **Step 2: Swap the mutation error union**

In `mutations.ts`, the `changePassword` mutation currently has `errors: { types: [UserNotFound, IncorrectCurrentPassword, PasswordHashFailed] }`. Change it to:

```ts
      errors: { types: [NoCredentialAccount, IncorrectCurrentPassword, PasswordHashFailed] },
```

Update imports: add `NoCredentialAccount` to the `from '../../../services/account'` import group (or create it if account errors are imported elsewhere — check the file's existing imports). Then check whether `UserNotFound` is still used by any OTHER mutation in `mutations.ts`: `grep -n "UserNotFound" packages/modules/auth/src/graphql/schema/account/mutations.ts`. If `changePassword` was its only use, remove `UserNotFound` from `import { PasswordHashFailed, UserNotFound } from '../../../services/user'` → `import { PasswordHashFailed } from '../../../services/user'`.

- [ ] **Step 3: Type-check (schema builds with the new error in the union)**

Run: `pnpm --filter @czo/auth check-types`
Expected: clean. (Pothos errors plugin resolves the union from `errors.types`; no `.graphql` codegen is involved for these code-first mutations — but if the module has a `pnpm generate` step that snapshots the SDL, run it: `cd packages/modules/auth && pnpm generate` and stage any regenerated file. Check `package.json` for a `generate` script first; skip if absent.)

- [ ] **Step 4: Lint + stage**

Run: `pnpm --filter @czo/auth lint --fix`
```bash
git add packages/modules/auth/src/graphql/schema/account/errors.ts packages/modules/auth/src/graphql/schema/account/mutations.ts
```

---

## Task 3: B13 — `constantTime` helper + config plumbing

**Files:** Create `packages/modules/auth/src/services/utils/constant-time.ts` + `…/constant-time.test.ts`; modify `constants.ts`, `services/account.ts` (AccountConfig only), `index.ts`.

- [ ] **Step 1: Write the failing helper test**

Create `packages/modules/auth/src/services/utils/constant-time.test.ts`:

```ts
import { expect, it } from '@effect/vitest'
import { Duration, Effect, Exit, Fiber, Option } from 'effect'
import { constantTime } from './constant-time'
import { TestClock } from 'effect/testing' // adjust import path to this Effect build if needed

it.effect('pads a fast success up to the budget', () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.fork(constantTime(Duration.millis(250), Effect.succeed('ok')))
    yield* TestClock.adjust(Duration.millis(249))
    const before = yield* Fiber.poll(fiber)
    expect(Option.isNone(before)).toBe(true) // not done one ms before the budget
    yield* TestClock.adjust(Duration.millis(1))
    expect(yield* Fiber.join(fiber)).toBe('ok')
  }))

it.effect('pads a failure up to the budget and preserves the error', () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.fork(
      constantTime(Duration.millis(100), Effect.fail('boom' as const)).pipe(Effect.exit),
    )
    yield* TestClock.adjust(Duration.millis(100))
    const exit = yield* Fiber.join(fiber)
    expect(Exit.isFailure(exit)).toBe(true)
  }))
```

> Note: the exact `TestClock` / `Fiber.poll` import paths and signatures vary across Effect 4 beta. If `effect/testing` or `Fiber.poll` don't resolve, find the correct path (`grep -rn "TestClock" node_modules/.pnpm/effect@*/node_modules/effect/dist/dts | head` and check `Fiber`'s dts). The INTENT is fixed: the effect must NOT complete before `budget` elapses on the test clock and MUST complete at `budget`, for both success and failure. Adapt the API, not the intent.

- [ ] **Step 2: Run, confirm it fails**

Run: `pnpm --filter @czo/auth test src/services/utils/constant-time.test.ts`
Expected: FAIL — `./constant-time` missing.

- [ ] **Step 3: Implement the helper**

Create `packages/modules/auth/src/services/utils/constant-time.ts`:

```ts
import { Clock, Duration, Effect } from 'effect'

/**
 * Pad an effect to a fixed wall-clock budget so its latency carries no signal
 * about which internal branch ran — defends the account-existence enumeration
 * vectors (`requestPasswordReset` / `requestEmailVerification` /
 * `requestEmailChange`). The effect runs to completion (success OR failure);
 * we then sleep the remainder of the budget before surfacing the result.
 * `Clock` + `Effect.sleep` make the timing `TestClock`-driven and deterministic.
 */
export const constantTime = <A, E, R>(
  budget: Duration.Duration,
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
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

- [ ] **Step 4: Run, confirm pass**

Run: `pnpm --filter @czo/auth test src/services/utils/constant-time.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the budget default to `constants.ts`**

In `packages/modules/auth/src/constants.ts`, after `ACCOUNT_GRACE_PERIOD`, add:

```ts
/**
 * Constant-time budget for the account-enumeration flows (`requestPasswordReset`
 * etc.). Each flow pads its response up to this budget so account existence is
 * not inferable from latency. Override via `AUTH_ENUM_TIMING_BUDGET_MS`.
 */
export const ENUM_TIMING_BUDGET: Duration.Duration = Duration.millis(250)
```

- [ ] **Step 6: Add `enumTimingBudget` to `AccountConfig` + `makeAccountConfigLayer`**

In `account.ts`:
- Add to the `AccountConfig` service shape (the `Context.Service<AccountConfig, { … }>` interface, ~line 73-87): `readonly enumTimingBudget: Duration.Duration`.
- Add to `makeAccountConfigLayer`'s `input` param: `enumTimingBudget?: Duration.Duration`.
- In the returned `Layer.succeed(AccountConfig, { … })`: `enumTimingBudget: input.enumTimingBudget ?? ENUM_TIMING_BUDGET,`.
- Add `ENUM_TIMING_BUDGET` to the `../constants` import line.

- [ ] **Step 7: Thread the env config in `index.ts`**

In `packages/modules/auth/src/index.ts`, in the `authConfig` `Effect.gen` block (next to the other `Config.*` reads), add:

```ts
    const enumTimingBudgetMs = yield* Config.int('AUTH_ENUM_TIMING_BUDGET_MS').pipe(Config.withDefault(250))
```

Add `enumTimingBudgetMs` to the object `authConfig` returns. Then in the `AccountConfigLive = Account.makeAccountConfigLayer({ … })` call (~line 149), add:

```ts
      enumTimingBudget: Duration.millis(cfg.enumTimingBudgetMs),
```

Ensure `Duration` is imported in `index.ts` (it imports from `effect`; add `Duration` to that named import if absent).

- [ ] **Step 8: Type-check + lint + stage**

Run: `pnpm --filter @czo/auth check-types && pnpm --filter @czo/auth lint --fix`
```bash
git add packages/modules/auth/src/services/utils/constant-time.ts packages/modules/auth/src/services/utils/constant-time.test.ts packages/modules/auth/src/constants.ts packages/modules/auth/src/services/account.ts packages/modules/auth/src/index.ts
```

---

## Task 4: B13 — wrap the three `request*` flows

**Files:** Modify `packages/modules/auth/src/services/account.ts`.

- [ ] **Step 1: Import the helper**

Add to `account.ts` imports: `import { constantTime } from './utils/constant-time'`.

- [ ] **Step 2: Wrap `requestPasswordReset`**

Replace the body so the work runs inside `constantTime(config.enumTimingBudget, …)`:

```ts
    const requestPasswordReset = Effect.fn('account.requestPasswordReset')(function* (email: string) {
      yield* constantTime(config.enumTimingBudget, Effect.gen(function* () {
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
      }))
    })
```

- [ ] **Step 3: Wrap `requestEmailVerification`**

```ts
    const requestEmailVerification = Effect.fn('account.requestEmailVerification')(function* (userId: number) {
      yield* constantTime(config.enumTimingBudget, Effect.gen(function* () {
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
      }))
    })
```

- [ ] **Step 4: Wrap `requestEmailChange`**

Wrap the existing `requestEmailChange` body (lines ~407-440) the same way: keep the `Effect.fn('account.requestEmailChange')(function* (input) { … })` wrapper, and move its entire current body inside `yield* constantTime(config.enumTimingBudget, Effect.gen(function* () { …existing body… }))`. Preserve every existing statement and any failure (`IncorrectCurrentPassword` etc.) — `constantTime` pads failures too, so the error still surfaces after the budget. Do not change the logic; only wrap it.

- [ ] **Step 5: Keep the existing account tests fast — set the test budget to 0**

The flows now pad by up to 250 ms each. In the account integration test layer(s) that exercise these flows (e.g. `soft-delete.integration.test.ts` and any account test using `makeAccountConfigLayer`), pass `enumTimingBudget: Duration.zero` to `makeAccountConfigLayer({ … })` so behavior tests don't wait. (Find call sites: `grep -rn "makeAccountConfigLayer" packages/modules/auth/src --include="*.test.ts"`. Add `enumTimingBudget: Duration.zero` to each.) The padding logic itself is covered by Task 3's `TestClock` unit test, so disabling the budget in integration tests loses no coverage.

- [ ] **Step 6: Run the affected account tests**

Run: `pnpm --filter @czo/auth test src/services/` (account + soft-delete integration).
Expected: all pass, no slowdown (budget 0 in tests).

- [ ] **Step 7: Type-check + lint + stage**

Run: `pnpm --filter @czo/auth check-types && pnpm --filter @czo/auth lint --fix`
```bash
git add packages/modules/auth/src/services/account.ts packages/modules/auth/src/services/soft-delete.integration.test.ts
# plus any other test file whose makeAccountConfigLayer call you edited
```

---

## Task 5: B14 — `setHeader` seam in kit

**Files:** Modify `packages/kit/src/module/app.ts`, `packages/kit/src/graphql/builder.ts`.

- [ ] **Step 1: Add `setHeader` to the `GraphQLContextMap` type**

In `packages/kit/src/graphql/builder.ts`, find the `setCookie` field on `GraphQLContextMap` (a `readonly setCookie: (serialized: string) => void`) and add directly after it:

```ts
  /**
   * Queue an arbitrary response header (e.g. `X-Session-Token` on session
   * rotation for Bearer clients). Mirrors `setCookie`; the kit Yoga `onResponse`
   * hook flushes queued headers onto the outgoing response.
   */
  readonly setHeader: (name: string, value: string) => void
```

- [ ] **Step 2: Wire `pendingHeaders` + `setHeader` into the Yoga context (app.ts)**

In `packages/kit/src/module/app.ts`, the `createYoga<{ pendingCookies?: string[] }, GraphQLContextMap>({ … })` call:

1. Extend the server-context generic to also carry pending headers:
```ts
    const yoga = options.graphQLApp?.(gqlSchema) ?? createYoga<{ pendingCookies?: string[], pendingHeaders?: Array<[string, string]> }, GraphQLContextMap>({
```
2. In the `context` factory, alongside the existing `pendingCookies`/`setCookie` block, add:
```ts
        const pendingHeaders = initialContext.pendingHeaders ?? []
        const setHeader = (name: string, value: string): void => {
          pendingHeaders.push([name, value])
        }
```
   and include both in the `Object.assign(initialContext, { setCookie, setHeader })` and the returned context `return { ...userCtx, runEffect, setCookie, setHeader, clientIp }`.
3. In the `onResponse` plugin, after the cookie-append loop, add the header-append loop:
```ts
            const pendingHeaders = (serverContext as { pendingHeaders?: Array<[string, string]> })?.pendingHeaders ?? []
            for (const [name, value] of pendingHeaders)
              response.headers.append(name, value)
```

- [ ] **Step 3: Type-check kit**

Run: `pnpm --filter @czo/kit check-types`
Expected: clean. (If any other production caller constructs a `GraphQLContextMap`-shaped object literal and now lacks `setHeader`, the compiler will point it out — add `setHeader` there the same way `setCookie` is provided. The `bootTestApp` path builds context via the same `assembleApp`/Yoga factory, so it inherits `setHeader` automatically.)

- [ ] **Step 4: Confirm kit tests + build still green**

Run: `pnpm --filter @czo/kit test && pnpm --filter @czo/kit lint && pnpm --filter @czo/kit build`
Expected: pass (the seam mirrors `setCookie`; no behavior change unless a caller uses it). The `build` refreshes the dist that auth e2e resolves.

> Coverage note: the kit `setHeader` wiring is a faithful mirror of the already-production-proven `setCookie` path (no dedicated kit HTTP test added — a standalone one would require rebuilding the Yoga app outside a module). Its real exercise is Task 6's session-context test, which drives the contributor that calls `setHeader`. State this explicitly; do not silently skip coverage.

- [ ] **Step 5: Stage**

```bash
git add packages/kit/src/graphql/builder.ts packages/kit/src/module/app.ts
```

---

## Task 6: B14 — emit `X-Session-Token` on Bearer-sourced rotation

**Files:** Modify `packages/modules/auth/src/graphql/session-context.ts`, `packages/modules/auth/src/graphql/session-context.test.ts`.

- [ ] **Step 1: Write the failing unit test (stubbed SessionService)**

Append to `packages/modules/auth/src/graphql/session-context.test.ts` a block that does NOT use the Postgres layer — it provides a stub `SessionService` whose `resolve` returns a rotated token, and asserts the contributor's header behavior. Add the imports `import { Effect as E, Layer as L } from 'effect'` are already present as `Effect`/`Layer`; reuse them.

```ts
// ── B14: rotated-token response header for Bearer clients ──────────────────
function stubSession(rotatedTo: string) {
  return Layer.succeed(Session.SessionService, {
    // Only the members the contributor touches need real behavior.
    readBearerToken: (h?: string | null) =>
      h?.toLowerCase().startsWith('bearer ') ? h.slice(7) : null,
    readSessionToken: (cookie: string) => {
      const m = /czo\.session=([^;]+)/.exec(cookie)
      return m ? m[1] : null
    },
    resolve: (_token: string) =>
      Effect.succeed({ session: { token: rotatedTo, impersonatedBy: null }, user: { id: 1 } }),
    setCookie: (token: string) => ({ serialize: () => `czo.session=${token}` }),
  } as unknown as Session.SessionService['Service'])
}

it.effect('Bearer-sourced rotation sets X-Session-Token AND the cookie', () =>
  Effect.gen(function* () {
    const headers: Array<[string, string]> = []
    const cookies: string[] = []
    yield* contribute({
      request: new Request('http://x', { headers: { authorization: 'Bearer child-token' } }),
      setCookie: (s: string) => { cookies.push(s) },
      setHeader: (n: string, v: string) => { headers.push([n, v]) },
    }).pipe(Effect.provide(stubSession('parent-token')))
    expect(headers).toContainEqual(['X-Session-Token', 'parent-token'])
    expect(cookies.length).toBe(1)
  }).pipe(Effect.provide(stubSession('parent-token'))))

it.effect('cookie-sourced rotation sets only the cookie, NOT X-Session-Token', () =>
  Effect.gen(function* () {
    const headers: Array<[string, string]> = []
    const cookies: string[] = []
    yield* contribute({
      request: new Request('http://x', { headers: { cookie: 'czo.session=child-token' } }),
      setCookie: (s: string) => { cookies.push(s) },
      setHeader: (n: string, v: string) => { headers.push([n, v]) },
    })
    expect(headers.length).toBe(0)
    expect(cookies.length).toBe(1)
  }).pipe(Effect.provide(stubSession('parent-token'))))
```

> Note: `contribute` is the existing `makeSessionContextContributor()` value already defined in the test file. The stub shape must satisfy the members the contributor calls (`readBearerToken`, `readSessionToken`, `resolve`, `setCookie`). If TS complains about the stub shape, widen via the `as unknown as` cast shown (test-only). Place these tests OUTSIDE the `layer(TestLayer)(…)` block (they provide their own stub layer), or in a second `describe`.

- [ ] **Step 2: Run, confirm failure**

Run: `pnpm --filter @czo/auth test src/graphql/session-context.test.ts`
Expected: FAIL — the contributor doesn't call `setHeader` yet (the first test fails to find `['X-Session-Token','parent-token']`).

- [ ] **Step 3: Implement the contributor change**

In `packages/modules/auth/src/graphql/session-context.ts`:

```ts
export function makeSessionContextContributor() {
  return (systemContext: unknown): Effect.Effect<Partial<GraphQLContextMap>, unknown, Session.SessionService> =>
    Effect.gen(function* () {
      const session = yield* Session.SessionService
      const ctx = systemContext as {
        request?: Request
        setCookie?: (serialized: string) => void
        setHeader?: (name: string, value: string) => void
      }
      // Authorization header takes precedence over the cookie fallback. Track
      // the source so rotation can also signal a pure-Bearer client (which
      // ignores Set-Cookie) via a response header.
      const fromHeader = session.readBearerToken(ctx.request?.headers.get('authorization'))
      const token = fromHeader ?? session.readSessionToken(ctx.request?.headers.get('cookie') ?? '')
      if (!token)
        return { auth: { session: null } }
      const resolved = yield* session.resolve(token)
      if (!resolved)
        return { auth: { session: null } }
      if (resolved.session.token !== token) {
        // Cookie clients re-adopt via Set-Cookie; Bearer clients via the header.
        if (ctx.setCookie)
          ctx.setCookie(session.setCookie(resolved.session.token).serialize())
        if (fromHeader != null && ctx.setHeader)
          ctx.setHeader('X-Session-Token', resolved.session.token)
      }
      return { auth: resolved }
    })
}
```

Also update the file's top doc comment: replace the parenthetical "(A pure Bearer client ignores the Set-Cookie, but queueing it is harmless.)" with a sentence noting that a Bearer-sourced request additionally receives the rotated token in the `X-Session-Token` response header.

- [ ] **Step 4: Run, confirm pass**

Run: `pnpm --filter @czo/auth test src/graphql/session-context.test.ts`
Expected: PASS (existing cookie/anonymous tests + the 2 new B14 tests).

- [ ] **Step 5: Type-check + lint + stage**

Run: `pnpm --filter @czo/auth check-types && pnpm --filter @czo/auth lint --fix`
```bash
git add packages/modules/auth/src/graphql/session-context.ts packages/modules/auth/src/graphql/session-context.test.ts
```

---

## Task 7: Backlog status + full verification + single commit

**Files:** Modify `docs/superpowers/backlog.md`.

- [ ] **Step 1: Mark B11 / B13 / B14 done**

In `docs/superpowers/backlog.md`, suffix each heading with `— ✅ FAIT (\`feat/b11-b13-b14-auth-hardening\`)` and prepend a one-line résolu note:
- **B11**: `changePassword` now fails `NoCredentialAccount` (registered GraphQL error) for OAuth-only users instead of `UserNotFound`; `requestEmailChange`/`deleteAccount` intentionally unchanged.
- **B13**: the 3 `request*` flows are padded to a constant-time budget (`constantTime` helper, `AUTH_ENUM_TIMING_BUDGET_MS` default 250 ms).
- **B14**: session rotation emits `X-Session-Token` for Bearer-sourced requests (new kit `setHeader` seam).

- [ ] **Step 2: Full verification**

```bash
pnpm --filter @czo/kit check-types && pnpm --filter @czo/kit lint && pnpm --filter @czo/kit build
pnpm --filter @czo/auth check-types && pnpm --filter @czo/auth lint
pnpm --filter @czo/auth test
```
Expected: kit clean; auth types/lint clean; full auth suite green (incl. the new B11 integration, B13 `TestClock` unit, B14 session-context tests).

- [ ] **Step 3: Stage backlog + review the diff**

```bash
git add docs/superpowers/backlog.md
git status
git diff --cached --stat
```

- [ ] **Step 4: Single commit (ONLY after the user has reviewed)**

```bash
git commit -m "feat(auth,kit): NoCredentialAccount + constant-time enum flows + Bearer rotation header (B11/B13/B14)

B11: changePassword fails NoCredentialAccount (not UserNotFound) for OAuth-only
users; registered as a GraphQL error. B13: the requestPasswordReset/
requestEmailVerification/requestEmailChange flows pad to a constant-time budget
(constantTime helper, AUTH_ENUM_TIMING_BUDGET_MS, default 250ms) so account
existence is not inferable from latency. B14: kit gains a generic setHeader
context seam; session-context emits X-Session-Token on rotation for
Bearer-sourced requests so pure-Bearer clients re-adopt the rotated token."
```

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/b11-b13-b14-auth-hardening
gh pr create --base main --title "feat(auth,kit): auth hardening — NoCredentialAccount + constant-time + Bearer rotation (B11/B13/B14)" --body "<summary per the spec>"
```

---

## Self-Review

**Spec coverage:** B11 (error + changePassword swap + GraphQL) → Tasks 1-2; B13 (`constantTime` helper + config + wrap 3 flows) → Tasks 3-4; B14 (kit `setHeader` seam + Bearer-sourced rotation header) → Tasks 5-6; backlog + verify → Task 7. The spec's "out of scope" items (broaden B11, B12 overlap, client docs) are not built. Covered.

**Placeholder scan:** No `TBD`/`TODO`/"handle edge cases". The two adaptation notes (Effect `TestClock`/`Fiber` import paths in Task 3; any extra `GraphQLContextMap` literal in Task 5) state a fixed intent with a concrete `grep` to resolve — not placeholders. Test/helper code is fully written.

**Type consistency:** `NoCredentialAccount` (Task 1) is registered (Task 2) and used in the `changePassword` union both in the service type (Task 1) and the mutation `errors.types` (Task 2). `constantTime(budget, self)` signature is identical in Task 3 (def) and Task 4 (3 call sites) — `config.enumTimingBudget` (added to `AccountConfig` in Task 3) is the budget passed in Task 4. `setHeader(name, value)` is identical across builder.ts type (Task 5), app.ts wiring (Task 5), and the session-context call + stub/spy (Task 6). `ENUM_TIMING_BUDGET` (constants.ts) ↔ `enumTimingBudget` (AccountConfig field) ↔ `AUTH_ENUM_TIMING_BUDGET_MS` (env) are consistently named across Tasks 3 and 7.
