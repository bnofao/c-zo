# Initial Admin User for `life` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real, login-capable **admin** user is created idempotently for `life` from environment config — via one shared `ensureInitialAdmin` core with two entry points (auth boot hook + `life` CLI).

**Architecture:** A new `ensureInitialAdmin` Effect in `@czo/auth` calls the existing `UserService.create` (extended with `emailVerified`). It is invoked automatically from auth's `onStarted` lifecycle hook (after the access registry is frozen) and manually from a new `apps/life/src/seed-admin.ts` CLI. Config (`INITIAL_ADMIN_*`) is read via Effect `Config`, with dev defaults outside production.

**Tech Stack:** TypeScript (strict), Effect 4 (`Effect.gen`, `Config`, `Layer`), Drizzle RQBv2 + `@effect/sql-pg`, `@effect/vitest` + Testcontainers Postgres, h3/Nitro-free Node entrypoints via `tsx`.

**Spec:** `docs/superpowers/specs/2026-06-25-initial-admin-user-design.md`

## Global Constraints

- **No `async`/`await`/`try`/`catch`** in service code — use `Effect.gen`, `Effect.sync`, `Effect.tryPromise`, `Effect.catchTag`, `Effect.catchAllCause`.
- **No `console.log`** — use `Effect.logInfo`/`Effect.logError` in Effect code, `useLogger(...)` in entrypoints.
- **Idempotency = ensure-by-email:** create only if `INITIAL_ADMIN_EMAIL`'s user is missing; if it exists, skip and **leave it untouched** (never overwrite password). The rare multi-replica insert race (Postgres SQLSTATE `23505`) counts as "exists → skip".
- **Platform role configurable** via `INITIAL_ADMIN_ROLE` (default `admin`), validated against the frozen `access.roles`. `'admin'` is the top of `ADMIN_HIERARCHY`.
- **Dev defaults only outside production:** when `NODE_ENV !== 'production'`, unset email/password fall back to `admin@life.dev` / `DevAdmin1!` (policy-valid). In production an unset email **or** password ⇒ no-op (never crash). Empty string is treated as unset.
- **Email + password are secrets:** read via `Config.redacted` (→ `Redacted.Redacted<string>`, like `DATABASE_URL` in `packages/kit/src/db/index.ts`), kept wrapped through config → core, and unwrapped with `Redacted.value(...)` **only** at the `UserService.create` sink. Never log them in clear (logs omit the address; OTel spans must not carry them). Deploy them as Coolify **secrets**, never committed.
- **Bootstrap admin is `emailVerified: true`** so it can log in regardless of `AUTH_REQUIRE_EMAIL_VERIFICATION`.
- **Boot seed must never block startup:** any error in the boot hook is caught and logged. The CLI, by contrast, exits non-zero on error/missing-config.
- **Out of scope:** password reset-on-run, initial organization/membership, multiple seed users. The existing fake-data `DB_SEEDERS` is untouched.
- **Dist rebuild:** `life` (and its CLI) import `@czo/auth` via the package's `default` (dist) condition under `tsx`. After changing auth, run `pnpm --filter @czo/auth build` before running `life`/the CLI. Tests run against `src` directly (no build needed).
- **Password policy** (`services/utils/password-schema.ts`): 8–20 chars, ≥1 upper, ≥1 lower, ≥1 digit, ≥1 of `!@#$%^&*`. `DevAdmin1!` satisfies it.

---

## File Structure

- `packages/modules/auth/src/services/user.ts` — **modify**: add `emailVerified?` to `CreateUserInput` + insert.
- `packages/modules/auth/src/services/initial-admin.ts` — **new**: `ensureInitialAdmin` + `InitialAdminConfig` + `isUniqueViolation`.
- `packages/modules/auth/src/services/index.ts` — **modify**: re-export the new module.
- `packages/modules/auth/src/services/user.create.integration.test.ts` — **new**: `emailVerified` coverage.
- `packages/modules/auth/src/services/initial-admin.test.ts` — **new**: `InitialAdminConfig` unit (pure, config-provider driven).
- `packages/modules/auth/src/services/initial-admin.integration.test.ts` — **new**: `ensureInitialAdmin` over Postgres.
- `packages/modules/auth/src/index.ts` — **modify**: extend `onStarted` to run the seed.
- `apps/life/src/seed-admin.ts` — **new**: CLI entry point.
- `apps/life/package.json` — **modify**: add `seed:admin` script.
- `docker-compose.yml` — **modify**: `INITIAL_ADMIN_*` on the `life` service.
- `docs/deployment/coolify.md` — **modify**: document the vars (Option A + B).

---

### Task 1: `UserService.create` accepts `emailVerified`

**Files:**
- Modify: `packages/modules/auth/src/services/user.ts` (`CreateUserInput` ~ lines 113–118; insert ~ lines 312–318)
- Test: `packages/modules/auth/src/services/user.create.integration.test.ts` (create)

**Interfaces:**
- Consumes: existing `UserService` (`@czo/auth/UserService`), `User.layer`, `Password.layer`, `UserEvents.layer`, `Access.makeLayer`, `AuthPostgresLayer`/`truncateAuth`.
- Produces: `CreateUserInput.emailVerified?: boolean` (default `false`) — Task 2 relies on passing `emailVerified: true`.

- [ ] **Step 1: Write the failing test**

Create `packages/modules/auth/src/services/user.create.integration.test.ts`:

```ts
import { DrizzleDb } from '@czo/kit/db'
import { layer } from '@effect/vitest'
import { expect } from 'vitest'
import { Effect, Layer } from 'effect'
import { ADMIN_HIERARCHY, ADMIN_STATEMENTS } from '../plugins/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Access from './access'
import * as UserEvents from './events/user'
import * as Password from './password'
import * as User from './user'

const AccessLive = Access.makeLayer(
  [{ name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY }],
  false,
)

// `provideMerge` keeps UserService AND its deps (DrizzleDb, Access, …) visible
// in the output context so the test body can resolve them too.
const TestLayer = User.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(Password.layer, UserEvents.layer, AccessLive)),
  Layer.provideMerge(AuthPostgresLayer),
)

layer(TestLayer, { timeout: 120_000 })('UserService.create emailVerified', (it) => {
  it.effect('persists emailVerified: true when set', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const user = yield* users.create({
        email: 'verified@example.com',
        name: 'V',
        password: 'DevAdmin1!',
        emailVerified: true,
      })
      expect(user.emailVerified).toBe(true)
    }))

  it.effect('defaults emailVerified: false when omitted', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const user = yield* users.create({
        email: 'plain@example.com',
        name: 'P',
        password: 'DevAdmin1!',
      })
      expect(user.emailVerified).toBe(false)
    }))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @czo/auth test user.create.integration`
Expected: FAIL — `emailVerified: true` is not an accepted property of `CreateUserInput` (type error), or the persisted value is `false` for the first test.

- [ ] **Step 3: Add `emailVerified` to `CreateUserInput`**

In `packages/modules/auth/src/services/user.ts`, extend the interface (currently lines ~113–118):

```ts
export interface CreateUserInput {
  name: string
  email: string
  role?: string | string[] | null
  password?: string | null
  emailVerified?: boolean
}
```

- [ ] **Step 4: Pass it through the insert**

In the same file, the `create` insert (currently ~lines 312–318). Add an explicit `emailVerified` line so an omitted value deterministically becomes `false`:

```ts
        const [user] = yield* dbErr(
          db.insert(users).values({
            ...input,
            role: role ?? 'user',
            emailVerified: input.emailVerified ?? false,
            createdAt: new Date(),
            updatedAt: new Date(),
          }).returning(),
        )
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @czo/auth test user.create.integration`
Expected: PASS (2 tests).

- [ ] **Step 6: Type-check & lint**

Run: `pnpm --filter @czo/auth check-types` then `pnpm lint:fix`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/modules/auth/src/services/user.ts \
        packages/modules/auth/src/services/user.create.integration.test.ts
git commit -m "feat(auth): UserService.create accepts emailVerified"
```

---

### Task 2: `ensureInitialAdmin` core + `InitialAdminConfig`

**Files:**
- Create: `packages/modules/auth/src/services/initial-admin.ts`
- Modify: `packages/modules/auth/src/services/index.ts` (add namespace re-export)
- Test: `packages/modules/auth/src/services/initial-admin.test.ts` (config unit, pure)
- Test: `packages/modules/auth/src/services/initial-admin.integration.test.ts` (Postgres)

**Interfaces:**
- Consumes: `UserService` + `CreateUserInput.emailVerified` (Task 1); `UserAlreadyExists`, `UserDbFailed`, `InvalidRole`, `CredentialLinkFailed`, `PasswordHashFailed` from `./user`; `describeDbError` from `@czo/kit/db`; `Config`, `Redacted` from `effect`.
- Produces:
  - `ensureInitialAdmin(input: EnsureInitialAdminInput): Effect.Effect<EnsureInitialAdminResult, EnsureInitialAdminError, UserService>`
  - `InitialAdminConfig: Effect.Effect<InitialAdminSettings, ...>` (reads env, applies dev defaults).
  - `EnsureInitialAdminInput = { email: Redacted.Redacted<string>; name: string; password: Redacted.Redacted<string>; role?: string | string[] }`
  - `EnsureInitialAdminResult = { created: boolean; email: Redacted.Redacted<string> }`
  - `InitialAdminSettings = { email: Redacted.Redacted<string>; password: Redacted.Redacted<string>; name: string; role: string }` (empty wrapped value ⇒ unset).
  - Re-exported as `InitialAdmin` from `@czo/auth/services`.

- [ ] **Step 1: Write the failing config unit test**

Create `packages/modules/auth/src/services/initial-admin.test.ts`:

```ts
import { describe, it } from '@effect/vitest'
import { expect } from 'vitest'
import { ConfigProvider, Effect, Redacted } from 'effect'
import { InitialAdminConfig } from './initial-admin'

describe('InitialAdminConfig', () => {
  it.effect('applies dev defaults when unset outside production', () =>
    InitialAdminConfig.pipe(
      Effect.tap(s => Effect.sync(() => {
        expect(Redacted.value(s.email)).toBe('admin@life.dev')
        expect(Redacted.value(s.password)).toBe('DevAdmin1!')
        expect(s.name).toBe('Admin')
        expect(s.role).toBe('admin')
      })),
      Effect.withConfigProvider(ConfigProvider.fromMap(new Map([['NODE_ENV', 'development']]))),
    ))

  it.effect('no defaults in production (email/password stay empty)', () =>
    InitialAdminConfig.pipe(
      Effect.tap(s => Effect.sync(() => {
        expect(Redacted.value(s.email)).toBe('')
        expect(Redacted.value(s.password)).toBe('')
      })),
      Effect.withConfigProvider(ConfigProvider.fromMap(new Map([['NODE_ENV', 'production']]))),
    ))

  it.effect('explicit env values win and dev defaults do not apply', () =>
    InitialAdminConfig.pipe(
      Effect.tap(s => Effect.sync(() => {
        expect(Redacted.value(s.email)).toBe('boss@acme.io')
        expect(s.role).toBe('admin,admin:manager')
      })),
      Effect.withConfigProvider(ConfigProvider.fromMap(new Map([
        ['NODE_ENV', 'development'],
        ['INITIAL_ADMIN_EMAIL', 'boss@acme.io'],
        ['INITIAL_ADMIN_PASSWORD', 'Sup3r-Secret!'],
        ['INITIAL_ADMIN_ROLE', 'admin,admin:manager'],
      ]))),
    ))
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @czo/auth test initial-admin.test`
Expected: FAIL — `Cannot find module './initial-admin'`.

- [ ] **Step 3: Create the core module**

Create `packages/modules/auth/src/services/initial-admin.ts`:

```ts
import type { CredentialLinkFailed, InvalidRole, PasswordHashFailed } from './user'
import { describeDbError } from '@czo/kit/db'
import { Config, Effect, Redacted } from 'effect'
import { UserDbFailed, UserService } from './user'

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

export type EnsureInitialAdminError =
  | CredentialLinkFailed
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
const isUniqueViolation = (cause: unknown): boolean => {
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
 * Reads `INITIAL_ADMIN_*` from the environment. Outside production
 * (`NODE_ENV !== 'production'`) an unset email/password falls back to the dev
 * defaults; in production they stay empty so callers no-op. Empty = unset.
 */
export const InitialAdminConfig = Effect.gen(function* () {
  const nodeEnv = yield* Config.string('NODE_ENV').pipe(Config.withDefault('development'))
  const isProd = nodeEnv === 'production'
  // `Config.redacted` keeps the raw value out of logs/spans (mirrors how
  // DATABASE_URL is read in packages/kit/src/db/index.ts).
  const emailRaw = yield* Config.redacted('INITIAL_ADMIN_EMAIL').pipe(Config.withDefault(Redacted.make('')))
  const passwordRaw = yield* Config.redacted('INITIAL_ADMIN_PASSWORD').pipe(Config.withDefault(Redacted.make('')))
  const name = yield* Config.string('INITIAL_ADMIN_NAME').pipe(Config.withDefault('Admin'))
  const role = yield* Config.string('INITIAL_ADMIN_ROLE').pipe(Config.withDefault('admin'))
  // Unwrap only to apply the empty/dev-default branch, then re-wrap.
  const email = Redacted.value(emailRaw) || (isProd ? '' : DEV_DEFAULT_EMAIL)
  const password = Redacted.value(passwordRaw) || (isProd ? '' : DEV_DEFAULT_PASSWORD)
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
export const ensureInitialAdmin = (
  input: EnsureInitialAdminInput,
): Effect.Effect<EnsureInitialAdminResult, EnsureInitialAdminError, UserService> =>
  Effect.gen(function* () {
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
              Effect.zipRight(Effect.fail(e))),
      ),
    )
    // Never log the address in clear (it's a secret).
    yield* Effect.logInfo(
      result.created ? 'initial admin created' : 'initial admin already exists — skipping',
    )
    return result
  })
```

- [ ] **Step 4: Re-export from the services barrel**

In `packages/modules/auth/src/services/index.ts`, add (namespace style, matching the file):

```ts
export * as InitialAdmin from './initial-admin'
```

- [ ] **Step 5: Run the config unit test to verify it passes**

Run: `pnpm --filter @czo/auth test initial-admin.test`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing integration test**

Create `packages/modules/auth/src/services/initial-admin.integration.test.ts`:

```ts
import { DrizzleDb } from '@czo/kit/db'
import { layer } from '@effect/vitest'
import { expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { Effect, Layer, Redacted } from 'effect'
import { accounts, users } from '../database/schema'
import { ADMIN_HIERARCHY, ADMIN_STATEMENTS } from '../plugins/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Access from './access'
import * as UserEvents from './events/user'
import * as Password from './password'
import * as User from './user'
import { ensureInitialAdmin } from './initial-admin'

const AccessLive = Access.makeLayer(
  [{ name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY }],
  false,
)
const TestLayer = User.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(Password.layer, UserEvents.layer, AccessLive)),
  Layer.provideMerge(AuthPostgresLayer),
)

const EMAIL = 'admin@life.dev'
// `email`/`password` are secrets in the API — pass them wrapped.
const ADMIN = { email: Redacted.make(EMAIL), name: 'Admin', password: Redacted.make('DevAdmin1!') }

layer(TestLayer, { timeout: 120_000 })('ensureInitialAdmin', (it) => {
  it.effect('creates the admin with role=admin, emailVerified, credential', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const res = yield* ensureInitialAdmin(ADMIN)
      expect(res.created).toBe(true)

      const db = yield* DrizzleDb
      const rows = yield* db.select().from(users).where(eq(users.email, EMAIL))
      expect(rows).toHaveLength(1)
      expect((rows[0] as { role: string }).role).toBe('admin')
      expect((rows[0] as { emailVerified: boolean }).emailVerified).toBe(true)

      const accts = yield* db.select().from(accounts)
      expect(accts).toHaveLength(1)
      expect((accts[0] as { providerId: string }).providerId).toBe('credential')
    }))

  it.effect('is idempotent — second run skips, one user remains', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      yield* ensureInitialAdmin(ADMIN)
      const res2 = yield* ensureInitialAdmin(ADMIN)
      expect(res2.created).toBe(false)

      const db = yield* DrizzleDb
      const rows = yield* db.select().from(users).where(eq(users.email, EMAIL))
      expect(rows).toHaveLength(1)
    }))

  it.effect('leaves a pre-existing user untouched', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users_ = yield* User.UserService
      yield* users_.create({ email: EMAIL, name: 'Original', password: 'Existing1!' })

      const res = yield* ensureInitialAdmin(ADMIN)
      expect(res.created).toBe(false)

      const db = yield* DrizzleDb
      const rows = yield* db.select().from(users).where(eq(users.email, EMAIL))
      expect(rows).toHaveLength(1)
      expect((rows[0] as { name: string }).name).toBe('Original')
    }))

  it.effect('honors a custom role from the frozen registry', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const res = yield* ensureInitialAdmin({ ...ADMIN, role: 'admin:manager' })
      expect(res.created).toBe(true)

      const db = yield* DrizzleDb
      const rows = yield* db.select().from(users).where(eq(users.email, EMAIL))
      expect((rows[0] as { role: string }).role).toBe('admin:manager')
    }))

  it.effect('propagates InvalidRole for an unknown role', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const err = yield* ensureInitialAdmin({ ...ADMIN, role: 'not-a-role' }).pipe(Effect.flip)
      expect(err._tag).toBe('InvalidRole')
    }))
})
```

- [ ] **Step 7: Run the integration test to verify it passes**

Run: `pnpm --filter @czo/auth test initial-admin.integration`
Expected: PASS (5 tests). (`ensureInitialAdmin` already exists from Step 3, so this is GREEN once the test file is correct; if a test fails, fix the test or core, not the assertions' intent.)

- [ ] **Step 8: Type-check & lint**

Run: `pnpm --filter @czo/auth check-types` then `pnpm lint:fix`
Expected: no errors. (If `lint:fix` strips a needed cast, re-check per the repo's lint/types caveat.)

- [ ] **Step 9: Commit**

```bash
git add packages/modules/auth/src/services/initial-admin.ts \
        packages/modules/auth/src/services/index.ts \
        packages/modules/auth/src/services/initial-admin.test.ts \
        packages/modules/auth/src/services/initial-admin.integration.test.ts
git commit -m "feat(auth): ensureInitialAdmin core + InitialAdminConfig"
```

---

### Task 3: Auto-run on boot (auth `onStarted` hook)

**Files:**
- Modify: `packages/modules/auth/src/index.ts` (imports near top; `onStarted` block at the end, currently after `yield* Organization.OrganizationService`)

**Interfaces:**
- Consumes: `ensureInitialAdmin`, `InitialAdminConfig` (Task 2). At `onStarted` time `UserService` is in the module runtime context (provided by `User.layer`), and the access registry is already frozen (so role validation works).
- Produces: no exported API — wiring only.

**Note:** No new automated test. The behavior is `ensureInitialAdmin`, fully covered in Task 2; this task only wires config-read + invocation + error-swallowing into the lifecycle. It is verified by type-check, lint, and the manual dev-boot check below.

- [ ] **Step 1: Add the imports**

In `packages/modules/auth/src/index.ts`, with the other `./services/*` imports:

```ts
import { ensureInitialAdmin, InitialAdminConfig } from './services/initial-admin'
```

Add `Redacted` to the existing `effect` import (used by the seed gate), e.g.:

```ts
import { Config, Duration, Effect, Layer, Redacted } from 'effect'
```
(Keep whatever members are already imported; just add `Redacted`.)

- [ ] **Step 2: Extend the `onStarted` effect**

The current `onStarted` ends with `yield* Organization.OrganizationService`. Append the seed inside the same `Effect.gen` (before the closing `})`), keeping the existing `as unknown as Effect.Effect<void, never, never>` cast:

```ts
    onStarted: Effect.gen(function* () {
      const access = yield* Access.AccessService
      yield* access.buildRoles
      yield* access.freeze
      // Warm OrganizationService so a broken Layer composition fails at
      // boot rather than at first request.
      yield* Organization.OrganizationService

      // Seed the initial admin (idempotent, ensure-by-email). Env-gated: runs
      // only when both email + password resolve (prod) or via dev defaults.
      // A failed seed must never take the server down — catch & log.
      const admin = yield* InitialAdminConfig
      if (Redacted.value(admin.email) && Redacted.value(admin.password)) {
        yield* ensureInitialAdmin({
          email: admin.email,
          name: admin.name,
          password: admin.password,
          role: admin.role,
        }).pipe(
          Effect.catchAllCause(cause => Effect.logError('initial admin seed failed', cause)),
        )
      }
      else {
        yield* Effect.logInfo('no initial-admin config — skipping seed')
      }
    }) as unknown as Effect.Effect<void, never, never>,
```

- [ ] **Step 3: Type-check & lint**

Run: `pnpm --filter @czo/auth check-types` then `pnpm lint:fix`
Expected: no errors.

- [ ] **Step 4: Re-run the auth suite (no regressions)**

Run: `pnpm --filter @czo/auth test initial-admin`
Expected: PASS (Task 2 suites still green).

- [ ] **Step 5: Manual dev-boot verification**

```bash
docker compose -f docker-compose.dev.yml up -d        # Postgres 17 on :5432
pnpm --filter @czo/auth build                          # life imports auth's dist
pnpm --filter @czo/life db:migrate                     # ensure schema present
pnpm --filter @czo/life dev                            # NODE_ENV=development
```
Expected log line: `initial admin created` on first boot, then
`initial admin already exists — skipping` on a second boot (the address is a
secret and is never logged in clear). Confirm the row exists:
`psql "$DATABASE_URL" -c "select email, role, email_verified from users where role='admin';"`.
(If a fresh DB already has random seeded users, the admin is still created —
ensure-by-email, not "empty DB".)

- [ ] **Step 6: Commit**

```bash
git add packages/modules/auth/src/index.ts
git commit -m "feat(auth): seed initial admin on boot (onStarted)"
```

---

### Task 4: CLI entry point (`life seed:admin`)

**Files:**
- Create: `apps/life/src/seed-admin.ts`
- Modify: `apps/life/package.json` (`scripts`)

**Interfaces:**
- Consumes: `InitialAdmin` namespace from `@czo/auth/services` (Task 2); `buildRuntime` from `@czo/kit/module`; `Email.fromEnv`; `modules`, `dotEnvConfigProvider`, `runMain` from `apps/life/src`.
- Produces: a runnable `pnpm --filter @czo/life seed:admin` command (exits 0 on create/skip, non-zero on error/missing-config).

**Note:** No automated test — entrypoint scripts in this app (`worker.ts`, `scripts/emit-admin-sdl.ts`) are not unit-tested; the seed logic itself is covered by Task 2. Verified by type-check, lint, and a manual run.

- [ ] **Step 1: Create the CLI script**

Create `apps/life/src/seed-admin.ts`:

```ts
/**
 * One-off CLI: ensure the initial admin user exists. Shares the module runtime
 * with `main.ts`/`worker.ts` (DB + services) but serves no HTTP and forks no
 * queue consumers — it runs every module's `onStart` (so each module's access
 * domain is registered and roles resolve), seeds the admin via the shared
 * `ensureInitialAdmin` core, then tears down and exits.
 *
 * Run: `pnpm --filter @czo/life seed:admin`
 * Optional overrides: `pnpm --filter @czo/life seed:admin --email you@host --name "You"`
 * (password always comes from INITIAL_ADMIN_PASSWORD / the dev default).
 */
import process from 'node:process'

import { InitialAdmin } from '@czo/auth/services'
import { useLogger } from '@czo/kit'
import * as Email from '@czo/kit/email/smtp'
import { buildRuntime } from '@czo/kit/module'
import { Effect, Layer, Redacted } from 'effect'

import { modules } from './modules'
import { dotEnvConfigProvider, runMain } from './runtime'

const logger = useLogger('life:seed-admin')

if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  logger.error('AUTH_SECRET missing or shorter than 32 chars — refusing to start.')
  process.exit(1)
}
process.env.AUTH_APP ??= 'life'

/** Read `--flag value` from argv (optional overrides). */
const argOf = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const { runtimeLayer, startup, teardown } = buildRuntime({
  modules,
  services: Email.fromEnv,
})

const program = Effect.gen(function* () {
  // onStart across modules registers every access domain so any configured role
  // (not just auth's own) resolves. Freeze isn't needed for role lookup.
  yield* startup

  const cfg = yield* InitialAdmin.InitialAdminConfig
  const emailArg = argOf('--email')
  // Keep the override wrapped — it's a secret, like the config value.
  const email = emailArg ? Redacted.make(emailArg) : cfg.email
  const name = argOf('--name') ?? cfg.name

  if (!Redacted.value(email) || !Redacted.value(cfg.password)) {
    return yield* Effect.fail(
      new Error('INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are required (or run in dev).'),
    )
  }

  const result = yield* InitialAdmin.ensureInitialAdmin({
    email,
    name,
    password: cfg.password,
    role: cfg.role,
  })
  // Never log the address in clear (it's a secret).
  yield* Effect.logInfo(
    result.created ? 'initial admin created' : 'initial admin already existed',
  )
}).pipe(
  Effect.ensuring(teardown.pipe(Effect.catchAllCause(() => Effect.void))),
  Effect.scoped,
  Effect.provide(Layer.mergeAll(runtimeLayer)),
  Effect.provide(dotEnvConfigProvider),
)

// Cast mirrors worker.ts: `runtimeLayer` provides the module services at runtime
// even though its type only advertises DrizzleDb.
runMain(program as Effect.Effect<void, unknown, never>)
```

- [ ] **Step 2: Add the npm script**

In `apps/life/package.json`, add to `scripts` (after `"worker"`):

```json
    "seed:admin": "node --import tsx src/seed-admin.ts",
```

- [ ] **Step 3: Type-check & lint**

Run: `pnpm --filter @czo/life check-types` then `pnpm lint:fix`
Expected: no errors. (If `check-types` flags the `runtimeLayer` requirement, confirm the final `as Effect.Effect<void, unknown, never>` cast is present — same pattern as `worker.ts`.)

- [ ] **Step 4: Manual run verification**

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm --filter @czo/auth build                 # CLI imports @czo/auth/services dist
pnpm --filter @czo/life db:migrate
INITIAL_ADMIN_EMAIL=boss@acme.io INITIAL_ADMIN_PASSWORD='Sup3r-Secret!' \
  pnpm --filter @czo/life seed:admin
```
Expected: logs `initial admin created`, exit 0 (the address is never logged — it's a secret). Re-run → `initial admin already existed`, exit 0. Run with neither env var in a production-like shell (`NODE_ENV=production`) → error message, non-zero exit.

- [ ] **Step 5: Commit**

```bash
git add apps/life/src/seed-admin.ts apps/life/package.json
git commit -m "feat(life): seed:admin CLI for the initial admin user"
```

---

### Task 5: Config surface — Docker Compose + Coolify runbook

**Files:**
- Modify: `docker-compose.yml` (the `life` service `environment:` map)
- Modify: `docs/deployment/coolify.md` (Option A env list + Option B env section)

**Interfaces:**
- Consumes: the env var names from Tasks 2–4 (`INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_ROLE`).
- Produces: documented + wired deployment config. No code.

- [ ] **Step 1: Add the env vars to the `life` service**

In `docker-compose.yml`, in the `life` service's `environment:` map (place it near `AUTH_APP` / the existing `OPENAPI_ENABLED` block):

```yaml
      # Initial admin user — created idempotently on boot (ensure-by-email).
      # Set BOTH email + password to bootstrap; unset in production → no admin
      # is seeded. Dev uses built-in defaults (admin@life.dev). INITIAL_ADMIN_ROLE
      # accepts a CSV for multiple platform roles.
      # EMAIL + PASSWORD are SECRETS: provide via Coolify secret env (never
      # commit values); the app reads them via Config.redacted (never logged).
      INITIAL_ADMIN_EMAIL: ${INITIAL_ADMIN_EMAIL-}
      INITIAL_ADMIN_PASSWORD: ${INITIAL_ADMIN_PASSWORD-}
      INITIAL_ADMIN_NAME: ${INITIAL_ADMIN_NAME-Admin}
      INITIAL_ADMIN_ROLE: ${INITIAL_ADMIN_ROLE-admin}
```

(Empty default for email/password is intentional: empty ⇒ the config reader treats it as unset and the boot seed no-ops. Unlike `OPENAPI_ENABLED`, empty here means "skip", so there is no inversion hazard.)

- [ ] **Step 2: Verify Compose interpolation**

Run (dummy values satisfy the `:?`-required vars so `config` renders):

```bash
DATABASE_URL=postgres://x SERVICE_PASSWORD_64_AUTH=$(printf 'a%.0s' {1..40}) \
  docker compose config | grep -A1 INITIAL_ADMIN
```
Expected: `INITIAL_ADMIN_EMAIL: ""`, `INITIAL_ADMIN_NAME: "Admin"`, `INITIAL_ADMIN_ROLE: "admin"` (unset case). Re-run prefixed with `INITIAL_ADMIN_EMAIL=a@b.c INITIAL_ADMIN_PASSWORD=Sup3r-Secret!` → those values render.

- [ ] **Step 3: Document in the Coolify runbook (Option A)**

In `docs/deployment/coolify.md`, in the **life** service env list (Option A — four separate resources), add:

```
- (optional, **secrets**) `INITIAL_ADMIN_EMAIL` + `INITIAL_ADMIN_PASSWORD` — bootstrap a login-capable admin on first boot (created once, then skipped — ensure-by-email). Store BOTH as Coolify **secret** env vars (mark them secret; never commit). The app reads them via `Config.redacted`, so they are never logged. Optional `INITIAL_ADMIN_NAME` (default `Admin`) and `INITIAL_ADMIN_ROLE` (default `admin`, CSV for multi-role) are plain vars. Unset → no admin is seeded.
```

- [ ] **Step 4: Document in the Coolify runbook (Option B)**

In the **Option B (single Docker Compose)** env section of the same file, add:

```
- **Initial admin (off by default):** set `INITIAL_ADMIN_EMAIL` + `INITIAL_ADMIN_PASSWORD` as Coolify **secrets** on the stack to create a login-capable admin on first boot (idempotent, ensure-by-email; read via `Config.redacted`, never logged). `INITIAL_ADMIN_NAME` defaults to `Admin`, `INITIAL_ADMIN_ROLE` to `admin`. Leave unset to seed no admin. The same can be run on-demand via the `seed:admin` script.
```

- [ ] **Step 5: Lint the docs**

Run: `pnpm lint:fix`
Expected: no errors (markdown/prettier only).

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml docs/deployment/coolify.md
git commit -m "docs(deploy): document INITIAL_ADMIN_* for life"
```

---

## Self-Review

**Spec coverage:**
- Core `ensureInitialAdmin` (ensure-by-email, unique-violation skip, propagating errors) → Task 2. ✅
- `InitialAdminConfig` (env + dev defaults, prod no-op) → Task 2. ✅
- `INITIAL_ADMIN_ROLE` configurable, CSV, validated → Task 2 (core + tests), Task 5 (env). ✅
- `UserService.create` `emailVerified` → Task 1. ✅
- Boot auto-run, log-and-continue → Task 3. ✅
- CLI, exit non-zero on failure/missing config → Task 4. ✅
- docker-compose + coolify docs → Task 5. ✅
- Tests: create-once, idempotent, pre-existing-untouched, custom role, invalid role, emailVerified flag, config dev/prod → Tasks 1–2. ✅
- Out-of-scope items (org, password reset, fake seeders) — none introduced. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every run step has a concrete command + expected output.

**Type consistency:** `EnsureInitialAdminInput`/`EnsureInitialAdminResult`/`InitialAdminSettings` defined in Task 2 and used identically in Tasks 3–4. `email`/`password` are `Redacted.Redacted<string>` everywhere they cross a boundary (config → core → entrypoints); unwrapped via `Redacted.value(...)` only at the `UserService.create` sink (core) and for the emptiness gate (boot hook, CLI). Tests wrap with `Redacted.make(...)` and assert via `Redacted.value(...)`. `CreateUserInput.emailVerified` (plain `boolean`) defined in Task 1, consumed in Task 2's core. `InitialAdmin.ensureInitialAdmin`/`InitialAdmin.InitialAdminConfig` (namespace export from Task 2 Step 4) match the CLI import in Task 4. Dev password `DevAdmin1!` is consistent across config, tests, and verification and satisfies the documented policy. `Redacted` is imported from `effect` in: `initial-admin.ts`, `index.ts` (Task 3), `seed-admin.ts` (Task 4), and both test files.
