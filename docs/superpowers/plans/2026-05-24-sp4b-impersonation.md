# SP4b — Impersonation: Native Finalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native impersonation flow (an admin acts as another user via a derived session) and drop the last `better-auth/plugins.admin()` runtime dependency.

**Architecture:** Five chantiers — (1) migration adding `sessions.parent_token` (FK self-reference, CASCADE on delete) + partial index + `user:impersonate` AccessControl statement; (2) `SessionService` extension (`create` accepts `impersonatedBy`/`parentToken`, `resolve` adds a `NOT EXISTS` guard that hides parent sessions while a child exists); (3) new `ImpersonationService` (`services/impersonation.ts`) with `start`/`stop`, `ImpersonationConfig` Tag, 6 tagged errors, 6 guards, telemetry via `Effect.fn`, events via `AuthEvents` (widened to a discriminated union); (4) GraphQL context exposes `sessionToken` + 2 `relayMutationField` mutations (`startImpersonation`/`stopImpersonation`) that swap the session cookie via h3 `setCookie`; (5) delete `layers/better-auth/admin.ts`, drop `adminConfig` from the `plugins:` array — last `'better-auth/plugins'` admin import disappears.

**Tech Stack:** `effect@4.0.0-beta.70` (`Context.Service`, `Layer`, `Effect.gen`, `Effect.fn`, `Effect.tryPromise`, `Stream`, `PubSub`, `Duration`), `drizzle-orm@1.0.0-rc.3` with `effect-postgres` (raw `sql` template for `NOT EXISTS`, self-referencing FK via `AnyPgColumn` forward declaration), Pothos (`@pothos/plugin-relay`, `@pothos/plugin-scope-auth`, `@pothos/plugin-errors`), h3 `setCookie` for response cookie, `@effect/vitest` + Testcontainers Postgres via `AuthPostgresLayer`.

**Source spec:** `docs/superpowers/specs/2026-05-24-sp4b-impersonation-design.md`

---

## Conventions for every task

- **TDD** for Task 4 (`ImpersonationService` — 16 tests). Other tasks are migration / wiring / refactors — `pnpm check-types` is the gate.
- **Test style — SP1/SP3/SP4 runnable pattern.** Integration tests use `@effect/vitest` (`describe` / `it.layer` / `it.effect` / `expect`) + `AuthPostgresLayer` + `truncateAuth` from `src/testing/postgres.ts`. Testcontainers spins its own Postgres per scope — NO `TEST_DATABASE_URL` env var. Pure unit tests use plain `vitest`. Do NOT import `@czo/kit/effect` (removed; the import will fail). Assert Effect failures with `Effect.flip` and check `err._tag`.
- **Real names — verified against current code, use these exactly:**
  - `SessionService` at `packages/modules/auth/src/services/session.ts:46` (Tag id `'@czo/auth/SessionService'`). Contract methods: `create` / `resolve` / `revoke` / `revokeAllForUser` / `listForUser` / `invalidateCacheForUser` / `update` / `purgeExpired` / `setCookie` / `readSessionToken`. Layer at `export const layer` near line 245. `subscribersLayer` exported around line 280.
  - `SessionRow` and `ResolvedSession` types exported from `session.ts` around lines 25–35. `CreateSessionInput` interface around line 30.
  - `UserService` at `packages/modules/auth/src/services/user.ts`. `findFirst({ where: { id } })` returns the user row or `null`.
  - `AccessService` at `packages/modules/auth/src/services/access.ts:181`. `role(name)` lookup returns the materialized `Role<S>` or `undefined`.
  - `AuthEvents` Tag at `packages/modules/auth/src/services/events/auth.ts:16`. Currently `type AuthEvent = { _tag: 'SignedUp', ... }` — Task 3 widens it to a discriminated union with two new variants.
  - `AuthModuleConfig` interface at `packages/modules/auth/src/module.ts:50`. Task 3 extends it with the optional `impersonation?: { ... }` field.
  - `AuthContext` interface at `packages/modules/auth/src/graphql/index.ts:10` — `{ session, user? }`. The session token is reachable as `ctx.auth.session?.token` (the `token` column on `SessionRow`) — no separate context field needed.
  - `GraphQLContextMap` augmentation at `packages/modules/auth/src/graphql/index.ts:17` (declaration-merge into `@czo/kit/graphql`).
  - `session-context.ts` at `packages/modules/auth/src/graphql/session-context.ts` — the contributor that populates `ctx.auth` from the cookie. Unchanged by SP4b.
  - `plugins/access.ts` defines `ADMIN_STATEMENTS` (line 9-ish) and `ADMIN_HIERARCHY` (line 47-ish). Both touched in Task 1.
  - `module.ts:130-ish` defines `accessOptions` (4 entries: organization, admin, api-key, apps). `Layer.mergeAll(...)` block at line 161; outer `Layer.provideMerge` chain at line 175-ish.
  - Migration tooling: `pnpm migrate:create <name>` from the module dir → generates `migrations/YYYYMMDDHHMMSS_<name>.sql` (empty file or stub).
  - `Cookie.layerConfigService` (from `services/cookie.ts`) builds `CookieService`; `SessionService.setCookie(token)` returns `Cookie.Cookie` (`{ name, value, attributes }`). h3 `setCookie(event, name, value, attributes)` sets it on the response.
- **Commits:** do NOT commit during execution. `git add` (stage) only — one review + commit after Task 8 (no-commit-until-review preference, same as SP1/SP-B/SP-A/SP2/SP3/SP4). Never `git stash`.
- **`old/` folder convention** for destructive refactors: BEFORE deleting a file, mirror it into `old/<path>`. `tsconfig.json` already excludes `old/` (SP4 added this).
- **Baseline:** `pnpm check-types` in `@czo/auth` captured at Task 0. Each subsequent task must keep error count `<=` baseline (currently 44 post-SP4).
- **No `as any` if inference is correct** (per project convention).

---

## File Structure

**New:**
- `packages/modules/auth/migrations/<NEW_TIMESTAMP>_sp4b_impersonation/` — directory containing `migration.sql` + `snapshot.json`, **generated by `pnpm migrate:generate`** from the schema diff (NOT hand-written; drizzle-kit reads `src/database/schema.ts`).
- `packages/modules/auth/src/services/impersonation.ts` — Tag + Layer + `ImpersonationConfig` Tag + 6 tagged errors + `start` / `stop` impl.
- `packages/modules/auth/src/services/impersonation.test.ts` — 16 integration tests via `AuthPostgresLayer`.
- `packages/modules/auth/src/graphql/schema/impersonation/mutations.ts` — 2 Relay mutations.
- `packages/modules/auth/src/graphql/schema/impersonation/errors.ts` — `registerError` calls.
- `packages/modules/auth/src/graphql/schema/impersonation/index.ts` — barrel.

**Modified:**
- `packages/modules/auth/src/database/schema.ts` — add `parentToken` column + partial index on `sessions`.
- `packages/modules/auth/src/plugins/access.ts` — add `'impersonate'` to user statements + admin hierarchy.
- `packages/modules/auth/src/services/session.ts` — extend `CreateSessionInput`, extend `create` impl, modify `resolve` query to use `NOT EXISTS` guard via raw `sql`.
- `packages/modules/auth/src/services/events/auth.ts` — widen `AuthEvent` to discriminated union with `ImpersonationStarted` / `ImpersonationStopped`.
- `packages/modules/auth/src/module.ts` — add `AuthModuleConfig.impersonation?` field, build `ImpersonationConfigLive`, add `Impersonation.layer` to `Layer.mergeAll`, add `Layer.provideMerge(ImpersonationConfigLive)` to outer pipe.
- `packages/modules/auth/src/constants.ts` — add `IMPERSONATION_DEFAULT_TTL` and `IMPERSONATION_MAX_TTL`.
- `packages/modules/auth/src/services/index.ts` — re-export `Impersonation` namespace.
- `packages/modules/auth/src/graphql/index.ts` — register the new errors + call the new mutation registrar; `AuthContext` is unchanged (the token is read via `ctx.auth.session.token`).
- `packages/modules/auth/src/layers/better-auth/index.ts` — drop `import { adminConfig } from './admin'` and the `adminConfig(...)` entry in `plugins:`.

**Deleted (mirrored to `old/`):**
- `packages/modules/auth/src/layers/better-auth/admin.ts`.

**Unchanged:** All other services, GraphQL surface aside from the 2 new mutations, the `Session.subscribersLayer` wiring (cascade FK handles the ban/role-change cases automatically).

---

## Task 0: Baseline capture

**Files:** none modified (capture only).

- [ ] **Step 1: Capture baseline TypeScript error count**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected output: a number. Record as `BASELINE_TS`. Currently `44` post-SP4. Each task must keep errors `<= BASELINE_TS`.

- [ ] **Step 2: Capture baseline test pass count**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected: a line like `Test Files X passed | Y failed`. Record `X`. Currently `14 passed`, `7 failed` (the 7 failing files are pre-existing dette: missing `@czo/kit/effect` + unrelated schema tests).

- [ ] **Step 3: Capture current HEAD SHA**

```bash
cd /workspace/c-zo && git rev-parse HEAD
```

Expected: a SHA. Currently `c5f17f1` (SP4 commit). Record as `BASELINE_SHA`.

No file changes, no staging.

---

## Task 1: Schema + migration generation + impersonate statement

**Critical flow**: migrations are **generated FROM the schema** by drizzle-kit, not hand-written. Edit the schema first, then run `pnpm migrate:generate` to emit the SQL diff. Migrations live in directories `migrations/<timestamp>_<name>/` containing `migration.sql` + `snapshot.json`.

**Files:**
- Modify: `packages/modules/auth/src/database/schema.ts`
- Modify: `packages/modules/auth/src/plugins/access.ts`
- Generated by drizzle-kit: `packages/modules/auth/migrations/<NEW_TIMESTAMP>_<name>/{migration.sql, snapshot.json}`

- [ ] **Step 1: Verify `sessions.token` is UNIQUE**

```bash
grep -n "token.*unique\|\.unique()" /workspace/c-zo/packages/modules/auth/src/database/schema.ts | head -10
```

The FK `parent_token REFERENCES sessions(token)` requires `sessions.token` to have a UNIQUE constraint. Confirm it does in the schema (look for `.unique()` on the token column definition). If it doesn't, STOP and escalate — retroactively adding uniqueness requires care.

- [ ] **Step 2: Update Drizzle schema with `parentToken` column + partial index**

In `packages/modules/auth/src/database/schema.ts`, find the `sessions` table definition. Add the new column next to `impersonatedBy`, and add a partial index in the indexes array:

```ts
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { index, pgTable } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
// ... existing imports

export const sessions = pgTable('sessions', t => ({
  // ... existing columns including impersonatedBy
  impersonatedBy: text('impersonated_by'),
  parentToken: text('parent_token').references(
    (): AnyPgColumn => sessions.token,
    { onDelete: 'cascade' },
  ),
  // ... rest
}), table => [
  // ... existing indexes
  index('idx_sessions_parent_token')
    .on(table.parentToken)
    .where(sql`${table.parentToken} IS NOT NULL`),
])
```

The `(): AnyPgColumn => sessions.token` forward declaration is required because `sessions` references itself.

- [ ] **Step 3: Add `'impersonate'` statement to admin AccessControl**

In `packages/modules/auth/src/plugins/access.ts`, find `ADMIN_STATEMENTS`. Add `'impersonate'` to the `user` array:

```ts
export const ADMIN_STATEMENTS = {
  user: ['create', 'read', 'update', 'ban', 'set-role', 'set-password', 'remove', 'impersonate'],
  // ... existing
} as const
```

Then find `ADMIN_HIERARCHY` and add `'impersonate'` to the admin level's user permissions:

```ts
export const ADMIN_HIERARCHY: HierarchyLevel<typeof ADMIN_STATEMENTS>[] = [
  // ... user level unchanged
  {
    name: 'admin',
    permissions: {
      user: ['create', 'update', 'ban', 'set-role', 'set-password', 'remove', 'impersonate'],
      // ... existing
    },
  },
]
```

Do NOT add `'impersonate'` to the `user` level — only admin gets it.

- [ ] **Step 4: Generate the migration SQL from the schema**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm migrate:generate --name sp4b_impersonation
```

(Drop the `--name` flag if drizzle-kit's version doesn't accept it; it'll prompt or use a hash-based name.)

Expected: a new directory `migrations/<timestamp>_sp4b_impersonation/` containing `migration.sql` + `snapshot.json`.

- [ ] **Step 5: Inspect the generated SQL**

```bash
cat /workspace/c-zo/packages/modules/auth/migrations/*sp4b_impersonation*/migration.sql
```

Verify the SQL contains:
1. `ALTER TABLE "sessions" ADD COLUMN "parent_token" text` with a FK constraint targeting `sessions(token)` and `ON DELETE CASCADE`.
2. The partial index `CREATE INDEX "idx_sessions_parent_token" ON "sessions" ("parent_token") WHERE "parent_token" IS NOT NULL`.

**If drizzle-kit emits a non-partial index** (some versions don't render the `WHERE` clause from the schema): manually edit `migration.sql` to add the `WHERE "parent_token" IS NOT NULL` clause. Re-run `pnpm migrate:status` to confirm the snapshot hash is still in sync (if not, regenerate).

**If FK constraint is missing** (drizzle-kit edge case for self-referencing tables): manually add the constraint to the SQL file:
```sql
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_parent_token_sessions_token_fk"
  FOREIGN KEY ("parent_token") REFERENCES "sessions"("token")
  ON DELETE CASCADE;
```

- [ ] **Step 6: Apply migration locally and regenerate types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm migrate:latest && pnpm generate:types
```

Expected: migration applies cleanly to the dev DB; `generate:types` regenerates Drizzle inferred types. If the dev DB is empty / unreachable, the apply step fails — set up local Postgres per the dev convention before continuing.

- [ ] **Step 7: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS` (44).

- [ ] **Step 8: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/migrations/ packages/modules/auth/src/database/schema.ts packages/modules/auth/src/plugins/access.ts
```

DO NOT COMMIT.

---

## Task 2: SessionService extension

**Files:**
- Modify: `packages/modules/auth/src/services/session.ts`

- [ ] **Step 1: Extend `CreateSessionInput`**

In `session.ts`, find the `CreateSessionInput` interface (around line 30). Add two optional fields:

```ts
export interface CreateSessionInput {
  readonly userId: number
  readonly actorType?: string
  readonly ipAddress?: string
  readonly userAgent?: string
  readonly expiresIn?: Duration.Duration
  // ── new SP4b ──
  readonly impersonatedBy?: number
  readonly parentToken?: string
}
```

- [ ] **Step 2: Add invariant guard + persist fields in `create`**

Find the `create` impl in `make`. Add the invariant check at the top and pass the new fields to the INSERT:

```ts
create: input =>
  Effect.gen(function* () {
    // Invariant: impersonatedBy IS NOT NULL ⟺ parentToken IS NOT NULL.
    // Mismatched callers are internal misuse, not surfaced via GraphQL.
    if ((input.impersonatedBy != null) !== (input.parentToken != null))
      return yield* Effect.dieMessage('SessionService.create: impersonatedBy and parentToken must both be set or both be undefined')

    // ... existing token gen, expiresAt calc, etc.
    const inserted = yield* Effect.tryPromise({
      try: () => db.insert(sessions).values({
        // ... existing fields
        impersonatedBy: input.impersonatedBy != null ? String(input.impersonatedBy) : null,
        parentToken: input.parentToken ?? null,
      }).returning(),
      catch: cause => new SessionStoreFailed({ cause }),
    })
    // ... rest unchanged
  }),
```

Note: `impersonated_by` is `text` in the schema (legacy choice from better-auth), so we cast `String(impersonatedBy)`.

- [ ] **Step 3: Modify `resolve` to add the `NOT EXISTS` filter via Drizzle RQBv2 `RAW`**

Drizzle RQBv2 `where` accepts a `RAW: (table, operators) => SQL` escape hatch for raw subqueries while keeping the rest of the filter in object form (verified at `node_modules/drizzle-orm/relations.d.ts:298` — `RAW?: SQLWrapper | ((table, operators) => SQL)`).

Find the `resolve` impl. The existing DB query is likely `db.query.sessions.findFirst({ where: { token, expiresAt: { gt: ... } } })`. Add the `RAW` clause for the suspended-while-child guard:

```ts
import { sql } from 'drizzle-orm'

// Inside resolve, after cache miss — keep the existing object filter, add RAW:
const row = yield* Effect.tryPromise({
  try: () => db.query.sessions.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
      RAW: (s) => sql`NOT EXISTS (SELECT 1 FROM ${sessions} c WHERE c.parent_token = ${s.token})`,
    },
  }),
  catch: cause => new SessionStoreFailed({ cause }),
})

if (!row) {
  // cache the negative result with NEGATIVE_TTL (existing pattern)
  return null
}
// ... existing path: join user, build ResolvedSession, cache positive
```

Wins vs `db.execute(sql\`...\`)`:
- Stays in object-form RQBv2 (consistent with the rest of the module).
- Auto-typed return (`typeof sessions.$inferSelect`) — no manual cast.
- `RAW` composes with the other object-form conditions.

The exact integration depends on the current `resolve` body; read it carefully and ADD the `RAW` clause to the existing `where` object, keeping the cache / user-join / etc. as-is. The `${sessions}` interpolation inside the `sql` template refers to the imported `sessions` table — drizzle handles the table-name escaping.

- [ ] **Step 4: Write a test for the suspended-while-child resolve behavior**

In `packages/modules/auth/src/services/session.test.ts`, add inside the existing `layer(TestLayer, ...)` block:

```ts
it.effect('resolve returns null while a child session exists (suspended parent)', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser
    const targetId = yield* seedUser
    const svc = yield* Session.SessionService

    const admin = yield* svc.create({ userId: adminId, actorType: 'user' })
    // Sanity: admin token resolves normally first.
    expect(yield* svc.resolve(admin.token)).not.toBeNull()

    // Create a child impersonation session pointing at admin token.
    yield* svc.create({
      userId: targetId,
      actorType: 'user',
      impersonatedBy: adminId,
      parentToken: admin.token,
    })

    // Cache may still have the positive entry — invalidate so resolve hits DB.
    yield* svc.invalidateCacheForUser(adminId)

    // Now admin token resolves as null (suspended).
    expect(yield* svc.resolve(admin.token)).toBeNull()
  }))

it.effect('resolve restores the parent after the child is revoked', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser
    const targetId = yield* seedUser
    const svc = yield* Session.SessionService

    const admin = yield* svc.create({ userId: adminId, actorType: 'user' })
    const child = yield* svc.create({
      userId: targetId,
      actorType: 'user',
      impersonatedBy: adminId,
      parentToken: admin.token,
    })
    yield* svc.revoke(child.token)
    yield* svc.invalidateCacheForUser(adminId)   // discipline: clear stale 'null' entry

    expect(yield* svc.resolve(admin.token)).not.toBeNull()
  }))

it.effect('FK cascade: revoking admin token deletes child impersonation session', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser
    const targetId = yield* seedUser
    const svc = yield* Session.SessionService

    const admin = yield* svc.create({ userId: adminId, actorType: 'user' })
    const child = yield* svc.create({
      userId: targetId,
      actorType: 'user',
      impersonatedBy: adminId,
      parentToken: admin.token,
    })

    yield* svc.revoke(admin.token)
    expect(yield* svc.listForUser(targetId)).toHaveLength(0)   // child cascaded
    expect(yield* svc.resolve(child.token)).toBeNull()
  }))
```

- [ ] **Step 5: Run tests, expect PASSes**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/session.test.ts 2>&1 | tail -10
```

Expected: 18/18 pass (15 pre-SP4b + 3 new). If the suspended-while-child test fails, the `resolve` query update is wrong.

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

## Task 3: AuthEvent widening + AuthConfig extension + constants

**Files:**
- Modify: `packages/modules/auth/src/services/events/auth.ts`
- Modify: `packages/modules/auth/src/module.ts`
- Modify: `packages/modules/auth/src/constants.ts`

- [ ] **Step 1: Widen `AuthEvent` to discriminated union**

In `packages/modules/auth/src/services/events/auth.ts`, replace the current single-variant `AuthEvent` with a union:

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
```

The `AuthEvents` Tag and live layer are unchanged — `PubSub.dropping<AuthEvent>` automatically handles the wider type.

- [ ] **Step 2: Add impersonation constants**

In `packages/modules/auth/src/constants.ts`, add:

```ts
import { Duration } from 'effect'

export const IMPERSONATION_DEFAULT_TTL = Duration.hours(1)
export const IMPERSONATION_MAX_TTL = Duration.hours(4)
```

If `Duration` isn't already imported, add the import.

- [ ] **Step 3: Extend `AuthModuleConfig`**

In `packages/modules/auth/src/module.ts`, find `AuthModuleConfig` (around line 50). Add the optional `impersonation` field:

```ts
import type { Duration } from 'effect'

export interface AuthModuleConfig {
  readonly app: string
  readonly secret: string
  readonly baseUrl?: string
  readonly socials?: SocialProviders
  readonly storage?: Storage
  /** Impersonation tunables (Task 4 wires the live config). */
  readonly impersonation?: {
    readonly defaultTtl?: Duration.Duration
    readonly maxTtl?: Duration.Duration
    readonly allowImpersonateAdmin?: boolean
  }
}
```

(The actual `ImpersonationConfigLive` layer and the `Layer.provideMerge` are added in Task 6 when the rest of the wiring is ready.)

- [ ] **Step 4: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS`. The `AuthEvent` widening is a non-breaking superset (existing `_tag: 'SignedUp'` callsites still type-check).

- [ ] **Step 5: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/events/auth.ts packages/modules/auth/src/module.ts packages/modules/auth/src/constants.ts
```

---

## Task 4: `ImpersonationService` + `ImpersonationConfig` — TDD

**Files:**
- Create: `packages/modules/auth/src/services/impersonation.ts`
- Create: `packages/modules/auth/src/services/impersonation.test.ts`
- Modify: `packages/modules/auth/src/services/index.ts`

- [ ] **Step 1: Scaffold `services/impersonation.ts` with errors + config + contract**

Create the file with the 6 tagged errors, `ImpersonationConfig` Tag, config layer factory, contract Tag, and an empty layer (impl stubbed for now):

```ts
import type { User } from './user'
import type { SessionRow } from './session'
import { Context, Data, Duration, Effect, Layer } from 'effect'
import { AuthEvents } from './events/auth'
import { SessionService } from './session'
import { UserService } from './user'
import { IMPERSONATION_DEFAULT_TTL, IMPERSONATION_MAX_TTL } from '../constants'
import type { AuthModuleConfig } from '../module'

// ─── Tagged errors ──────────────────────────────────────────────────────

export class CannotImpersonateSelf extends Data.TaggedError('CannotImpersonateSelf')<{
  readonly userId: number
}> {
  readonly code = 'CANNOT_IMPERSONATE_SELF'
  get message() { return 'You cannot impersonate yourself' }
}

export class CannotImpersonateAdmin extends Data.TaggedError('CannotImpersonateAdmin')<{
  readonly targetUserId: number
}> {
  readonly code = 'CANNOT_IMPERSONATE_ADMIN'
  get message() { return 'Cannot impersonate another admin' }
}

export class CannotImpersonateBannedUser extends Data.TaggedError('CannotImpersonateBannedUser')<{
  readonly targetUserId: number
}> {
  readonly code = 'CANNOT_IMPERSONATE_BANNED_USER'
  get message() { return 'Cannot impersonate a banned user' }
}

export class CannotChainImpersonation extends Data.TaggedError('CannotChainImpersonation')<{
  readonly currentToken: string
}> {
  readonly code = 'CANNOT_CHAIN_IMPERSONATION'
  get message() { return 'Cannot start impersonation from an impersonation session' }
}

export class ImpersonationTtlTooLong extends Data.TaggedError('ImpersonationTtlTooLong')<{
  readonly requestedMs: number
  readonly maxMs: number
}> {
  readonly code = 'IMPERSONATION_TTL_TOO_LONG'
  get message() { return `Requested TTL exceeds max (${this.maxMs}ms)` }
}

export class ImpersonationNotActive extends Data.TaggedError('ImpersonationNotActive')<{
  readonly token: string
}> {
  readonly code = 'IMPERSONATION_NOT_ACTIVE'
  get message() { return 'Current session is not an impersonation' }
}

// (Reuse UserNotFound + SessionStoreFailed from their owning modules — re-export
// here only if convenient; the service contract types directly reference them.)

// ─── Config Tag ─────────────────────────────────────────────────────────

export class ImpersonationConfig extends Context.Service<
  ImpersonationConfig,
  {
    readonly defaultTtl: Duration.Duration
    readonly maxTtl: Duration.Duration
    readonly allowImpersonateAdmin: boolean
  }
>()('@czo/auth/ImpersonationConfig') {}

export const makeImpersonationConfigLayer = (
  config?: AuthModuleConfig['impersonation'],
): Layer.Layer<ImpersonationConfig> =>
  Layer.succeed(ImpersonationConfig, {
    defaultTtl: config?.defaultTtl ?? IMPERSONATION_DEFAULT_TTL,
    maxTtl: config?.maxTtl ?? IMPERSONATION_MAX_TTL,
    allowImpersonateAdmin: config?.allowImpersonateAdmin ?? false,
  })

// ─── Service contract ───────────────────────────────────────────────────

export interface StartImpersonationInput {
  readonly adminId: number
  readonly adminToken: string
  readonly targetUserId: number
  readonly ttl?: Duration.Duration
  readonly reason?: string
}

export interface ImpersonationResult {
  readonly session: SessionRow
  readonly user: User
}

export class ImpersonationService extends Context.Service<
  ImpersonationService,
  {
    readonly start: (input: StartImpersonationInput) => Effect.Effect<ImpersonationResult, unknown>
    readonly stop: (currentToken: string) => Effect.Effect<ImpersonationResult, unknown>
  }
>()('@czo/auth/ImpersonationService') {}

// ─── Layer (stub — replaced in Step 4) ──────────────────────────────────

export const layer = Layer.effect(
  ImpersonationService,
  Effect.gen(function* () {
    return ImpersonationService.of({
      start: () => Effect.die('not implemented'),
      stop: () => Effect.die('not implemented'),
    })
  }),
)
```

The `Effect<..., unknown>` error channel is a placeholder — Step 4 narrows it to the actual union.

- [ ] **Step 2: Scaffold `impersonation.test.ts` with the layer composition**

Create `packages/modules/auth/src/services/impersonation.test.ts`:

```ts
import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db/effect'
import { DrizzleDb } from '@czo/kit/db/effect'
import { describe, expect, it, layer } from '@effect/vitest'
import { Duration, Effect, Layer } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import { users } from '../database/schema'
import { ADMIN_HIERARCHY, ADMIN_STATEMENTS } from '../plugins/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Access from './access'
import * as Cookie from './cookie'
import * as AuthEvents from './events/auth'
import * as UserEventsMod from './events/user'
import * as Impersonation from './impersonation'
import * as Session from './session'
import * as User from './user'

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

// AccessService seeded with the admin hierarchy so UserService.hasPermission /
// impersonation guards have real role data to query.
const AccessSeedLayer = Access.makeLayer(
  [{ name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY }],
  true,
)

const SessionLive = Session.layer.pipe(
  Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer)),
)
const UserLive = User.layer.pipe(Layer.provideMerge(UserEventsMod.layer))
const ImpersonationConfigLive = Impersonation.makeImpersonationConfigLayer({})

const TestLayer = Impersonation.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(
    SessionLive,
    UserLive,
    AccessSeedLayer,
    AuthEvents.layer,
    ImpersonationConfigLive,
  )),
  Layer.provideMerge(AuthPostgresLayer),
)

const seedUser = (over: Partial<{ role: string, banned: boolean, email: string }> = {}) =>
  Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const now = new Date()
    const rows = yield* db.insert(users).values({
      name: 'Test',
      email: over.email ?? `u-${Math.random()}@example.com`,
      emailVerified: false,
      role: over.role ?? 'user',
      banned: over.banned ?? false,
      createdAt: now,
      updatedAt: now,
    }).returning()
    return (rows[0] as { id: number }).id
  })

layer(TestLayer, { timeout: 120_000, excludeTestServices: true })('ImpersonationService', (it) => {
  // (16 tests added in Step 3)
})
```

- [ ] **Step 3: Write the 16 failing integration tests**

Inside the `layer(TestLayer, ...)` block, add the tests. Each test starts with `yield* truncateAuth`:

```ts
it.effect('start — happy path: admin impersonates a normal user', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin', email: 'admin@x.io' })
    const targetId = yield* seedUser({ email: 'target@x.io' })
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService

    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    const result = yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: targetId })

    expect(result.session.userId).toBe(targetId)
    expect(result.session.impersonatedBy).toBe(String(adminId))
    expect(result.session.parentToken).toBe(admin.token)
    expect(result.user.id).toBe(targetId)
  }))

it.effect('start — CannotImpersonateSelf', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin' })
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService

    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    const err = yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: adminId }).pipe(Effect.flip)
    expect((err as { _tag: string })._tag).toBe('CannotImpersonateSelf')
  }))

it.effect('start — CannotImpersonateBannedUser', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin' })
    const targetId = yield* seedUser({ banned: true })
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService

    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    const err = yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: targetId }).pipe(Effect.flip)
    expect((err as { _tag: string })._tag).toBe('CannotImpersonateBannedUser')
  }))

it.effect('start — CannotImpersonateAdmin (default deny)', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin' })
    const targetId = yield* seedUser({ role: 'admin' })
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService

    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    const err = yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: targetId }).pipe(Effect.flip)
    expect((err as { _tag: string })._tag).toBe('CannotImpersonateAdmin')
  }))

// — Test 5 (admin impersonate allowed by config) needs a separate TestLayer
//   instance with allowImpersonateAdmin: true. Inline a small helper:
const TestLayerAllowAdmin = Impersonation.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(
    SessionLive, UserLive, AccessSeedLayer, AuthEvents.layer,
    Impersonation.makeImpersonationConfigLayer({ allowImpersonateAdmin: true }),
  )),
  Layer.provideMerge(AuthPostgresLayer),
)

// Note: this test runs in its own `layer(...)` block below the main one.

it.effect('start — CannotChainImpersonation', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin' })
    const t1 = yield* seedUser()
    const t2 = yield* seedUser()
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService

    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    const first = yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: t1 })

    const err = yield* impersonation.start({
      adminId, adminToken: first.session.token, targetUserId: t2,
    }).pipe(Effect.flip)
    expect((err as { _tag: string })._tag).toBe('CannotChainImpersonation')
  }))

it.effect('start — ImpersonationTtlTooLong when ttl exceeds max', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin' })
    const targetId = yield* seedUser()
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService

    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    const err = yield* impersonation.start({
      adminId, adminToken: admin.token, targetUserId: targetId,
      ttl: Duration.hours(10),    // > maxTtl (4h)
    }).pipe(Effect.flip)
    expect((err as { _tag: string })._tag).toBe('ImpersonationTtlTooLong')
  }))

it.effect('start — default TTL applied when ttl omitted', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin' })
    const targetId = yield* seedUser()
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService

    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    const before = Date.now()
    const result = yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: targetId })
    const expectedExpiresMs = before + Duration.toMillis(Duration.hours(1))
    // Tolerance: child created within 5s of `before`, expires within 5s of expected.
    expect(Math.abs(result.session.expiresAt.getTime() - expectedExpiresMs)).toBeLessThan(5000)
  }))

it.effect('stop — happy path restores admin session', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin' })
    const targetId = yield* seedUser()
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService

    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    const child = yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: targetId })

    const restored = yield* impersonation.stop(child.session.token)
    expect(restored.user.id).toBe(adminId)
    expect(restored.session.token).toBe(admin.token)
    expect(yield* sessions.resolve(child.session.token)).toBeNull()    // child revoked
  }))

it.effect('stop — ImpersonationNotActive on a non-impersonation token', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const userId = yield* seedUser()
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService

    const s = yield* sessions.create({ userId, actorType: 'user' })
    const err = yield* impersonation.stop(s.token).pipe(Effect.flip)
    expect((err as { _tag: string })._tag).toBe('ImpersonationNotActive')
  }))

it.effect('resolve — admin token returns null while child exists', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin' })
    const targetId = yield* seedUser()
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService

    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: targetId })
    expect(yield* sessions.resolve(admin.token)).toBeNull()
  }))

it.effect('resolve — admin token restored after stop', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin' })
    const targetId = yield* seedUser()
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService

    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    const child = yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: targetId })
    yield* impersonation.stop(child.session.token)
    expect(yield* sessions.resolve(admin.token)).not.toBeNull()
  }))

it.effect('cascade — admin revoke deletes child impersonation session', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin' })
    const targetId = yield* seedUser()
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService

    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    const child = yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: targetId })

    yield* sessions.revoke(admin.token)
    expect(yield* sessions.resolve(child.session.token)).toBeNull()
    expect(yield* sessions.listForUser(targetId)).toHaveLength(0)
  }))

it.effect('events — start publishes ImpersonationStarted on AuthEvents', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin' })
    const targetId = yield* seedUser()
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService
    const events = yield* AuthEvents.AuthEvents

    // Collect first 1 event into a Fiber before triggering start.
    const collected = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)
    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: targetId, reason: 'support' })
    yield* Effect.sleep(Duration.millis(100))
    const events_collected = yield* Fiber.join(collected)
    const arr = Chunk.toReadonlyArray(events_collected)
    expect(arr.length).toBe(1)
    expect((arr[0] as { _tag: string })._tag).toBe('ImpersonationStarted')
  }))

it.effect('events — stop publishes ImpersonationStopped on AuthEvents', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const adminId = yield* seedUser({ role: 'admin' })
    const targetId = yield* seedUser()
    const sessions = yield* Session.SessionService
    const impersonation = yield* Impersonation.ImpersonationService
    const events = yield* AuthEvents.AuthEvents

    const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
    const child = yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: targetId })

    // Subscribe AFTER start (we only care about stop event).
    const collected = yield* events.subscribe.pipe(Stream.take(1), Stream.runCollect, Effect.fork)
    yield* impersonation.stop(child.session.token)
    yield* Effect.sleep(Duration.millis(100))
    const events_collected = yield* Fiber.join(collected)
    const arr = Chunk.toReadonlyArray(events_collected)
    expect((arr[0] as { _tag: string })._tag).toBe('ImpersonationStopped')
  }))
```

Add the missing imports at the top of the file: `import { Chunk, Fiber, Stream } from 'effect'`.

In a SECOND `layer(...)` block below the main one, add:

```ts
layer(TestLayerAllowAdmin, { timeout: 120_000, excludeTestServices: true })('ImpersonationService (admin-on-admin allowed)', (it) => {
  it.effect('start — admin can impersonate admin when allowImpersonateAdmin: true', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const adminId = yield* seedUser({ role: 'admin' })
      const targetId = yield* seedUser({ role: 'admin' })
      const sessions = yield* Session.SessionService
      const impersonation = yield* Impersonation.ImpersonationService

      const admin = yield* sessions.create({ userId: adminId, actorType: 'user' })
      const result = yield* impersonation.start({ adminId, adminToken: admin.token, targetUserId: targetId })
      expect(result.session.userId).toBe(targetId)
    }))
})
```

That's 15 tests in the main block + 1 in the override block = 16 total.

- [ ] **Step 4: Run tests, expect 16 FAILs (impl stubbed)**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/impersonation.test.ts 2>&1 | tail -30
```

Expected: all 16 FAIL with `Effect.die('not implemented')` defect.

- [ ] **Step 5: Implement `start` in `services/impersonation.ts`**

Replace the stub layer with the real impl:

```ts
import type { UserNotFound } from './user'   // re-import for typing
import type { SessionStoreFailed } from './session'

// ... (errors + config above unchanged)

export class ImpersonationService extends Context.Service<
  ImpersonationService,
  {
    readonly start: (input: StartImpersonationInput) => Effect.Effect<
      ImpersonationResult,
      | UserNotFound | CannotImpersonateSelf | CannotImpersonateAdmin
      | CannotImpersonateBannedUser | CannotChainImpersonation
      | ImpersonationTtlTooLong | SessionStoreFailed
    >
    readonly stop: (currentToken: string) => Effect.Effect<
      ImpersonationResult,
      ImpersonationNotActive | SessionStoreFailed
    >
  }
>()('@czo/auth/ImpersonationService') {}

export const layer = Layer.effect(
  ImpersonationService,
  Effect.gen(function* () {
    const sessions = yield* SessionService
    const users = yield* UserService
    const config = yield* ImpersonationConfig
    const events = yield* AuthEvents

    const start = Effect.fn('impersonation.start')(function* (input: StartImpersonationInput) {
      const { adminId, adminToken, targetUserId, ttl, reason } = input

      if (adminId === targetUserId)
        return yield* Effect.fail(new CannotImpersonateSelf({ userId: adminId }))

      const effectiveTtl = ttl ?? config.defaultTtl
      if (Duration.toMillis(effectiveTtl) > Duration.toMillis(config.maxTtl))
        return yield* Effect.fail(new ImpersonationTtlTooLong({
          requestedMs: Duration.toMillis(effectiveTtl),
          maxMs: Duration.toMillis(config.maxTtl),
        }))

      const currentResolved = yield* sessions.resolve(adminToken)
      if (currentResolved?.session.impersonatedBy != null)
        return yield* Effect.fail(new CannotChainImpersonation({ currentToken: adminToken }))

      const target = yield* users.findFirst({ where: { id: targetUserId } })
      if (!target) return yield* Effect.fail(new UserNotFound({ id: targetUserId }))
      if (target.banned)
        return yield* Effect.fail(new CannotImpersonateBannedUser({ targetUserId }))
      if (!config.allowImpersonateAdmin && (target.role ?? '').split(',').includes('admin'))
        return yield* Effect.fail(new CannotImpersonateAdmin({ targetUserId }))

      const { session: child } = yield* sessions.create({
        userId: targetUserId,
        actorType: 'user',
        expiresIn: effectiveTtl,
        impersonatedBy: adminId,
        parentToken: adminToken,
      })

      yield* sessions.invalidateCacheForUser(adminId)

      yield* Effect.forkDetach(events.publish({
        _tag: 'ImpersonationStarted',
        adminId,
        targetUserId,
        sessionToken: child.token,
        reason: reason ?? null,
        expiresAt: child.expiresAt,
      }))

      return { session: child, user: target }
    })

    const stop = Effect.fn('impersonation.stop')(function* (currentToken: string) {
      const current = yield* sessions.resolve(currentToken)
      if (!current || current.session.impersonatedBy == null || current.session.parentToken == null)
        return yield* Effect.fail(new ImpersonationNotActive({ token: currentToken }))

      const parentToken = current.session.parentToken
      const adminId = Number(current.session.impersonatedBy)

      yield* sessions.revoke(currentToken)
      // Invalidate parent cache so its 'null suspended' entry is evicted.
      yield* sessions.invalidateCacheForUser(adminId)

      const restored = yield* sessions.resolve(parentToken)
      if (!restored)
        return yield* Effect.fail(new ImpersonationNotActive({ token: currentToken }))

      yield* Effect.forkDetach(events.publish({
        _tag: 'ImpersonationStopped',
        adminId,
        targetUserId: current.session.userId,
        sessionToken: currentToken,
      }))

      return { session: restored.session, user: restored.user }
    })

    return ImpersonationService.of({ start, stop })
  }),
)
```

Notes:
- `sessions.create` returns `{ token, session }` per SP1's contract — destructure accordingly.
- `Effect.forkDetach` for fire-and-forget event publish (matches `credential.ts` `SignedUp` pattern).
- The `sessions.invalidateCacheForUser(adminId)` call drops the cached entries for ALL of admin's sessions (sweep-style; per the SP4 Task 3 design decision to clear all including expired). This evicts the parent's cached "active" entry at start and its "null suspended" entry at stop.

- [ ] **Step 6: Run tests, expect PASSes**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/impersonation.test.ts 2>&1 | tail -25
```

Expected: 16/16 PASS. If guards trigger out of order (e.g. `CannotImpersonateAdmin` fires before `CannotImpersonateBannedUser`), the test for the earlier guard will see a different `_tag` — adjust the impl order or the test data so the right guard fires first.

- [ ] **Step 7: Re-export `Impersonation` from the services barrel**

In `packages/modules/auth/src/services/index.ts`, add:

```ts
export * as Impersonation from './impersonation'
```

(Mirror the existing barrel style — `export * as Foo from './foo'`.)

- [ ] **Step 8: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS`.

- [ ] **Step 9: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/services/impersonation.ts packages/modules/auth/src/services/impersonation.test.ts packages/modules/auth/src/services/index.ts
```

---

## Task 5: GraphQL mutations + error registration

**Files:**
- Create: `packages/modules/auth/src/graphql/schema/impersonation/mutations.ts`
- Create: `packages/modules/auth/src/graphql/schema/impersonation/errors.ts`
- Create: `packages/modules/auth/src/graphql/schema/impersonation/index.ts`
- Modify: `packages/modules/auth/src/graphql/index.ts` (call new register)

- [ ] **Step 1: Create the errors registration**

`packages/modules/auth/src/graphql/schema/impersonation/errors.ts`:

```ts
import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { registerError } from '@czo/kit/graphql'
import {
  CannotChainImpersonation,
  CannotImpersonateAdmin,
  CannotImpersonateBannedUser,
  CannotImpersonateSelf,
  ImpersonationNotActive,
  ImpersonationTtlTooLong,
} from '../../../services/impersonation'

export function registerImpersonationErrors(builder: AuthGraphQLSchemaBuilder): void {
  registerError(builder, CannotImpersonateSelf, { name: 'CannotImpersonateSelfError' })
  registerError(builder, CannotImpersonateAdmin, { name: 'CannotImpersonateAdminError' })
  registerError(builder, CannotImpersonateBannedUser, { name: 'CannotImpersonateBannedUserError' })
  registerError(builder, CannotChainImpersonation, { name: 'CannotChainImpersonationError' })
  registerError(builder, ImpersonationTtlTooLong, { name: 'ImpersonationTtlTooLongError' })
  registerError(builder, ImpersonationNotActive, { name: 'ImpersonationNotActiveError' })
}
```

(`AuthGraphQLSchemaBuilder` type comes from `@czo/auth/graphql` — same pattern as SP3 api-key errors.)

- [ ] **Step 2: Create the mutations file**

`packages/modules/auth/src/graphql/schema/impersonation/mutations.ts`:

```ts
import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { decodeGlobalID } from '@czo/kit/graphql'
import { Duration, Effect } from 'effect'
import { setCookie } from 'h3'
import {
  CannotChainImpersonation,
  CannotImpersonateAdmin,
  CannotImpersonateBannedUser,
  CannotImpersonateSelf,
  ImpersonationNotActive,
  ImpersonationService,
  ImpersonationTtlTooLong,
} from '../../../services/impersonation'
import { SessionService } from '../../../services/session'
import { UserNotFound } from '../../../services/user'

export function registerImpersonationMutations(builder: AuthGraphQLSchemaBuilder): void {
  builder.relayMutationField(
    'startImpersonation',
    {
      inputFields: t => ({
        targetUserId: t.id({ required: true }),
        ttl: t.int(),
        reason: t.string(),
      }),
    },
    {
      errors: {
        types: [
          UserNotFound,
          CannotImpersonateSelf,
          CannotImpersonateAdmin,
          CannotImpersonateBannedUser,
          CannotChainImpersonation,
          ImpersonationTtlTooLong,
        ],
      },
      authScopes: { permission: { resource: 'user', actions: ['impersonate'] } },
      resolve: async (_root, { input }, ctx) => {
        const adminId = Number(ctx.auth.user!.id)
        const adminToken = ctx.auth.session!.token   // authScope guarantees session is non-null
        const { id: targetIdRaw } = decodeGlobalID(input.targetUserId)
        const targetUserId = Number(targetIdRaw)

        const result = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ImpersonationService
            return yield* svc.start({
              adminId,
              adminToken,
              targetUserId,
              ttl: input.ttl != null ? Duration.seconds(input.ttl) : undefined,
              reason: input.reason ?? undefined,
            })
          }),
        )

        const cookie = await ctx.runEffect(
          Effect.gen(function* () {
            const sessions = yield* SessionService
            return sessions.setCookie(result.session.token)
          }),
        )
        const event = (ctx as { event?: unknown }).event
        if (event)
          setCookie(event as Parameters<typeof setCookie>[0], cookie.name, cookie.value, cookie.attributes)

        return result
      },
    },
    {
      outputFields: t => ({
        session: t.field({ type: 'Session', resolve: p => p.session }),
        user: t.field({ type: 'User', resolve: p => p.user }),
      }),
    },
  )

  builder.relayMutationField(
    'stopImpersonation',
    { inputFields: () => ({}) },
    {
      errors: { types: [ImpersonationNotActive] },
      authScopes: { auth: true },
      resolve: async (_root, _input, ctx) => {
        const currentToken = ctx.auth.session!.token   // authScope guarantees session is non-null
        const result = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ImpersonationService
            return yield* svc.stop(currentToken)
          }),
        )

        const cookie = await ctx.runEffect(
          Effect.gen(function* () {
            const sessions = yield* SessionService
            return sessions.setCookie(result.session.token)
          }),
        )
        const event = (ctx as { event?: unknown }).event
        if (event)
          setCookie(event as Parameters<typeof setCookie>[0], cookie.name, cookie.value, cookie.attributes)

        return result
      },
    },
    {
      outputFields: t => ({
        session: t.field({ type: 'Session', resolve: p => p.session }),
        user: t.field({ type: 'User', resolve: p => p.user }),
      }),
    },
  )
}
```

Note on `ctx.event`: the h3 event isn't on `GraphQLContextMap` by default. The `(ctx as { event?: unknown }).event` access reads whatever the yoga adapter attaches. Verify by reading how SP1 sets cookies on response — if the project uses a different mechanism (e.g., a `setCookie` helper attached to ctx by the kit), use it instead.

- [ ] **Step 3: Create the barrel**

`packages/modules/auth/src/graphql/schema/impersonation/index.ts`:

```ts
export { registerImpersonationErrors } from './errors'
export { registerImpersonationMutations } from './mutations'
```

- [ ] **Step 4: Wire the registration in `graphql/index.ts`**

Find the existing wiring (where other modules' `register*` functions are called — e.g. `registerUserMutations`, `registerApiKeyErrors`). Add the impersonation calls in the same block:

```ts
import { registerImpersonationErrors, registerImpersonationMutations } from './schema/impersonation'

// In the existing setup function (mirror the existing pattern):
registerImpersonationErrors(builder)
registerImpersonationMutations(builder)
```

- [ ] **Step 5: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS`. Type errors here usually mean a wrong import path or a mismatch with the builder's input/output shapes — read the error carefully and fix.

- [ ] **Step 6: Run impersonation service tests + access tests + session tests for regressions**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/impersonation.test.ts src/services/access.test.ts src/services/session.test.ts 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 7: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/graphql/schema/impersonation/ packages/modules/auth/src/graphql/index.ts
```

---

## Task 6: Module wiring (Impersonation Layer + Config)

**Files:**
- Modify: `packages/modules/auth/src/module.ts`

- [ ] **Step 1: Build the `ImpersonationConfigLive` layer**

In `module.ts`, near the other `*Live` constructions (around line 140), add:

```ts
import * as Impersonation from './services/impersonation'
// ... existing imports

// Inside the factory function (where AccessServiceLive, BetterAuthLive are built):
const ImpersonationConfigLive = Impersonation.makeImpersonationConfigLayer(config.impersonation)
```

- [ ] **Step 2: Add `Impersonation.layer` to the inner `Layer.mergeAll`**

Find `Layer.mergeAll(...)` (around line 161). Add `Impersonation.layer` alongside the others. The order doesn't matter for `mergeAll`:

```ts
const AuthModuleLive = Layer.mergeAll(
  ApiKey.layer.pipe(...),
  UserServiceLive,
  AuthActorServiceLive,
  Password.layer,
  AuthEvents.layer,
  sessionLayer,
  Session.subscribersLayer,
  Impersonation.layer,                      // ← new
).pipe(...)
```

- [ ] **Step 3: Provide `ImpersonationConfigLive` at the outer pipe**

In the same block, find the outer `.pipe(Layer.provideMerge(...), ...)` chain (around line 175). Add the config layer:

```ts
).pipe(
  Layer.provideMerge(BetterAuthLive),
  Layer.provideMerge(AccessServiceLive),
  Layer.provideMerge(UserEvents.layer),
  Layer.provideMerge(ImpersonationConfigLive),     // ← new
)
```

- [ ] **Step 4: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS`. Layer composition errors here mean a dep wasn't provided — the most likely culprit is that `Impersonation.layer` needs `SessionService` + `UserService` + `AccessService` + `AuthEvents` + `ImpersonationConfig`, all of which are merged. If TS hurts, read the error to see what's missing.

- [ ] **Step 5: Run full test suite for regression**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected: pass count `>= BASELINE` (impersonation suite adds 16). Failures should be the same pre-existing files (4 dette files + 3 schema tests).

- [ ] **Step 6: Stage**

```bash
cd /workspace/c-zo && git add packages/modules/auth/src/module.ts
```

---

## Task 7: Drop better-auth admin plugin

**Files:**
- Delete: `packages/modules/auth/src/layers/better-auth/admin.ts` (mirror to `old/`)
- Modify: `packages/modules/auth/src/layers/better-auth/index.ts`

- [ ] **Step 1: Mirror admin.ts to old/**

```bash
cd /workspace/c-zo
mkdir -p old/packages/modules/auth/src/layers/better-auth
cp packages/modules/auth/src/layers/better-auth/admin.ts old/packages/modules/auth/src/layers/better-auth/admin.ts
```

- [ ] **Step 2: Delete from src/**

```bash
rm packages/modules/auth/src/layers/better-auth/admin.ts
```

- [ ] **Step 3: Remove imports and plugin entry in `layers/better-auth/index.ts`**

In `packages/modules/auth/src/layers/better-auth/index.ts`:

1. Delete the line `import { adminConfig } from './admin'` (line ~12).
2. Find the `plugins: [...]` array (line ~58–60) and remove the `adminConfig({ ac: option.ac, roles: option.roles })` entry.
3. If `option.ac` and `option.roles` are no longer used by any other plugin in the array, also remove them from the `AuthOption` interface (or whatever the local type was called). Verify by re-grepping `option.ac\|option.roles` in the file.

- [ ] **Step 4: Verify zero better-auth/plugins admin imports remain**

```bash
grep -rn "from 'better-auth/plugins'\|AdminOptions\b" /workspace/c-zo/packages/modules/auth/src
```

Expected: zero matches.

- [ ] **Step 5: check-types**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
```

Expected: `<= BASELINE_TS`. If errors appear, a stale import remained — fix.

- [ ] **Step 6: Run full test suite**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected: no new failures (the admin plugin had no test coverage we'd be removing; the previous tests don't depend on its endpoints).

- [ ] **Step 7: Stage**

```bash
cd /workspace/c-zo && git add -A packages/modules/auth/src/layers/better-auth/ old/packages/modules/auth/src/layers/better-auth/
```

---

## Task 8: Final review + user-approved commit

- [ ] **Step 1: Verify scope and zero leftover admin imports**

```bash
grep -rn "from 'better-auth/plugins'" /workspace/c-zo/packages/modules/auth/src
grep -rn "AdminOptions\b" /workspace/c-zo/packages/modules/auth/src
grep -rn "adminConfig\b" /workspace/c-zo/packages/modules/auth/src
```

Expected: all return ZERO matches.

- [ ] **Step 2: Verify check-types and tests**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -c "error TS"
cd /workspace/c-zo/packages/modules/auth && pnpm test 2>&1 | tail -10
```

Expected:
- check-types `<= BASELINE_TS` (44 or lower).
- Test count: at least 16 new passing tests in `impersonation.test.ts` + 3 new in `session.test.ts`, total adds ~19 to baseline.

- [ ] **Step 3: Review staged diff**

```bash
cd /workspace/c-zo && git status && git diff --cached --stat
```

Verify scope: 1 migration, ~10 files modified, 1 file deleted (with mirror in `old/`), 4 new files (`impersonation.ts`, `impersonation.test.ts`, and 3 in `graphql/schema/impersonation/`).

- [ ] **Step 4: Wait for user review**

Per the no-auto-commit convention: present a summary to the user, ask for review/commit approval. Do NOT commit autonomously.

When the user approves, commit with:

```bash
git commit -m "$(cat <<'EOF'
feat(auth): SP4b — native impersonation flow + drop better-auth admin plugin

- Migration: sessions.parent_token (text, FK self-ref ON DELETE CASCADE)
  with partial index WHERE parent_token IS NOT NULL. Adds 'impersonate'
  to ADMIN_STATEMENTS / ADMIN_HIERARCHY (user statement, admin level).

- SessionService extension:
  * CreateSessionInput accepts impersonatedBy + parentToken (invariant
    enforced: both set or neither).
  * resolve adds NOT EXISTS subquery filter — a parent session is
    "suspended" while a child with parent_token = this token exists.

- AuthEvent widened to discriminated union with two new variants
  ImpersonationStarted / ImpersonationStopped.

- ImpersonationService (services/impersonation.ts):
  * Tag + Layer; depends on SessionService + UserService + AccessService
    + AuthEvents + ImpersonationConfig.
  * 6 guards: CannotImpersonateSelf, CannotImpersonateAdmin (config-gated),
    CannotImpersonateBannedUser, CannotChainImpersonation,
    ImpersonationTtlTooLong, ImpersonationNotActive.
  * start: 6 guards → SessionService.create({ impersonatedBy, parentToken })
    → invalidate parent cache → publish ImpersonationStarted (fire-and-forget).
  * stop: lookup parent_token on current session → revoke child →
    invalidate parent cache → re-resolve parent → publish
    ImpersonationStopped.
  * Effect.fn span names: 'impersonation.start' / 'impersonation.stop'.

- ImpersonationConfig Tag + makeImpersonationConfigLayer. AuthModuleConfig
  extended with optional impersonation field { defaultTtl, maxTtl,
  allowImpersonateAdmin }. Defaults via IMPERSONATION_DEFAULT_TTL (1h) and
  IMPERSONATION_MAX_TTL (4h) constants.

- GraphQL: two new Relay mutations startImpersonation / stopImpersonation,
  registering 6 errors via registerError. Cookie swap via h3 setCookie.
  AuthScope permission: { resource: 'user', actions: ['impersonate'] }.
  Token read from ctx.auth.session.token (no AuthContext extension needed).

- Drop better-auth/plugins.admin(): delete layers/better-auth/admin.ts
  (mirrored to old/), remove adminConfig from plugins: array in
  layers/better-auth/index.ts. Last 'better-auth/plugins' admin-side
  import disappears.

Breaking: previous /api/auth/admin/* REST endpoints (impersonate-user /
stop-impersonating / list-users / etc.) cease to exist. No consumer in
apps/* was hitting them (verified at brainstorm).

Spec: docs/superpowers/specs/2026-05-24-sp4b-impersonation-design.md
Plan: docs/superpowers/plans/2026-05-24-sp4b-impersonation.md
EOF
)"
```

---

## Self-review (executed by writer, fixed inline)

**Spec coverage:**
- Chantier 1 (migration + statement) → Task 1.
- Chantier 2 (SessionService extension) → Task 2.
- Chantier 3 (ImpersonationService + Config + events) → Tasks 3 (events + config shape) + 4 (service impl with TDD).
- Chantier 4 (GraphQL mutations) → Tasks 5 (mutations) + 6 (module wiring).
- Chantier 5 (drop admin plugin) → Task 7.
- Final review/commit → Task 8.

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / vague-handler instructions. Two acknowledged uncertainties with concrete fallbacks (ctx.event cookie path in Task 5 Step 2; AccessService composition in test layer in Task 4 Step 2). Both are typed-out with the expected shape and a verification path.

**Type consistency:**
- `StartImpersonationInput`: `{ adminId: number, adminToken: string, targetUserId: number, ttl?: Duration, reason?: string }` — used identically in Tasks 4 and 5.
- `ImpersonationResult`: `{ session: SessionRow, user: User }` — used identically in Tasks 4 and 5.
- Token access in mutations: `ctx.auth.session!.token` (the `token` column on the `SessionRow` already in `AuthContext`). No `AuthContext` extension needed — `ResolvedSession['session']` already exposes `token`.
- `AuthEvent` variants `ImpersonationStarted` / `ImpersonationStopped` — defined in Task 3, published in Task 4 (Step 5 impl), asserted in Task 4 (Step 3 tests).
- `ImpersonationConfig` shape `{ defaultTtl, maxTtl, allowImpersonateAdmin }` — defined in Task 4 Step 1, consumed in Task 4 Step 5 impl, provided via `makeImpersonationConfigLayer` in Task 6.

**Spec requirements not covered:** None identified.

**Note on scope:** the brainstorm initially assumed a separate `ctx.auth.sessionToken` field needed to be added to the GraphQL context. On verification, the token is already reachable via `ctx.auth.session.token` (the `token` column on the `SessionRow` returned by `session.resolve(...)`), so no `AuthContext` extension is needed. The mutations use `ctx.auth.session!.token` directly — authScope guarantees `session` is non-null when the resolver runs.
