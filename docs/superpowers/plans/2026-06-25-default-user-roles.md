# Default User Roles at Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assign a configurable list of default roles to a user at creation when no explicit role is given — centralized in `UserService.create`, reused by `signUp`, validated at boot.

**Architecture:** A shared `DefaultUserRolesConfig` reads `AUTH_DEFAULT_USER_ROLES` (CSV). `UserService.makeLayer(defaultUserRoles)` injects it; `create` applies it (CSV or `null`) and becomes transactional. The HTTP `signUp` handler delegates user+credential creation to `UserService.create`. Auth's `onStarted` validates the configured defaults against the frozen access registry (fail-fast).

**Tech Stack:** TypeScript (strict), Effect 4 (`Effect.gen`, `Config`, `Layer`, `Effect.catchTag`), Drizzle RQBv2 + `@effect/sql-pg` (`db.transaction`), `@effect/vitest` + Testcontainers Postgres.

**Spec:** `docs/superpowers/specs/2026-06-25-default-user-roles-design.md`

## Global Constraints

- Effect 4 idioms only — no `async`/`await`/`try`/`catch`; no `console.log`. Use `Effect.gen`, `Effect.catchTag`, `Effect.mapError`, `Effect.forkDetach`.
- `users.role` is a single nullable `text` column; multiple roles are stored as a **CSV** string (matches `validateRole`'s join-by-`,`).
- Default when `AUTH_DEFAULT_USER_ROLES` unset ⇒ `role = null`. The `'user'` magic string in `create` is removed. (The GraphQL display fallback `u.role ?? 'user'` in `schema/user/types.ts:57` stays — out of scope.)
- **Role composition = deduped union**: a created user gets the configured defaults **plus** any explicit role(s), explicit first then defaults, duplicates dropped. Applies to every path including the initial-admin seed. Explicit role(s) validated per-call via `ensureValidRole`; defaults validated once at boot (fail-fast).
- `UserService.create` becomes transactional: user + credential atomic; `UserCreated` published post-commit.
- `signUp` delegates to `UserService.create`; maps `UserAlreadyExists → EmailAlreadyRegistered`. `SignedUp` is still published by `signUp`; the added `UserCreated` event has no subscriber (harmless).
- Effect-4 API note already established on this branch's siblings: it is `Effect.catchTag` (singular, used here), `Effect.catchCause` (not `catchAllCause`). Don't introduce non-existent APIs.
- Do NOT touch `hasPermission`'s `input.role || 'user'` (a permission-check fallback, unrelated to stored roles).

---

## File Structure

- `packages/modules/auth/src/services/user.ts` — **modify**: `parseCsvRoles`, `DefaultUserRolesConfig`, `InvalidDefaultUserRoles`, `assertDefaultUserRolesValid`, `makeLayer(defaultUserRoles)`, default-role application + transactional `create`.
- `packages/modules/auth/src/services/user.roles.test.ts` — **new**: unit tests for `parseCsvRoles` + `assertDefaultUserRolesValid`.
- `packages/modules/auth/src/services/user.default-roles.integration.test.ts` — **new**: `create` default-role behavior over Postgres.
- `packages/modules/auth/src/index.ts` — **modify**: `authConfig.defaultUserRoles`, `User.makeLayer(cfg.defaultUserRoles)`, `onStarted` boot validation.
- `packages/modules/auth/src/http/credential.ts` — **modify**: `signUp` delegates to `UserService.create`.
- `packages/modules/auth/src/http/credential.test.ts` — **modify**: TestLayer provides `UserService`.

---

### Task 1: Core — config parsing, default-role application, transactional create

**Files:**
- Modify: `packages/modules/auth/src/services/user.ts`
- Test: `packages/modules/auth/src/services/user.roles.test.ts` (create)
- Test: `packages/modules/auth/src/services/user.default-roles.integration.test.ts` (create)

**Interfaces:**
- Consumes: existing `UserService`, `ensureValidRole`, `insertCredential` (`(db|tx, userId, hash, now?)`), `events`, `passwords`, `db` (`Database<Relations>` with `.transaction`). `seededAccessLayer` + `ADMIN_STATEMENTS`/`ADMIN_HIERARCHY` for tests.
- Produces (all from `./user`):
  - `parseCsvRoles(raw: string): string[]`
  - `mergeRoles(provided: ReadonlyArray<string>, defaults: ReadonlyArray<string>): string[]` (deduped union, provided-first)
  - `DefaultUserRolesConfig: Effect.Effect<ReadonlyArray<string>, ...>` (reads `AUTH_DEFAULT_USER_ROLES`, default `[]`)
  - `class InvalidDefaultUserRoles` (Data.TaggedError, field `roles: ReadonlyArray<string>`)
  - `assertDefaultUserRolesValid(defaultUserRoles: ReadonlyArray<string>, registered: Record<string, unknown>): Effect.Effect<void, InvalidDefaultUserRoles>`
  - `makeLayer(defaultUserRoles?: ReadonlyArray<string>): Layer` and back-compat `layer = makeLayer()`

- [ ] **Step 1: Write the failing unit test**

Create `packages/modules/auth/src/services/user.roles.test.ts`:

```ts
import { describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { assertDefaultUserRolesValid, mergeRoles, parseCsvRoles } from './user'

describe('parseCsvRoles', () => {
  it('empty string → []', () => {
    expect(parseCsvRoles('')).toEqual([])
  })
  it('single role', () => {
    expect(parseCsvRoles('admin')).toEqual(['admin'])
  })
  it('trims and drops empties', () => {
    expect(parseCsvRoles('a, b ,')).toEqual(['a', 'b'])
  })
})

describe('mergeRoles', () => {
  it('provided first, then defaults', () => {
    expect(mergeRoles(['admin'], ['m', 'v'])).toEqual(['admin', 'm', 'v'])
  })
  it('dedupes overlap', () => {
    expect(mergeRoles(['m'], ['m'])).toEqual(['m'])
  })
  it('defaults only when nothing provided', () => {
    expect(mergeRoles([], ['x'])).toEqual(['x'])
  })
  it('empty when both empty', () => {
    expect(mergeRoles([], [])).toEqual([])
  })
})

describe('assertDefaultUserRolesValid', () => {
  it.effect('passes when every role is registered', () =>
    assertDefaultUserRolesValid(['x'], { x: {}, y: {} }))

  it.effect('fails InvalidDefaultUserRoles listing the unknown roles', () =>
    assertDefaultUserRolesValid(['x', 'z'], { x: {} }).pipe(
      Effect.flip,
      Effect.tap(e => Effect.sync(() => {
        expect(e._tag).toBe('InvalidDefaultUserRoles')
        expect(e.roles).toEqual(['z'])
      })),
    ))
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @czo/auth test user.roles`
Expected: FAIL — `parseCsvRoles`/`mergeRoles`/`assertDefaultUserRolesValid` are not exported from `./user`.

- [ ] **Step 3: Add `Config` to the effect import**

In `packages/modules/auth/src/services/user.ts`, the effect import is currently:

```ts
import { Context, Data, Effect, Layer } from 'effect'
```

Change it to add `Config`:

```ts
import { Config, Context, Data, Effect, Layer } from 'effect'
```

- [ ] **Step 4: Add the parser, config, error, and validator**

In `packages/modules/auth/src/services/user.ts`, add near the other tagged-error
declarations (top of file, after the existing `import`s and before/among the
`Data.TaggedError` classes):

```ts
/** Parse a CSV role list: split on `,`, trim, drop empties. */
export function parseCsvRoles(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

/** Deduped union of provided + default roles (provided first). */
export function mergeRoles(provided: ReadonlyArray<string>, defaults: ReadonlyArray<string>): string[] {
  return [...new Set([...provided, ...defaults])]
}

/**
 * Shared reader for the default platform roles assigned to a user at creation.
 * Unset ⇒ `[]` (no default role). Used by `authConfig` (to build the layer) and
 * by the boot-time validation in the module's `onStarted`.
 */
export const DefaultUserRolesConfig = Effect.gen(function* () {
  const raw = yield* Config.string('AUTH_DEFAULT_USER_ROLES').pipe(Config.withDefault(''))
  return parseCsvRoles(raw) as ReadonlyArray<string>
})

/** Raised at boot when a configured default role is not in the access registry. */
export class InvalidDefaultUserRoles extends Data.TaggedError('InvalidDefaultUserRoles')<{
  readonly roles: ReadonlyArray<string>
}> {
  readonly code = 'INVALID_DEFAULT_USER_ROLES'
  get message() {
    return `AUTH_DEFAULT_USER_ROLES contains unregistered role(s): ${this.roles.join(', ')}`
  }
}

/** Fail-fast check: every configured default role must exist in the registry.
 *  Reuses `validateRole` (already imported in this file) instead of hand-rolled
 *  membership checks — `validateRole(r, registered)` returns `false` for an
 *  unregistered role. */
export function assertDefaultUserRolesValid(
  defaultUserRoles: ReadonlyArray<string>,
  registered: Record<string, unknown>,
): Effect.Effect<void, InvalidDefaultUserRoles> {
  return Effect.gen(function* () {
    const invalid = defaultUserRoles.filter(
      r => validateRole(r, registered as Parameters<typeof validateRole>[1]) === false,
    )
    if (invalid.length > 0)
      return yield* Effect.fail(new InvalidDefaultUserRoles({ roles: invalid }))
  })
}
```

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `pnpm --filter @czo/auth test user.roles`
Expected: PASS (9 tests: parseCsvRoles ×3, mergeRoles ×4, assertDefaultUserRolesValid ×2).

- [ ] **Step 6: Parametrize the layer with `defaultUserRoles`**

In `packages/modules/auth/src/services/user.ts`, the service factory currently
starts (around line 262):

```ts
const make = Effect.gen(function* () {
```

Change it to a factory that closes over the default roles:

```ts
const makeService = (defaultUserRoles: ReadonlyArray<string>) =>
  Effect.gen(function* () {
```

(The generator body is unchanged except for the `create` change in Step 7.)

Then the layer export currently reads:

```ts
/** Live layer — depends on DrizzleDb, AccessService, UserEvents. */
export const layer = Layer.effect(UserService, make)
```

Replace it with:

```ts
/** Live layer — depends on DrizzleDb, AccessService, UserEvents.
 *  `defaultUserRoles` are assigned (CSV) to users created without an explicit
 *  role; they must be registry-valid (checked at boot via assertDefaultUserRolesValid). */
export function makeLayer(defaultUserRoles: ReadonlyArray<string> = []) {
  return Layer.effect(UserService, makeService(defaultUserRoles))
}

/** Back-compat no-arg layer (no default roles). */
export const layer = makeLayer()
```

- [ ] **Step 7: Apply default roles + make `create` transactional**

In `packages/modules/auth/src/services/user.ts`, replace the entire `create`
method body (currently from `create: input =>` through its closing `}),` — the
block that does the existence check, role resolution, insert, credential link,
and `UserCreated` publish) with:

```ts
    create: input =>
      Effect.gen(function* () {
        const existing = yield* dbErr(
          db.query.users.findFirst({ where: { email: input.email } }),
        )
        if (existing)
          return yield* Effect.fail(new UserAlreadyExists({ user: existing }))

        // Stored role = deduped union of any provided role(s) (validated) and
        // the configured defaults (boot-validated); null when both are empty.
        const provided = input.role ? parseCsvRoles(yield* ensureValidRole(input.role)) : []
        const merged = mergeRoles(provided, defaultUserRoles)
        const role = merged.length > 0 ? merged.join(',') : null

        // Hash before opening the transaction to keep the tx short. Hash failure
        // surfaces as CredentialLinkFailed (no user row written yet).
        const hashed = input.password
          ? yield* passwords.hash(input.password).pipe(
              Effect.mapError(cause => new CredentialLinkFailed({ cause })),
            )
          : undefined

        const now = new Date()
        // user + credential in ONE transaction → no orphan user if the
        // credential insert fails (it rolls back).
        const user = yield* db.transaction(tx =>
          Effect.gen(function* () {
            const [u] = yield* dbErr(
              tx.insert(users).values({
                ...input,
                role,
                emailVerified: input.emailVerified ?? false,
                createdAt: now,
                updatedAt: now,
              }).returning(),
            )
            if (!u)
              return yield* Effect.fail(new UserDbFailed({ cause: 'insert returned no row' }))
            if (hashed !== undefined)
              yield* insertCredential(tx, u.id, hashed, now).pipe(
                Effect.mapError(cause => new CredentialLinkFailed({ cause })),
              )
            return u
          }),
        )

        // Post-commit, fire-and-forget. `UserCreated` currently has no
        // subscriber; kept for parity with the domain-event surface.
        yield* Effect.forkDetach(events.publish({ _tag: 'UserCreated', userId: user.id, email: user.email }))
        return user
      }),
```

- [ ] **Step 8: Apply the same merge in `update` and `setRole`**

In `packages/modules/auth/src/services/user.ts`, `update` currently resolves the
role like this:

```ts
        let role: string | undefined = input.role as string | undefined
        if (input.role) {
          role = yield* ensureValidRole(input.role)
        }

        const row = yield* updateUserRow(id, { ...input, role })
```

Replace it so a provided role is merged with the defaults (a role-less update
still leaves `role` untouched — `undefined` ⇒ `updateUserRow` skips it):

```ts
        let role: string | null | undefined
        if (input.role) {
          const provided = parseCsvRoles(yield* ensureValidRole(input.role))
          const merged = mergeRoles(provided, defaultUserRoles)
          role = merged.length > 0 ? merged.join(',') : null
        }

        const row = yield* updateUserRow(id, { ...input, role })
```

`setRole` currently reads:

```ts
        const existing = yield* findById(id)
        const validRole = yield* ensureValidRole(role)

        if (actorId !== undefined && existing.id === actorId)
          return yield* Effect.fail(new CannotDemoteSelf())

        const row = yield* updateUserRow(id, { role: validRole })
        yield* Effect.forkDetach(events.publish({
          _tag: 'UserRoleChanged',
          userId: id,
          previousRole: existing.role,
          newRole: validRole,
          changedBy: actorId ?? null,
        }))
        return row
```

Replace `validRole` with the merged value (setRole's `role` arg is required, so
the merge is always non-empty):

```ts
        const existing = yield* findById(id)
        const provided = parseCsvRoles(yield* ensureValidRole(role))
        const newRole = mergeRoles(provided, defaultUserRoles).join(',')

        if (actorId !== undefined && existing.id === actorId)
          return yield* Effect.fail(new CannotDemoteSelf())

        const row = yield* updateUserRow(id, { role: newRole })
        yield* Effect.forkDetach(events.publish({
          _tag: 'UserRoleChanged',
          userId: id,
          previousRole: existing.role,
          newRole,
          changedBy: actorId ?? null,
        }))
        return row
```

- [ ] **Step 9: Write the failing default-roles integration test**

Create `packages/modules/auth/src/services/user.default-roles.integration.test.ts`:

```ts
import { layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { ADMIN_HIERARCHY, ADMIN_STATEMENTS } from '../plugins/access'
import { seededAccessLayer } from '../testing/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as UserEvents from './events/user'
import * as Password from './password'
import * as User from './user'

const access = seededAccessLayer(
  [{ name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY }],
  false,
)

function userLayer(defaults: ReadonlyArray<string>) {
  return User.makeLayer(defaults).pipe(
    Layer.provideMerge(Layer.mergeAll(Password.layer, UserEvents.layer, access)),
    Layer.provideMerge(AuthPostgresLayer),
  )
}

layer(userLayer([]), { timeout: 120_000 })('create — no default roles', (it) => {
  it.effect('no explicit role + empty config → role is null', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'none@x.io', name: 'N', password: 'DevAdmin1!' })
      expect(u.role).toBe(null)
    }))
})

layer(userLayer(['admin:manager', 'admin:viewer']), { timeout: 120_000 })('create — configured default roles', (it) => {
  it.effect('no explicit role → CSV of configured defaults', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'def@x.io', name: 'D', password: 'DevAdmin1!' })
      expect(u.role).toBe('admin:manager,admin:viewer')
    }))

  it.effect('explicit role is MERGED with defaults (explicit first, deduped)', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'exp@x.io', name: 'E', password: 'DevAdmin1!', role: 'admin' })
      expect(u.role).toBe('admin,admin:manager,admin:viewer')
    }))

  it.effect('explicit role overlapping a default is not duplicated', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'dup@x.io', name: 'U', password: 'DevAdmin1!', role: 'admin:manager' })
      expect(u.role).toBe('admin:manager,admin:viewer')
    }))
})

layer(userLayer(['admin:viewer']), { timeout: 120_000 })('update/setRole — defaults re-merged', (it) => {
  it.effect('setRole merges its arg with the defaults', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'sr@x.io', name: 'S', password: 'DevAdmin1!' })
      const updated = yield* users.setRole(u.id, 'admin')
      expect(updated.role).toBe('admin,admin:viewer')
    }))

  it.effect('update with a role merges with the defaults', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'up@x.io', name: 'U', password: 'DevAdmin1!' })
      const updated = yield* users.update(u.id, { role: 'admin' })
      expect(updated.role).toBe('admin,admin:viewer')
    }))

  it.effect('update without a role leaves the role untouched', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'nr@x.io', name: 'N', password: 'DevAdmin1!' })
      const updated = yield* users.update(u.id, { name: 'Renamed' })
      expect(updated.role).toBe('admin:viewer')
      expect(updated.name).toBe('Renamed')
    }))
})
```

- [ ] **Step 10: Run the integration test to verify it passes**

Run: `pnpm --filter @czo/auth test user.default-roles`
Expected: PASS (7 tests across 3 layer scopes: create null; create CSV defaults; create merge; create dedup; setRole merge; update-with-role merge; update-without-role untouched). (`create`/`update`/`setRole` already have the new behavior from Steps 7–8.)

- [ ] **Step 11: Confirm no regression in the existing create suite**

Run: `pnpm --filter @czo/auth test user.create.integration`
Expected: PASS — the `emailVerified` tests don't assert `role`, so the null default is fine. (If any assertion expected `role === 'user'`, update it to `null` — none is expected.)

- [ ] **Step 12: Type-check & lint**

Run: `pnpm --filter @czo/auth check-types` then `pnpm lint`
Expected: no errors. (If `db.transaction`'s typed error channel needs help, ensure the `tx` generator's failures are `UserDbFailed`/`CredentialLinkFailed` as written.)

- [ ] **Step 13: Commit**

```bash
git add packages/modules/auth/src/services/user.ts \
        packages/modules/auth/src/services/user.roles.test.ts \
        packages/modules/auth/src/services/user.default-roles.integration.test.ts
git commit -m "feat(auth): configurable default user roles + transactional create"
```

---

### Task 2: Wire config + boot validation

**Files:**
- Modify: `packages/modules/auth/src/index.ts`

**Interfaces:**
- Consumes (from `./services/user`, Task 1): `DefaultUserRolesConfig`, `makeLayer`, `assertDefaultUserRolesValid`. Already-present: `Access.AccessService` (with `roles`/`buildRoles`/`freeze`), the `authConfig` generator, the `onStarted` block.
- Produces: no exported API — wiring only.

**Note:** No new automated test — `assertDefaultUserRolesValid` is unit-tested in Task 1; this task only wires config-read + layer param + the boot call. Verified by type-check, lint, and the existing auth suite.

- [ ] **Step 1: Read the default roles in `authConfig`**

In `packages/modules/auth/src/index.ts`, the `authConfig` generator ends with:

```ts
    const enumTimingBudgetMs = yield* Config.int('AUTH_ENUM_TIMING_BUDGET_MS').pipe(Config.withDefault(250))
    return { app, secret, baseUrl, requireEmailVerification, sendVerificationOnSignUp, orgOwnerRole, enumTimingBudgetMs }
```

Add a `defaultUserRoles` read (using the shared config) and return it:

```ts
    const enumTimingBudgetMs = yield* Config.int('AUTH_ENUM_TIMING_BUDGET_MS').pipe(Config.withDefault(250))
    const defaultUserRoles = yield* DefaultUserRolesConfig
    return { app, secret, baseUrl, requireEmailVerification, sendVerificationOnSignUp, orgOwnerRole, enumTimingBudgetMs, defaultUserRoles }
```

- [ ] **Step 2: Import the new symbols**

In `packages/modules/auth/src/index.ts`, find the existing user-service import.
It is the namespace import used as `User.layer` (e.g. `import * as User from './services/user'`).
Ensure these are importable from `./services/user`:
`DefaultUserRolesConfig`, `assertDefaultUserRolesValid` (both exported in Task 1).
If the file uses `import * as User from './services/user'`, reference them as
`User.DefaultUserRolesConfig` / `User.assertDefaultUserRolesValid` and use
`User.makeLayer(...)`. (Confirm the existing alias and match it.)

- [ ] **Step 3: Pass the default roles into the user layer**

In `packages/modules/auth/src/index.ts`, the layer composition currently has:

```ts
      Layer.provideMerge(User.layer),
```

Replace it with:

```ts
      Layer.provideMerge(User.makeLayer(cfg.defaultUserRoles)),
```

(`cfg` is the resolved `authConfig` value in scope of the `Layer.unwrap(authConfig.pipe(Effect.map((cfg) => …)))` block — same place `Organization.makeLayer(cfg.orgOwnerRole)` is used.)

- [ ] **Step 4: Validate the defaults at boot in `onStarted`**

In `packages/modules/auth/src/index.ts`, the `onStarted` effect runs
`access.buildRoles` then `access.freeze` then warms `OrganizationService`
(and, on this branch, seeds the initial admin). Add the default-role validation
**after `access.freeze`** and before the initial-admin seed:

```ts
      yield* access.freeze
      // Fail-fast: every configured default user role must exist in the frozen
      // registry. This is a PROPAGATING failure (not caught) — a bad config
      // aborts boot rather than silently creating users with phantom roles.
      const defaultUserRoles = yield* User.DefaultUserRolesConfig
      const registered = yield* access.roles
      yield* User.assertDefaultUserRolesValid(defaultUserRoles, registered)
```

(The existing `as unknown as Effect.Effect<void, never, never>` cast on
`onStarted` remains; it absorbs the `InvalidDefaultUserRoles` / `ConfigError`
types while still letting a real failure abort boot.)

- [ ] **Step 5: Type-check & lint**

Run: `pnpm --filter @czo/auth check-types` then `pnpm lint`
Expected: no errors.

- [ ] **Step 6: Confirm the auth suite still boots/passes**

Run: `pnpm --filter @czo/auth test user.roles user.default-roles`
Expected: PASS (Task 1 suites still green; nothing in index breaks them).

- [ ] **Step 7: Commit**

```bash
git add packages/modules/auth/src/index.ts
git commit -m "feat(auth): wire AUTH_DEFAULT_USER_ROLES + boot validation"
```

---

### Task 3: `signUp` delegates to `UserService.create`

**Files:**
- Modify: `packages/modules/auth/src/http/credential.ts`
- Test: `packages/modules/auth/src/http/credential.test.ts`

**Interfaces:**
- Consumes: `UserService.create` (Task 1) — `Effect<User, UserAlreadyExists | InvalidRole | CredentialLinkFailed | PasswordHashFailed | UserDbFailed, …>`. Existing `EmailAlreadyRegistered`, `CredentialDbFailed`, `assertActorType`, `Session.SessionService`, `AuthActorService`, `AuthEvents`.
- Produces: `signUp` with the same external contract (`CredentialResult` / `CredentialError`), now backed by `UserService.create`.

- [ ] **Step 1: Update the signUp test layer to provide `UserService`**

In `packages/modules/auth/src/http/credential.test.ts`, the current `TestLayer`
does not provide `UserService` (signUp will now require it). Add the imports and
extend the layer. Add these imports near the existing ones:

```ts
import { ADMIN_HIERARCHY, ADMIN_STATEMENTS } from '../plugins/access'
import { seededAccessLayer } from '../testing/access'
import * as UserEvents from '../services/events/user'
import * as User from '../services/user'
```

Replace the `TestLayer` definition:

```ts
const TestLayer = Layer.mergeAll(
  Password.layer,
  Session.layer.pipe(Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer, AuthEvents.layer))),
  Actor.makeLayer(DEFAULT_ACTOR_RESTRICTIONS, true),
  AuthEvents.layer,
).pipe(Layer.provideMerge(AuthPostgresLayer))
```

with one that also provides `UserService` (no default roles in the test):

```ts
const accessLayer = seededAccessLayer(
  [{ name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY }],
  false,
)

const TestLayer = Layer.mergeAll(
  Password.layer,
  Session.layer.pipe(Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer, AuthEvents.layer))),
  Actor.makeLayer(DEFAULT_ACTOR_RESTRICTIONS, true),
  AuthEvents.layer,
  User.makeLayer([]).pipe(Layer.provide(Layer.mergeAll(Password.layer, UserEvents.layer, accessLayer))),
).pipe(Layer.provideMerge(AuthPostgresLayer))
```

- [ ] **Step 2: Run the existing signUp tests to verify they now fail**

Run: `pnpm --filter @czo/auth test credential`
Expected: FAIL — `signUp` still does its own insert and does not yet require/use `UserService` (or the layer wiring mismatches). This is the RED for the delegation. (If they still pass, that only means the layer change compiles; proceed — Step 4 is the real behavior change and Step 5 re-runs them.)

- [ ] **Step 3: Add the `UserService` import to `credential.ts`**

In `packages/modules/auth/src/http/credential.ts`, add a value import for the
user service (there is already `import type { PasswordHashFailed } from '../services/user'`):

```ts
import * as User from '../services/user'
```

- [ ] **Step 4: Delegate signUp to `UserService.create`**

In `packages/modules/auth/src/http/credential.ts`, change `signUp`'s signature
requirements and replace its email pre-check + hash + manual transaction with a
call to `UserService.create`. Update the `Effect` requirement (`R`) channel to
add `User.UserService` and drop `DrizzleDb`/`Password.PasswordService` (no longer
used by signUp):

```ts
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
```

(`PasswordHashFailed` remains a valid member of `CredentialError`, so create
surfacing it — if ever — type-checks without an explicit catch.)

- [ ] **Step 5: Remove now-unused imports in `credential.ts`**

`signUp` no longer inserts users or links credentials directly. Remove imports
that **only** `signUp` used and are now unused (verify each is not used by
`signIn`/`signOut`/module scope before deleting):
- `insertCredential` (from `../services/utils/credential-account`) — keep `CREDENTIAL_PROVIDER` (used by `signIn`).
- `users` (from `../database/schema`) — remove only if `signIn` does not reference it.

Let `pnpm lint` / `check-types` confirm; do not remove anything still referenced.

- [ ] **Step 6: Run the signUp/signIn tests to verify they pass**

Run: `pnpm --filter @czo/auth test credential`
Expected: PASS — `signUp creates user + credential + session` (now via delegation: the `accounts` row with `providerId='credential'` still asserts), `signUp publishes a SignedUp event`, and the `EmailAlreadyRegistered` / signIn cases.

- [ ] **Step 7: Run the auth e2e signup path (no regression)**

Run: `pnpm --filter @czo/auth test rest-auth.e2e`
Expected: PASS — the REST `/api/auth/sign-up` flow still creates a user + session.

- [ ] **Step 8: Type-check & lint**

Run: `pnpm --filter @czo/auth check-types` then `pnpm lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/modules/auth/src/http/credential.ts \
        packages/modules/auth/src/http/credential.test.ts
git commit -m "refactor(auth): signUp delegates user creation to UserService.create"
```

---

## Self-Review

**Spec coverage:**
- `AUTH_DEFAULT_USER_ROLES` CSV config + shared reader → Task 1 (`DefaultUserRolesConfig`, `parseCsvRoles`). ✅
- `'user'` removed; `null` when empty → Task 1 Step 7. ✅
- Role composition = deduped union of provided (validated) + defaults (boot-validated), via shared `mergeRoles`, applied in `create` (Step 7) **and** `update` + `setRole` (Step 8) → Task 1 + tests. ✅
- Validation reuses `validateRole` (no hand-rolled parsing) → Task 1 Step 4 (`assertDefaultUserRolesValid`). ✅
- Transactional create (atomic user+credential) → Task 1 Step 7. ✅
- `makeLayer(defaultUserRoles)` + wiring → Task 1 Step 6, Task 2 Step 3. ✅
- Boot validation fail-fast (`InvalidDefaultUserRoles`) → Task 1 (validator) + Task 2 Step 4. ✅
- `signUp` delegates; `UserAlreadyExists → EmailAlreadyRegistered`; `SignedUp` kept → Task 3. ✅
- GraphQL display fallback untouched; `hasPermission`'s `|| 'user'` untouched → Global Constraints. ✅
- Tests: parseCsvRoles + mergeRoles + validator units; create/update/setRole merge+dedup integration; signUp delegation via existing suite → Tasks 1 & 3. ✅

**Known follow-up (from spec blast-radius):** `userCounts.admins` uses `eq(users.role, 'admin')` (exact match). Unaffected when no defaults are configured (admins stay `'admin'`); if a deployment sets defaults, an admin's role becomes `'admin,<defaults>'` and the count query would need a CSV-contains match. Out of scope — flag in the PR.

**Placeholder scan:** none — every code step shows complete code; every run step has a command + expected result.

**Type consistency:** `parseCsvRoles`/`mergeRoles`/`DefaultUserRolesConfig`/`InvalidDefaultUserRoles`/`assertDefaultUserRolesValid`/`makeLayer` defined in Task 1, consumed identically in Tasks 2–3. `mergeRoles` returns `string[]`; callers join to CSV or `null`. `create` error tags caught in Task 3 (`UserAlreadyExists`, `InvalidRole`, `CredentialLinkFailed`, `UserDbFailed`) match `create`'s declared channel; `PasswordHashFailed` intentionally left to pass through (member of `CredentialError`). `makeLayer([])` used consistently in test layers. Dev password `DevAdmin1!` reused (policy-valid).

**Note on atomicity:** forcing a credential-insert failure isn't cleanly injectable in this harness, so rollback is covered structurally by the single `db.transaction` (the happy-path tests prove user+credential both land). No contrived fault-injection test is added.
