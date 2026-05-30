# SP-B — Runtime DB layer migration to `@effect/sql-pg` + `drizzle-orm/effect-postgres`

> Intermediate work between SP1 (auth credentials/sessions) and SP2 (organizations).
> Sibling project **SP-A** (service single-file pattern migration) is deferred until SP-B lands.

## Goal

Move the monorepo's **runtime** Drizzle/Postgres binding off `drizzle-orm/node-postgres`
(a raw `pg.Pool`, Promise-returning queries) onto the native Effect integration:
`@effect/sql-pg`'s `PgClient` + `drizzle-orm/effect-postgres`'s `PgDrizzle`. After this,
`DrizzleDb` yields an `EffectPgDatabase` whose query builders return **`Effect`s**, so DB
access composes directly inside `Effect.gen` with no `Effect.tryPromise` bridging.

This is a deliberate, **monorepo-wide** change: every DB call site moves from
`Effect.tryPromise(() => db.x())` to `yield* db.x()`. It is all-or-nothing — `DrizzleDb`
cannot be half-migrated.

## Scope

**In scope:** `@czo/kit` (`db/effect.ts` + any `db/*` consumers, `seeder.ts`),
`@czo/auth` (all `services/` + `layers/` doing DB work, the SP1 code, `testing/postgres.ts`),
`@czo/stock-location` — every site that touches a `DrizzleDb`.

**Out of scope:** `@czo/app` and `apps/mazo` — their DB call sites are deferred to a later
effort; once `effect.ts` changes they carry type errors until then (accepted — consistent
with the repo's pre-existing in-flight-migration state, the app is already not runnable).
SP-A (service single-file pattern). `drizzle-kit` config and the `migrations/` folders
(build-time, driver-agnostic — unchanged). Read-replica behaviour is **preserved**, not
redesigned.

## 1. `kit/db/effect.ts` — new shape

- `DatabaseConfig` (Tag) + `DatabaseConfigFromEnv` (reads `DATABASE_URL`, comma-separated
  master+replicas, `DATABASE_POOL_MAX`, all `Redacted`) — **kept as-is**.
- For each connection (master + each replica) build an `@effect/sql-pg` `PgClient` from the
  `Redacted` url. The `PgClient` is a scoped resource — it owns its pool lifecycle, so the
  manual `pg.Pool` + `Effect.addFinalizer(pool.end)` dance is removed.
- Build one `EffectPgDatabase` per client via
  `PgDrizzle.make({ relations }).pipe(Effect.provide(PgDrizzle.DefaultServices), <provide that PgClient>)`.
  `relations` still comes from the `SchemaRegistry` Service (`registry.relations`), unchanged.
- If replicas are configured, wrap with `withReplicas(masterDb, [replicaDbs])` (the same
  `drizzle-orm/pg-core` utility used today) so reads route to replicas, writes to master.
- `DrizzleDb` (Tag) — unchanged tag; the underlying value is now an `EffectPgDatabase`.
- `Database<Relations>` type → `EffectPgDatabase<Relations> & { $client: PgClient }`
  (was `NodePgDatabase<…> & { $client: PgPool }`).
- `DrizzleDbLayer` stays a `Layer.effect(DrizzleDb, …)`; the build Effect is scoped so the
  `PgClient`(s) close on `ManagedRuntime` dispose.

## 2. Query-API change — the monorepo sweep

`EffectPgDatabase` query builders return `Effect`s. Mechanical transformation at every
call site:

| Before (node-postgres) | After (effect-postgres) |
|---|---|
| `Effect.tryPromise(() => db.select()…)` / `Effect.promise(…)` | `yield* db.select()…` (or `.pipe(…)`) |
| `tryDb(() => db.insert(…).returning())` | `yield* dbErr(db.insert(…).returning())` — see §3 |
| `db.transaction(async (tx) => { … })` | effect-postgres Effect-based transaction — see §4 |
| `db.execute(sql\`…\`)` | effect-postgres raw exec — see §4 |
| RQBv2 `db.query.x.findFirst(…)` | `yield* db.query.x.findFirst(…)` (still an Effect now) |

The sweep is guided by `tsc`: after `effect.ts` is rewritten, every stale call site is a
type error. Work module-by-module until `check-types` returns to its pre-SP-B baseline.

## 3. Error handling — per-service `dbErr` helper

Decision: domain tagged errors and service `E` channels are **kept**. Each service keeps a
small helper that maps the effect-postgres DB error to its domain error — replacing the
current `tryDb` (a `Effect.tryPromise` wrapper) with a `dbErr` (an `Effect.mapError`):

```ts
const dbErr = <A>(eff: Effect.Effect<A, SqlError>) =>
  eff.pipe(Effect.mapError(cause => new SessionStoreFailed({ cause })))
// usage:  const row = yield* dbErr(db.query.sessions.findFirst({ where: { token } }))
```

- `SessionStoreFailed`, `CredentialDbFailed`, `UserDbFailed`, `DbFailed`, `OrgDbFailed` and
  every service contract's `E` channel are unchanged — minimal ripple into the committed
  SP1 code (`SessionService`, `signUp`/`signIn` keep their signatures).
- `http/error-map.ts` (`STATUS_BY_TAG`) is unchanged.
- The exact effect-postgres failure type (here written `SqlError`) is confirmed in §10.

## 4. Transactions & raw SQL

- `signUp`'s `users`+`accounts` transaction and any other `db.transaction(...)` move to
  effect-postgres's transaction API (an `Effect`-based transaction, not an `async` callback).
- `truncateAuth`'s `db.execute(sql\`TRUNCATE …\`)` and any raw `db.execute` move to the
  effect-postgres raw-exec form.
- Exact APIs confirmed in §10.

## 5. `testing/postgres.ts` (SP1 Testcontainers helper)

Rebuilt on an `@effect/sql-pg` `PgClient` pointed at the Testcontainer's connection URI
(replacing the `pg.Pool` + `drizzle-orm/node-postgres` build), then `PgDrizzle.make`.
The `migrations/` folder and `drizzle-kit` are untouched; the migration **runner** moves
to `drizzle-orm/effect-postgres/migrator` (or stays node-postgres for the test only — §10).

## 6. Migrations / drizzle-kit — unchanged

`drizzle.config.ts`, `drizzle-kit generate` / `migrate` are build-time and agnostic of the
runtime driver. No change.

## 7. Dependencies

Add `@effect/sql-pg` to the `pnpm-workspace.yaml` catalog at `4.0.0-beta.70` (lockstep with
`effect`), and to `@czo/kit`'s `dependencies`. It pulls `@effect/sql` transitively.

## 8. Testing

- The full SP1 suite (30 tests across 7 files, incl. the Testcontainers suites) must pass
  after the migration — it is the regression gate for the `testing/postgres.ts` rewrite and
  the auth call-site sweep.
- `check-types` for `@czo/kit` and every swept module must return to its pre-SP-B baseline
  (no NEW errors; the pre-existing in-flight-migration errors are out of scope).

## 9. Sequencing

1. Add the `@effect/sql-pg` dependency.
2. Rewrite `kit/db/effect.ts`.
3. Sweep call sites module-by-module guided by `tsc`: `@czo/kit` → `@czo/auth` →
   `@czo/stock-location`.
4. Rewrite `testing/postgres.ts`; run the SP1 suite.
5. Full `check-types` + test pass.

## 10. Verification notes (confirm against installed source during planning)

`@effect/sql-pg` is not yet installed — install it first, then verify:

- **`PgClient` construction** — the exact `PgClient.layer` / `PgClient.make` API and its
  config shape (does it take a `Redacted` `url`, pool/`max` options?). The user's reference
  uses `PgClient.layer({ url })`. For the multi-client (replica) case a scoped
  `PgClient.make` per connection is likely needed rather than the singleton `.layer`.
- **`withReplicas` × `EffectPgDatabase`** — confirm `drizzle-orm/pg-core`'s `withReplicas`
  proxies an `EffectPgDatabase` correctly (it is a driver-agnostic proxy, but verify).
- **`PgDrizzle.make` signature** — confirmed: `make({ relations })` →
  `Effect<EffectPgDatabase<R> & { $client: PgClient }, never, EffectCache | EffectLogger | PgClient>`;
  `DefaultServices` provides the cache + logger. Confirm `EffectDrizzlePgConfig` fields.
- **Transaction & raw-exec API** of `EffectPgDatabase` (`drizzle-orm/effect-postgres`
  `session.d.ts` — `EffectPgTransaction`).
- **effect-postgres migrator** (`drizzle-orm/effect-postgres/migrator`) — signature, and
  whether it reads the existing rc.3 `migrations/` folder.
- **The DB failure type** — what `EffectPgDatabase` queries fail with (the §3 `SqlError`).

## 11. Risks / open items

- The monorepo carries a large pre-existing in-flight migration (~75 `@czo/auth` /
  ~44 `@czo/kit` type errors, broken legacy tests). SP-B sweeps DB calls in files that may
  already be broken — scope discipline: only NEW errors count; do not fix pre-existing ones.
- `@effect/sql-pg`/`@effect/sql` are beta — the migration shares the beta-API-churn risk
  already seen in SP1; the verification notes (§10) front-load the risky spots.
- `withReplicas` is preserved but lightly exercised — if no environment actually configures
  replicas, the replica path is effectively untested.
