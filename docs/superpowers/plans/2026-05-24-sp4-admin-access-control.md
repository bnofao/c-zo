# SP4 — Admin & Access Control: Native Finalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Free `@czo/auth` from the last better-auth runtime couplings on the admin / access-control user path, close the session-revoke gap on ban + role-downgrade, and dissolve `AuthService` by relocating `hasPermission` to the owning domain services.

**Architecture:** Four independent chantiers — (1) fork `createAccessControl` drop-in inside `services/access.ts`; (2) add `SessionService.listForUser` and delete the `UserService` session façade; (3) port `checkUserPermission` to `AccessService` and split `AuthService.hasPermission` into `UserService.hasPermission` + `OrganizationService.hasPermission` with dispatch at the `permission` authScope; (4) `Session.subscribersLayer` (scoped `Stream.runForEach` on `UserEvents`) auto-revoking on `UserBanned` and `UserRoleChanged` downgrade.

**Tech Stack:** `effect@4.0.0-beta.70` (Context.Service, Layer.scopedDiscard, Stream, PubSub, Effect.fn, Effect.forkScoped), `drizzle-orm@1.0.0-rc.3` (`effect-postgres`, RQBv2 object form), Pothos (`@pothos/plugin-scope-auth`), `@effect/vitest` + Testcontainers Postgres.

**Source spec:** `docs/superpowers/specs/2026-05-24-sp4-admin-access-control-design.md`

---

## Conventions for every task

- **TDD** for Tasks 1 (fork: pure logic via public API), 3 (`listForUser` + `invalidateCacheForUser`), 5 (`UserService.hasPermission`), 9 (subscribers layer). Other tasks are refactors/wiring — `pnpm check-types` is the gate.
- **Test style — SP1/SP3 runnable pattern.** New tests use `@effect/vitest` (`describe` / `it` / `layer` / `expect`) + `AuthPostgresLayer` / `truncateAuth` from `src/testing/postgres.ts` for integration. Pure tests use `vitest`. Do NOT import `@czo/kit/effect` (removed). Assert failures with `Effect.flip` then `_tag` check.
- **Real names — verified against current code, use these exactly:**
  - `AccessService` at `packages/modules/auth/src/services/access.ts:138` (Tag id `'@czo/auth/AccessService'`). Factory `makeLayer(initialOptions, freezeOnInit)`. Contract: `register`, `providers`, `hierarchies`, `role`, `roles`, `statements`, `freeze`, `isFrozen`, `buildRoles`, `authorize`.
  - `SessionService` at `packages/modules/auth/src/services/session.ts:47` (Tag id likely `'@czo/auth/SessionService'`; verify). Contract: `create`, `resolve`, `revoke`, `revokeAllForUser`, `update`, `purgeExpired`, `setCookie`, `readSessionToken`. Layer at `export const layer` near bottom of file.
  - `UserService` at `packages/modules/auth/src/services/user.ts` — currently exposes `listSessions`, `revokeSession`, `revokeSessions` (lines 200–212 contract / 434–462 impl). Make function at top, `Layer.effect(UserService, make)` at bottom. `UserEvents` Tag imported from `./events/user`.
  - `OrganizationService` at `packages/modules/auth/src/services/organization.ts` — `Layer.effect(OrganizationService, make)`.
  - `AuthService` at `packages/modules/auth/src/services/auth.ts` — Tag with single method `hasPermission`. Live impl at `layers/auth.ts` (`AuthServiceLive = Layer.effect(AuthService, …)`).
  - `module.ts:131–162` defines `accessOptions` (4 entries: organization, admin, api-key, apps) and `Layer.mergeAll(...).pipe(Layer.provideMerge(BetterAuthLive), Layer.provideMerge(AccessServiceLive))`.
  - `UserEvent` discriminated union at `services/events/user.ts` includes `UserBanned({ userId, bannedBy, reason, expires })` and `UserRoleChanged({ userId, previousRole, newRole, changedBy })`.
  - Drizzle table `session` (RQBv2): `findMany({ where, orderBy })` object form (NOT callback). Verify exact column names at `packages/modules/auth/src/database/schema.ts` before writing the query.
- **Commits:** do NOT commit during execution. `git add` (stage) only — one review + commit after Task 10 (no-commit-until-review preference, same as SP1/SP-B/SP-A/SP2/SP3). Never `git stash`.
- **Baseline:** `pnpm check-types` in `@czo/auth` captured at Task 0. Each subsequent task must keep the error count `<=` baseline.
- **No `as any` if inference is correct** (per project convention from SP3).

---

## File Structure

**Modified:**
- `packages/modules/auth/src/services/access.ts` — fork `createAccessControl` + `Role` + `AccessControl` locally; extract pure `authorizePermissions`; drop two better-auth imports; `AccessService.authorize` delegates to the pure helper. (Chantier 1.)
- `packages/modules/auth/src/services/session.ts` — add `SessionService.listForUser` + `SessionService.invalidateCacheForUser` to contract + impl; extract private `invalidateCacheForToken` helper from existing `revokeAllForUser` impl; add `subscribersLayer` (scoped, dispatches `UserEvents` to ban / role-change handlers). (Chantiers 2 + 4.)
- `packages/modules/auth/src/services/user.ts` — delete `listSessions`/`revokeSession`/`revokeSessions` from contract + impl; add `hasPermission` to contract + impl (depends on `AccessService`); inline `checkUserPermission` (moved from `layers/auth.ts`). (Chantiers 2 + 3.)
- `packages/modules/auth/src/services/organization.ts` — add `hasPermission` to contract + impl (depends on `BetterAuth`); inline `checkOrgPermission` (moved from `layers/auth.ts`). (Chantier 3.)
- `packages/modules/auth/src/graphql/scopes.ts` — `permission` authScope dispatches between `UserService.hasPermission` and `OrganizationService.hasPermission` (no more `AuthService`). (Chantier 3.)
- `packages/modules/auth/src/graphql/schema/user/mutations.ts` — `revokeSession` + `revokeSessions` resolvers route to `SessionService` (Chantier 2); `setRole` canSetRole check routes to `User.UserService.hasPermission` (Chantier 3).
- `packages/modules/auth/src/module.ts` — drop `AuthServiceLive` from `Layer.mergeAll`; add `Session.subscribersLayer` to `Layer.mergeAll`; ensure `UserServiceLive` provides `AccessService` if needed (already merged at outer pipe). (Chantiers 3 + 4.)
- `packages/modules/auth/src/services/index.ts` — drop `AuthService` export. (Chantier 3.)
- `packages/modules/auth/src/services/auth.ts` — **deleted**. (Chantier 3.)
- `packages/modules/auth/src/layers/auth.ts` — **deleted** (logic moved to user.ts + organization.ts). (Chantier 3.)
- `packages/modules/auth/src/layers/index.ts` — drop `AuthServiceLive` export. (Chantier 3.)

**New tests:**
- `packages/modules/auth/src/services/access.test.ts` — extend with `createAccessControl` fork unit tests (5 cases).
- `packages/modules/auth/src/services/session.test.ts` — extend with `listForUser` + `invalidateCacheForUser` integration tests + `subscribersLayer` integration tests.
- `packages/modules/auth/src/services/user.test.ts` — extend with `UserService.hasPermission` unit tests; **delete** existing `listSessions`/`revokeSession`/`revokeSessions` cases.
- `packages/modules/auth/src/services/organization.test.ts` — extend with `OrganizationService.hasPermission` cases (port from any existing `AuthService.hasPermission` org cases).

**Unchanged:** all DB tables/columns, migrations, schema, all other services, GraphQL surface (mutations/queries shape), `services/api-key.ts`, `services/access` registry behavior.

---

## Task 0: Baseline capture

**Files:**
- Capture: `pnpm check-types` baseline for `@czo/auth`

- [ ] **Step 1: Capture baseline TypeScript error count**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | tail -5
```

Expected: A line like `Found N errors`. Record `N` as the baseline. Each subsequent task must keep errors `<= N`. As of the SP3 commit `394606e1`, the baseline was 45 — confirm or update.

- [ ] **Step 2: Capture baseline test pass count**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected: A line like `Test Files X passed | Y skipped`. Record `X` as the baseline. Each task must keep `X` not decreasing (skipped is OK, failing is not).

- [ ] **Step 3: Stage nothing, no commit**

This task captures numbers only. No file changes.

---

## Task 1: Fork `createAccessControl` (chantier 1) — TDD

**Files:**
- Modify: `packages/modules/auth/src/services/access.ts` (add types + functions, keep better-auth imports for now)
- Modify: `packages/modules/auth/src/services/access.test.ts` (add fork tests)

- [ ] **Step 1: Write failing tests for `createAccessControl` fork (exercises the helper via the public API)**

Open `packages/modules/auth/src/services/access.test.ts`. Add a new `describe` block. The fork's `Role.authorize` is the single external API for permission matching — testing through it covers both the fork shape AND the helper logic in one block:

```ts
import { describe, expect, it } from 'vitest'
import { createAccessControl } from './access'

describe('createAccessControl (fork of better-auth/plugins/access)', () => {
  const statements = { user: ['create', 'read', 'update'], 'api-key': ['create'] } as const

  it('exposes statements + newRole on the AccessControl', () => {
    const ac = createAccessControl(statements)
    expect(ac.statements).toEqual(statements)
    expect(typeof ac.newRole).toBe('function')
  })

  it('newRole returns a Role with statements + authorize', () => {
    const role = createAccessControl(statements).newRole({ user: ['create'] })
    expect(role.statements).toEqual({ user: ['create'] })
    expect(typeof role.authorize).toBe('function')
  })

  it('Role.authorize: AND success when all required actions are granted', () => {
    const role = createAccessControl(statements).newRole({ user: ['create', 'read', 'update'] })
    expect(role.authorize({ user: ['create', 'read'] })).toEqual({ success: true, error: null })
  })

  it('Role.authorize: AND failure when a required action is missing', () => {
    const role = createAccessControl(statements).newRole({ user: ['read'] })
    const result = role.authorize({ user: ['create', 'read'] }, 'AND')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Missing actions on user/)
  })

  it('Role.authorize: OR success when at least one required action is granted', () => {
    const role = createAccessControl(statements).newRole({ user: ['read'] })
    expect(role.authorize({ user: ['create', 'read'] }, 'OR')).toEqual({ success: true, error: null })
  })

  it('Role.authorize: failure when required resource is absent from granted', () => {
    const role = createAccessControl(statements).newRole({ user: ['read'] })
    const result = role.authorize({ 'api-key': ['create'] }, 'AND')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Missing resource: api-key/)
  })
})
```

(Note: `Role.authorize` covers the `granted=null` case via the internal helper, but it can't be triggered through the public API since `newRole` requires permissions. That branch is exercised in Task 2 via `AccessService.authorize(null, …)`.)

- [ ] **Step 2: Run tests to verify failures**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test -- access.test.ts 2>&1 | tail -20
```

Expected: 6 FAILs (`'createAccessControl' is not exported from './access'`).

- [ ] **Step 3: Implement the private `authorizePermissions` helper in `access.ts`**

Add after the existing `mergePermissions` helper (around line 65). **Not exported** — internal detail consumed by `newRole` (Step 4) and `AccessService.authorize` (Task 2):

```ts
function authorizePermissions<S extends Statements>(
  granted: RolePermissions<S> | null | undefined,
  required: RolePermissions<S>,
  connector: 'AND' | 'OR' = 'AND',
): { success: boolean, error: string | null } {
  if (!granted) return { success: false, error: 'No permissions granted' }
  for (const [resource, actions] of Object.entries(required) as [string, string[]][]) {
    const grantedActions = (granted as Record<string, string[]>)[resource]
    if (!grantedActions) return { success: false, error: `Missing resource: ${resource}` }
    const hasAll = actions.every(a => grantedActions.includes(a))
    const hasAny = actions.some(a => grantedActions.includes(a))
    if (connector === 'AND' && !hasAll) return { success: false, error: `Missing actions on ${resource}` }
    if (connector === 'OR' && !hasAny) return { success: false, error: `No matching action on ${resource}` }
  }
  return { success: true, error: null }
}
```

- [ ] **Step 4: Implement forked `createAccessControl` + types in `access.ts`**

In `packages/modules/auth/src/services/access.ts`, add **before** the existing `RoleBuilder` interface (around line 43):

```ts
// ─── Forked from better-auth/plugins/access (drop-in surface) ────────

export interface Role<S extends Statements = Statements> {
  readonly statements: RolePermissions<S>
  readonly authorize: (
    required: RolePermissions<S>,
    connector?: 'AND' | 'OR',
  ) => { success: boolean, error: string | null }
}

export interface AccessControl<S extends Statements> {
  readonly statements: S
  readonly newRole: (permissions: RolePermissions<S>) => Role<S>
}

export function createAccessControl<const S extends Statements>(
  statements: S,
): AccessControl<S> {
  return {
    statements,
    newRole: permissions => ({
      statements: permissions,
      authorize: (required, connector = 'AND') =>
        authorizePermissions(permissions, required, connector),
    }),
  }
}
```

- [ ] **Step 5: Run tests to verify passes**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test -- access.test.ts 2>&1 | tail -20
```

Expected: 6 PASSes for the `createAccessControl` block. Other access tests unchanged.

- [ ] **Step 6: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/access.ts packages/modules/auth/src/services/access.test.ts
```

Do not commit.

---

## Task 2: Replace better-auth `createAccessControl` with the local fork

**Files:**
- Modify: `packages/modules/auth/src/services/access.ts` (swap `Role`/`Subset` import for local types; swap `createAccessControl` import; delete the cast)

- [ ] **Step 1: Update the AccessService impl to use the local fork**

In `access.ts`:

1. Delete the better-auth imports at the top:

```diff
- import type { Role, Subset } from 'better-auth/plugins/access'
- import { createAccessControl } from 'better-auth/plugins/access'
```

2. `RolePermissions<S>` is already defined locally — `AccessRole<S>` can become an alias to the new local `Role<S>`:

```diff
- export type AccessRole<S extends Statements = Statements> = Role<S>
+ export type AccessRole<S extends Statements = Statements> = Role<S>
```

(Same line, the type now resolves to the local `Role<S>` — no change needed; verify by hovering in IDE.)

3. In `roleBuilder` (around line 80), the cast `as unknown as AccessRole<S>` becomes safe because the local `newRole` already returns `Role<S>`:

```diff
- roles[level.name] = ac.newRole(accumulated as Subset<keyof S, S>) as unknown as AccessRole<S>
+ roles[level.name] = ac.newRole(accumulated)
```

(If TS complains about the type of `accumulated` not matching, cast to `RolePermissions<S>` explicitly:
`ac.newRole(accumulated as RolePermissions<S>)` — no `unknown` round-trip.)

4. In `buildRoles` (line 268-ish), `createAccessControl` now resolves to the local export — no source change needed since the call site is `createAccessControl(Object.fromEntries(_statements.entries()))` and Object.fromEntries returns a generic `{[k:string]: ...}` which matches `Statements`.

5. Update `BuiltRoles.ac` type if it referenced `ReturnType<typeof createAccessControl<...>>`:

```diff
  export interface BuiltRoles {
-   readonly ac: ReturnType<typeof createAccessControl<Statements>>
+   readonly ac: AccessControl<Statements>
    readonly roles: Record<string, AccessRole>
  }
```

6. Update `RoleBuilder.ac` type similarly:

```diff
  export interface RoleBuilder<S extends Statements> {
    statements: S
-   ac: ReturnType<typeof createAccessControl<S>>
+   ac: AccessControl<S>
    createHierarchy: <const N extends string>(...) => ...
  }
```

7. Update `roleBuilder` signature parameter:

```diff
- export function roleBuilder<const S extends Statements>(
-   ac: ReturnType<typeof createAccessControl<S>>,
- ): RoleBuilder<S> {
+ export function roleBuilder<const S extends Statements>(
+   ac: AccessControl<S>,
+ ): RoleBuilder<S> {
```

- [ ] **Step 2: Make `AccessService.authorize` delegate to `authorizePermissions`**

In `access.ts`, find the `authorize` impl inside `makeLayer` (around line 280). Replace:

```ts
authorize: (granted, required, connector = 'AND') =>
  Effect.sync(() => {
    if (!granted) return false
    for (const [resource, actions] of Object.entries(required) as [string, string[]][]) {
      const grantedActions = (granted as Record<string, string[]>)[resource]
      if (!grantedActions) return false
      const hasAll = actions.every(a => grantedActions.includes(a))
      const hasAny = actions.some(a => grantedActions.includes(a))
      if (connector === 'AND' && !hasAll) return false
      if (connector === 'OR' && !hasAny) return false
    }
    return true
  }),
```

with:

```ts
authorize: (granted, required, connector = 'AND') =>
  Effect.sync(() => authorizePermissions(granted, required, connector).success),
```

- [ ] **Step 3: Run check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | tail -5
```

Expected: error count `<= baseline` from Task 0.

- [ ] **Step 4: Run access tests**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test -- access.test.ts 2>&1 | tail -20
```

Expected: all access tests pass (including the 8 new fork tests from Task 1, and existing AccessService tests).

- [ ] **Step 5: Verify zero better-auth/plugins/access imports remain**

```bash
grep -rn "from 'better-auth/plugins/access'" /workspace/c-zo/packages/modules/auth/src
```

Expected: zero matches.

- [ ] **Step 6: Run full test suite**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected: pass count `>= baseline` from Task 0.

- [ ] **Step 7: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/access.ts
```

---

## Task 3: Add `SessionService.listForUser` + `invalidateCacheForUser` (chantier 2 part 1) — TDD

**Files:**
- Modify: `packages/modules/auth/src/services/session.ts` (add 2 methods to contract + impl)
- Modify: `packages/modules/auth/src/services/session.test.ts` (add integration tests)

**Rationale for `invalidateCacheForUser`:** when a user attribute that lives in the cached `ResolvedSession` changes (e.g., `user.role`), the session itself should stay valid — only the cached `{ session, user }` resolution is stale. `revokeAllForUser` is too aggressive (kicks the user out, forces re-auth) for a non-security-critical mutation. `invalidateCacheForUser` purges L1 / L2 entries for all of the user's sessions; DB rows untouched; next `resolve(token)` re-fetches the user fresh and the new attribute is honored.

- [ ] **Step 1: Verify schema column names**

```bash
grep -n -E "session|userId|expiresAt|createdAt" /workspace/c-zo/packages/modules/auth/src/database/schema.ts | head -20
```

Confirm the `session` table has columns `userId`, `expiresAt`, `createdAt`. If named differently (e.g., `expires_at`), use the JS field name (Drizzle inflects automatically).

- [ ] **Step 2: Write failing test for `listForUser`**

In `packages/modules/auth/src/services/session.test.ts`, find the existing `describe('SessionService', ...)` block. Add inside:

```ts
describe('listForUser', () => {
  it.layer(TestLayer)('returns active sessions for the user ordered desc', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* createTestUser()  // helper from existing tests
      const sessions = yield* SessionService

      const s1 = yield* sessions.create({ userId, /* …  */ })
      yield* Effect.sleep('10 millis')   // ensure distinct createdAt
      const s2 = yield* sessions.create({ userId, /* … */ })

      const list = yield* sessions.listForUser(userId)
      expect(list).toHaveLength(2)
      expect(list[0].token).toBe(s2.token)   // desc ordering
      expect(list[1].token).toBe(s1.token)
    }))

  it.layer(TestLayer)('excludes expired sessions', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* createTestUser()
      const sessions = yield* SessionService

      // Active session
      yield* sessions.create({ userId, /* … */ })
      // Expired: create then manually set expiresAt in past via direct UPDATE
      // (or use sessions.create with expiresIn in the past if supported)

      const list = yield* sessions.listForUser(userId)
      expect(list).toHaveLength(1)
    }))

  it.layer(TestLayer)('returns empty array when user has no sessions', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* createTestUser()
      const sessions = yield* SessionService
      const list = yield* sessions.listForUser(userId)
      expect(list).toEqual([])
    }))
})
```

Note: adapt `createTestUser`, `TestLayer`, and `sessions.create` payload to the actual helpers/signatures in `session.test.ts` — read the file first to mirror existing tests exactly. If `sessions.create` requires extra fields (IP, userAgent, …), pass placeholders or read the existing test fixture pattern.

- [ ] **Step 3: Run tests to verify failure**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test -- session.test.ts 2>&1 | tail -25
```

Expected: 3 FAILs on `listForUser` (`Property 'listForUser' does not exist`).

- [ ] **Step 4: Add `listForUser` to `SessionService` contract**

In `packages/modules/auth/src/services/session.ts`, find the `SessionService` class (line 47-ish). Add to the methods object:

```ts
readonly listForUser: (userId: number) => Effect.Effect<
  readonly SessionRow[],
  SessionStoreFailed
>
```

- [ ] **Step 5: Implement `listForUser` in the layer impl**

In the same file, find the impl object (where `revokeAllForUser` is defined). Add:

```ts
listForUser: userId =>
  Effect.tryPromise({
    try: () => db.query.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    }),
    catch: cause => new SessionStoreFailed({ cause }),
  }),
```

Note: `db` is the DrizzleDb instance already destructured in `make` (mirror the pattern used by other methods). If column type is `Date | string`, the `gt: new Date()` comparison may need a Date-typed value — check what `purgeExpired` does for the same comparison.

- [ ] **Step 6: Write failing test for `invalidateCacheForUser`**

In `session.test.ts`, after the `listForUser` block:

```ts
describe('invalidateCacheForUser', () => {
  it.layer(TestLayer)('drops L1/L2 cache entries but keeps DB sessions', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* createTestUser()
      const sessions = yield* SessionService

      const created = yield* sessions.create({ userId, /* … */ })
      // Warm the cache: first resolve populates L1/L2
      const before = yield* sessions.resolve(created.token)
      expect(before).not.toBeNull()

      yield* sessions.invalidateCacheForUser(userId)

      // DB row still there → listForUser returns it
      expect(yield* sessions.listForUser(userId)).toHaveLength(1)

      // Cache cleared → resolve still works (goes back to DB)
      const after = yield* sessions.resolve(created.token)
      expect(after).not.toBeNull()
      expect(after!.session.token).toBe(created.token)
    }))

  it.layer(TestLayer)('is a no-op for users with no sessions', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* createTestUser()
      const sessions = yield* SessionService
      yield* sessions.invalidateCacheForUser(userId)   // should not throw
    }))
})
```

The "drops cache" semantic is hard to assert directly (L1 is private to the layer). The test asserts the observable contract: DB rows are kept (via `listForUser`) and `resolve` continues to work. A whitebox test that pokes the cache directly is out of scope — if you want stronger assertions, expose a peek method on the test-only layer, but YAGNI for now.

- [ ] **Step 7: Run tests to verify failures**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test -- session.test.ts 2>&1 | tail -25
```

Expected: 2 FAILs (`Property 'invalidateCacheForUser' does not exist`).

- [ ] **Step 8: Add `invalidateCacheForUser` to `SessionService` contract**

In `services/session.ts`, add to the methods object next to `revokeAllForUser`:

```ts
readonly invalidateCacheForUser: (userId: number) => Effect.Effect<void, SessionStoreFailed>
```

- [ ] **Step 9: Implement `invalidateCacheForUser` in the layer impl**

Find how `revokeAllForUser` invalidates cache (look for the L1 / L2 invalidation calls — likely a helper like `invalidate(token)` or a `PubSub.publish` for L2). The new method does the cache half of `revokeAllForUser` without the DB DELETE:

```ts
invalidateCacheForUser: userId =>
  Effect.gen(function* () {
    // List active session tokens for the user — same query as listForUser
    // but only the token column (read pattern internal to the cache hop).
    const tokens = yield* Effect.tryPromise({
      try: () => db.query.session.findMany({
        where: { userId },
        columns: { token: true },
      }),
      catch: cause => new SessionStoreFailed({ cause }),
    })
    // Drop L1 entries and broadcast L2 invalidation for each token.
    // Reuse the existing per-token invalidate path used by `revoke(token)`
    // and `revokeAllForUser(userId)` — DO NOT duplicate the implementation.
    for (const { token } of tokens) {
      yield* invalidateCacheForToken(token)   // ← name to be confirmed by reading session.ts
    }
  }),
```

If the existing `revokeAllForUser` implementation embeds the cache invalidation inline rather than via a reusable helper, extract that piece into a private `invalidateCacheForToken(token)` function in `session.ts` and call it from both `revokeAllForUser` (after the DELETE) and `invalidateCacheForUser`. The helper must do: L1 `Map.delete(token)` + L2 publish (whatever the SP1 mechanism is — likely a `Persistable` interaction or a Redis pub/sub).

- [ ] **Step 10: Run tests to verify passes**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test -- session.test.ts 2>&1 | tail -25
```

Expected: 5 PASSes total in the SessionService block (3 listForUser + 2 invalidateCacheForUser).

- [ ] **Step 11: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | tail -5
```

Expected: error count `<= baseline`.

- [ ] **Step 12: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/session.ts packages/modules/auth/src/services/session.test.ts
```

---

## Task 4: Drop `UserService` session façade (chantier 2 part 2)

**Files:**
- Modify: `packages/modules/auth/src/services/user.ts` (delete contract methods + impl methods)
- Modify: `packages/modules/auth/src/graphql/schema/user/mutations.ts` (route `revokeSession`, `revokeSessions` resolvers to `SessionService`)
- Modify: `packages/modules/auth/src/services/user.test.ts` (delete session façade tests)

- [ ] **Step 1: Find the listSessions/revokeSession resolvers**

Read `packages/modules/auth/src/graphql/schema/user/mutations.ts` around lines 315–360 (the `revokeSession` and `revokeSessions` mutations). Confirm they currently call `User.UserService.revokeSession(token)` / `User.UserService.revokeSessions(id)`.

Also check `packages/modules/auth/src/graphql/schema/user/queries.ts` for a `userSessions` query (or similar) that might call `User.UserService.listSessions`.

- [ ] **Step 2: Update `revokeSession` resolver to use `SessionService`**

In `mutations.ts` line ~317–340, replace inside the resolver:

```diff
- const svc = yield* User.UserService
- return yield* svc.revokeSession(input.sessionToken)
+ const svc = yield* SessionService
+ yield* svc.revoke(input.sessionToken)
+ return true as const
```

And at the top, add `import { SessionService } from '../../../services/session'` (verify the right path; might be from `'../../../services'` barrel).

- [ ] **Step 3: Update `revokeSessions` resolver**

In `mutations.ts` line ~344–365:

```diff
- const svc = yield* User.UserService
- return yield* svc.revokeSessions(Number(input.id))
+ const svc = yield* SessionService
+ yield* svc.revokeAllForUser(Number(input.id))
+ return true as const
```

- [ ] **Step 4: Update `userSessions` query (if present)**

If found in `queries.ts`, replace:

```diff
- const svc = yield* UserService
- return yield* svc.listSessions(userId)
+ const svc = yield* SessionService
+ return yield* svc.listForUser(userId)
```

If no query exposes session listing yet (admin-only feature might be GraphQL-unexposed), skip this step — log "no resolver found, listForUser remains service-only".

- [ ] **Step 5: Delete the 3 methods from `UserService` contract**

In `packages/modules/auth/src/services/user.ts` around lines 200–212, delete:

```ts
readonly listSessions: (id: number) => Effect.Effect<readonly SessionRow[], UserDbFailed>
readonly revokeSession: (token: string) => Effect.Effect<true, UserDbFailed>
readonly revokeSessions: (id: number) => Effect.Effect<true, UserDbFailed>
```

- [ ] **Step 6: Delete the 3 impl blocks from `UserService.make`**

Same file, around lines 434–462, delete the three `Effect.tryPromise({ try: …, catch: … })` blocks for `listSessions` / `revokeSession` / `revokeSessions`.

- [ ] **Step 7: Delete now-unused imports**

In `user.ts`, search for `parseSessionOutput` usage. If only used by the 3 deleted methods, delete the import. Same for `SessionRow` import if no longer referenced.

- [ ] **Step 8: Delete session façade tests in `user.test.ts`**

In `packages/modules/auth/src/services/user.test.ts`, find any `describe`/`it` blocks targeting `listSessions` / `revokeSession` / `revokeSessions` and delete them. The behavior is now tested in `session.test.ts`.

- [ ] **Step 9: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | tail -5
```

Expected: error count `<= baseline`. If a callsite was missed, fix it (grep `UserService.*\(list|revoke\)Session` to find).

- [ ] **Step 10: Run full test suite**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected: pass count `>= baseline`. Session tests grow by 3, user tests shrink by however many session-façade cases existed.

- [ ] **Step 11: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/user.ts packages/modules/auth/src/services/user.test.ts packages/modules/auth/src/graphql/schema/user/mutations.ts packages/modules/auth/src/graphql/schema/user/queries.ts
```

---

## Task 5: Add `UserService.hasPermission` (chantier 3 part 1) — TDD

**Files:**
- Modify: `packages/modules/auth/src/services/user.ts` (add contract + impl + helper)
- Modify: `packages/modules/auth/src/services/user.test.ts` (add unit tests)

- [ ] **Step 1: Write failing tests for `UserService.hasPermission`**

In `user.test.ts`, add a new describe:

```ts
describe('UserService.hasPermission', () => {
  it.layer(TestLayer)('returns true when role grants the required permission (AND)', () =>
    Effect.gen(function* () {
      const users = yield* UserService
      const ok = yield* users.hasPermission({
        role: 'admin',
        permissions: { user: ['create'] },
      })
      expect(ok).toBe(true)
    }))

  it.layer(TestLayer)('returns false when role lacks the required permission', () =>
    Effect.gen(function* () {
      const users = yield* UserService
      const ok = yield* users.hasPermission({
        role: 'user',
        permissions: { user: ['ban'] },
      })
      expect(ok).toBe(false)
    }))

  it.layer(TestLayer)('returns false when role is unknown', () =>
    Effect.gen(function* () {
      const users = yield* UserService
      const ok = yield* users.hasPermission({
        role: 'martian',
        permissions: { user: ['create'] },
      })
      expect(ok).toBe(false)
    }))

  it.layer(TestLayer)('multi-role string ("admin,user") returns true if any role authorizes', () =>
    Effect.gen(function* () {
      const users = yield* UserService
      const ok = yield* users.hasPermission({
        role: 'admin,user',
        permissions: { user: ['ban'] },
      })
      expect(ok).toBe(true)
    }))

  it.layer(TestLayer)('defaults to "user" role when role param is undefined', () =>
    Effect.gen(function* () {
      const users = yield* UserService
      const ok = yield* users.hasPermission({
        permissions: { user: ['ban'] },
      })
      expect(ok).toBe(false)   // default 'user' role lacks ban
    }))
})
```

Adapt `TestLayer` to provide `AccessService` materialized with `ADMIN_STATEMENTS` + `ADMIN_HIERARCHY` (mirror the module.ts seeding). The test layer must call `AccessService.buildRoles` at boot — read `services/access.test.ts` for the existing pattern.

- [ ] **Step 2: Run tests to verify failures**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test -- user.test.ts 2>&1 | tail -25
```

Expected: 5 FAILs on `hasPermission` (method not in contract).

- [ ] **Step 3: Add `hasPermission` to `UserService` contract**

In `services/user.ts`, add to the methods object (alongside `create`, `update`, `ban`, etc.):

```ts
readonly hasPermission: (input: {
  role?: string
  permissions: Record<string, string[]>
  connector?: 'AND' | 'OR'
}) => Effect.Effect<boolean>
```

- [ ] **Step 4: Implement `hasPermission` in `UserService.make`**

In the same file, ensure `make` yields `AccessService`:

```ts
const access = yield* AccessService
```

Then add to the returned methods object:

```ts
hasPermission: input =>
  Effect.gen(function* () {
    const { permissions, role, connector = 'AND' } = input
    if (!permissions) return false
    const roleNames = (role || 'user').split(',')
    for (const r of roleNames) {
      const acRole = yield* access.role(r)
      if (!acRole) continue
      const ok = yield* access.authorize(acRole.statements, permissions, connector)
      if (ok) return true
    }
    return false
  }),
```

Add the import at the top of `user.ts`:

```ts
import { AccessService } from './access'
```

(No import of `authorizePermissions` — it stays private to `access.ts`. All matching goes through the `AccessService.authorize` Effect method, keeping the chain in `Effect.gen`.)

- [ ] **Step 5: Run tests to verify passes**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test -- user.test.ts 2>&1 | tail -25
```

Expected: 5 PASSes for `hasPermission` block. Other user tests unchanged.

- [ ] **Step 6: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | tail -5
```

Expected: error count `<= baseline`. The new `AccessService` dep added to `UserService.make` requires the outer Layer composition to provide it — `module.ts` already does via `Layer.provideMerge(AccessServiceLive)` at the outer pipe, so no module.ts change needed yet (verify at Task 8).

- [ ] **Step 7: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/user.ts packages/modules/auth/src/services/user.test.ts
```

---

## Task 6: Add `OrganizationService.hasPermission` (chantier 3 part 2)

**Files:**
- Modify: `packages/modules/auth/src/services/organization.ts` (add contract + impl + colocated `checkOrgPermission`)
- Modify: `packages/modules/auth/src/services/organization.test.ts` (port existing org-permission tests, if any)

- [ ] **Step 1: Read the current `checkOrgPermission` impl**

Open `packages/modules/auth/src/layers/auth.ts` lines 45–136. This is the source we're moving. It depends on `BetterAuth` (via `auth.options.plugins`, `auth.$context.adapter`).

- [ ] **Step 2: Add `hasPermission` to `OrganizationService` contract**

In `services/organization.ts`, find the `OrganizationService` class. Add to the methods object:

```ts
readonly hasPermission: (input: {
  orgId: string
  role: string
  permissions: Record<string, string[]>
  connector?: 'AND' | 'OR'
  allowCreatorAllPermissions?: boolean
  useMemoryCache?: boolean
}) => Effect.Effect<boolean>
```

- [ ] **Step 3: Move `checkOrgPermission` into `organization.ts`**

Cut the helpers `checkOrgPermission`, `isValidPermissionsRecord`, `cacheOrgRoles`, and the related types `OrgPermissionInput` from `layers/auth.ts`. Paste them into `services/organization.ts` (top-level, above the `make` function).

Update imports in `organization.ts`:

```ts
import type { OrganizationOptions, OrganizationRole, Role } from 'better-auth/plugins'
import type { Auth } from '../layers/better-auth'
```

- [ ] **Step 4: Wire `hasPermission` in `OrganizationService.make`**

In `make`, ensure `auth` is yielded:

```ts
const auth = yield* BetterAuth
```

Add to the returned methods:

```ts
hasPermission: input =>
  Effect.promise(() => checkOrgPermission(auth, input)),
```

Where `checkOrgPermission` keeps its existing signature `(auth: Auth, input: OrgPermissionInput) => Promise<boolean>`.

- [ ] **Step 5: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | tail -5
```

Expected: error count `<= baseline`. If `BetterAuth` was already a dep of `OrganizationService.make`, no change; otherwise the outer composition in `module.ts` already provides it.

- [ ] **Step 6: Run tests**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test -- organization 2>&1 | tail -15
```

Expected: pass count unchanged. (We're not adding new tests — `OrganizationService.hasPermission` is a verbatim move; the `AuthService.hasPermission` tests will be ported / removed at Task 8.)

- [ ] **Step 7: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/organization.ts
```

---

## Task 7: Update `permission` authScope to dispatch (chantier 3 part 3)

**Files:**
- Modify: `packages/modules/auth/src/graphql/scopes.ts` (replace `AuthService` calls with `UserService` / `OrganizationService` dispatch)
- Modify: `packages/modules/auth/src/graphql/schema/user/mutations.ts` (setRole callsite uses `UserService.hasPermission`)

- [ ] **Step 1: Read current `permission` authScope**

```bash
grep -n -A40 "permission:" /workspace/c-zo/packages/modules/auth/src/graphql/scopes.ts | head -60
```

Identify the function body that calls `authSvc.hasPermission(...)`. Confirm it has access to `input.organization` (the org dispatch hint).

- [ ] **Step 2: Update `permission` authScope to dispatch**

In `scopes.ts`, replace the `permission` authScope body. The new body (simplified — adapt to the actual variable names like `resource`, `actions`, `organization`, `connector`):

```ts
permission: async ({ resource, actions, organization, connector }) => {
  const role = ctx.auth.user?.role ?? undefined
  return ctx.runEffect(Effect.gen(function* () {
    if (organization) {
      const org = yield* OrganizationService
      return yield* org.hasPermission({
        orgId: organization,
        role: role ?? '',
        permissions: { [resource]: actions ?? [] },
        connector,
      })
    }
    const users = yield* UserService
    return yield* users.hasPermission({
      role,
      permissions: { [resource]: actions ?? [] },
      connector,
    })
  }))
}
```

Update imports at the top of `scopes.ts`:

```diff
- import { AuthService } from '../services/auth'
+ import { UserService } from '../services/user'
+ import { OrganizationService } from '../services/organization'
```

Apply the same dispatch logic to all 4 occurrences of `AuthService` in `scopes.ts` (the `auth` scope, the `permission` scope, the `apiKeyOwner` scope — verify each by reading the file).

- [ ] **Step 3: Update setRole callsite in `user/mutations.ts`**

Read lines 70–86 of `graphql/schema/user/mutations.ts`. The current code yields `AuthService` for the `canSetRole` check. Replace:

```diff
- const svc = yield* AuthService
- return yield* svc.hasPermission(
-   { userId: String(actorId), organizationId: ..., role: ... },
-   { user: ['set-role'] },
- )
+ const svc = yield* User.UserService
+ return yield* svc.hasPermission({
+   role: ctx.auth.user?.role ?? undefined,
+   permissions: { user: ['set-role'] },
+ })
```

Drop the now-unused `AuthService` import from this file.

- [ ] **Step 4: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | tail -5
```

Expected: error count `<= baseline`. If errors increase, the dispatch shape mismatch needs fixing — the org-side `org.hasPermission` requires `orgId: string` but `organization` from the authScope might be `string | undefined` — guard with the `if (organization)` check (already in the snippet).

- [ ] **Step 5: Run tests**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected: pass count unchanged.

- [ ] **Step 6: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/graphql/scopes.ts packages/modules/auth/src/graphql/schema/user/mutations.ts
```

---

## Task 8: Delete `AuthService` (chantier 3 part 4)

**Files:**
- Delete: `packages/modules/auth/src/services/auth.ts`
- Delete: `packages/modules/auth/src/layers/auth.ts`
- Modify: `packages/modules/auth/src/services/index.ts` (drop export)
- Modify: `packages/modules/auth/src/layers/index.ts` (drop export)
- Modify: `packages/modules/auth/src/module.ts` (drop `AuthServiceLive` from `Layer.mergeAll`)

- [ ] **Step 1: Verify no callsites remain**

```bash
grep -rn "AuthService" /workspace/c-zo/packages/modules/auth/src --include='*.ts'
```

Expected: zero results outside of the files about to be deleted. If any callsite remains, go back and fix it before deleting.

- [ ] **Step 2: Delete files**

```bash
rm /workspace/c-zo/packages/modules/auth/src/services/auth.ts /workspace/c-zo/packages/modules/auth/src/layers/auth.ts
```

- [ ] **Step 3: Remove from `services/index.ts`**

```bash
grep -n "AuthService\|auth'" /workspace/c-zo/packages/modules/auth/src/services/index.ts
```

Find lines like `export * from './auth'` or `export { AuthService } from './auth'` and delete them.

- [ ] **Step 4: Remove from `layers/index.ts`**

```bash
grep -n "AuthServiceLive\|auth'" /workspace/c-zo/packages/modules/auth/src/layers/index.ts
```

Find `export { AuthServiceLive } from './auth'` and delete the line.

- [ ] **Step 5: Remove from `module.ts`**

In `module.ts` around line 166, remove `AuthServiceLive,` from the `Layer.mergeAll(...)` arg list. Remove `AuthServiceLive` from the `import { AuthServiceLive, makeBetterAuthLive } from '@czo/auth/layers'` line.

- [ ] **Step 6: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | tail -5
```

Expected: error count `<= baseline`. If errors appear, a stale import remained — grep and fix.

- [ ] **Step 7: Run tests**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected: pass count `>= baseline`.

- [ ] **Step 8: Stage**

```bash
cd /workspace/c-zo && git add -A packages/modules/auth/src/services packages/modules/auth/src/layers packages/modules/auth/src/module.ts
```

---

## Task 9: Subscribers layer (chantier 4) — TDD

**Files:**
- Modify: `packages/modules/auth/src/services/session.ts` (add `subscribersLayer`)
- Modify: `packages/modules/auth/src/services/session.test.ts` (add integration tests)
- Modify: `packages/modules/auth/src/module.ts` (wire `subscribersLayer`)

- [ ] **Step 1: Write failing integration test — UserBanned**

In `session.test.ts`:

```ts
describe('subscribersLayer', () => {
  it.layer(TestLayerWithSubscribers)('revokes all sessions on UserBanned event', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* createTestUser()
      const sessions = yield* SessionService
      const events = yield* UserEvents

      yield* sessions.create({ userId, /* … */ })
      expect(yield* sessions.listForUser(userId)).toHaveLength(1)

      yield* events.publish({
        _tag: 'UserBanned',
        userId,
        bannedBy: null,
        reason: 'test',
        expires: null,
      })
      yield* Effect.sleep('100 millis')   // let the fiber drain

      expect(yield* sessions.listForUser(userId)).toHaveLength(0)
    }))

  it.layer(TestLayerWithSubscribers)('invalidates session cache on UserRoleChanged (any direction)', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* createTestUser()
      const sessions = yield* SessionService
      const events = yield* UserEvents

      const created = yield* sessions.create({ userId, /* … */ })
      // Warm cache
      yield* sessions.resolve(created.token)

      yield* events.publish({
        _tag: 'UserRoleChanged',
        userId,
        previousRole: 'admin',
        newRole: 'user',
        changedBy: null,
      })
      yield* Effect.sleep('100 millis')

      // Session still alive (DB row kept) — the user is NOT logged out
      expect(yield* sessions.listForUser(userId)).toHaveLength(1)
      // resolve still works, returns fresh data
      const after = yield* sessions.resolve(created.token)
      expect(after).not.toBeNull()
    }))

  it.layer(TestLayerWithSubscribers)('invalidates cache on UserRoleChanged in the upgrade direction too', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* createTestUser()
      const sessions = yield* SessionService
      const events = yield* UserEvents

      yield* sessions.create({ userId, /* … */ })

      // Upgrade: user → admin. Same handler, no filter — cached role is stale either way.
      yield* events.publish({
        _tag: 'UserRoleChanged',
        userId,
        previousRole: 'user',
        newRole: 'admin',
        changedBy: null,
      })
      yield* Effect.sleep('100 millis')

      // Session still alive — role change is not a security revocation
      expect(yield* sessions.listForUser(userId)).toHaveLength(1)
    }))
})
```

`TestLayerWithSubscribers` = `TestLayer` ∪ `Session.subscribersLayer` ∪ `UserEvents.layer` (mirror module.ts wiring).

- [ ] **Step 2: Run to verify failures**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test -- session.test.ts 2>&1 | tail -20
```

Expected: 3 FAILs (`subscribersLayer is not exported`).

- [ ] **Step 3: Implement `subscribersLayer` in `session.ts`**

Add to `session.ts` after `export const layer`:

```ts
import { Stream } from 'effect'
import { UserEvents, type UserEvent } from './events/user'

const onUserBanned = Effect.fn('sessions.subscribers.user-banned')(
  function* (e: Extract<UserEvent, { _tag: 'UserBanned' }>) {
    const sessions = yield* SessionService
    yield* sessions.revokeAllForUser(e.userId)
  },
)

const onUserRoleChanged = Effect.fn('sessions.subscribers.user-role-changed')(
  function* (e: Extract<UserEvent, { _tag: 'UserRoleChanged' }>) {
    const sessions = yield* SessionService
    yield* sessions.invalidateCacheForUser(e.userId)
  },
)

export const subscribersLayer = Layer.scopedDiscard(
  Effect.gen(function* () {
    const events = yield* UserEvents
    yield* Effect.forkScoped(
      Stream.runForEach(events.subscribe, e =>
        e._tag === 'UserBanned' ? onUserBanned(e)
          : e._tag === 'UserRoleChanged' ? onUserRoleChanged(e)
          : Effect.void,
      ),
    )
  }),
)
```

Two distinct semantics:
- **Ban** (`UserBanned`) — security revocation. `revokeAllForUser` deletes session rows + cache. User is logged out and must re-authenticate. **Cache invalidation alone is not enough** — a banned user with a valid token should not be able to make even non-admin requests.
- **Role change** (`UserRoleChanged`) — attribute mutation on a still-legitimate user. `invalidateCacheForUser` drops the cached `ResolvedSession` so the next `resolve` re-fetches the user with the new role. **Session stays alive**, user keeps their UI state. This applies regardless of direction (downgrade *or* upgrade) because the cached `user.role` is stale either way.

If `Layer.scopedDiscard` is not exported from `effect@4.0.0-beta.70`, use `Layer.effectDiscard(Effect.scoped(...))` as fallback — verify which is available.

- [ ] **Step 4: Run to verify passes**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test -- session.test.ts 2>&1 | tail -20
```

Expected: 3 PASSes for subscribers block.

- [ ] **Step 5: Wire `subscribersLayer` in `module.ts`**

In `module.ts` `Layer.mergeAll(...)`, add `Session.subscribersLayer` alongside `sessionLayer`. Order matters: the subscribers layer depends on `SessionService` and `UserEvents` — those must be visible. With `Layer.mergeAll`, all listed layers share the same scope; the deps come from outer `provideMerge` of `AccessServiceLive` etc.

```diff
  const AuthModuleLive = Layer.mergeAll(
    ApiKey.layer.pipe(...),
    UserServiceLive.pipe(Layer.provideMerge(UserEvents.layer)),
    AuthActorServiceLive,
    Password.layer,
    AuthEvents.layer,
    sessionLayer,
+   Session.subscribersLayer,
  ).pipe(
    Layer.provideMerge(BetterAuthLive),
    Layer.provideMerge(AccessServiceLive),
  )
```

Note: `Session.subscribersLayer` requires `UserEvents` and `SessionService`. The current `UserEvents.layer` is `provideMerge`d onto `UserServiceLive`, which makes it visible at the outer scope (provideMerge propagates). If layer composition errors arise, factor `UserEvents.layer` out and `provideMerge` it at the outer pipe alongside `AccessServiceLive`.

- [ ] **Step 6: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | tail -5
```

Expected: error count `<= baseline`.

- [ ] **Step 7: Run full test suite**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected: pass count `>= baseline + 8` (3 listForUser + 2 invalidateCacheForUser + 3 subscribers, minus deleted user-session-façade tests, plus AccessService and UserService/OrganizationService additions from earlier tasks).

- [ ] **Step 8: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/session.ts packages/modules/auth/src/services/session.test.ts packages/modules/auth/src/module.ts
```

---

## Task 10: Final review + commit

- [ ] **Step 1: Verify zero better-auth admin imports**

```bash
grep -rn "AdminOptions\|from 'better-auth/plugins/access'" /workspace/c-zo/packages/modules/auth/src
```

Expected: zero results.

- [ ] **Step 2: Verify zero `AuthService` references**

```bash
grep -rn "AuthService\b" /workspace/c-zo/packages/modules/auth/src
```

Expected: zero results.

- [ ] **Step 3: Verify check-types at or below baseline**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | tail -5
```

Expected: error count `<= baseline`.

- [ ] **Step 4: Verify all tests pass**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -15
```

Expected: pass count strictly greater than baseline (new tests added).

- [ ] **Step 5: Review staged diff**

```bash
cd /workspace/c-zo && git status && git diff --cached --stat
```

Verify: ~10 files modified, 2 files deleted (`services/auth.ts`, `layers/auth.ts`), ~280 lines test added.

- [ ] **Step 6: Wait for user review**

Per the no-auto-commit convention: present a summary to the user, ask for review/commit approval. Do NOT commit autonomously.

When the user approves, commit with:

```bash
git commit -m "$(cat <<'EOF'
feat(auth): SP4 — fork createAccessControl, drop AuthService, auto-revoke on ban/downgrade

Chantier 1: fork createAccessControl + Role + AccessControl drop-in inside
services/access.ts; extract pure authorizePermissions used by both Role.authorize
and AccessService.authorize. Drop better-auth/plugins/access imports.

Chantier 2: add SessionService.listForUser; delete UserService session façade
(listSessions / revokeSession / revokeSessions); resolvers route directly to
SessionService.

Chantier 3: port checkUserPermission to AccessService; relocate
checkUserPermission inside services/user.ts as UserService.hasPermission and
checkOrgPermission inside services/organization.ts as
OrganizationService.hasPermission. Delete services/auth.ts and layers/auth.ts.
permission authScope in graphql/scopes.ts dispatches based on input.organization.
Drop adminUserIds escape hatch (no replacement; first admins seed via CLI).

Chantier 4: Session.subscribersLayer (Layer.scopedDiscard + Effect.forkScoped)
fully revokes sessions on UserBanned, and invalidates the per-user resolution
cache on UserRoleChanged (any direction — session stays alive, next resolve
re-fetches the user). Handlers use Effect.fn for span naming.

Breaking changes:
- AuthService Tag removed — consumers migrate to UserService.hasPermission or
  OrganizationService.hasPermission.
- UserService.{listSessions,revokeSession,revokeSessions} removed — consumers
  use SessionService.{listForUser,revoke,revokeAllForUser}.
- adminUserIds better-auth escape hatch removed.

New SessionService methods:
- listForUser(userId): readonly SessionRow[]
- invalidateCacheForUser(userId): drops L1/L2 cache only; DB rows kept.

Spec: docs/superpowers/specs/2026-05-24-sp4-admin-access-control-design.md
Plan: docs/superpowers/plans/2026-05-24-sp4-admin-access-control.md
EOF
)"
```

---

## Self-review (executed by writer, fixed inline)

**Spec coverage:** Chantier 1 → Tasks 1–2; Chantier 2 → Tasks 3–4; Chantier 3 → Tasks 5–8; Chantier 4 → Task 9; Task 10 = final review/commit. Hors-scope items (impersonation, listUsers, org port, audit table, account flows) not in plan — correct. Note: the spec doc still mentions `isAdminDowngrade` and full-revoke on role-downgrade — that's superseded by the plan (rationale: cache invalidation is the right primitive for ANY role change, not just downgrade). The spec should be amended or the discrepancy carried as a known refinement; either way the plan is the source of truth for execution.

**Placeholder scan:** No TBD/TODO. Three `verify-at-impl-time` notes (subscribersLayer if `Layer.scopedDiscard` unavailable; UserEvents.layer propagation in module.ts; cache-invalidation primitive name in session.ts — likely needs extraction of an `invalidateCacheForToken` private helper from existing `revokeAllForUser`) are acknowledged uncertainties with concrete fallback paths, not placeholders.

**Type consistency:** `authorizePermissions(granted, required, connector?)` private to access.ts, consumed by both `createAccessControl.newRole` and `AccessService.authorize`. `hasPermission` input shape consistent: `{ role?, permissions, connector? }` for user, `{ orgId, role, permissions, connector?, allowCreatorAllPermissions?, useMemoryCache? }` for org. `invalidateCacheForUser(userId: number) => Effect<void, SessionStoreFailed>` consistent between Task 3 (def) and Task 9 (usage).

**Spec requirements not covered:** None identified.
