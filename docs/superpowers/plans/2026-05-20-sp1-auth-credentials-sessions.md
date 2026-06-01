# SP1 — Credentials, Sessions & email-password flows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `better-auth` for email/password sign-up/sign-in/sign-out with a native Effect-TS implementation: `PasswordService`, `CookieService`, `SessionService`, and `signUp`/`signIn` orchestration functions, plus a `ctx.auth` session contributor — all behind unchanged GraphQL resolver contracts.

**Architecture:** Three Effect `Context.Service`s (each a single `src/services/<name>.ts` file holding contract + `Live` layer) + plain `signUp`/`signIn` Effect functions in `src/http/credential.ts`. Sessions are random opaque tokens in the existing `sessions` table, resolved through an `effect/unstable/persistence` `PersistedCache` (L1 in-memory Effect `Cache` + L2 `Persistence` backing). The `Persistence` provide is shared infra wired in `buildApp` — **deferred** (see Notes); SP1 tests use `Persistence.layerMemory`. HTTP sign-up/in/out are h3 routes mounted by the auth module's `http` hook; the session cookie is read into `ctx.auth` by a new `graphql.contexts` contributor.

**Tech Stack:** Effect 4.0.0-beta.66 (`Context.Service`, `Layer.effect`, `Data.TaggedError`, `Schema`, `effect/unstable/persistence`), `@node-rs/argon2` (Argon2id), Drizzle ORM (RQBv2, `1.0.0-beta.22`), h3 v2, Pothos. Tests: `@effect/vitest` + Testcontainers.

**Source spec:** `docs/superpowers/specs/2026-05-20-sp1-auth-credentials-sessions-design.md`

---

## Conventions for every task

- **TDD:** write the failing test first, run it, see it fail for the *expected* reason, implement, run, see green.
- **Test harness:** `@effect/vitest` (catalog version, lockstep with `effect`). Import `describe`, `it`, `expect`, `layer` from `@effect/vitest`. Tests are `it.effect('name', () => Effect<void, E, R>)` — the test body **is** an Effect.
- **Effect assertions:**
  - *Success:* `yield*` the program inside `it.effect` and call `expect(...)`.
  - *Failure:* `Effect.flip` turns `Effect<A, E>` into `Effect<E, A>` — so `const err = yield* program.pipe(Effect.flip); expect(err).toBeInstanceOf(TagClass)`. (If the program *succeeds*, the flipped effect fails and the test fails.) **No hand-rolled assertion helpers.**
- **Suite-shared layers:** integration suites that need a Testcontainers DB use `@effect/vitest`'s `layer(SomeLayer, { timeout })('suite name', (it) => { it.effect(...) })` — the container starts once per suite as a scoped Effect Layer.
- **Run a single test file:** from the package dir — `pnpm vitest run src/<path>.test.ts`.
- **Type-check:** `pnpm check-types` in the package being edited.
- **`old/` convention:** before deleting or substantially rewriting an existing file, copy it to `old/<original-path>` first. `old/` is deleted at the end (Task 9, final step).
- **Commits:** conventional-commit format, one per task (or per logical step where noted). Do **not** commit the spec or this plan file.
- **Service export pattern:** each `services/<name>.ts` exports its `Context.Service` Tag (named) + a *private* `const make` (the constructor — `Effect.fnUntraced` / `Effect.gen` / `Effect.sync` / a plain value, per context) + `export const layer` built from `make`. Parametrised services export `layer` as a function `(config) => Layer…`. The `services/index.ts` barrel re-exports each new service as a **namespace** (`export * as Password from './password'`); consumers use namespace imports — `import * as Password from '../services/password'` → `Password.PasswordService` (the Tag), `Password.layer`.
- **Effect 4 note:** `effect/unstable/persistence` is a beta module — Task 5 (`SessionService`) begins with an explicit API-verification step against the installed source before coding.

---

## File Structure

**New files** (`packages/modules/auth/src/`):

| File | Responsibility |
|---|---|
| `constants.ts` | `SESSION_DURATION` (`Duration`) — shared session lifetime (cookie `maxAge` + DB `expiresAt`) |
| `services/password.ts` | `PasswordService` Tag + `make` + `layer` (Argon2id hash/verify) |
| `services/cookie.ts` | `CookieService` Tag + `make` + `layer(config)` + `layerConfig(Config.Wrap)` + `layerConfigService` + `CookieConfigService` (Tag + class-level layer) + `Cookie`/`CookieAttributes` |
| `services/session.ts` | `SessionService` Tag + `make` + `layer` + `SessionStoreFailed` + session `Schema`/`Persistable` |
| `services/events/auth.ts` | `AuthEvents` Tag + `AuthEvent` union (`SignedUp`) + `make` + `layer` |
| `http/credential.ts` | `signUp` / `signIn` Effect functions + their tagged errors |
| `http/error-map.ts` | tagged-error → HTTP status mapper for the handlers |
| `http/sign-up.ts`, `http/sign-in.ts`, `http/sign-out.ts` | thin h3 handlers |
| `testing/postgres.ts` | Testcontainers Postgres wrapped as a scoped `DrizzleDb` Layer + `truncateAuth` |
| `graphql/session-context.ts` | the `graphql.contexts` session contributor |
| co-located `*.test.ts` | unit + integration tests (`@effect/vitest`) |

**Modified:** `packages/kit/src/module/contract.ts`, `packages/kit/src/graphql/builder.ts`, `packages/kit/src/module/app.ts`, `packages/modules/auth/src/module.ts`, `packages/modules/auth/src/graphql/index.ts`, `packages/modules/auth/src/services/index.ts`, `packages/modules/auth/package.json`, `packages/kit/package.json`, `pnpm-workspace.yaml`.

**Deleted:** `packages/modules/auth/src/graphql/context-factory.ts`.

---

## Task 1: Dependencies & catalog entries

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `packages/modules/auth/package.json`
- Modify: `packages/kit/package.json`

Setup/config — no TDD. (Redis / `NodeRedis` infra is **deferred** — see Notes.)

- [ ] **Step 1: Add catalog entries**

In `pnpm-workspace.yaml`, under `catalogs.common`, add:

```yaml
    '@node-rs/argon2': ^2.0.2
```

Under `catalogs.dev`, add:

```yaml
    '@testcontainers/postgresql': ^11.8.0
```

`@effect/vitest` is already in the default `catalog:` at `4.0.0-beta.66` — no change.

- [ ] **Step 2: Add dependencies to `@czo/auth`**

In `packages/modules/auth/package.json`, add to `dependencies`:

```json
    "@node-rs/argon2": "catalog:common",
```

Add to `devDependencies` (`pg` + `@types/pg` are for the Task 3 Testcontainers
helper — `drizzle-orm` is already a dep; `pg`/`@types/pg` reference catalog
entries that already exist):

```json
    "@effect/vitest": "catalog:",
    "@testcontainers/postgresql": "catalog:dev",
    "pg": "catalog:common",
    "@types/pg": "catalog:types",
```

- [ ] **Step 3: Add `@effect/vitest` to `@czo/kit` (needed by Task 7's test)**

In `packages/kit/package.json` `devDependencies`, add:

```json
    "@effect/vitest": "catalog:",
```

- [ ] **Step 4: Install and verify**

Run: `pnpm install`
Expected: completes with no error; the new packages resolve.

Run: `cd packages/kit && pnpm check-types` — expect PASS (no new errors).

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml packages/modules/auth/package.json packages/kit/package.json pnpm-lock.yaml
git commit -m "chore(auth): add SP1 deps (argon2, testcontainers, effect-vitest)"
```

---

## Task 2: `PasswordService` — Argon2id hash/verify

**Files:**
- Create: `packages/modules/auth/src/services/password.ts`
- Test: `packages/modules/auth/src/services/password.test.ts`

`PasswordService` hashes/verifies with Argon2id. `hash` fails with `PasswordHashFailed` — **reused from `services/user.ts`**, not redefined (a redefinition would collide through the `services/index.ts` barrel). `verify` never fails: `@node-rs/argon2`'s `verify` *throws* on a malformed stored hash, so the impl catches it and returns `false`.

- [ ] **Step 1: Write the failing test**

Create `packages/modules/auth/src/services/password.test.ts`:

```typescript
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import * as Password from './password'

describe('passwordService', () => {
  it.effect('hash produces an Argon2id PHC string', () =>
    Effect.gen(function* () {
      const hash = yield* (yield* Password.PasswordService).hash('correct horse battery staple')
      expect(hash.startsWith('$argon2id$')).toBe(true)
    }).pipe(Effect.provide(Password.layer)))

  it.effect('hashing the same password twice yields different strings', () =>
    Effect.gen(function* () {
      const svc = yield* Password.PasswordService
      const a = yield* svc.hash('pw-AAAA-1111')
      const b = yield* svc.hash('pw-AAAA-1111')
      expect(a).not.toBe(b)
    }).pipe(Effect.provide(Password.layer)))

  it.effect('verify returns true for the matching password', () =>
    Effect.gen(function* () {
      const svc = yield* Password.PasswordService
      const hash = yield* svc.hash('s3cret-Password!')
      expect(yield* svc.verify(hash, 's3cret-Password!')).toBe(true)
    }).pipe(Effect.provide(Password.layer)))

  it.effect('verify returns false for a wrong password', () =>
    Effect.gen(function* () {
      const svc = yield* Password.PasswordService
      const hash = yield* svc.hash('s3cret-Password!')
      expect(yield* svc.verify(hash, 'wrong-password')).toBe(false)
    }).pipe(Effect.provide(Password.layer)))

  it.effect('verify returns false (no throw) for a malformed stored hash', () =>
    Effect.gen(function* () {
      const ok = yield* (yield* Password.PasswordService).verify('not-a-real-hash', 'whatever')
      expect(ok).toBe(false)
    }).pipe(Effect.provide(Password.layer)))
})
```

- [ ] **Step 2: Run the test — expect failure**

Run: `cd packages/modules/auth && pnpm vitest run src/services/password.test.ts`
Expected: FAIL — `Cannot find module './password'`.

- [ ] **Step 3: Implement `PasswordService`**

Create `packages/modules/auth/src/services/password.ts`:

```typescript
import type { Effect as EffectNS } from 'effect'
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import { Context, Effect, Layer } from 'effect'
import { PasswordHashFailed } from './user'

/**
 * Password hashing/verification via Argon2id (`@node-rs/argon2`).
 *
 * - `hash` returns a self-describing PHC string (`$argon2id$v=19$m=…$…`);
 *   any failure → `PasswordHashFailed` (reused from `./user`).
 * - `verify` never fails: a wrong password → `false`, and a malformed stored
 *   hash (which `@node-rs/argon2` reports by THROWING) is caught → `false`.
 */
export class PasswordService extends Context.Service<PasswordService, {
  readonly hash: (plain: string) => EffectNS.Effect<string, PasswordHashFailed>
  readonly verify: (storedHash: string, plain: string) => EffectNS.Effect<boolean>
}>()('@czo/auth/PasswordService') {}

const make = Effect.sync(() => PasswordService.of({
  hash: plain =>
    Effect.tryPromise({
      try: () => argonHash(plain),
      catch: cause => new PasswordHashFailed({ cause }),
    }),
  verify: (storedHash, plain) =>
    Effect.tryPromise(() => argonVerify(storedHash, plain)).pipe(
      Effect.orElseSucceed(() => false),
    ),
}))

/** Layer — no dependencies, no async construction. */
export const layer = Layer.effect(PasswordService, make)
```

> Verification note: confirm `Layer.effect` / `Effect.sync` against an existing service — `packages/modules/auth/src/layers/api-key.ts` uses `Layer.effect(Tag, Effect.gen(() => Tag.of({...})))`. `make` is dependency-free here so `Effect.sync` suffices. `verify` swallows `@node-rs/argon2`'s throw on a malformed hash via **`Effect.orElseSucceed(() => false)`** — verified present in `effect@4.0.0-beta.66`. ⚠️ **`Effect.catchAll` does NOT exist in beta.66** (the catch family was reorganised — `catchCause`, `catchIf`, `catchTag`, … only); do not use it.

- [ ] **Step 4: Run the test — expect pass**

Run: `cd packages/modules/auth && pnpm vitest run src/services/password.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Type-check & commit**

Run: `cd packages/modules/auth && pnpm check-types` — expect no new errors.

```bash
git add packages/modules/auth/src/services/password.ts packages/modules/auth/src/services/password.test.ts
git commit -m "feat(auth): add PasswordService (Argon2id hash/verify)"
```

---

## Task 3: Testcontainers Postgres as an Effect Layer

**Files:**
- Create: `packages/modules/auth/src/testing/postgres.ts`
- Test: `packages/modules/auth/src/testing/postgres.test.ts`

The auth integration tests need a real Postgres with the auth schema. Following the `effect-smol` `NodeRedis.test.ts` pattern, the container is a **scoped Effect `Layer`** (`Layer.unwrap` + `Effect.acquireRelease`) that provides `DrizzleDb`; `@effect/vitest`'s `layer()` starts it once per suite. It lives in `@czo/auth` (not `@czo/kit`) because it imports the auth migrations + schema, and `@czo/kit` must not depend on `@czo/auth`.

- [ ] **Step 1: Confirm the migrations source**

Run: `ls packages/modules/auth/migrations`
Expected: `.sql` files + a `meta/` dir. Note the path. If empty/absent, STOP and report — the helper would instead need `drizzle-kit push`.

- [ ] **Step 2: Write the failing test**

Create `packages/modules/auth/src/testing/postgres.test.ts`:

```typescript
import { DrizzleDb } from '@czo/kit/db/effect'
import { describe, expect, it, layer } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { AuthPostgresLayer } from './postgres'

layer(AuthPostgresLayer, { timeout: 120_000 })('AuthPostgresLayer', (it) => {
  it.effect('boots a container with the auth schema applied', () =>
    Effect.gen(function* () {
      const db = yield* DrizzleDb
      const res = yield* Effect.promise(() => db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      ))
      const names = (res.rows as { table_name: string }[]).map(r => r.table_name)
      expect(names).toContain('users')
      expect(names).toContain('sessions')
      expect(names).toContain('accounts')
    }))
})
```

- [ ] **Step 3: Run the test — expect failure**

Run: `cd packages/modules/auth && pnpm vitest run src/testing/postgres.test.ts`
Expected: FAIL — `Cannot find module './postgres'`.

- [ ] **Step 4: Implement the container Layer**

Create `packages/modules/auth/src/testing/postgres.ts`:

```typescript
import type { Database } from '@czo/kit/db'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DrizzleDb } from '@czo/kit/db/effect'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Effect, Layer } from 'effect'
import { Pool } from 'pg'
import { accounts, sessions, users } from '../database/schema'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')

/**
 * A Postgres Testcontainer wrapped as a scoped `DrizzleDb` Layer — the
 * `effect-smol` `NodeRedis.test.ts` pattern. The container + pg pool are
 * acquired/released by the layer's scope; the auth Drizzle migrations are
 * applied on acquire. Provide it to a suite via `@effect/vitest`'s `layer()`.
 */
export const AuthPostgresLayer: Layer.Layer<DrizzleDb> = Layer.unwrap(
  Effect.gen(function* () {
    const container = yield* Effect.acquireRelease(
      Effect.promise(() => new PostgreSqlContainer('postgres:17').start()),
      c => Effect.promise(() => c.stop()),
    )
    const pool = yield* Effect.acquireRelease(
      Effect.sync(() => new Pool({ connectionString: container.getConnectionUri() })),
      p => Effect.promise(() => p.end()),
    )
    const db = drizzle({ client: pool })
    yield* Effect.promise(() => migrate(db, { migrationsFolder: MIGRATIONS }))
    return Layer.succeed(DrizzleDb, db as unknown as Database)
  }),
)

/** Truncate the auth tables — call at the top of an `it.effect` for isolation. */
export const truncateAuth: Effect.Effect<void, never, DrizzleDb> = Effect.gen(function* () {
  const db = yield* DrizzleDb
  yield* Effect.promise(() => db.execute(
    sql`TRUNCATE TABLE ${accounts}, ${sessions}, ${users} RESTART IDENTITY CASCADE`,
  ))
})
```

> Verification notes: confirm `Layer.unwrap` accepts a scope-using `Effect.gen` (the reference `effect-smol/packages/platform-node/test/NodeRedis.test.ts` uses exactly `Layer.unwrap(Effect.gen(... Effect.acquireRelease ...))`). If beta `effect/Layer` instead exposes `Layer.unwrapScoped`, use that. Confirm `@effect/vitest`'s `layer()` second argument shape — `{ timeout }` (number ms or `Duration`). Confirm `@testcontainers/postgresql`'s class name `PostgreSqlContainer` + `getConnectionUri()` against its `.d.ts`.

- [ ] **Step 5: Run the test — expect pass**

Run: `cd packages/modules/auth && pnpm vitest run src/testing/postgres.test.ts`
Expected: PASS (first run pulls `postgres:17` — allow up to 120 s).

- [ ] **Step 6: Commit**

```bash
git add packages/modules/auth/src/testing/postgres.ts packages/modules/auth/src/testing/postgres.test.ts
git commit -m "test(auth): add Testcontainers Postgres Effect layer"
```

---

## Task 4: `CookieService` — generic cookie mechanics

**Files:**
- Create: `packages/modules/auth/src/constants.ts`
- Create: `packages/modules/auth/src/services/cookie.ts`
- Test: `packages/modules/auth/src/services/cookie.test.ts`

`CookieService` is generic: it knows one cookie's `name` + `attributes` (supplied at layer construction) and exposes pure `create`/`createBlank`/`parse`. `name` is a top-level field of `Cookie`, **not** part of `CookieAttributes`.

Three layers construct it, all kept: `layer(config)` (a literal `CookieConfig`), `layerConfig(Config.Wrap<CookieConfig>)` (per-field `Config`), and `layerConfigService` — which routes through a new injectable `CookieConfigService` Tag. `CookieConfigService` holds the `cookieConfig` **`Config.Wrap`** (one `Config` per field — env-backed except `maxAge`, which is pinned to the shared `SESSION_DURATION`; camelCase keys matching `CookieConfig`); its shape is declared as `typeof cookieConfig`, and its layer is declared **directly on the class** (`CookieConfigService.layer`, a `static readonly` `Layer.succeed` — no env access at construction). `layerConfigService` reads the service and feeds the `Config.Wrap` to `layerConfig`, reusing its resolution path, and provides the class-level layer internally — so it exposes `CookieService` with only a possible `ConfigError` left in `E`.

- [ ] **Step 1: Write the failing test**

Create `packages/modules/auth/src/services/cookie.test.ts`:

```typescript
import { describe, expect, it } from '@effect/vitest'
import { ConfigProvider, Duration, Effect, Layer } from 'effect'
import { SESSION_DURATION } from '../constants'
import * as Cookie from './cookie'

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

describe('cookieService', () => {
  it.effect('create wraps a value with the configured name + attributes', () =>
    Effect.gen(function* () {
      const cookie = (yield* Cookie.CookieService).create('token-abc')
      expect(cookie.name).toBe('czo.session')
      expect(cookie.value).toBe('token-abc')
      expect(cookie.attributes.maxAge).toBe(604800)
      expect(cookie.attributes.httpOnly).toBe(true)
    }).pipe(Effect.provide(cookieLayer)))

  it.effect('createBlank yields an empty, immediately-expired deletion cookie', () =>
    Effect.gen(function* () {
      const cookie = (yield* Cookie.CookieService).createBlank()
      expect(cookie.value).toBe('')
      expect(cookie.attributes.maxAge).toBe(0)
      expect(cookie.attributes.expires?.getTime()).toBe(0)
    }).pipe(Effect.provide(cookieLayer)))

  it.effect('parse extracts every cookie from a Cookie header', () =>
    Effect.gen(function* () {
      const map = (yield* Cookie.CookieService).parse('a=1; czo.session=tok-xyz; b=2')
      expect(map['czo.session']).toBe('tok-xyz')
      expect(map.a).toBe('1')
    }).pipe(Effect.provide(cookieLayer)))

  it.effect('parse returns an empty record for an empty header', () =>
    Effect.gen(function* () {
      const map = (yield* Cookie.CookieService).parse('')
      expect(Object.keys(map)).toHaveLength(0)
    }).pipe(Effect.provide(cookieLayer)))

  it.effect('serialize renders a Set-Cookie header value', () =>
    Effect.gen(function* () {
      const header = (yield* Cookie.CookieService).create('tok-1').serialize()
      expect(header).toContain('czo.session=tok-1')
      expect(header).toContain('Max-Age=604800')
      expect(header).toContain('Path=/')
      expect(header).toContain('HttpOnly')
      expect(header).toContain('SameSite=Lax')
    }).pipe(Effect.provide(cookieLayer)))

  it.effect('layerConfigService resolves CookieService from a ConfigProvider', () =>
    Effect.gen(function* () {
      const cookie = (yield* Cookie.CookieService).create('tok-cfg')
      expect(cookie.name).toBe('auth.sid') // env-sourced
      expect(cookie.attributes.path).toBe('/') // defaulted — key absent from the provider
      // maxAge is pinned via Config.succeed — the provider cannot change it:
      expect(cookie.attributes.maxAge).toBe(Duration.toSeconds(SESSION_DURATION))
    }).pipe(Effect.provide(
      Cookie.layerConfigService.pipe(Layer.provide(ConfigProvider.layer(
        // camelCase config name — no `constantCase` wrapper applied here yet
        ConfigProvider.fromUnknown({ sessionCookieName: 'auth.sid' }),
      ))),
    )))
})
```

- [ ] **Step 2: Run the test — expect failure**

Run: `cd packages/modules/auth && pnpm vitest run src/services/cookie.test.ts`
Expected: FAIL — `Cannot find module './cookie'`.

- [ ] **Step 3: Implement `CookieService`**

First create `packages/modules/auth/src/constants.ts` — the single home for the
session lifetime, in its own file so neither `cookie.ts` nor `session.ts` has to
import the other:

```typescript
import { Duration } from 'effect'

/**
 * Session lifetime — the ONE source for both the cookie `maxAge`
 * (`services/cookie.ts`) and the DB session `expiresAt` (`services/session.ts`).
 * A single constant guarantees the two can never drift. Typed as an Effect
 * `Duration` (consistent with the cache TTLs in `session.ts`); callers convert
 * at the boundary — `Duration.toMillis` for the DB `Date`, `Duration.toSeconds`
 * for the cookie `Max-Age`.
 */
export const SESSION_DURATION: Duration.Duration = Duration.days(7)
```

Then create `packages/modules/auth/src/services/cookie.ts`:

```typescript
import { Config, Context, Data, Duration, Effect, Layer } from 'effect'
import { SESSION_DURATION } from '../constants'

/** Cookie attributes — `name` is intentionally NOT here (see `Cookie`). */
export interface CookieAttributes {
  readonly httpOnly: boolean
  readonly sameSite: 'lax' | 'strict' | 'none'
  readonly secure: boolean
  readonly path: string
  readonly domain?: string
  readonly maxAge: number
  readonly expires?: Date
}

/**
 * A cookie value object — `Data.Class` (structural equality) with a
 * `serialize()` method that renders the `Set-Cookie` header value.
 * `name` is a top-level field, not an attribute.
 */
export class Cookie extends Data.Class<{
  readonly name: string
  readonly value: string
  readonly attributes: CookieAttributes
}> {
  /** Render this cookie as a `Set-Cookie` header value. */
  serialize(): string {
    const a = this.attributes
    const parts = [`${this.name}=${encodeURIComponent(this.value)}`]
    if (a.maxAge !== undefined)
      parts.push(`Max-Age=${Math.trunc(a.maxAge)}`)
    if (a.expires)
      parts.push(`Expires=${a.expires.toUTCString()}`)
    if (a.domain)
      parts.push(`Domain=${a.domain}`)
    parts.push(`Path=${a.path}`)
    if (a.httpOnly)
      parts.push('HttpOnly')
    if (a.secure)
      parts.push('Secure')
    parts.push(`SameSite=${a.sameSite[0]!.toUpperCase()}${a.sameSite.slice(1)}`)
    return parts.join('; ')
  }
}

export interface CookieConfig {
  readonly name: string
  readonly attributes: CookieAttributes
}

/**
 * Generic, config-driven cookie mechanics for ONE configured cookie.
 * Pure: no I/O, no session knowledge.
 */
export class CookieService extends Context.Service<CookieService, {
  /** The configured cookie name — exposed so callers needn't synthesize a `Cookie` to read it. */
  readonly name: string
  readonly create: (value: string) => Cookie
  readonly createBlank: () => Cookie
  readonly parse: (header: string) => Record<string, string>
}>()('@czo/auth/CookieService') {}

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1)
      continue
    const key = part.slice(0, eq).trim()
    if (!key)
      continue
    out[key] = decodeURIComponent(part.slice(eq + 1).trim())
  }
  return out
}

const make = (config: CookieConfig) => CookieService.of({
  name: config.name,
  create: value => new Cookie({ name: config.name, value, attributes: config.attributes }),
  createBlank: () => new Cookie({
    name: config.name,
    value: '',
    attributes: { ...config.attributes, maxAge: 0, expires: new Date(0) },
  }),
  parse: parseCookieHeader,
})

/** Layer factory — parametrised by a resolved `CookieConfig`. */
export const layer = (config: CookieConfig): Layer.Layer<CookieService> =>
  Layer.succeed(CookieService, make(config))

/**
 * Layer factory reading the cookie config from Effect `Config` — each field is
 * individually wrappable as a `Config` (e.g. `name` / `sameSite` / `maxAge`
 * sourced from env vars). Fails with `ConfigError` if a required key is absent.
 */
export const layerConfig = (
  config: Config.Wrap<CookieConfig>,
): Layer.Layer<CookieService, Config.ConfigError> =>
  Layer.effect(CookieService, Config.unwrap(config).pipe(Effect.map(make)))

/**
 * The cookie configuration as a `Config.Wrap` — one `Config` per field, with
 * camelCase object keys matching `CookieConfig` exactly, so this object IS a
 * `Config.Wrap<CookieConfig>` and can be handed straight to `layerConfig`.
 * Each leaf `Config` is *named* in camelCase too (`sessionCookieName`,
 * `sessionCookieHttpOnly`, …); a `ConfigProvider.constantCase` wrapper — wired
 * in a later step — maps those onto the conventional `SESSION_COOKIE_*` env
 * vars. `name`/`httpOnly`/`sameSite`/`secure`/`path` are env-backed and
 * defaulted (a bare environment still boots). `maxAge` is deliberately NOT
 * env-tunable — it is pinned to the shared `SESSION_DURATION`, converted to
 * whole seconds via `Duration.toSeconds` for the `Set-Cookie` `Max-Age`, so the
 * cookie lifetime and the DB session `expiresAt` (Task 5) cannot drift.
 * `domain` is omitted (use `layer`/`layerConfig` for that rare case).
 */
const cookieConfig: Config.Wrap<CookieConfig> = {
  name: Config.string('sessionCookieName').pipe(Config.withDefault('czo.session')),
  attributes: {
    httpOnly: Config.boolean('sessionCookieHttpOnly').pipe(Config.withDefault(true)),
    sameSite: Config.literals(['lax', 'strict', 'none'], 'sessionCookieSameSite')
      .pipe(Config.withDefault('lax' as const)),
    secure: Config.boolean('sessionCookieSecure').pipe(Config.withDefault(false)),
    path: Config.string('sessionCookiePath').pipe(Config.withDefault('/')),
    maxAge: Config.succeed(Duration.toSeconds(SESSION_DURATION)),
  },
}

/**
 * The cookie `Config.Wrap` as an injectable service — its shape is declared as
 * `typeof cookieConfig`. The layer lives directly on the class and is a plain
 * `Layer.succeed`: it carries the static bag of `Config`s — nothing is read
 * from the environment here; resolution happens downstream in `layerConfig`.
 */
export class CookieConfigService extends Context.Service<CookieConfigService, typeof cookieConfig>()(
  '@czo/auth/CookieConfigService',
) {
  /** Internal layer — the static `Config.Wrap`; no env access at construction. */
  static readonly layer: Layer.Layer<CookieConfigService> = Layer.succeed(
    CookieConfigService,
    cookieConfig,
  )
}

/**
 * Layer for `CookieService` routed through `CookieConfigService`. It reads the
 * service's `Config.Wrap` and feeds it to `layerConfig` — so the env
 * resolution and the `ConfigError` come from the exact same path as a direct
 * `layerConfig` call. `CookieConfigService.layer` is provided internally, so
 * only a possible `ConfigError` is left in `E`.
 */
export const layerConfigService: Layer.Layer<CookieService, Config.ConfigError> = Layer.unwrap(
  CookieConfigService.pipe(Effect.map(layerConfig)),
).pipe(Layer.provide(CookieConfigService.layer))
```

> Verification notes: (1) confirm Effect 4's `Data.Class` accepts an added instance method (`serialize`) — it is a plain class extension, so this is standard; if beta `Data.Class` interferes with methods, fall back to a plain `class Cookie { constructor(readonly name, readonly value, readonly attributes) {} serialize() {…} }`. (2) confirm `Config.Wrap`, `Config.unwrap`, and `Config.ConfigError` exist on the `effect` `Config` namespace — `@effect/platform-node`'s `NodeRedis.layerConfig` uses exactly `Config.Wrap<…>` / `Config.unwrap` / `Config.ConfigError`. (3) the `cookieConfig` + test APIs were checked against installed `effect@4.0.0-beta.66` and confirmed: `Config.string`/`boolean`/`number` (lowercase, optional `name` arg), `Config.literals([...], name)` (array form — `Config.literal` is single-value only), `Config.withDefault`, the `Config.Wrap` type / `Config.unwrap` / `Config.ConfigError` class, and `Layer.succeed`/`Layer.unwrap`/`Layer.provide` all exist as used. The test's provider is `ConfigProvider.fromUnknown(record)` wrapped in `ConfigProvider.layer(...)` — note beta.66 has **no** `ConfigProvider.fromMap` and **no** `Effect.withConfigProvider`. (4) confirm a `Context.Service` class accepts an added `static readonly layer` member that references the class itself in its initialiser — verified: the class binding is in scope by the time static fields evaluate, and the class extends `Context.Key` (which `extends Effect`), so it is both yieldable and `.pipe`-able.

- [ ] **Step 4: Run the test — expect pass**

Run: `cd packages/modules/auth && pnpm vitest run src/services/cookie.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Type-check & commit**

Run: `cd packages/modules/auth && pnpm check-types` — expect no new errors.

```bash
git add packages/modules/auth/src/constants.ts packages/modules/auth/src/services/cookie.ts packages/modules/auth/src/services/cookie.test.ts
git commit -m "feat(auth): add CookieService (generic cookie mechanics)"
```

---

## Task 5: `SessionService` — sessions table + 3-tier cache

**Files:**
- Create: `packages/modules/auth/src/services/session.ts`
- Test: `packages/modules/auth/src/services/session.test.ts`

The core. `SessionService` owns the `sessions` table: `create`, `resolve` (through a `PersistedCache`), `revoke`, `revokeAllForUser`, `purgeExpired`, plus pure `setCookie`/`readSessionToken`. Any L2/L3 infra failure surfaces as `SessionStoreFailed` — never collapsed to `null`. `resolve` returning `null` means *only* absent/expired.

- [ ] **Step 1: Verify the `PersistedCache` / `Persistable` / `Schema` API**

Read (beta API — do not skip):
- `effect/src/unstable/persistence/PersistedCache.ts` — `make(lookup, { storeId, timeToLive, inMemoryCapacity?, inMemoryTTL? })` → `{ get, invalidate, inMemory }`.
- `effect/src/unstable/persistence/Persistable.ts` — `Persistable.Class<{ payload }>()(tag, { primaryKey, success, error })`.
- `effect/src/Schema.ts` — `Schema.Struct`, `Schema.NullOr`, `Schema.Never` (the rest of the value shape is derived — see below).
- `drizzle-orm/effect-schema` — `createSelectSchema(table)` builds an Effect `Schema` from a Drizzle table; **verified present** in `drizzle-orm@1.0.0-beta.22` (subpath export, no new dependency). Check how it models `timestamp` columns (`Date`): with `Persistence.layerMemory` either representation round-trips, but a Redis backing (later SP) would need a `Date`↔string transform — confirm before wiring Redis.

Adjust Step 4's code to the exact signatures found.

- [ ] **Step 2: Write the failing test**

Create `packages/modules/auth/src/services/session.test.ts`:

```typescript
import { DrizzleDb } from '@czo/kit/db/effect'
import { describe, expect, it, layer } from '@effect/vitest'
import { Duration, Effect, Layer } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { users } from '../database/schema'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Cookie from './cookie'
import * as Session from './session'

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

// SessionService provided over the Testcontainers Postgres + memory persistence.
const TestLayer = Session.layer.pipe(
  Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer)),
  Layer.provideMerge(AuthPostgresLayer),
)

/** Insert a user, return its id. */
const seedUser = Effect.gen(function* () {
  const db = yield* DrizzleDb
  const now = new Date()
  const rows = yield* Effect.promise(() => db.insert(users).values({
    name: 'Ada', email: `ada-${Math.random()}@example.com`,
    emailVerified: false, createdAt: now, updatedAt: now,
  }).returning())
  return (rows[0] as { id: number }).id
})

layer(TestLayer, { timeout: 120_000 })('sessionService', (it) => {
  it.effect('create → resolve round-trips the session + user', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      const { token } = yield* svc.create({ userId, actorType: 'user' })
      const resolved = yield* svc.resolve(token)
      expect(resolved?.session.userId).toBe(userId)
      expect(resolved?.user.id).toBe(userId)
    }))

  it.effect('resolve returns null for an unknown token', () =>
    Effect.gen(function* () {
      const resolved = yield* (yield* Session.SessionService).resolve('does-not-exist')
      expect(resolved).toBeNull()
    }))

  it.effect('revoke makes a subsequent resolve return null', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      const { token } = yield* svc.create({ userId, actorType: 'user' })
      yield* svc.revoke(token)
      expect(yield* svc.resolve(token)).toBeNull()
    }))

  it.effect('purgeExpired deletes expired rows and returns the count', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const userId = yield* seedUser
      const svc = yield* Session.SessionService
      yield* svc.create({ userId, actorType: 'user', expiresIn: Duration.seconds(-1) })
      expect(yield* svc.purgeExpired()).toBeGreaterThanOrEqual(1)
    }))

  it.effect('setCookie / readSessionToken round-trip the token', () =>
    Effect.gen(function* () {
      const svc = yield* Session.SessionService
      const cookie = svc.setCookie('tok-roundtrip')
      expect(svc.readSessionToken(`${cookie.name}=${cookie.value}`)).toBe('tok-roundtrip')
    }))
})

// A broken DB → SessionStoreFailed (separate suite — no container needed).
describe('sessionService — infra failure', () => {
  it.effect('create on a broken DB fails with SessionStoreFailed', () =>
    Effect.gen(function* () {
      const err = yield* (yield* Session.SessionService)
        .create({ userId: 1, actorType: 'user' })
        .pipe(Effect.flip)
      expect(err).toBeInstanceOf(Session.SessionStoreFailed)
    }).pipe(Effect.provide(Session.layer.pipe(Layer.provide(Layer.mergeAll(
      Layer.succeed(DrizzleDb, { insert: () => { throw new Error('db down') } } as never),
      Persistence.layerMemory,
      cookieLayer,
    ))))))
})
```

- [ ] **Step 3: Run the test — expect failure**

Run: `cd packages/modules/auth && pnpm vitest run src/services/session.test.ts`
Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 4: Implement `SessionService`**

Create `packages/modules/auth/src/services/session.ts`:

```typescript
import type { Database } from '@czo/kit/db'
import type { Relations } from '@czo/auth/relations'
import type { SessionRow, User } from './user'
import { randomBytes } from 'node:crypto'
import { DrizzleDb } from '@czo/kit/db/effect'
import { eq, lt } from 'drizzle-orm'
import { createSelectSchema } from 'drizzle-orm/effect-schema'
import { Context, Data, Duration, Effect, Layer, Schema } from 'effect'
import { Persistable, PersistedCache } from 'effect/unstable/persistence'
import { SESSION_DURATION } from '../constants'
import { sessions, users } from '../database/schema'
import * as Cookie from './cookie'

/**
 * The canonical session lifetime now lives in `../constants` (a `Duration`,
 * shared with `services/cookie.ts`, which pins the cookie `maxAge` to the same
 * value). Re-exported here so the `Session` namespace still surfaces it.
 */
export { SESSION_DURATION }
const L1_TTL = Duration.seconds(30)
const NEGATIVE_TTL = Duration.seconds(30)

/** `{ session, user }` — the resolved-session shape. */
export interface ResolvedSession {
  readonly session: SessionRow
  readonly user: User
}

export interface CreateSessionInput {
  readonly userId: number
  /** Defaults to `'user'` — `sessions.actorType` is `NOT NULL`, so `create` fills it. */
  readonly actorType?: string
  readonly ipAddress?: string
  readonly userAgent?: string
  /** Override the 7-day default — tests only (a negative `Duration` → already-expired). */
  readonly expiresIn?: Duration.Duration
}

/** Single tagged error for ANY session-store infrastructure failure (L2/L3). */
export class SessionStoreFailed extends Data.TaggedError('SessionStoreFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'SESSION_STORE_FAILED'
  get message() { return 'Session store operation failed' }
}

export class SessionService extends Context.Service<SessionService, {
  readonly create: (input: CreateSessionInput) => Effect.Effect<
    { token: string, session: SessionRow }, SessionStoreFailed
  >
  readonly resolve: (token: string) => Effect.Effect<ResolvedSession | null, SessionStoreFailed>
  readonly revoke: (token: string) => Effect.Effect<void, SessionStoreFailed>
  readonly revokeAllForUser: (userId: number) => Effect.Effect<void, SessionStoreFailed>
  readonly purgeExpired: () => Effect.Effect<number, SessionStoreFailed>
  readonly setCookie: (token: string) => Cookie.Cookie
  readonly readSessionToken: (cookieHeader: string) => string | null
}>()('@czo/auth/SessionService') {}

// ─── Cache value schema + key (Persistable) ──────────────────────────────

/**
 * `PersistedCache` value schema, DERIVED from the Drizzle tables via
 * `drizzle-orm/effect-schema`'s `createSelectSchema` — so it can never drift
 * from the real columns (it replaces a hand-written `Schema.Struct` that was a
 * silent hazard: any column rename would have broken cache decode at runtime).
 */
const ResolvedSessionSchema = Schema.NullOr(Schema.Struct({
  session: createSelectSchema(sessions),
  user: createSelectSchema(users),
}))

/** `PersistedCache` key — one cache entry per session token. */
class SessionKey extends Persistable.Class<{ payload: { token: string } }>()(
  '@czo/auth/SessionKey',
  { primaryKey: p => p.token, success: ResolvedSessionSchema, error: Schema.Never },
) {}

// ─── Layer ───────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const cookies = yield* Cookie.CookieService

    const tryDb = <A>(f: () => Promise<A>) =>
      Effect.tryPromise({ try: f, catch: cause => new SessionStoreFailed({ cause }) })

    /** L3 — source of truth: read `sessions ⋈ users`, honour expiry. */
    const lookup = (key: SessionKey): Effect.Effect<ResolvedSession | null> =>
      Effect.gen(function* () {
        const row = yield* tryDb(() => db.query.sessions.findFirst({
          where: { token: key.token },
          with: { user: true },
        })).pipe(Effect.orDie)
        if (!row || !row.user)
          return null
        if (row.expiresAt.getTime() <= Date.now()) {
          yield* tryDb(() => db.delete(sessions).where(eq(sessions.token, key.token))).pipe(Effect.orDie)
          return null
        }
        const { user, ...session } = row
        return { session: session as SessionRow, user: user as User }
      })

    const cache = yield* PersistedCache.make(lookup, {
      storeId: '@czo/auth/session',
      // L2 TTL is the session's REAL remaining lifetime — not a flat 7 days —
      // so an expired (or bulk-revoked) session can't be served stale from L2.
      timeToLive: (exit) => {
        if (exit._tag !== 'Success' || exit.value === null)
          return NEGATIVE_TTL
        const remainingMs = exit.value.session.expiresAt.getTime() - Date.now()
        return remainingMs > 0 ? Duration.millis(remainingMs) : NEGATIVE_TTL
      },
      inMemoryTTL: () => L1_TTL,
      inMemoryCapacity: 10_000,
    })

    return SessionService.of({
      create: input =>
        Effect.gen(function* () {
          const token = randomBytes(32).toString('base64url')
          const now = new Date()
          const ttl = input.expiresIn ?? SESSION_DURATION
          const [session] = yield* tryDb(() => db.insert(sessions).values({
            userId: input.userId,
            token,
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
            actorType: input.actorType ?? 'user',
            expiresAt: new Date(now.getTime() + Duration.toMillis(ttl)),
            createdAt: now,
            updatedAt: now,
          }).returning())
          if (!session)
            return yield* Effect.fail(new SessionStoreFailed({ cause: 'insert returned no row' }))
          return { token, session: session as SessionRow }
        }),
      resolve: token =>
        cache.get(new SessionKey({ token })).pipe(
          Effect.mapError(cause => new SessionStoreFailed({ cause })),
        ),
      revoke: token =>
        tryDb(() => db.delete(sessions).where(eq(sessions.token, token))).pipe(
          Effect.andThen(cache.invalidate(new SessionKey({ token })).pipe(
            Effect.mapError(cause => new SessionStoreFailed({ cause })),
          )),
        ),
      revokeAllForUser: userId =>
        // Delete every session row AND invalidate its cache entry — otherwise
        // bulk-revoked sessions keep resolving as valid from L1/L2 until TTL.
        tryDb(() => db.delete(sessions).where(eq(sessions.userId, userId))
          .returning({ token: sessions.token })).pipe(
          Effect.flatMap(rows => Effect.forEach(
            rows,
            ({ token }) => cache.invalidate(new SessionKey({ token })).pipe(
              Effect.mapError(cause => new SessionStoreFailed({ cause })),
            ),
            { discard: true },
          )),
        ),
      purgeExpired: () =>
        tryDb(async () => {
          const deleted = await db.delete(sessions)
            .where(lt(sessions.expiresAt, new Date()))
            .returning({ id: sessions.id })
          return deleted.length
        }),
      setCookie: token => cookies.create(token),
      readSessionToken: header => cookies.parse(header)[cookies.name] ?? null,
    })
})

/** Layer — scoped (the PersistedCache needs a Scope). */
export const layer = Layer.scoped(SessionService, make)
```

> Verification notes (beta API — adjust to Step 1's findings):
> - `PersistedCache.make` requires `Persistence` + `Scope`; `Layer.scoped` supplies the scope, `Persistence` comes from the provided layer.
> - `cache.get`'s error type is `Persistable.Error<K> | PersistenceError | SchemaError`; `SessionKey`'s error schema is `Schema.Never`, so it reduces to `PersistenceError | SchemaError` — both mapped to `SessionStoreFailed`.
> - `lookup`'s typed `E` must be `never` (`PersistedCache` lookup `E` = `Persistable.Error<K>` = `never`). DB errors inside `lookup` become defects via `Effect.orDie`; they still reach the caller as a cache failure → `SessionStoreFailed`. If beta `PersistedCache` swallows lookup defects, instead widen `SessionKey`'s error schema and fail properly.
> - `db.query.sessions.findFirst({ with: { user: true } })` — **verified**: `database/relations.ts` defines the `sessions.user` relation, so this resolves as written.
> - `Effect.orDie` / `Effect.andThen` / `Effect.flatMap` / `Effect.forEach` (`{ discard: true }`) / `Effect.mapError` / `Duration.millis` / `Duration.toMillis` — all verified present in `effect@4.0.0-beta.66`.

- [ ] **Step 5: Run the test — expect pass**

Run: `cd packages/modules/auth && pnpm vitest run src/services/session.test.ts`
Expected: PASS — all 6 tests green. If `with: { user: true }` fails, apply the relation fallback from the verification note.

- [ ] **Step 6: Type-check & commit**

Run: `cd packages/modules/auth && pnpm check-types` — expect no new errors.

```bash
git add packages/modules/auth/src/services/session.ts packages/modules/auth/src/services/session.test.ts
git commit -m "feat(auth): add SessionService (sessions table + 3-tier PersistedCache)"
```

---

## Task 6: `AuthEvents` bus + `signUp` / `signIn` orchestration

**Files:**
- Create: `packages/modules/auth/src/services/events/auth.ts`
- Create: `packages/modules/auth/src/http/credential.ts`
- Test: `packages/modules/auth/src/http/credential.test.ts`

A new `AuthEvents` domain bus (one event so far — `SignedUp`) plus the plain `signUp`/`signIn` Effect functions. `signUp` **pre-checks the email** (fail-fast, before the Argon2 hash), then runs the `users` + `accounts` inserts in **one transaction** (no orphan user); the `users.email` unique constraint guarantees integrity under a concurrent race. On success — after the transaction commits and the session is created — `signUp` publishes a `SignedUp` event on `AuthEvents`, **fire-and-forget** via `Effect.forkDetach` (a subscriber must never block or fail `signUp`). `signIn` collapses missing-user / missing-credential / bad-password into a single `InvalidCredentials` (no enumeration) and emits no event in SP1. `actorType` defaults to `'user'`; an unregistered actor type is *allowed*.

`AuthEvents` is a distinct domain bus from `UserEvents` — `SignedUp` models the *self-registration act*, not the generic `UserEvents.UserCreated` lifecycle event. (A consumer wanting "every new user, however created" subscribes to both; SP1 does not bridge them.)

- [ ] **Step 1: Write the failing test**

Create `packages/modules/auth/src/http/credential.test.ts`:

```typescript
import { DrizzleDb } from '@czo/kit/db/effect'
import { describe, expect, it, layer } from '@effect/vitest'
import { Chunk, Effect, Fiber, Layer, Stream } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { accounts, users } from '../database/schema'
import { makeAuthActorServiceLive } from '../layers/actor'
import { DEFAULT_ACTOR_RESTRICTIONS } from '../plugins/actor'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import { EmailAlreadyRegistered, InvalidCredentials, signIn, signUp } from './credential'
import * as AuthEvents from '../services/events/auth'
import * as Cookie from '../services/cookie'
import * as Password from '../services/password'
import * as Session from '../services/session'

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

const TestLayer = Layer.mergeAll(
  Password.layer,
  Session.layer.pipe(Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer))),
  makeAuthActorServiceLive(DEFAULT_ACTOR_RESTRICTIONS, true),
  AuthEvents.layer,
).pipe(Layer.provideMerge(AuthPostgresLayer))

layer(TestLayer, { timeout: 120_000 })('credential signUp/signIn', (it) => {
  it.effect('signUp creates user + credential + session', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const result = yield* signUp({ email: 'ada@example.com', name: 'Ada', password: 'Sup3r-Secret!' })
      expect(result.user.email).toBe('ada@example.com')
      expect(result.cookie.name).toBe('czo.session')
      expect(result.cookie.value).not.toBe('')
      const db = yield* DrizzleDb
      const accts = yield* Effect.promise(() => db.select().from(accounts))
      expect(accts).toHaveLength(1)
      expect((accts[0] as { providerId: string }).providerId).toBe('credential')
    }))

  it.effect('signUp publishes a SignedUp event on AuthEvents', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const events = yield* AuthEvents.AuthEvents
      // Subscribe BEFORE signUp so the forkDetach'd publish is observed.
      const collector = yield* events.subscribe.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      )
      yield* Effect.yieldNow
      yield* signUp({ email: 'evt@example.com', name: 'E', password: 'Sup3r-Secret!' })
      const event = Chunk.unsafeHead(yield* Fiber.join(collector))
      expect(event._tag).toBe('SignedUp')
      expect(event.email).toBe('evt@example.com')
    }))

  it.effect('signUp rejects a duplicate email → EmailAlreadyRegistered', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      yield* signUp({ email: 'dup@example.com', name: 'A', password: 'Sup3r-Secret!' })
      const err = yield* signUp({ email: 'dup@example.com', name: 'B', password: 'Sup3r-Secret!' })
        .pipe(Effect.flip)
      expect(err).toBeInstanceOf(EmailAlreadyRegistered)
      const db = yield* DrizzleDb
      expect(yield* Effect.promise(() => db.select().from(users))).toHaveLength(1)
    }))

  it.effect('signIn with the correct password succeeds', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      yield* signUp({ email: 'in@example.com', name: 'A', password: 'Sup3r-Secret!' })
      const result = yield* signIn({ email: 'in@example.com', password: 'Sup3r-Secret!' })
      expect(result.user.email).toBe('in@example.com')
    }))

  it.effect('signIn with a wrong password → InvalidCredentials', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      yield* signUp({ email: 'wp@example.com', name: 'A', password: 'Sup3r-Secret!' })
      const err = yield* signIn({ email: 'wp@example.com', password: 'wrong' }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(InvalidCredentials)
    }))

  it.effect('signIn for an unknown email → InvalidCredentials (no enumeration)', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const err = yield* signIn({ email: 'ghost@example.com', password: 'x' }).pipe(Effect.flip)
      expect(err).toBeInstanceOf(InvalidCredentials)
    }))
})
```

- [ ] **Step 2: Run the test — expect failure**

Run: `cd packages/modules/auth && pnpm vitest run src/http/credential.test.ts`
Expected: FAIL — `Cannot find module './credential'`.

- [ ] **Step 3: Implement the `AuthEvents` bus**

Create `packages/modules/auth/src/services/events/auth.ts`:

```typescript
import type { Effect as EffectNS, Stream as StreamNS } from 'effect'
import { Context, Effect, Layer, PubSub, Stream } from 'effect'

/**
 * Auth-domain events — the sign-up / sign-in flow. Distinct from `UserEvents`
 * (user lifecycle): `SignedUp` is the *self-registration act*. A discriminated
 * union on `_tag`, ready to grow (`SignedIn`, `SignedOut`, …).
 */
export type AuthEvent = {
  readonly _tag: 'SignedUp'
  readonly userId: number
  readonly email: string
  readonly actorType: string
}

export class AuthEvents extends Context.Service<AuthEvents, {
  readonly publish: (event: AuthEvent) => EffectNS.Effect<void>
  readonly publishAll: (events: ReadonlyArray<AuthEvent>) => EffectNS.Effect<void>
  readonly subscribe: StreamNS.Stream<AuthEvent>
}>()('@czo/auth/AuthEvents') {}

const make = Effect.gen(function* () {
  const pubsub = yield* PubSub.unbounded<AuthEvent>()
  return AuthEvents.of({
    publish: event => PubSub.publish(pubsub, event),
    publishAll: events => PubSub.publishAll(pubsub, events),
    subscribe: Stream.fromPubSub(pubsub),
  })
})

/** Layer — scoped: the `PubSub` is released with the surrounding scope. */
export const layer = Layer.scoped(AuthEvents, make)
```

> Verification note: mirror the existing `layers/events/user.ts` (`UserEvents`) bus for the exact `PubSub` / `Stream.fromPubSub` API in beta.66 — `UserEvents` has the same `publish`/`publishAll`/`subscribe` shape. Confirm `PubSub.unbounded` / `Stream.fromPubSub` names.

- [ ] **Step 4: Implement `signUp` / `signIn`**

Create `packages/modules/auth/src/http/credential.ts`:

```typescript
import type { Database } from '@czo/kit/db'
import type { Relations } from '@czo/auth/relations'
import type { ActorProviderFailed } from '../services/actor'
import { DrizzleDb } from '@czo/kit/db/effect'
import { Data, Effect } from 'effect'
import { accounts, users } from '../database/schema'
import { AuthActorService } from '../services/actor'
import { PasswordHashFailed } from '../services/user'
import * as AuthEvents from '../services/events/auth'
import * as Cookie from '../services/cookie'
import * as Password from '../services/password'
import * as Session from '../services/session'

const CREDENTIAL_PROVIDER = 'credential'

// ─── Tagged errors ───────────────────────────────────────────────────────

export class EmailAlreadyRegistered extends Data.TaggedError('EmailAlreadyRegistered')<{
  readonly email: string
}> {
  readonly code = 'EMAIL_ALREADY_REGISTERED'
  get message() { return `Email ${this.email} is already registered` }
}

export class InvalidCredentials extends Data.TaggedError('InvalidCredentials') {
  readonly code = 'INVALID_CREDENTIALS'
  get message() { return 'Invalid email or password' }
}

export class ActorTypeNotAllowed extends Data.TaggedError('ActorTypeNotAllowed')<{
  readonly actorType: string
}> {
  readonly code = 'ACTOR_TYPE_NOT_ALLOWED'
  get message() { return `Actor type "${this.actorType}" is not allowed for this user` }
}

export class CredentialDbFailed extends Data.TaggedError('CredentialDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'CREDENTIAL_DB_FAILED'
  get message() { return 'Credential database operation failed' }
}

// ─── Inputs ──────────────────────────────────────────────────────────────

export interface SignUpInput {
  readonly email: string
  readonly name: string
  readonly password: string
  readonly actorType?: string
}

export interface SignInInput {
  readonly email: string
  readonly password: string
  readonly actorType?: string
}

export type CredentialResult = Session.ResolvedSession & {
  readonly token: string
  readonly cookie: Cookie.Cookie
}

type CredentialError =
  | EmailAlreadyRegistered | InvalidCredentials | ActorTypeNotAllowed
  | PasswordHashFailed | ActorProviderFailed | Session.SessionStoreFailed | CredentialDbFailed

// ─── Helper: actor-type validation (unregistered type → allowed) ─────────

function assertActorType(userId: number, actorType: string) {
  return Effect.gen(function* () {
    const actor = yield* AuthActorService
    const registered = yield* actor.registeredActors
    if (!registered.includes(actorType))
      return
    // `AuthActorService` keys actors by string user id.
    const ok = yield* actor.hasActorType(String(userId), actorType)
    if (!ok)
      return yield* Effect.fail(new ActorTypeNotAllowed({ actorType }))
  })
}

// ─── signUp ──────────────────────────────────────────────────────────────

export function signUp(input: SignUpInput): Effect.Effect<
  CredentialResult, CredentialError,
  Password.PasswordService | Session.SessionService | AuthActorService | DrizzleDb | AuthEvents.AuthEvents
> {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const password = yield* Password.PasswordService
    const session = yield* Session.SessionService

    const tryDb = <A>(f: () => Promise<A>) =>
      Effect.tryPromise({ try: f, catch: cause => new CredentialDbFailed({ cause }) })

    // Fail fast: reject an already-registered email BEFORE the (deliberately
    // expensive) Argon2 hash. The `users.email` unique constraint is still the
    // race-proof backstop in the transaction's `catch` below — this pre-check
    // is an optimisation + clean control flow, not a substitute for it.
    const existing = yield* tryDb(() => db.query.users.findFirst({ where: { email: input.email } }))
    if (existing)
      return yield* Effect.fail(new EmailAlreadyRegistered({ email: input.email }))

    const passwordHash = yield* password.hash(input.password)

    // user + credential account in ONE transaction → no orphan user.
    const user = yield* Effect.tryPromise({
      try: () => db.transaction(async (tx) => {
        const now = new Date()
        const [u] = await tx.insert(users).values({
          name: input.name, email: input.email, emailVerified: false,
          createdAt: now, updatedAt: now,
        }).returning()
        if (!u)
          throw new Error('user insert returned no row')
        await tx.insert(accounts).values({
          userId: u.id, accountId: String(u.id), providerId: CREDENTIAL_PROVIDER,
          password: passwordHash, createdAt: now, updatedAt: now,
        })
        return u
      }),
      // Integrity under a concurrent same-email race is guaranteed by the
      // `users.email` unique constraint (the insert is rejected, the txn rolls
      // back). The pre-check above already maps the normal "email taken" case
      // to EmailAlreadyRegistered.
      catch: cause => new CredentialDbFailed({ cause }),
    })

    // Membership is checked ONLY when the caller explicitly requested an actor
    // type — a fresh sign-up with no actorType has nothing to validate, and the
    // default-`'user'` session would otherwise always fail the check (a brand-
    // new user holds no actor-type memberships).
    if (input.actorType)
      yield* assertActorType(user.id, input.actorType)

    const { token, session: sessionRow } = yield* session.create({
      userId: user.id,
      actorType: input.actorType,
    })
    const cookie = session.setCookie(token)

    // SignedUp — fire-and-forget: a domain-event subscriber must never block or
    // fail signUp. Emitted post-commit, so the event reflects persisted state.
    // `actorType` is read off the persisted row (`SessionService` defaults it).
    const events = yield* AuthEvents.AuthEvents
    yield* Effect.forkDetach(events.publish({
      _tag: 'SignedUp', userId: user.id, email: user.email, actorType: sessionRow.actorType,
    }))

    return { session: sessionRow, user, token, cookie }
  })
}

// ─── signIn ──────────────────────────────────────────────────────────────

export function signIn(input: SignInInput): Effect.Effect<
  CredentialResult, CredentialError,
  Password.PasswordService | Session.SessionService | AuthActorService | DrizzleDb
> {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const password = yield* Password.PasswordService
    const session = yield* Session.SessionService

    const tryDb = <A>(f: () => Promise<A>) =>
      Effect.tryPromise({ try: f, catch: cause => new CredentialDbFailed({ cause }) })

    const user = yield* tryDb(() => db.query.users.findFirst({ where: { email: input.email } }))
    if (!user)
      return yield* Effect.fail(new InvalidCredentials())

    // RQBv2 — the `where` object filters by userId AND providerId, so the
    // credential row is already scoped (no post-query narrowing needed).
    const credential = yield* tryDb(() => db.query.accounts.findFirst({
      where: { userId: user.id, providerId: CREDENTIAL_PROVIDER },
    }))
    if (!credential?.password)
      return yield* Effect.fail(new InvalidCredentials())

    const ok = yield* password.verify(credential.password, input.password)
    if (!ok)
      return yield* Effect.fail(new InvalidCredentials())

    if (input.actorType)
      yield* assertActorType(user.id, input.actorType)

    const { token, session: sessionRow } = yield* session.create({
      userId: user.id,
      actorType: input.actorType,
    })
    return { session: sessionRow, user, token, cookie: session.setCookie(token) }
  })
}
```

> Verification notes: **verified during planning** — `AuthActorService.registeredActors` (`Effect<readonly string[]>`) and `hasActorType(userId: string, type: string)` exist (`services/actor.ts`); `users` / `accounts` / `sessions` are all registered in `database/relations.ts` (so the RQBv2 `findFirst` calls resolve); `Effect.forkDetach` exists in `effect@4.0.0-beta.66`. ⚠️ `hasActorType` keys by a **string** user id — `assertActorType` passes `String(userId)`. ⚠️ The credential test uses **`Effect.forkChild`** — `Effect.fork` does NOT exist in beta.66 (the fork family is `forkChild` / `forkIn` / `forkScoped` / `forkDetach`). Still confirm the `PubSub`/`Stream` API in `events/auth.ts` against the existing `layers/events/user.ts` bus (same shape): `PubSub.unbounded`, `PubSub.publish`/`publishAll`, `Stream.fromPubSub`, plus `Chunk.unsafeHead`, `Stream.take`, `Stream.runCollect`, `Effect.yieldNow`.

- [ ] **Step 5: Run the test — expect pass**

Run: `cd packages/modules/auth && pnpm vitest run src/http/credential.test.ts`
Expected: PASS — all 6 tests green.

> If the `SignedUp`-emission test is flaky, the subscriber didn't attach before
> `signUp`'s `forkDetach`'d publish — replace `Effect.yieldNow` with an explicit
> readiness `Deferred` the collector completes once subscribed.

- [ ] **Step 6: Type-check & commit**

Run: `cd packages/modules/auth && pnpm check-types` — expect no new errors.

```bash
git add packages/modules/auth/src/services/events/auth.ts packages/modules/auth/src/http/credential.ts packages/modules/auth/src/http/credential.test.ts
git commit -m "feat(auth): add AuthEvents bus + signUp/signIn credential orchestration"
```

---

## Task 7: `@czo/kit` — make `graphql.contexts` Effect-returning

**Files:**
- Modify: `packages/kit/src/module/contract.ts:73`
- Modify: `packages/kit/src/graphql/builder.ts` (lines ~78, ~84, ~94-96)
- Modify: `packages/kit/src/module/app.ts` (the `graphQLContexts` aggregation)
- Test: `packages/kit/src/graphql/builder.test.ts`

Session resolution is async; the sync `contexts` contributor cannot run it. Widen the contract to an Effect-returning contributor and `yield*` them in `buildContext`. Verified during planning: **no module implements `contexts` today** — this is a kit-internal change only.

- [ ] **Step 1: Verify `makeGraphQLBuilder`'s signature, then write the failing test**

First read `packages/kit/src/graphql/builder.ts` — confirm `makeGraphQLBuilder`'s
parameter order and arity (the test below assumes positional args
`(contributions, contexts, authScopes, …)`). Adjust the test call to the real
signature before running it.

Create (or extend) `packages/kit/src/graphql/builder.test.ts`:

```typescript
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { GraphQLBuilder, makeGraphQLBuilder } from './builder'

describe('makeGraphQLBuilder — Effect contexts contributors', () => {
  it.effect('buildContext composes async (Effect) contributors', () =>
    Effect.gen(function* () {
      const builder = yield* GraphQLBuilder
      const ctx = yield* builder.buildContext({ request: new Request('http://x') })
      expect((ctx as any).auth).toEqual({ session: null })
    }).pipe(Effect.provide(makeGraphQLBuilder(
      [],
      [() => Effect.succeed({ auth: { session: null } } as never)],
      [],
      {} as never,
    ))))
})
```

- [ ] **Step 2: Run the test — expect failure**

Run: `cd packages/kit && pnpm vitest run src/graphql/builder.test.ts`
Expected: FAIL — contributors typed sync; `Effect.succeed(...)` not assignable / `buildContext` does not `yield*` them.

- [ ] **Step 3: Widen the `contexts` contract**

In `packages/kit/src/module/contract.ts`, change the `contexts` field (line 73) to:

```typescript
    readonly contexts?: (systemContext: unknown) =>
      Effect.Effect<Partial<GraphQLContextMap>, unknown, any>
```

(`Effect` is already imported as a type.)

- [ ] **Step 4: Compose contributors as Effects in `buildContext`**

In `packages/kit/src/graphql/builder.ts`:

`makeGraphQLBuilder`'s `contexts` parameter type (line ~84):

```typescript
  contexts: ReadonlyArray<(systemContext: unknown) => Effect.Effect<Partial<GraphQLContextMap>, unknown, any>>,
```

`GraphQLBuilder` service shape — `buildContext` (line ~78):

```typescript
  readonly buildContext: (systemContext: unknown) => Effect.Effect<GraphQLContextMap, unknown, any>
```

`buildContext` body (lines ~94-96) — replace the sync `Object.assign` with:

```typescript
        buildContext: (systemContext: unknown) => Effect.gen(function* () {
          const parts = yield* Effect.all(contexts.map(ctx => ctx(systemContext)))
          return Object.assign({}, ...parts)
        }),
```

- [ ] **Step 5: Fix `buildApp`'s aggregation**

In `packages/kit/src/module/app.ts`, `m.graphql?.contexts` is a single function, not an array — `?? []` on a function is wrong. Change:

```typescript
const graphQLContexts = options.modules.flatMap(m => m.graphql?.contexts ? [m.graphql.contexts] : [])
```

Apply the same `m.graphql?.X ? [m.graphql.X] : []` shape to `graphQLContributions` and `authScopes` if they have the identical `?? []`-on-a-function bug.

- [ ] **Step 6: Run the test — expect pass**

Run: `cd packages/kit && pnpm vitest run src/graphql/builder.test.ts` — expect PASS.
Run: `cd packages/kit && pnpm check-types` — expect no new errors.

- [ ] **Step 7: Commit**

```bash
git add packages/kit/src/module/contract.ts packages/kit/src/graphql/builder.ts packages/kit/src/module/app.ts packages/kit/src/graphql/builder.test.ts
git commit -m "feat(kit): make module graphql.contexts an Effect-returning contributor"
```

---

## Task 8: HTTP handlers + error mapper

**Files:**
- Create: `packages/modules/auth/src/http/error-map.ts`
- Create: `packages/modules/auth/src/http/sign-up.ts`, `sign-in.ts`, `sign-out.ts`
- Test: `packages/modules/auth/src/http/error-map.test.ts`

Thin h3 handlers: validate the body with an **Effect `Schema`** (diverges from the repo's "Zod at boundaries" rule — deliberate for the Effect-native auth module). Each handler is a single Effect pipeline — decode body → orchestration → `Effect.match` to the response — run once via `event.context.runEffect`; **no JS `try/catch`**. The error mapper turns tagged errors into HTTP statuses.

- [ ] **Step 1: Write the failing test for the error mapper**

Create `packages/modules/auth/src/http/error-map.test.ts`:

```typescript
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { EmailAlreadyRegistered, InvalidCredentials } from './credential'
import { httpStatusForError } from './error-map'

describe('httpStatusForError', () => {
  it('maps EmailAlreadyRegistered → 409', () => {
    expect(httpStatusForError(new EmailAlreadyRegistered({ email: 'a@b.c' }))).toBe(409)
  })
  it('maps InvalidCredentials → 401', () => {
    expect(httpStatusForError(new InvalidCredentials())).toBe(401)
  })
  it('maps an Effect Schema decode error → 400', () => {
    let err: unknown
    try { Schema.decodeUnknownSync(Schema.String)(123) }
    catch (e) { err = e }
    expect(httpStatusForError(err)).toBe(400)
  })
  it('maps an unknown error → 500', () => {
    expect(httpStatusForError(new Error('boom'))).toBe(500)
  })
})
```

> Verification note: confirm the `_tag` of the error thrown by `Schema.decodeUnknownSync` in beta.66 (`SchemaError` or `ParseError`) — `STATUS_BY_TAG` covers both, but trim to whichever is correct. This 400-mapping test will tell you which `_tag` fired.

(Plain `vitest` here — `httpStatusForError` is a pure sync function, no Effect.)

- [ ] **Step 2: Run the test — expect failure**

Run: `cd packages/modules/auth && pnpm vitest run src/http/error-map.test.ts`
Expected: FAIL — `Cannot find module './error-map'`.

- [ ] **Step 3: Implement the error mapper**

Create `packages/modules/auth/src/http/error-map.ts`:

```typescript
/** Map a tagged error (or anything) to an HTTP status for the auth handlers. */
const STATUS_BY_TAG: Record<string, number> = {
  EmailAlreadyRegistered: 409,
  InvalidCredentials: 401,
  ActorTypeNotAllowed: 403,
  SessionStoreFailed: 503,
  PasswordHashFailed: 500,
  CredentialDbFailed: 500,
  ActorProviderFailed: 500,
  // Effect `Schema` body-decode failure → 400 Bad Request.
  SchemaError: 400,
  ParseError: 400,
}

export function httpStatusForError(error: unknown): number {
  const tag = (error as { _tag?: string } | null)?._tag
  return (tag && STATUS_BY_TAG[tag]) || 500
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `cd packages/modules/auth && pnpm vitest run src/http/error-map.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Implement the three handlers**

`signUp`/`signIn` already return a `Cookie` in their result. Each handler is a single Effect pipeline run once via `event.context.runEffect` — read body → `decodeBody` → `signUp`/`signIn` → `Effect.match` to the response. No JS `try/catch`, no `Effect.gen`, no `SessionService` in the handler.

Create `packages/modules/auth/src/http/sign-up.ts`:

```typescript
import { Effect, Schema } from 'effect'
import { defineHandler, readBody } from 'h3'
import { signUp } from './credential'
import { httpStatusForError } from './error-map'

const BodySchema = Schema.Struct({
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  password: Schema.String.pipe(Schema.minLength(8), Schema.maxLength(128)),
  actorType: Schema.optional(Schema.String),
})

/** Decode the body inside Effect — a `SchemaError` lands in the error channel. */
const decodeBody = (raw: unknown) =>
  Effect.try({ try: () => Schema.decodeUnknownSync(BodySchema)(raw), catch: error => error })

// The whole handler is ONE Effect, run once — no JS try/catch. `Effect.match`
// turns both channels into the response: expected tagged errors (decode,
// credential) → a status; a genuine defect propagates to h3 as a 500.
export const signUpHandler = defineHandler(event =>
  event.context.runEffect(
    Effect.promise(() => readBody(event)).pipe(
      Effect.flatMap(decodeBody),
      Effect.flatMap(signUp),
      Effect.match({
        onSuccess: ({ user, cookie }) => {
          event.res.headers.append('set-cookie', cookie.serialize())
          event.res.status = 200
          return { user }
        },
        onFailure: (error) => {
          event.res.status = httpStatusForError(error)
          return { error: (error as { code?: string })?.code ?? 'ERROR' }
        },
      }),
    ),
  ),
)
```

Create `packages/modules/auth/src/http/sign-in.ts`:

```typescript
import { Effect, Schema } from 'effect'
import { defineHandler, readBody } from 'h3'
import { signIn } from './credential'
import { httpStatusForError } from './error-map'

const BodySchema = Schema.Struct({
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  password: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  actorType: Schema.optional(Schema.String),
})

/** Decode the body inside Effect — a `SchemaError` lands in the error channel. */
const decodeBody = (raw: unknown) =>
  Effect.try({ try: () => Schema.decodeUnknownSync(BodySchema)(raw), catch: error => error })

export const signInHandler = defineHandler(event =>
  event.context.runEffect(
    Effect.promise(() => readBody(event)).pipe(
      Effect.flatMap(decodeBody),
      Effect.flatMap(signIn),
      Effect.match({
        onSuccess: ({ user, cookie }) => {
          event.res.headers.append('set-cookie', cookie.serialize())
          event.res.status = 200
          return { user }
        },
        onFailure: (error) => {
          event.res.status = httpStatusForError(error)
          return { error: (error as { code?: string })?.code ?? 'ERROR' }
        },
      }),
    ),
  ),
)
```

> Verification note: confirm the Effect 4 `Schema` filter API — `Schema.Struct`, `Schema.String`, `Schema.pattern`, `Schema.minLength`, `Schema.maxLength`, `Schema.optional` (already used in `services/session.ts`, Task 5). If beta.66 ships a built-in email schema, prefer it over the raw `Schema.pattern` regex. Decode-into-Effect: beta.66 `Schema` has **no `decodeUnknownEffect`** (only `decodeUnknownSync` / `decodeUnknownPromise` / `…Result` / `…Option` — verified) — hence `decodeBody` wraps `Schema.decodeUnknownSync` in `Effect.try`. `Effect.try` (the `try`/`catch` options form) and `Effect.match` are both verified present in beta.66. A `SchemaError`'s `_tag` → `httpStatusForError` → 400 (`STATUS_BY_TAG` covers `SchemaError`/`ParseError`); a genuine defect is not caught by `Effect.match` and surfaces as h3's default 500.

Create `packages/modules/auth/src/http/sign-out.ts`:

```typescript
import { Effect } from 'effect'
import { defineHandler, getCookie } from 'h3'
import * as Cookie from '../services/cookie'
import * as Session from '../services/session'

export const signOutHandler = defineHandler(async (event) => {
  const blank = await event.context.runEffect(
    Effect.gen(function* () {
      const session = yield* Session.SessionService
      const cookies = yield* Cookie.CookieService
      const token = getCookie(event, cookies.name)
      if (token)
        // A revoke infra failure must NOT block logout — log it and clear the
        // cookie anyway. Stays in Effect (a pipe); the handler keeps no try/catch.
        yield* session.revoke(token).pipe(
          Effect.catchCause(cause =>
            Effect.logWarning('sign-out: session revoke failed', cause)),
        )
      return cookies.createBlank()
    }),
  )
  event.res.headers.append('set-cookie', blank.serialize())
  event.res.status = 204
  return null
})
```

> Verification note: `Effect.catchCause` + `Effect.logWarning` (keeping a revoke
> failure from blocking logout) are verified present in `effect@4.0.0-beta.66`.
> `cookies.name` is the field added to `CookieService` in Task 4.

- [ ] **Step 6: Type-check**

Run: `cd packages/modules/auth && pnpm check-types`
Expected: no new errors. (`event.context.runEffect` is typed by the `declare module 'h3'` augmentation in `@czo/kit`'s `app.ts`.)

- [ ] **Step 7: Commit**

```bash
git add packages/modules/auth/src/http/error-map.ts packages/modules/auth/src/http/error-map.test.ts packages/modules/auth/src/http/sign-up.ts packages/modules/auth/src/http/sign-in.ts packages/modules/auth/src/http/sign-out.ts
git commit -m "feat(auth): add sign-up/sign-in/sign-out HTTP handlers"
```

---

## Task 9: Module wiring — layers, http routes, session contributor, `AuthContext`

**Files:**
- Modify: `packages/modules/auth/src/module.ts`
- Modify: `packages/modules/auth/src/graphql/index.ts`
- Modify: `packages/modules/auth/src/services/index.ts`
- Delete: `packages/modules/auth/src/graphql/context-factory.ts`
- Create: `packages/modules/auth/src/graphql/session-context.ts`
- Test: `packages/modules/auth/src/graphql/session-context.test.ts`

Compose the new layers into `AuthModuleLive`, register the HTTP routes on the `http` hook, add the `graphql.contexts` session contributor, give `AuthContext` real types.

- [ ] **Step 1: `old/`-mirror the files being rewritten/deleted**

```bash
mkdir -p old/packages/modules/auth/src/graphql
cp packages/modules/auth/src/module.ts old/packages/modules/auth/src/module.ts
cp packages/modules/auth/src/graphql/context-factory.ts old/packages/modules/auth/src/graphql/context-factory.ts
cp packages/modules/auth/src/graphql/index.ts old/packages/modules/auth/src/graphql/index.ts
```

- [ ] **Step 2: Write the failing test for the session contributor**

Create `packages/modules/auth/src/graphql/session-context.test.ts`:

```typescript
import { DrizzleDb } from '@czo/kit/db/effect'
import { describe, expect, it, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { users } from '../database/schema'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Cookie from '../services/cookie'
import * as Session from '../services/session'
import { makeSessionContextContributor } from './session-context'

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

const TestLayer = Session.layer.pipe(
  Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer)),
  Layer.provideMerge(AuthPostgresLayer),
)

const contribute = makeSessionContextContributor()

layer(TestLayer, { timeout: 120_000 })('session-context contributor', (it) => {
  it.effect('no cookie → anonymous { auth: { session: null } }', () =>
    Effect.gen(function* () {
      const ctx = yield* contribute({ request: new Request('http://x') })
      expect((ctx as any).auth).toEqual({ session: null })
    }))

  it.effect('valid cookie → { auth: { session, user } }', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const db = yield* DrizzleDb
      const now = new Date()
      const [u] = yield* Effect.promise(() => db.insert(users).values({
        name: 'Ada', email: 'ada@example.com', emailVerified: false, createdAt: now, updatedAt: now,
      }).returning())
      const { token } = yield* (yield* Session.SessionService).create({ userId: (u as any).id, actorType: 'user' })
      const ctx = yield* contribute({
        request: new Request('http://x', { headers: { cookie: `czo.session=${token}` } }),
      })
      expect((ctx as any).auth.user.id).toBe((u as any).id)
    }))
})
```

- [ ] **Step 3: Run the test — expect failure**

Run: `cd packages/modules/auth && pnpm vitest run src/graphql/session-context.test.ts`
Expected: FAIL — `Cannot find module './session-context'`.

- [ ] **Step 4: Implement the session contributor**

Create `packages/modules/auth/src/graphql/session-context.ts`:

```typescript
import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import * as Session from '../services/session'

/**
 * The `graphql.contexts` contributor: read the session cookie off the request
 * and resolve it into `ctx.auth`. Absent/expired → anonymous. An infra failure
 * (`SessionStoreFailed`) is propagated — the request fails, never silently
 * downgraded to anonymous.
 */
export function makeSessionContextContributor() {
  return (systemContext: unknown): Effect.Effect<Partial<GraphQLContextMap>, unknown, Session.SessionService> =>
    Effect.gen(function* () {
      const session = yield* Session.SessionService
      const request = (systemContext as { request?: Request }).request
      const token = session.readSessionToken(request?.headers.get('cookie') ?? '')
      if (!token)
        return { auth: { session: null } }
      const resolved = yield* session.resolve(token)
      return { auth: resolved ? { session: resolved.session, user: resolved.user } : { session: null } }
    })
}
```

- [ ] **Step 5: Run the test — expect pass**

Run: `cd packages/modules/auth && pnpm vitest run src/graphql/session-context.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 6: Type the `AuthContext`**

In `packages/modules/auth/src/graphql/index.ts`: add `import type { ResolvedSession } from '../services/session'`, replace the `AuthContext` interface, and delete the `// import './context-factory'` line:

```typescript
export interface AuthContext {
  session: ResolvedSession['session'] | null
  user?: ResolvedSession['user']
}
```

- [ ] **Step 7: Delete the dead context factory**

```bash
git rm packages/modules/auth/src/graphql/context-factory.ts
```

- [ ] **Step 8: Export the new services from the barrel**

In `packages/modules/auth/src/services/index.ts` add (namespace re-exports — each
file exports its own `layer`, so a flat `export *` would collide):

```typescript
export * as Cookie from './cookie'
export * as Password from './password'
export * as Session from './session'
export * as AuthEvents from './events/auth'
```

(Do **not** re-export `http/credential.ts` — it is not a service.)

- [ ] **Step 9: Wire the module**

In `packages/modules/auth/src/module.ts`, add these imports:

```typescript
import { signInHandler } from './http/sign-in'
import { signOutHandler } from './http/sign-out'
import { signUpHandler } from './http/sign-up'
import { makeSessionContextContributor } from './graphql/session-context'
import * as AuthEvents from './services/events/auth'
import * as Cookie from './services/cookie'
import * as Password from './services/password'
import * as Session from './services/session'
```

Inside `makeAuthModule`, before `AuthModuleLive`, build the SP1 layers:

```typescript
  // CookieService config — `Cookie.layerConfigService` builds CookieService
  // from the env-backed `Config.Wrap` routed through `CookieConfigService`.
  // All cookie tuning now lives in `services/cookie.ts`.
  const cookieLayer = Cookie.layerConfigService

  // SessionService requires DrizzleDb + Persistence — shared infra provided at
  // the app surface by buildApp (deferred, see Notes). CookieService is
  // module-local, provided here (`layerConfigService`'s `ConfigError` is
  // absorbed by the `AuthModuleLive` cast).
  const sessionLayer = Session.layer.pipe(Layer.provide(cookieLayer))
```

Add `Password.layer`, `AuthEvents.layer`, and `sessionLayer` to the `Layer.mergeAll(...)` that builds `AuthModuleLive` (alongside `ApiKeyServiceLive`, `UserServiceLive`, …). Keep the existing `as unknown as Layer.Layer<never, never, never>` cast `module.ts` already applies to `AuthModuleLive`.

Add the `contexts` contributor to the `graphql` object:

```typescript
    graphql: {
      contribution: builder => registerAuthSchema(builder),
      authScope: authScopes,
      contexts: makeSessionContextContributor(),
    },
```

Add the three routes to the `http` hook, before the better-auth catch-all:

```typescript
    http: (app) => {
      app.post('/api/auth/sign-up', signUpHandler)
      app.post('/api/auth/sign-in', signInHandler)
      app.post('/api/auth/sign-out', signOutHandler)
      app.all('/api/auth/**', defineHandler(async (event) => {
        const auth = await event.context.runEffect(BetterAuth)
        return auth.handler(event.req)
      }))
      return Effect.void
    },
```

- [ ] **Step 10: Type-check the whole module**

Run: `cd packages/modules/auth && pnpm check-types`
Expected: no new errors. Fix fallout from the `AuthContext` retyping — resolvers reading `ctx.auth.user`/`ctx.auth.session` now get real types instead of `any`.

- [ ] **Step 11: Run the SP1 test suite**

Run: `cd packages/modules/auth && pnpm vitest run src/services/password.test.ts src/services/cookie.test.ts src/services/session.test.ts src/http/credential.test.ts src/http/error-map.test.ts src/graphql/session-context.test.ts src/testing/postgres.test.ts`
Expected: all PASS. (Pre-existing legacy `*.test.ts` files that import the removed `@czo/kit/effect` stay broken — out of SP1 scope; note, do not fix.)

Run: `cd packages/kit && pnpm vitest run src/graphql/builder.test.ts` — expect PASS.

- [ ] **Step 12: Remove the `old/` mirror**

```bash
rm -rf old/
```

- [ ] **Step 13: Commit**

```bash
git add packages/modules/auth/src/module.ts packages/modules/auth/src/graphql/index.ts packages/modules/auth/src/graphql/session-context.ts packages/modules/auth/src/graphql/session-context.test.ts packages/modules/auth/src/services/index.ts
git add -A packages/modules/auth/src/graphql/context-factory.ts
git commit -m "feat(auth): wire SP1 layers, HTTP routes, and session ctx.auth contributor"
```

---

## Final verification

- [ ] `cd packages/kit && pnpm check-types` — PASS
- [ ] `cd packages/modules/auth && pnpm check-types` — PASS
- [ ] `cd packages/modules/auth && pnpm vitest run` — SP1 files green (pre-existing legacy failures noted, not SP1)
- [ ] `cd packages/modules/auth && pnpm lint` — no new warnings
- [ ] `git grep -n "context-factory" packages/modules/auth/src` — returns nothing
- [ ] `ls old/ 2>/dev/null` — empty / absent

---

## Spec coverage check

| Spec section | Task(s) |
|---|---|
| §3.1 `PasswordService` | Task 2 |
| §3.2 `SessionService` + 3-tier cache + `SessionStoreFailed` | Task 5 |
| §3.3 `CookieService` | Task 4 |
| §3.4 `signUp`/`signIn` + transaction + actorType | Task 6 |
| §4 HTTP surface + error mapping | Task 8 |
| §5 `ctx.auth` + `contexts` contract change | Tasks 7, 9 |
| §6 module wiring | Task 9 |
| §7 errors | Tasks 2, 5, 6, 8 |
| §8 Testcontainers testing | Task 3 + every integration suite |
| §9 file layout, `context-factory.ts` deletion | Tasks 1, 9 |

---

## Notes / resolved open items (spec §11)

- **`contexts` `R`/`E` typing** — resolved as `R = any`, `E = unknown` (consistent with the existing `GraphQLContextMap.runEffect: …Effect<A, E, any>`). The captured `appContext` in `buildApp` provides `SessionService` at runtime.
- **`Persistable`/`Schema`** — explicit `Schema.Struct` in Task 5; if beta `PersistedCache` lookup-error propagation differs from the verification note, widen `SessionKey`'s error schema.
- **`Persistence` / `NodeRedis` infra is deferred** — `Persistence` is *consumed* by SP1 (`SessionService` builds a `PersistedCache`, leaving `Persistence` in its layer's `R`) but **not provided** by the auth module. The infra provide — `NodeRedis` → `Redis.Redis` → `Persistence` (memory or Redis), wired once in `@czo/kit`'s `buildApp` alongside `DrizzleDb` — is a separate later task. SP1 is validated by tests, which provide `Persistence.layerMemory` directly; the auth module is therefore not app-runnable until that infra task lands.
- **Testcontainers lifecycle** — container is a scoped Effect `Layer` (`Layer.unwrap` + `Effect.acquireRelease`), provided per-suite via `@effect/vitest`'s `layer()`. Auth Drizzle migrations applied on layer acquire. Pattern follows `effect-smol`'s `NodeRedis.test.ts`.
- **`@czo/kit/effect` removal** — SP1 uses `@effect/vitest` (not the deleted hand-rolled helpers); no re-home needed. Legacy auth tests still importing `@czo/kit/effect` remain broken — out of SP1 scope.
- **`SameSite`** — env-tunable via the `sessionCookieSameSite` `Config` in `cookieConfig` (→ `SESSION_COOKIE_SAME_SITE` once the `ConfigProvider.constantCase` wrapper is wired), defaults to `lax`; cross-origin + CORS deferred.
```
