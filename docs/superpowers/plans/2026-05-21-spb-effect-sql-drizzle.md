# SP-B — Effect-SQL DB Layer Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the monorepo's runtime Drizzle/Postgres binding from `drizzle-orm/node-postgres` (a raw `pg.Pool`, Promise-returning queries) to `@effect/sql-pg`'s `PgClient` + `drizzle-orm/effect-postgres`'s `PgDrizzle` (Effect-returning queries).

**Architecture:** `kit/db/effect.ts` builds `DrizzleDb` as an `EffectPgDatabase` backed by one or more `@effect/sql` `PgClient`s; every DB call site monorepo-wide moves from `Effect.tryPromise(() => db.x())` to `yield* db.x()`; each service maps the effect-postgres failure to its existing domain tagged error via a per-service `dbErr` helper (replacing the `tryDb` `Effect.tryPromise` wrapper). Read replicas preserved via `withReplicas`.

**Tech Stack:** `effect@4.0.0-beta.70`, `@effect/sql-pg@4.0.0-beta.70`, `drizzle-orm@1.0.0-rc.3` (`effect-postgres` driver), Testcontainers.

**Source spec:** `docs/superpowers/specs/2026-05-21-spb-effect-sql-drizzle-design.md`

---

## Conventions for every task

- **`tsc`-guided sweep:** once `effect.ts` changes (Task 3), every stale DB call site is a type error. Tasks 5–7 fix call sites until `pnpm check-types` returns to the **per-package pre-SP-B baseline** captured in Task 1 — no NEW errors. Pre-existing in-flight-migration errors are out of scope; never fix them.
- **Transformation rules** (apply at every call site):
  | Before (node-postgres) | After (effect-postgres) |
  |---|---|
  | `Effect.tryPromise(() => db.x())` / `Effect.promise(() => db.x())` | `yield* db.x()` (the query is already an `Effect`) |
  | `tryDb(() => db.x())` (a `tryPromise` wrapper) | `yield* dbErr(db.x())` — see below |
  | `db.transaction(async (tx) => { … })` | effect-postgres Effect-based transaction (Task 2 confirms the API) |
  | `db.execute(sql\`…\`)` | effect-postgres raw exec (Task 2 confirms the API) |
  | `await db.x()` (plain await) | `yield* db.x()` inside an `Effect.gen` |
- **`dbErr` per-service helper:** replace each service's `tryDb` with a `dbErr` that `mapError`s the effect-postgres failure to that service's domain tagged error:
  ```ts
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new SessionStoreFailed({ cause })))
  ```
  Generic `E` (not `SqlError`): effect-postgres queries fail with `EffectDrizzleQueryError`, which `drizzle-orm/effect-postgres` does **not** re-export — the generic form needs no import. (Transaction-wrapping sites carry `EffectDrizzleQueryError | SqlError`; the generic `E` absorbs both.) The domain tagged errors (`SessionStoreFailed`, `CredentialDbFailed`, `UserDbFailed`, `DbFailed`, `OrgDbFailed`) and every service contract's `E` channel are **kept unchanged**.
- **Type-check:** `pnpm check-types` in each touched package.
- **Tests:** the SP1 suite (30 tests, `@czo/auth`) is the behavioural regression gate; run it after Tasks 4 and 6. Other modules' existing tests run in their sweep task.
- **Commits:** **do NOT commit during execution.** Stage changes with `git add` only; a single review + commit happens after Task 8 (user's no-commit-until-final-review preference). **Never run `git stash`** (it silently reverted work in a prior session). Do not stage the spec or this plan.
- **Beta API:** `@effect/sql-pg` is unverified — **Task 2 verifies the full API against installed source before Task 3 writes code.** Tasks 3–7's code is written against the spec's design; Task 2's findings override any mismatch.

---

## File Structure

**Modified:**
- `pnpm-workspace.yaml` — add the `@effect/sql-pg` catalog entry.
- `packages/kit/package.json` — add `@effect/sql-pg` dependency.
- `packages/kit/src/db/effect.ts` — **rewritten** (the core change).
- `packages/kit/src/db/effect.test.ts` — adapted.
- `packages/modules/auth/src/testing/postgres.ts` — **rewritten** (Testcontainers helper).
- DB call sites swept across `@czo/kit`, `@czo/auth`, `@czo/stock-location` — exact files discovered via `tsc` per task. (`@czo/app` and `apps/mazo` are **out of SP-B scope** — see Notes/risks.)

**Unchanged:** `drizzle.config.ts`, the `migrations/` folders, `drizzle-kit` scripts (build-time, driver-agnostic). `DatabaseConfig` / `DatabaseConfigFromEnv` in `effect.ts` (kept).

---

## Task 1: Add `@effect/sql-pg` + capture baselines

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `packages/kit/package.json`

Setup — no TDD.

- [ ] **Step 1: Catalog entry**

In `pnpm-workspace.yaml`, in the Effect-4 lockstep block (next to `effect: 4.0.0-beta.70`), add:

```yaml
  '@effect/sql-pg': 4.0.0-beta.70
```

- [ ] **Step 2: Add the dependency to `@czo/kit`**

In `packages/kit/package.json` `dependencies`, add:

```json
    "@effect/sql-pg": "catalog:",
```

- [ ] **Step 3: Install**

Run: `cd /workspace/c-zo && pnpm install`
Expected: completes; `@effect/sql-pg` (and transitively `@effect/sql`) resolve.

- [ ] **Step 4: Capture the check-types baselines**

Run `pnpm check-types` in each package and **record the error count** — these are the targets the sweep must return to:

```bash
cd /workspace/c-zo/packages/kit && pnpm check-types 2>&1 | grep -cE "error TS"
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -cE "error TS"
cd /workspace/c-zo/packages/modules/stock-location && pnpm check-types 2>&1 | grep -cE "error TS"
```

Write the three numbers into this plan (Task 1 notes) before continuing.

**Task 1 baseline:** `@czo/kit: 44`, `@czo/auth: 75`, `@czo/stock-location: 111`

- [ ] **Step 5: Stage (no commit)**

```bash
git add pnpm-workspace.yaml packages/kit/package.json pnpm-lock.yaml
```

---

## Task 2: Verify the `@effect/sql-pg` + `effect-postgres` API

**Files:** none (research task — its output is the verified-API notes used by Tasks 3–7).

No TDD. Read the installed source and confirm every API the migration relies on. If anything is materially different from this plan's assumptions, **STOP and report** before coding.

- [ ] **Step 1: `@effect/sql-pg` `PgClient`**

Read `node_modules/.pnpm/@effect+sql-pg@*/node_modules/@effect/sql-pg/dist/PgClient.d.ts` (and `index.d.ts`). Confirm:
- The `PgClient` `Context` tag and its service shape.
- `PgClient.layer(config)` — the config shape: does it take a `url` (string / `Redacted` / `Config`), and pool options (`max`, …)?
- Whether a non-layer scoped constructor exists (`PgClient.make` / `PgClient.makeRuntime` / similar) — **needed for the multi-client replica case**, since one `Layer` provides only one `PgClient` tag.

- [ ] **Step 2: `drizzle-orm/effect-postgres`**

Read the installed `drizzle-orm/effect-postgres/driver.d.ts` + `session.d.ts`. Confirm:
- `make` — confirmed: `make<R>(config?: EffectDrizzlePgConfig<R>) => Effect<EffectPgDatabase<R> & { $client: PgClient }, never, EffectCache | EffectLogger | PgClient>`. Confirm `EffectDrizzlePgConfig` fields (`relations`, logger, casing?).
- `DefaultServices` — `Layer<EffectCache | EffectLogger>`.
- `EffectPgDatabase` — the query builder API: `.select`/`.insert`/`.update`/`.delete`/`.query.*` return `Effect`s; the **transaction** API (`EffectPgTransaction`) and the **raw exec** API; **the failure type** the queries fail with (this is the `SqlError` referenced in the `dbErr` helper).

- [ ] **Step 3: `withReplicas` compatibility**

Confirm `drizzle-orm/pg-core`'s `withReplicas` accepts `EffectPgDatabase` instances (it is a driver-agnostic proxy). If it does not, note the fallback: a hand-written read/write router over master + replica `EffectPgDatabase`s.

- [ ] **Step 4: effect-postgres migrator**

Read `drizzle-orm/effect-postgres/migrator.d.ts`. Confirm the migrator signature and that it reads the existing rc.3 `migrations/<timestamp>_<name>/` folder format (`testing/postgres.ts` uses it in Task 4).

- [ ] **Step 5: Record findings**

Append a short "Verified API" note to this task with the exact signatures. Tasks 3–7 follow it; where it contradicts the code blocks below, the verified API wins.

---

## Task 3: Rewrite `kit/db/effect.ts`

**Files:**
- Modify: `packages/kit/src/db/effect.ts`
- Modify: `packages/kit/src/db/effect.test.ts`

`DatabaseConfig` / `DatabaseConfigFromEnv` are **kept verbatim** (config shape, `DATABASE_URL` parsing, `Redacted`). Only the `Database` type and the `DrizzleDb` build change.

- [ ] **Step 1: Adapt the failing test**

`effect.test.ts` already exercises `DrizzleDbLayer`. Update it so a test builds `DrizzleDb` over a `PgClient` pointed at a test database and asserts a trivial query (`yield* db.execute(sql\`select 1 as n\`)`), provided the env has a reachable DB; otherwise gate it behind the Testcontainers layer from `@czo/auth/testing` is not available to `@czo/kit` — instead use a `PgClient` against `TEST_DATABASE_URL` (skip if unset). Keep the existing `DatabaseConfigFromEnv` parsing tests unchanged.

Run: `cd /workspace/c-zo/packages/kit && pnpm vitest run src/db/effect.test.ts` — expect FAIL (the rewritten `effect.ts` doesn't exist yet / type mismatch).

- [ ] **Step 2: Rewrite `effect.ts`**

Replace the drizzle-build section. Keep the file's `DatabaseConfig`, `DatabaseConfigShape`, `DatabaseConfigFromEnv`, and `RelationsEntry`/`SchemaRegistryShape` imports. New core:

```ts
import { PgClient } from '@effect/sql-pg'
import type { TablesRelationalConfig } from 'drizzle-orm' // names the inferred type — avoids TS2883
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { withReplicas } from 'drizzle-orm/pg-core/effect' // ⚠️ /effect subpath — Task 2 findings
import { Context, Effect, Layer, Redacted } from 'effect'
import pg from 'pg'
import { SchemaRegistry } from './schema-registry'
import type { RelationsEntry } from './schema-registry'

/** The drizzle instance — an effect-postgres `EffectPgDatabase`; queries return `Effect`s. */
export type Database<Relations extends RelationsEntry = RelationsEntry>
  = PgDrizzle.EffectPgDatabase<Relations> & { $client: PgClient.PgClient }

export class DrizzleDb extends Context.Service<DrizzleDb, Database>()(
  '@czo/kit/DrizzleDb',
) {}

/** PG type OIDs (date/time/interval/numeric + their array variants) the
 *  effect-postgres driver must receive RAW — it applies its own column
 *  codecs. https://orm.drizzle.team/docs/connect-effect-postgres */
const RAW_TYPE_OIDS = new Set([1184, 1114, 1082, 1186, 1231, 1115, 1185, 1187, 1182])

/** Build one effect-postgres db for a single connection URL.
 *  `PgClient.layer` owns the pool lifecycle and absorbs Scope + Reactivity. */
function makeClientDb(url: Redacted.Redacted<string>, relations: RelationsEntry) {
  return PgDrizzle.makeWithDefaults({ relations }).pipe(
    Effect.provide(PgClient.layer({
      url,
      types: {
        getTypeParser: (id, format) =>
          RAW_TYPE_OIDS.has(id)
            ? (value: unknown) => value
            : pg.types.getTypeParser(id, format),
      },
    })),
  )
}

const acquireDb = Effect.gen(function* () {
  const config = yield* DatabaseConfig
  const registry = yield* SchemaRegistry
  const relations = yield* registry.relations

  const masterDb = yield* makeClientDb(config.url, relations)
  if (config.replicas.length === 0)
    return masterDb

  const replicaDbs = yield* Effect.forEach(config.replicas, r => makeClientDb(r, relations))
  return withReplicas(masterDb, replicaDbs as [typeof masterDb, ...typeof masterDb[]])
})

/** Live Layer — requires `DatabaseConfig` + `SchemaRegistry`; `PgClient`s close on scope dispose. */
export const DrizzleDbLayer = Layer.effect(DrizzleDb, acquireDb as unknown as Effect.Effect<Database, never, DatabaseConfig | SchemaRegistry>)
```

> Task 2 resolved the open questions — see "## Task 2 — Verified API" at the end of this plan. Design notes for this code block:
> - **`PgClient.layer({ url })`** (user's choice over `PgClient.make`): builds a self-contained client `Layer` that owns the pool lifecycle and absorbs `Scope`/`Reactivity` — no manual `Reactivity` wiring. Each `makeClientDb` call provides its own fresh `PgClient.layer`, so master and replicas resolve to distinct clients.
> - **`withReplicas`** must be imported from `drizzle-orm/pg-core/effect` (the plain `drizzle-orm/pg-core` export rejects `EffectPgDatabase`).
> - **`PgDrizzle.makeWithDefaults`** = `make` + `DefaultServices` pre-provided (requirement just `PgClient`).
> - The `as unknown as` cast mirrors the pre-SP-B file and absorbs the replica-vs-non-replica shape difference.
> - **TS2883:** the `Database`/`DrizzleDb` inferred type references drizzle's `TablesRelationalConfig`; the `import type { TablesRelationalConfig } from 'drizzle-orm'` above makes it nameable in the emitted declaration. If `tsc` still complains, verify the type's real export path.

- [ ] **Step 3: Run the test**

Run: `cd /workspace/c-zo/packages/kit && pnpm vitest run src/db/effect.test.ts` — expect PASS (or the query test skipped if no `TEST_DATABASE_URL`; the config-parsing tests must pass).

- [ ] **Step 4: Type-check**

Run: `cd /workspace/c-zo/packages/kit && pnpm check-types` — `effect.ts` itself must be error-free. (Consumers elsewhere in `@czo/kit` are swept in Task 5; the count may rise here — that is expected and addressed next.)

- [ ] **Step 5: Stage (no commit)**

```bash
git add packages/kit/src/db/effect.ts packages/kit/src/db/effect.test.ts
```

---

## Task 4: Rewrite `testing/postgres.ts`

**Files:**
- Modify: `packages/modules/auth/src/testing/postgres.ts`

The Testcontainers helper currently builds `drizzle({ client: pool })` over a `pg.Pool`. Rebuild it on a `PgClient` + `PgDrizzle` so the test `DrizzleDb` matches production.

- [ ] **Step 1: Rewrite the helper**

`AuthPostgresLayer` keeps the same outer shape (a scoped `Layer.unwrap` that boots the container) but builds the db from a `PgClient` pointed at `container.getConnectionUri()`, and runs migrations via the effect-postgres migrator (Task 2 Step 4). It must still:
- provide `relations` to `PgDrizzle.make` — keep the `authRelations(authSchema)` wiring added in SP1.
- apply the auth `migrations/` folder on acquire.
- expose `truncateAuth` — `db.execute(sql\`TRUNCATE …\`)` becomes the effect-postgres raw-exec form, `yield*`-ed.

> Verification note: the effect-postgres migrator may need the `PgClient` (not a raw `pg.Pool`). If the migrator cannot target the container cleanly, fall back to `drizzle-orm/node-postgres/migrator` with a one-off `pg` connection for the test only — the runtime path stays `PgDrizzle`.

- [ ] **Step 2: Type-check**

Run: `cd /workspace/c-zo/packages/modules/auth && pnpm check-types` — `testing/postgres.ts` error-free.

- [ ] **Step 3: Run the postgres test**

Run: `cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/testing/postgres.test.ts` — expect PASS (container boots, migrations apply, tables present).

- [ ] **Step 4: Stage (no commit)**

```bash
git add packages/modules/auth/src/testing/postgres.ts
```

---

## Task 5: Sweep `@czo/kit` DB call sites

**Files:** Modify — every `@czo/kit` file `tsc` flags after Task 3 (candidates: `db/seeder.ts`, `db/manager.ts`, `db/discover.ts`, `db/optimistic.ts`, and any other `DrizzleDb`/`Database` consumer).

- [ ] **Step 1: Enumerate**

Run `cd /workspace/c-zo/packages/kit && pnpm check-types` and list every NEW error (vs the Task 1 baseline). Each is a stale DB call site.

- [ ] **Step 2: Apply the transformation rules**

For each flagged site, apply the Conventions transformation table. `@czo/kit` has no domain tagged errors of its own — where a kit DB call needs an error type, let the effect-postgres failure propagate or map to the kit `db/errors.ts` error, matching the file's existing style.

> Note: `manager.ts:useDatabase()` is the legacy non-Effect façade. If it cannot be cleanly migrated (it returns a Promise-based db), leave it and its callers as-is and note it — it is being retired; do not expand scope.

- [ ] **Step 3: Type-check + tests**

Run `cd /workspace/c-zo/packages/kit && pnpm check-types` — back to the Task 1 baseline (no NEW errors).
Run `cd /workspace/c-zo/packages/kit && pnpm vitest run src/db` — pre-existing failures unchanged; no new failures.

- [ ] **Step 4: Stage (no commit)**

```bash
git add packages/kit/src
```

---

## Task 6: Sweep `@czo/auth` DB call sites

**Files:** Modify — every `@czo/auth` file `tsc` flags. Known DB-touching SP1 + service/layer files: `services/session.ts`, `http/credential.ts`, `services/user.ts`/`layers/user.ts`, `layers/organization.ts`, `layers/api-key.ts`, `layers/actor.ts`, `layers/access.ts`, `layers/auth.ts`, `layers/better-auth/*`, plus whatever else `tsc` flags.

- [ ] **Step 1: Add `@effect/sql-pg`, then enumerate**

Add `"@effect/sql-pg": "catalog:"` to `packages/modules/auth/package.json` `dependencies` and run `pnpm install` from the repo root. `@czo/auth` now consumes effect-postgres types via `DrizzleDb`; this also makes `@czo/auth`'s `drizzle-orm` peer-resolve identically to `@czo/kit`'s, collapsing the two `drizzle-orm@1.0.0-rc.3` pnpm instances into one (see Notes/risks).

Then run `pnpm check-types` in `@czo/auth`; list NEW errors vs the Task 1 baseline.

- [ ] **Step 2: Introduce the `dbErr` helper per service**

For each service that currently has a `tryDb` (`Effect.tryPromise` wrapper) — `session.ts` (`SessionStoreFailed`), `credential.ts` (`CredentialDbFailed`), `user.ts`/`layers/user.ts` (`UserDbFailed`), `organization.ts` (`OrgDbFailed`), `api-key.ts` (`DbFailed`) — replace `tryDb` with a module-scope `dbErr`:

```ts
const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
  eff.pipe(Effect.mapError(cause => new SessionStoreFailed({ cause })))
```

(substitute the file's own tagged error; generic `E` — effect-postgres queries fail with `EffectDrizzleQueryError`, not re-exported, so the generic form needs no import). Then rewrite each `tryDb(() => db.x())` → `dbErr(db.x())` and each `Effect.tryPromise(() => db.x())` per the transformation table. `signUp`'s `db.transaction(...)` moves to the effect-postgres transaction form (Task 2). `SessionService.lookup`'s `innerJoin` query and the `PersistedCache` wiring are unchanged structurally — only the `Effect.tryPromise`/`tryDb` bridging is removed.

The domain tagged errors and service `E` channels stay — `SessionService`, `signUp`/`signIn` keep their public signatures, so resolvers/handlers and `http/error-map.ts` need no change.

- [ ] **Step 3: Type-check** — `pnpm check-types` back to the Task 1 baseline.

- [ ] **Step 4: Run the full SP1 suite**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run \
  src/services/password.test.ts src/services/cookie.test.ts src/services/session.test.ts \
  src/http/credential.test.ts src/http/error-map.test.ts \
  src/graphql/session-context.test.ts src/testing/postgres.test.ts
```
Expected: **30/30 pass** — this is the behavioural regression gate for the migration.

- [ ] **Step 5: Stage (no commit)**

```bash
git add packages/modules/auth/src
```

---

## Task 7: Sweep `@czo/stock-location` DB call sites

**Files:** Modify — every `@czo/stock-location` file `tsc` flags (the Effect-migrated `services/`/`layers/` for stock-location).

- [ ] **Step 1: Add `@effect/sql-pg`, then enumerate** — add `"@effect/sql-pg": "catalog:"` to `packages/modules/stock-location/package.json` `dependencies`, run `pnpm install` (consumes effect-postgres types via `DrizzleDb`; also dedupes the `drizzle-orm` pnpm instance — see Notes/risks). Then `pnpm check-types` in `@czo/stock-location`; list NEW errors vs baseline.
- [ ] **Step 2: Apply the transformation rules** — including the `dbErr`-per-service pattern for any `tryDb`/`tryPromise` DB wrappers, mapping to stock-location's own tagged errors.
- [ ] **Step 3: Type-check + tests** — `pnpm check-types` back to baseline; `pnpm vitest run` — no new failures.
- [ ] **Step 4: Stage (no commit)**

```bash
git add packages/modules/stock-location/src
```

---

## Task 8: Final verification

- [ ] **Step 1: Monorepo type-check** — every package back to its Task 1 baseline (no NEW errors):

```bash
cd /workspace/c-zo/packages/kit && pnpm check-types
cd /workspace/c-zo/packages/modules/auth && pnpm check-types
cd /workspace/c-zo/packages/modules/stock-location && pnpm check-types
```

- [ ] **Step 2: Full SP1 auth suite** — 30/30 (the only suite with full coverage of the migrated DB layer):

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run \
  src/services/password.test.ts src/services/cookie.test.ts src/services/session.test.ts \
  src/http/credential.test.ts src/http/error-map.test.ts \
  src/graphql/session-context.test.ts src/testing/postgres.test.ts
```

- [ ] **Step 3: Confirm no `drizzle-orm/node-postgres` runtime imports remain**

```bash
git grep -n "drizzle-orm/node-postgres" -- 'packages/kit/src' 'packages/modules/auth/src' 'packages/modules/stock-location/src' ':!*test*'
```
Expected: nothing (the only acceptable residue is a node-postgres *migrator* import in a test helper if Task 4's fallback was taken — note it if so). `@czo/app` / `apps/mazo` are out of SP-B scope and intentionally still import node-postgres.

- [ ] **Step 4: Stage everything for the final review**

```bash
git add packages/kit/src packages/modules/auth/src packages/modules/stock-location/src \
  pnpm-workspace.yaml packages/kit/package.json pnpm-lock.yaml
```

Leave it staged and uncommitted — the user runs the final review and commits SP-B as one unit.

---

## Spec coverage check

| Spec section | Task(s) |
|---|---|
| §1 new `effect.ts` shape | Task 3 |
| §2 query-API change / monorepo sweep | Tasks 5–7 |
| §3 per-service `dbErr` error handling | Task 6 (+ 5, 7 patterns) |
| §4 transactions & raw SQL | Tasks 2, 4, 6 |
| §5 `testing/postgres.ts` | Task 4 |
| §6 migrations / drizzle-kit unchanged | (no task — explicitly unchanged) |
| §7 `@effect/sql-pg` dependency | Task 1 |
| §8 testing (SP1 suite + check-types gate) | Tasks 6, 8 |
| §9 sequencing | Task order 1→8 |
| §10 verification notes | Task 2 |

## Notes / risks

- The monorepo carries a large pre-existing in-flight migration (~75 `@czo/auth` / ~44 `@czo/kit` type errors before SP-B). The Task 1 baselines are the contract — only NEW errors are SP-B's; pre-existing ones must not be touched or "fixed".
- `@effect/sql-pg` is beta — Task 2 front-loads the API risk; if it diverges materially from this plan, Task 2 stops and escalates.
- `withReplicas` over `EffectPgDatabase` is the one structural unknown — Task 2 Step 3 has the fallback (a hand-written read/write router).
- **`@czo/app` and `apps/mazo` are deliberately OUT of SP-B scope.** After Task 3 rewrites `effect.ts`, their DB call sites will carry type errors until separately migrated — accepted, consistent with the repo's pre-existing in-flight-migration state (the app is already not runnable). They get picked up by a later effort.
- **Dual `drizzle-orm` install (resolved by Tasks 6–7).** Task 1 added `@effect/sql-pg` to `@czo/kit` only, so pnpm created a second `drizzle-orm@1.0.0-rc.3` virtual instance — `drizzle-orm` lists `@effect/sql-pg` as an optional peer, now resolved for kit but not for auth/stock-location. Per-package `tsc` resolves each package's `drizzle-orm` consistently, so `pnpm check-types` (the plan's gate) is unaffected and stays at baseline. But a whole-workspace IDE type-server sees both instances and reports spurious "two `TablesRelationalConfig`" mismatches (e.g. on `DrizzleDbLayer`). Tasks 6 & 7 add `@effect/sql-pg` to `@czo/auth`/`@czo/stock-location`, collapsing pnpm to a single `drizzle-orm` instance and clearing the IDE noise. No code change is needed for this — it is purely a dependency-graph dedupe.

---

## Task 2 — Verified API

Ground truth read from the installed `.d.ts` files (`@effect/sql-pg@4.0.0-beta.70`,
`drizzle-orm@1.0.0-rc.3` `effect-postgres` driver, `effect@4.0.0-beta.70`).
**Where this contradicts a code block above, this section wins.**

### TL;DR — divergences from the plan's assumptions

1. **DB failure type is NOT `SqlError`.** Query effects fail with
   `EffectDrizzleQueryError` (a `Schema.TaggedStruct` `YieldableError`). `SqlError`
   only appears as the *extra* error on the `transaction(...)` combinator and on the
   migrator. The `dbErr` helper must be typed against `EffectDrizzleQueryError`.
2. **`withReplicas` from `drizzle-orm/pg-core` does NOT accept `EffectPgDatabase`.**
   That export is the node-postgres (`PgAsyncDatabase`) version. The Effect-aware
   `withReplicas` lives at **`drizzle-orm/pg-core/effect`** and works on
   `PgEffectDatabase`. Task 3's import path must change.
3. `PgClient.make` exists and is scoped — config takes `url` plus pool options, but
   pool size is `maxConnections`/`minConnections`, **not** `max`. It also requires
   `Reactivity.Reactivity` in addition to `Scope` (provided by `PgClient.layer`'s own
   internals — see Step 1).

None of these block the plan's approach; they are mechanical corrections applied in
Tasks 3–4. Status: **DONE_WITH_CONCERNS** (corrections below are mandatory).

### Step 1 — `@effect/sql-pg` `PgClient`

File: `@effect/sql-pg/dist/PgClient.d.ts`.

- **Context tag:** `export declare const PgClient: Context.Service<PgClient, PgClient>`.
  Reference it as `PgClient.PgClient`. The service interface
  `PgClient extends Client.SqlClient` (from `effect/unstable/sql/SqlClient`) and adds
  `config`, `json`, `listen`, `notify`.
- **Pool config** — `PgPoolConfig extends PgClientConfig`:
  ```ts
  interface PgClientConfig {
    readonly url?: Redacted.Redacted | undefined   // Redacted<string>
    readonly host?, port?, path?, ssl?, database?, username?
    readonly password?: Redacted.Redacted | undefined
    readonly connectTimeout?: Duration.Input
    readonly applicationName?, spanAttributes?, transformResultNames?,
             transformQueryNames?, transformJson?, types?
  }
  interface PgPoolConfig extends PgClientConfig {
    readonly idleTimeout?: Duration.Input
    readonly maxConnections?: number      // ← pool size lives HERE (not `max`)
    readonly minConnections?: number
    readonly connectionTTL?: Duration.Input
  }
  ```
- **Non-layer scoped constructors EXIST** (this is what the multi-client replica case
  needs — one `Layer` provides only one `PgClient` tag):
  ```ts
  declare const make:       (options: PgPoolConfig)   => Effect<PgClient, SqlError, Scope.Scope | Reactivity.Reactivity>
  declare const makeClient: (options: PgClientConfig & { acquireForStream?: boolean })
                                                      => Effect<PgClient, SqlError, Scope.Scope | Reactivity.Reactivity>
  declare const fromPool:   (options: { acquire: Effect<Pg.Pool, SqlError, Scope.Scope>, ... })
                                                      => Effect<PgClient, SqlError, Scope.Scope | Reactivity.Reactivity>
  declare const fromClient, makeWith                  // low-level
  ```
  `PgClient.make({ url })` matches the plan's reference design — **but its requirement
  channel is `Scope.Scope | Reactivity.Reactivity`**, not just `Scope`. `acquireDb`
  must provide `Reactivity.Reactivity` (or run inside a context that has it). Easiest:
  `Effect.provide(Reactivity.layer)` from `effect/unstable/reactivity/Reactivity`, or
  build clients via the layers below which bundle it.
- **Layer constructors:**
  ```ts
  declare const layer:       (config: PgPoolConfig)        => Layer<PgClient | Client.SqlClient, SqlError>
  declare const layerConfig: (config: Config.Wrap<PgPoolConfig>) => Layer<PgClient | Client.SqlClient, Config.ConfigError | SqlError>
  declare const layerFrom:   <E,R>(acquire: Effect<PgClient,E,R>) => Layer<PgClient | Client.SqlClient, E, Exclude<R, Scope|Reactivity>>
  ```
  `layer` has NO requirements (Scope/Reactivity absorbed) — usable directly for the
  single-client (no-replica) path. For multiple clients in one scope, use `make`
  (+ provide `Reactivity`).

### Step 2 — `drizzle-orm/effect-postgres`

Files: `effect-postgres/driver.d.ts`, `session.d.ts`, `pg-core/effect/db.d.ts`,
`effect-core/errors.d.ts`. Import everything from `drizzle-orm/effect-postgres`.

- **`make`** — matches the plan EXACTLY:
  ```ts
  declare const make: <TRelations extends AnyRelations = EmptyRelations>(
    config?: EffectDrizzlePgConfig<TRelations>,
  ) => Effect.Effect<EffectPgDatabase<TRelations> & { $client: PgClient },
                     never, EffectCache | EffectLogger | PgClient>
  ```
- **`EffectDrizzlePgConfig`** = `Omit<DrizzlePgConfig<TRelations>, 'cache' | 'logger'>`.
  `DrizzlePgConfig` = `Omit<DrizzleConfig<Record<string,never>, TRelations>, 'schema'> & { codecs?: PgCodecs }`.
  So the **accepted fields are: `relations?`, `jit?`, `codecs?`** — `logger`, `cache`,
  `schema` are stripped. **There is no `casing` field.** `make({ relations })` is valid.
- **`makeWithDefaults`** — convenience: `make` with `DefaultServices` pre-provided, so
  its requirement is just `PgClient`. Optional simplification for Task 3.
- **`DefaultServices`** — `Layer.Layer<EffectCache | EffectLogger, never, never>` (matches plan).
- **`EffectPgDatabase`** query API — `EffectPgDatabase<TRelations> extends PgEffectDatabase<...>`.
  Every builder **IS an `Effect`** (`yield*`-able directly, no `.execute()` needed):
  - `select / selectDistinct / selectDistinctOn` → `PgEffectSelectBuilder` → `PgEffectSelectBase extends Effect.Effect<TResult, EffectDrizzleQueryError, never>`
  - `insert(table)` → `PgInsertBuilder` → `PgEffectInsertBase extends Effect.Effect<..., EffectDrizzleQueryError, never>`
  - `update(table)` → `PgEffectUpdateBase extends Effect.Effect<..., EffectDrizzleQueryError, never>`
  - `delete(table)` → `PgEffectDeleteBase extends Effect.Effect<..., EffectDrizzleQueryError, never>`
  - `query.<rel>.*` → `PgEffectRelationalQuery extends Effect.Effect<TResult, EffectDrizzleQueryError, never>`
  - `$count`, `$with`/`with(...)`, `refreshMaterializedView` also present.
- **Raw exec:** `db.execute<TRow>(query: SQLWrapper | string)` →
  `PgEffectRaw extends Effect.Effect<TResult, EffectDrizzleQueryError, never>`.
  `yield* db.execute(sql\`select 1\`)` works directly. (`PgEffectRaw` also exposes an
  `.execute()` method returning the same Effect — either form is fine.)
- **Transactions:**
  ```ts
  transaction<A, E, R>(
    fn: (tx: EffectPgTransaction<TQueryResult, TRelations>) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | SqlError, R>
  ```
  The transaction *combinator* adds `SqlError` to the error channel (on top of `E` and
  the `EffectDrizzleQueryError`s from queries inside `tx`). `tx` exposes the same
  query builder API as `db`. Nested `tx.transaction(...)` likewise.
- **THE DB FAILURE TYPE — confirmed:**
  ```
  EffectDrizzleQueryError   — import { EffectDrizzleQueryError } from 'drizzle-orm/effect-postgres'
  ```
  It is re-exported from `drizzle-orm/effect-postgres`'s index? — **NO.** The index
  (`effect-postgres/index.d.ts`) exports `DefaultServices, EffectDrizzlePgConfig,
  EffectLogger, EffectPgDatabase, EffectPg*HKT, EffectPgSession, EffectPgSessionOptions,
  EffectPgTransaction, effectPgCodecs, make, makeWithDefaults` — it does **not**
  re-export the error classes. `EffectDrizzleQueryError` is declared in
  `drizzle-orm/dist/effect-core/errors.d.ts`. There is **no public subpath export** for
  `drizzle-orm/effect-core` in `package.json`. Options for the `dbErr` helper:
  1. Import the type structurally / via the package's deep path if the build allows
     deep imports, OR
  2. **Recommended:** derive it without importing the class — the query Effects already
     carry `EffectDrizzleQueryError` in their `E` channel, so write `dbErr` generically:
     ```ts
     import type { Effect } from 'effect'
     // E inferred from the query effect — no need to name EffectDrizzleQueryError
     const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
       eff.pipe(Effect.mapError(cause => new SessionStoreFailed({ cause })))
     ```
     `mapError`'s callback receives the `EffectDrizzleQueryError` value as `cause:
     unknown` into the domain error — no type import required. This sidesteps the
     missing subpath export entirely.
  Shape of the error (for reference): `_tag: "EffectDrizzleQueryError"`, fields
  `query: string`, `params: unknown[]`, `cause: unknown`, getter `message`.
  > **Plan correction:** every code block above that types `dbErr` as
  > `(eff: Effect.Effect<A, SqlError>)` is wrong — use the generic-`E` form above, or
  > type it `Effect.Effect<A, EffectDrizzleQueryError>` if a clean import is available.
  > For call sites that wrap a `db.transaction(...)`, the error is
  > `EffectDrizzleQueryError | SqlError` — the generic-`E` `dbErr` handles both.

### Step 3 — `withReplicas` compatibility

**The plan's import is wrong.** `drizzle-orm/pg-core`'s `withReplicas` is
`./async/db.js`'s — typed for `PgAsyncDatabase` (node-postgres) and returns
`PgAsyncWithReplicas`. It will NOT accept an `EffectPgDatabase`.

**The Effect-compatible `withReplicas` exists** at `drizzle-orm/pg-core/effect`
(`pg-core/effect/db.d.ts`), and `drizzle-orm/pg-core/effect` is a real `package.json`
export subpath:
```ts
declare const withReplicas: <TEffectHKT, HKT, TRelations,
  Q extends PgEffectDatabase<TEffectHKT, HKT, TRelations>>(
  primary: Q, replicas: [Q, ...Q[]], getReplica?: (replicas: Q[]) => Q,
) => PgEffectWithReplicas<Q>            //  Q & { $primary: Q; $replicas: Q[] }
```
> **Plan correction (Task 3):** change the import from
> `import { withReplicas } from 'drizzle-orm/pg-core'` to
> `import { withReplicas } from 'drizzle-orm/pg-core/effect'`.
> With that one-line change the plan's `withReplicas(masterDb, replicaDbs)` call
> works as designed — `EffectPgDatabase` is assignable to the `Q extends
> PgEffectDatabase<...>` constraint. **No hand-written router fallback is needed.**
> Note `PgEffectWithReplicas<Q>` adds `$primary`/`$replicas` (not `$client`); the
> `Database` type alias should account for replica vs non-replica shapes, or keep the
> existing `as unknown as` cast.

### Step 4 — effect-postgres migrator

File: `effect-postgres/migrator.d.ts` (function re-exported from
`effect-postgres/session.d.ts` and available off the `drizzle-orm/effect-postgres`
index? — the index re-exports `migrate` via `session.js`; `migrate` is exported).
```ts
declare function migrate<TRelations extends AnyRelations>(
  db: EffectPgDatabase<TRelations>,
  config: MigrationConfig,
): Effect.Effect<undefined,
                 EffectDrizzleQueryError | MigratorInitError | SqlError,
                 never>
```
- Takes the **`EffectPgDatabase`** directly (not a raw `pg.Pool`) — so Task 4's
  Testcontainers helper can run migrations on the same `PgDrizzle` instance it builds.
  No node-postgres-migrator fallback required.
- `MigrationConfig` = `{ migrationsFolder: string; migrationsTable?: string;
  migrationsSchema?: string }`. This is the **same `MigrationConfig`** the standard
  drizzle migrator uses, and it reads the conventional
  `<migrationsFolder>/<timestamp>_<name>/` + `meta/_journal.json` layout — compatible
  with the existing rc.3 `migrations/` folders. Usage:
  `yield* migrate(db, { migrationsFolder: '<abs path to auth migrations>' })`.

### `@effect/sql-pg/PgMigrator`

Out of scope for SP-B (drizzle migrator is used), but noted: `@effect/sql-pg` also ships
`dist/PgMigrator.d.ts` — that is the Effect-SQL native migrator, NOT the drizzle one.
Task 4 should use `drizzle-orm/effect-postgres`'s `migrate`, per Step 4.

### Net effect on Tasks 3–7

- Task 3: import `withReplicas` from `drizzle-orm/pg-core/effect`; provide
  `Reactivity.Reactivity` to `PgClient.make` (or use `PgClient.layer`/`layerFrom`);
  `make({ relations })` config is correct.
- Task 4: `migrate(db, { migrationsFolder })` runs on the `EffectPgDatabase` — no
  node-postgres fallback.
- Task 6 (+5,7): `dbErr` is typed on the **generic `E`** (or `EffectDrizzleQueryError`),
  never `SqlError`. Transaction-wrapping call sites carry `EffectDrizzleQueryError | SqlError`.
