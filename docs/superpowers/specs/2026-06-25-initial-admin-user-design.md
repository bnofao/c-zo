# Initial Admin User for `life` — Design Spec

**Date:** 2026-06-25
**Status:** Approved (design) — ready for implementation plan
**Scope:** single subsystem (auth seeding + life wiring)

## Goal

A real, login-capable **admin** account exists after a fresh `life` deploy
(production) and on local dev, created **idempotently** from environment config.
One shared core (`ensureInitialAdmin`) with two entry points: an auth boot hook
(automatic) and a `life` CLI script (manual).

## Why

`@czo/auth` already has a `DB_SEEDERS` block (`packages/modules/auth/src/index.ts:40`)
but it generates **random fake users** (`f.fullName()`, `f.email()`, random role)
with **no known credentials** — you cannot log in as any of them. A freshly
deployed `life` therefore has no way for a human to authenticate. This feature
provides a known admin whose credentials the operator chooses.

## Decisions (resolved during brainstorming)

| Decision | Choice |
|----------|--------|
| Purpose | Both prod bootstrap **and** local dev (env-driven, dev defaults). |
| Trigger | Shared idempotent core, **two entry points**: boot hook + CLI. |
| Idempotency | **Ensure-by-email**: create if `INITIAL_ADMIN_EMAIL` user is missing; skip (untouched) if it exists. Never overwrites an existing password. |
| `emailVerified` | Extend `UserService.create` with `emailVerified?` and pass it through. |
| Platform role | **Configurable** via `INITIAL_ADMIN_ROLE` (default `'admin'`). Accepts a CSV list (e.g. `admin,apps:admin`); validated against the frozen `access.roles`. `users.role` is the platform/global role; org roles (`org:owner`, …) are per-organization memberships and **out of scope**. |
| Boot auto-run | Auth `onStarted` hook auto-runs every boot (no extra enable flag). Gated only by both env vars being present (prod) or dev defaults (non-prod). |

## Architecture

```
INITIAL_ADMIN_EMAIL/PASSWORD/NAME (env)
        │  (Effect Config, dev defaults when NODE_ENV !== 'production')
        ▼
  InitialAdminConfig ──► ensureInitialAdmin(input)  [requires UserService]
        ▲                         │  catches UserAlreadyExists / unique-violation
        │                         ▼  → { created: boolean }
   ┌────┴─────────┐        UserService.create({ …, role:'admin', emailVerified:true })
   │              │
 boot hook      CLI script
 (auth          (apps/life/src/seed-admin.ts)
  onStarted,     buildRuntime → startup→started → run → teardown → exit
  log+continue)  exits non-zero on failure
```

Both entry points call the **same** `ensureInitialAdmin` Effect; they differ
only in how they resolve the runtime and how they treat failure.

## Components

### 1. Core — `packages/modules/auth/src/services/initial-admin.ts` (new)

**`ensureInitialAdmin`**

```ts
export interface EnsureInitialAdminInput {
  readonly email: string
  readonly name: string
  readonly password: string
  readonly role?: string | string[] // default 'admin'; CSV/array → multi-role
}
export interface EnsureInitialAdminResult {
  readonly created: boolean
  readonly email: string
}
export type EnsureInitialAdminError =
  | CredentialLinkFailed | PasswordHashFailed | InvalidRole | UserDbFailed
export const ensureInitialAdmin: (
  input: EnsureInitialAdminInput,
) => Effect.Effect<EnsureInitialAdminResult, EnsureInitialAdminError, UserService>
```

- Calls `UserService.create({ email, name, password, role: input.role ?? 'admin', emailVerified: true })`.
  `UserService.create` runs `ensureValidRole` against the frozen `access.roles`,
  so an unknown role surfaces as `InvalidRole` (a genuine, propagated error —
  see below). `'admin'` is the top of `ADMIN_HIERARCHY`
  (`plugins/access.ts:63`) and validates.
- **Expected skips → `{ created: false }`** (success, logged at info "initial
  admin already exists — skipping"):
  - `UserAlreadyExists`.
  - `UserDbFailed` whose cause is a **unique-constraint violation** (SQLSTATE
    `23505`, multi-replica boot race) — treated as exists.
- **Genuine errors propagate** in the error channel (non-unique `UserDbFailed`,
  `CredentialLinkFailed`, `PasswordHashFailed`, `InvalidRole`). The core does
  **not** swallow them — each entry point decides escalation (boot logs &
  continues; CLI exits non-zero). This keeps "skipped because it exists"
  distinguishable from "failed".
- Pure of env — unit/integration testable against `UserService` directly.

**`InitialAdminConfig`** (Effect `Config` reader)

```ts
export interface InitialAdminSettings {
  readonly email: string | undefined
  readonly password: string | undefined
  readonly name: string
  readonly role: string // CSV; default 'admin'
}
export const InitialAdminConfig: Effect.Effect<InitialAdminSettings, ConfigError>
```

- Reads `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `INITIAL_ADMIN_NAME`,
  `INITIAL_ADMIN_ROLE` (`Config.string(...).pipe(Config.option)` / `withDefault`).
- `name` defaults to `"Admin"`; `role` defaults to `"admin"` (passed straight to
  `ensureInitialAdmin`, which forwards it to `UserService.create` for CSV split +
  validation — no parsing in the config reader).
- Dev defaults (only when `NODE_ENV !== 'production'`): `email = admin@life.dev`,
  `password = <policy-valid dev password>` (must satisfy the account
  `passwordSchema`; the plan picks a concrete value and asserts it passes).
- In production with either email or password unset → both returned `undefined`
  ⇒ callers no-op.

### 2. `UserService.create` change — `packages/modules/auth/src/services/user.ts`

- Add `emailVerified?: boolean` to `CreateUserInput` (default `false` →
  existing callers unchanged).
- Pass it into the `db.insert(users).values({ ... })` call. The `users.emailVerified`
  column already exists (`schema.ts:12`, `notNull().default(false)`).
- No other `create` behavior changes.

### 3. Boot entry — auth `onStarted` hook — `packages/modules/auth/src/index.ts`

- Add (or extend) the module's `onStarted` effect (runs **after** all `onStart`,
  so the access registry is frozen and the `'admin'` role validates).
- Effect: read `InitialAdminConfig`; if `email && password` resolved →
  `ensureInitialAdmin({ email, name, password, role })`; else `Effect.logInfo`
  "no initial-admin config — skipping".
- Wrapped so **any** defect/error is caught and logged — a failed seed must
  never prevent the server from starting (`Effect.catchAllCause` → log → void).
- `ensureInitialAdmin` requires `UserService`, which is in the module layer
  context at `onStarted` time.

### 4. CLI entry — `apps/life/src/seed-admin.ts` (new) + script

- Mirrors `apps/life/src/worker.ts`:
  - Same `AUTH_SECRET` length guard + `AUTH_APP ??= 'life'` env prep.
  - `buildRuntime({ modules })` → `{ runtimeLayer, startup, started, teardown }`.
  - Program: `yield* startup; yield* started;` resolve config (with optional
    `--email` / `--name` CLI-arg overrides via `process.argv`); run
    `ensureInitialAdmin`; log the `{ created }` result; `teardown`.
  - Provide `runtimeLayer`; run via `runMain` + `dotEnvConfigProvider`.
- **Failure handling differs from boot:** the CLI lets the core's error channel
  propagate (non-zero exit via `runMain`) and exits non-zero when config is
  missing — it is an explicit operator action, so a silent no-op or swallowed
  error would mislead. On success it logs the `{ created }` result.
- `apps/life/package.json` scripts: add
  `"seed:admin": "node --import tsx src/seed-admin.ts"`.

### 5. Config surface

- `docker-compose.yml` — `life` service `environment:`:
  ```yaml
  # Initial admin user (created idempotently on boot when both are set).
  # Unset in production → no admin is seeded. Dev uses built-in defaults.
  INITIAL_ADMIN_EMAIL: ${INITIAL_ADMIN_EMAIL-}
  INITIAL_ADMIN_PASSWORD: ${INITIAL_ADMIN_PASSWORD-}
  INITIAL_ADMIN_NAME: ${INITIAL_ADMIN_NAME-Admin}
  INITIAL_ADMIN_ROLE: ${INITIAL_ADMIN_ROLE-admin}
  ```
  (Empty default for email/password is correct here: empty string ⇒ falsy ⇒
  the config reader treats it as unset and no-ops. Unlike the `OPENAPI_ENABLED`
  case, there is no "empty means on" hazard — empty means skip.)
- `docs/deployment/coolify.md` — document the vars in **both** the Option A
  (life) env list and the Option B (single Docker Compose) env section, noting:
  set both `INITIAL_ADMIN_EMAIL` + `INITIAL_ADMIN_PASSWORD` to bootstrap
  (optional `INITIAL_ADMIN_NAME`, default `Admin`; optional `INITIAL_ADMIN_ROLE`,
  default `admin`, CSV for multi-role); the admin is created on first boot and
  skipped thereafter (ensure-by-email).

## Data flow

1. Boot: `runApp` builds the runtime → modules `onStart` (auth freezes access
   registry) → modules `onStarted` (auth seed) → `ensureInitialAdmin` →
   `UserService.create` inserts `users` row (`role='admin'`, `emailVerified=true`)
   + a `credential` account row with the hashed password.
2. Subsequent boots: email exists → `create` fails `UserAlreadyExists` → skip.
3. CLI: same core, separate short-lived runtime, exits.

## Error handling

| Site | On error |
|------|----------|
| `ensureInitialAdmin` | Expected skips (`UserAlreadyExists`, unique-violation) → `{ created: false }` logged at info. Genuine errors propagate in the error channel. |
| Boot hook | `catchAllCause` → log → void. Server starts regardless. |
| CLI | Propagates the core's error → non-zero exit. Also exits non-zero when config is missing (nothing to do). On success logs the `{ created }` result. |

## Testing

`packages/modules/auth/src/services/initial-admin.integration.test.ts`
(`AuthPostgresLayer` + the services `ensureInitialAdmin` needs — `UserService`,
`AccessService`, `PasswordService`, `UserEvents`):

1. **Creates admin once:** `ensureInitialAdmin` → `{ created: true }`; one
   `users` row with `role='admin'`, `emailVerified=true`; one `accounts` row
   with `providerId='credential'`.
2. **Idempotent:** run twice → second returns `{ created: false }`; still
   exactly one user.
3. **Pre-existing email is untouched:** create a user with that email + a known
   password first, then `ensureInitialAdmin` → `{ created: false }`; the original
   password still verifies (not overwritten).
4. **`UserService.create` `emailVerified` flag:** unit/integration — `create`
   with `emailVerified: true` persists `true`; without it persists `false`
   (default unchanged).
5. **Custom role:** `ensureInitialAdmin({ …, role: 'apps:admin' })` persists
   `users.role = 'apps:admin'` (validates against the frozen registry).
6. **Invalid role propagates:** `ensureInitialAdmin({ …, role: 'not-a-role' })`
   fails with `InvalidRole` (genuine error, not a skip) — confirms the CLI would
   exit non-zero and the boot hook would log it.

Optionally: a focused unit test of `InitialAdminConfig` dev-default behavior
(NODE_ENV gate) if it can be exercised without process-env flakiness; otherwise
covered implicitly by the integration tests.

## Out of scope (YAGNI)

- Password rotation / "reset on every run" (explicitly rejected).
- Creating an initial organization or org membership for the admin.
- Multiple seed users, or a generic data-seeding framework (the existing
  `DB_SEEDERS` fake-data path is untouched).
- Interactive prompts in the CLI (env + optional `--email`/`--name` args only).

## Security notes

- `INITIAL_ADMIN_PASSWORD` is a secret: documented as such; set via Coolify's
  secret env, never committed. Empty/unset in prod ⇒ no admin created (safe).
- Dev defaults are clearly dev-only (gated on `NODE_ENV !== 'production'`) and
  must satisfy the password policy.
- The seed never logs the password; logs only email + `created` boolean.

## Files touched

- **New:** `packages/modules/auth/src/services/initial-admin.ts`
- **New:** `packages/modules/auth/src/services/initial-admin.integration.test.ts`
- **New:** `apps/life/src/seed-admin.ts`
- **Modify:** `packages/modules/auth/src/services/user.ts` (`CreateUserInput.emailVerified`)
- **Modify:** `packages/modules/auth/src/index.ts` (`onStarted` seed hook)
- **Modify:** `apps/life/package.json` (`seed:admin` script)
- **Modify:** `docker-compose.yml` (three env vars on `life`)
- **Modify:** `docs/deployment/coolify.md` (document the env vars)
