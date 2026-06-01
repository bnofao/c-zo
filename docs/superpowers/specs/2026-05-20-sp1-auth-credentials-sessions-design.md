# SP1 — Credentials, Sessions & email-password flows

**Date:** 2026-05-20
**Status:** Design approved, pending spec review
**Sub-project:** SP1 of the "drop better-auth, go Effect-native" migration

---

## 1. Context

The `@czo/auth` module currently delegates the *actual* auth work (password
hashing, session tokens, OAuth, organization/member/API-key logic) to
`better-auth`. The Effect `Service`s in `src/services/` are stable contracts;
the `src/layers/*.ts` implementations either hit Drizzle directly (already
migrated: `api-key`, `organization`, `user`) or delegate to the `BetterAuth`
instance (`src/layers/better-auth/`, 15 files).

Goal: remove `better-auth` + `@better-auth/api-key` and model auth natively in
Effect, **keeping every Service contract and GraphQL resolver byte-identical**.

### Scope of the overall migration (decided)

Keep: email/password + cookie sessions, organizations, API keys, admin.
**Drop:** social/OAuth, 2FA/TOTP, email verification, password reset.

The DB schema is **not** changed ("on conserve la structure db") — this is a
pure code swap, **zero DB migrations**. Dropped-feature columns/tables
(`twoFactorEnabled`, `verifications`, `accounts.{accessToken,refreshToken,…}`)
become inert dead weight, flagged for a later cleanup. Note: the `accounts`
table **survives** — it is the credential store (`providerId='credential'`,
hash in `accounts.password`), not just an OAuth table.

### Migration strategy (decided)

**Layer-by-Layer behind stable contracts.** Reimplement one `layers/*.ts` at a
time against Drizzle; `better-auth` stays installed and functional until the
last layer is migrated, then is deleted in one cleanup pass.

### Decomposition (decided) — each gets its own spec → plan → implement cycle

| # | Sub-project | Delivers |
|---|---|---|
| **SP1** | **Credentials, Sessions, email-password flows** *(this spec)* | `PasswordService`, `CookieService`, `SessionService`, `signUp`/`signIn` functions, sign-up/in/out, cookie→`ctx.auth`. |
| SP2 | Organizations | Reimplement `OrganizationService` layer on Drizzle. |
| SP3 | API keys | Reimplement `ApiKeyService` layer on Drizzle. |
| SP4 | Admin + access control | Ban/unban, set-role, impersonation; reimplement permissions without better-auth `AccessControl`. |
| SP5 | Decommission | Delete `layers/better-auth/`, `BetterAuth` service, `auth-instance.ts`, REST proxy, dropped-feature code; drop the deps. |

SP1 is the foundation: every later SP needs sessions and `ctx.auth`.

---

## 2. SP1 goal & guarantees

Deliver a working, better-auth-free **email/password + cookie session** path:

- A user can sign up, sign in, and sign out via REST endpoints.
- Every GraphQL request resolves its session into a real, typed
  `ctx.auth = { session, user }`.
- `better-auth` itself is **untouched and still installed** — SP1 changes no
  `better-auth` code or config, and not-yet-migrated `/api/auth/**` paths still
  fall through to it. (SP1 *does* add its own new files and rewrite a few of
  its own — `context-factory.ts`, the `http` hook, two `@czo/kit` files — §9.)

### Independence

Verified: the already-migrated layers (`api-key`, `organization`, `user`) are
Drizzle-direct and take explicit IDs — none call `auth.api.getSession`. So
populating `ctx.auth` from SP1's own `SessionService` is sufficient; nothing
between SP1 and SP4 breaks.

---

## 3. Components

`PasswordService`, `CookieService`, and `SessionService` are each a **single
file** `src/services/<name>.ts` holding *both* the contract (`Context.Service`
Tag + `Data.TaggedError`s that double as Pothos errors) *and* its `Layer`
(`<Name>Live`, `Layer.effect`). **SP1 introduces no `layers/` files** — the
contract-here / layer-there split is dropped for new code. The fourth unit —
the sign-up/sign-in orchestration (3.4) — is **not** a Service: plain
Effect-returning functions, since it has a single consumer and is never
substituted.

### 3.1 `PasswordService` — `services/password.ts`

```
hash(plain: string):           Effect<string, PasswordHashFailed>
verify(hash: string, plain):   Effect<boolean>            // never fails
```

- Algorithm: **Argon2id** via **`@node-rs/argon2`** (Rust/napi, prebuilt
  binaries — no node-gyp compile). This is the one new runtime dependency SP1
  adds; the version is pinned through a `pnpm-workspace.yaml` catalog entry
  per repo convention.
- Params: the library's Argon2id defaults (`m=19456, t=2, p=1`) unless tuned;
  a 16-byte random salt is generated internally by the library.
- Stored format: the standard **PHC string**
  (`$argon2id$v=19$m=…,t=…,p=…$<salt>$<hash>`) — self-describing, so parameters
  can evolve without a data migration. No custom format needed.
- `hash` wraps `argon2.hash(plain)`; any failure → `PasswordHashFailed`.
- `verify` wraps `argon2.verify(storedHash, plain)`; a malformed/unparseable
  stored hash is caught and yields `false` (no throw).
- `PasswordHashFailed` — tagged error. One already exists in `services/user.ts`
  (`{ cause: unknown }`); SP1 **reuses it** (imported from there) rather than
  redefining, to avoid a duplicate export through the `services/index.ts`
  barrel.

### 3.2 `SessionService` — `services/session.ts`

```
create({ userId, actorType, ipAddress?, userAgent? }):
    Effect<{ token: string; session: SessionRow }, SessionStoreFailed>
resolve(token: string):
    Effect<ResolvedSession | null, SessionStoreFailed>  // null = absent/expired ONLY
revoke(token: string):              Effect<void, SessionStoreFailed>
revokeAllForUser(userId: number):   Effect<void, SessionStoreFailed>   // used by SP4
purgeExpired():                     Effect<number, SessionStoreFailed> // count of rows deleted

setCookie(token: string):                Cookie           // pure — session cookie for a token
readSessionToken(cookieHeader: string):  string | null    // pure — extract the session token
```

`ResolvedSession = { session: SessionRow; user: User }`. `SessionStoreFailed`
is the single tagged error for **any** infrastructure failure of the session
store (L2 Redis or L3 Postgres) — see the fail-loud rule below.

- **Token:** 32 random bytes (`randomBytes(32)`), base64url. Stored **raw** in
  `sessions.token` — it is the cache key at every tier; consistent with the
  "token = lookup key" model. (Hashing-at-rest was considered and deliberately
  not done; revisit if a DB-leak threat model demands it.)
- **Lifetime:** a single **configurable** session duration drives both the DB
  `expiresAt` (`now + duration`) and the cookie `maxAge` — they stay in lockstep.
  Default 7 d. **Fixed window, no sliding refresh in SP1:** true rolling
  sessions would need a `Set-Cookie` on GraphQL responses, which SP1's
  REST-only cookie boundary deliberately excludes — deferred.
- **Expiry on read:** `resolve` returns `null` for an absent token or an
  expired row (and best-effort deletes the expired row).
- **Fail loud on infra (decided):** an L2/L3 failure (Redis or Postgres
  unreachable) is **never** collapsed into `null` — it surfaces as
  `SessionStoreFailed`. `null` means *only* "absent or expired", never "lookup
  failed". This keeps a DB/Redis outage from silently logging every user out;
  the caller decides the response (the `contexts` hook fails the request — §5).
- **Cookie methods** — `setCookie` / `readSessionToken` are thin, **pure**
  (non-Effect) members that delegate to `CookieService` (see 3.3): `setCookie`
  builds the session `Cookie` via `CookieService.create(token)`;
  `readSessionToken` runs `CookieService.parse(header)` and returns the value
  under the configured cookie name (or `null`). They live on `SessionService`
  so the "cookie value *is* the session token" semantics sit with the session
  owner; `CookieService` itself stays generic. `SessionService` therefore
  depends on `CookieService`.
- `actorType` is written by the `signUp`/`signIn` functions (see 3.4);
  `SessionService` treats it as an opaque required string.
- **`purgeExpired`** — bulk-deletes every `sessions` row with `expiresAt < now`
  and returns the count. `resolve` only *lazily* deletes the single expired row
  it touches; sessions of users who never return are otherwise never cleaned,
  so the table needs a sweep for storage hygiene. SP1 ships the method, its
  impl, and tests — **wiring it to a schedule (cron/interval) is out of SP1
  scope** (a small separate follow-up).

#### Session cache — 3-tier via `effect/unstable/persistence`

`SessionService` resolves through a `PersistedCache` (`effect/unstable/persistence/PersistedCache`), which maps 1:1 to the agreed 3-tier design — no hand-rolled LRU:

| Tier | Mechanism | TTL | Notes |
|------|-----------|-----|-------|
| **L1** | `PersistedCache.inMemory` (Effect `Cache`) | 30 s (`inMemoryTTL`) | per-process; `inMemoryCapacity` ~10 000 |
| **L2** | `Persistence` backing store | = session expiry | `Persistence.layerRedis` in prod; `layerMemory` in tests |
| **L3** | the `PersistedCache` `lookup` fn | source of truth | Drizzle `sessions ⋈ users` query |

- `PersistedCache.make(lookup, { storeId: 'auth/session', timeToLive, inMemoryTTL: 30s, inMemoryCapacity })`.
- The cache key is a `Persistable` schema entity wrapping the session token;
  `timeToLive` is derived from the resolved session's `expiresAt`. For a
  **not-found (`null`) result**, a short fixed TTL (~30 s) is used — long-lived
  negative caching is avoided.
- A `PersistedCache` `get`/store error (`PersistenceError`, etc.) is mapped to
  `SessionStoreFailed` — it is *not* swallowed as `null`.
- `revoke` → `PersistedCache.invalidate(key)` clears **L1 + L2**; then deletes
  the Postgres row.
- **Known tradeoff:** L1's 30 s TTL is a revocation lag — a revoked session can
  still be honored for up to 30 s within a process that cached it, and
  `invalidate` only reaches the *current* process's L1. Accepted for SP1
  (sign-out). SP4 (ban/impersonate) will revisit whether it needs a shorter
  L1 TTL or an L1 bypass for security-sensitive checks.

#### Persistence wiring — shared infra, **not** an auth file

- `NodeRedis` (the `ioredis` connection) is the *infrastructure*; `Persistence`,
  `PersistedCache`, `KeyValueStore`, `PersistedQueue` are *consumption*
  abstractions modules build on top. A module never builds the infra — it just
  *requires* `Persistence`, exactly as it requires `DrizzleDb`.
- So SP1 ships **no `persistence.ts`**. `SessionService` builds a
  `PersistedCache` and leaves `Persistence` in its layer's requirement channel
  `R`, unprovided by the auth module.
- The provide chain — `NodeRedis` → `Redis.Redis` → `Persistence` (memory or
  Redis), wired once in `@czo/kit`'s `buildApp` alongside `DrizzleDb` — is a
  **separate, deferred task** (it pulls in `@effect/platform-node` + `ioredis`).
- SP1 is validated by tests, which provide `Persistence.layerMemory` directly;
  the auth module is therefore not app-runnable until that infra task lands.
- `PersistedCache` keys are `Persistable` classes — SP1 defines Effect `Schema`
  codecs for the cached `ResolvedSession` value (required for serialization at
  every backend, memory included).

### 3.3 `CookieService` — `services/cookie.ts`

A generic, config-driven cookie service — it knows *one* cookie's `name` and
`attributes`, supplied at layer construction; it has no session knowledge.

```
create(value: string):       Cookie        // { name, value, attributes }
createBlank():                Cookie        // value '', maxAge 0 — deletion cookie
parse(header: string):        Record<string, string>   // Cookie header → name→value map
```

- `Cookie` is a **class** (`Data.Class`) — fields `name` / `value` /
  `attributes` (`name` is top-level, **not** part of `CookieAttributes`) plus a
  `serialize(): string` method that renders the `Set-Cookie` header value.
- `CookieAttributes` = `{ httpOnly; sameSite; secure; path; domain; maxAge; expires }`.
- `name` and every `CookieAttributes` field are **supplied via config**, so the
  cookie is fully parametric:
  - `name` — config, default `czo.session` (separate from `CookieAttributes`).
  - `maxAge` — config, the session-duration value; default 7 d.
  - `expires` — config, optional absolute date; coexists with `maxAge` (which
    takes precedence in modern browsers).
  - `domain` — config, optional; unset = host-only cookie.
  - `path` — config, default `/`.
  - `sameSite` — config, **default `lax`** (deployment topology is undecided;
    cross-origin would set `none` + `secure`).
  - `secure` — config, environment-derived (true on https, false on localhost).
  - `httpOnly` — always `true`.
- `create(value)` → a `Cookie` carrying `value` with the configured
  `name`/`attributes`. `createBlank()` → the same `name` with empty value,
  `maxAge: 0` **and** `expires` set to the epoch (both, for cross-browser
  deletion) for sign-out. `parse(header)` is a generic `Cookie:`-header parser
  returning every cookie as a `name → value` map.
- `CookieService` is auth-module-scoped for SP1 (its config = the session
  cookie); it is generic enough to promote to `@czo/kit` later if a second
  cookie appears.
- Config source: the auth module wires `CookieService` via `layerConfig`
  (`Config.Wrap<CookieConfig>`). `name` / `httpOnly` / `path` are fixed
  (`Config.succeed`); `maxAge` is `Config.succeed`'d from the session-duration
  constant (so the cookie and the DB `expiresAt` can't drift); `sameSite` /
  `secure` are env-tunable (`AUTH_COOKIE_*`).

### 3.4 Sign-up / sign-in orchestration — `http/credential.ts`

**Not a `Context.Service`.** `signUp` / `signIn` are plain exported
Effect-returning functions — the orchestration has a single consumer (its REST
handler) and is never substituted, so a Tag + Layer would be ceremony. They
require the other services as `R`, which `event.context.runEffect` discharges
(exactly as GraphQL resolvers do). They live in `http/credential.ts` —
**not** `services/` (that directory is for `Context.Service`s) — co-located
with their only consumers, the `http/` handlers. The file holds the two
functions plus their tagged errors; no layer.

```
signUp(input: { email, name, password, actorType? }):
    Effect<ResolvedSession & { token: string; cookie: Cookie },
           EmailAlreadyRegistered | PasswordHashFailed | ActorTypeNotAllowed
           | ActorProviderFailed | SessionStoreFailed | CredentialDbFailed,
           PasswordService | SessionService | AuthActorService | DrizzleDb | AuthEvents>
signIn(input: { email, password, actorType? }):
    Effect<ResolvedSession & { token: string; cookie: Cookie },
           InvalidCredentials | ActorTypeNotAllowed | ActorProviderFailed
           | SessionStoreFailed | CredentialDbFailed,
           PasswordService | SessionService | AuthActorService | DrizzleDb>
```

The error unions are **complete**: domain errors *and* infrastructure errors —
`SessionStoreFailed` (from `SessionService.create`), `CredentialDbFailed` (the
functions' own `users`/`accounts` DB ops), `ActorProviderFailed` (from
`hasActorType`). Nothing is silently swallowed.

- **Credential storage:** the password hash lives in the existing `accounts`
  table — one row per user with `providerId = 'credential'`,
  `accountId = String(userId)`, `password = <PasswordService hash>`.
- `signUp`: **pre-check the email** (a `users` lookup — fail fast with
  `EmailAlreadyRegistered` *before* the deliberately-expensive Argon2 hash) →
  `PasswordService.hash` → **in one Drizzle transaction** insert the `users`
  row then the `accounts` credential row → validate `actorType` →
  `SessionService.create`. The transaction prevents an **orphan user with no
  credential** if the second insert fails; `create` runs *after* commit (a
  post-commit `SessionStoreFailed` just means the account exists and the user
  can sign in later). The pre-check is fail-fast + clean control flow; the
  `users.email` unique constraint remains the **race-proof integrity
  guarantee** — a concurrent duplicate slipping past the pre-check is rejected
  by the DB and the transaction rolls back. Any DB failure (including that rare
  race) → `CredentialDbFailed`.
- **`SignedUp` event:** on success — *after* the transaction commits and the
  session is created — `signUp` publishes a `SignedUp` event
  (`{ userId, email, actorType }`) on a new **`AuthEvents`** domain bus,
  fire-and-forget via `Effect.forkDetach` (a subscriber must never block or
  fail `signUp`). `AuthEvents` is distinct from `UserEvents` — `SignedUp` is the
  *self-registration act*, not the generic `UserCreated` lifecycle event.
- `signIn`: look up `users` by email + its `credential` account →
  `PasswordService.verify` → validate `actorType` → `SessionService.create`.
  A missing user, missing credential, or failed verify all collapse to a single
  `InvalidCredentials` (no user-enumeration leak). `signIn` emits no event in SP1.
- **`actorType` validation (decided):** `actorType` is optional input,
  default `'user'`. `signUp`/`signIn` call
  `AuthActorService.hasActorType(userId, actorType)` (the registry is already
  better-auth-free); a `false` result → `ActorTypeNotAllowed`. The resolved
  `actorType` is passed to `SessionService.create`.
- **No-provider rule (decided):** when *no* `ActorProvider` is registered for
  the requested type, `hasActorType` resolves to **allowed** — validation only
  restricts a type once a module registers a provider for it, so sign-up/in
  work out of the box. SP1 requires the `AuthActorService` implementation to
  honor this; adjusting it if it doesn't already is within SP1 scope.
- **No `accounts` uniqueness guard:** the frozen schema has no unique
  constraint enforcing one credential row per user. SP1 relies on `signUp`
  being the sole credential creator (inside its transaction); documented, not
  enforced at the DB.
- Sign-out has no orchestration function — its handler calls
  `SessionService.revoke` directly.

---

## 4. HTTP surface — auth module `http` hook

The auth module's existing `http` hook gains three **explicit** h3 routes.
h3 matches explicit routes before the existing `app.all('/api/auth/**', …)`
catch-all (which still forwards not-yet-migrated paths to better-auth), so the
two coexist with no ordering hazard.

| Method & path | Body | Effect | Response |
|---|---|---|---|
| `POST /api/auth/sign-up` | `{ email, name, password, actorType? }` | `signUp(input)` → emit `SessionService.setCookie(token)` | `200 { user }` |
| `POST /api/auth/sign-in` | `{ email, password, actorType? }` | `signIn(input)` → emit `SessionService.setCookie(token)` | `200 { user }` |
| `POST /api/auth/sign-out` | — (cookie) | `SessionService.revoke` → emit `CookieService.createBlank()` | `204` |

- Handlers are thin: validate the body with an **Effect `Schema`**
  (`Schema.decodeUnknownSync` — a deliberate divergence from the repo's "Zod at
  boundaries" rule, for the Effect-native auth module), then
  `await event.context.runEffect(<service effect>)`, then write the resulting
  `Cookie` to the response.
- Cookie writing: the service returns a `Cookie` (a class); the handler appends
  `cookie.serialize()` to the response `Set-Cookie` header — no dependency on
  h3's cookie serializer. Sign-out appends the `createBlank()` cookie
  (`maxAge: 0`, `expires` epoch), which deletes it in the browser.
- Cookie *reading* inside a handler (sign-out needs the current token) uses the
  raw `Cookie` header off the `H3Event` request → `SessionService.readSessionToken`.
- Body `Schema.Struct`s: a fresh `password` constraint for SP1 (min 8, max 128
  — Argon2 handles long inputs; the existing `passwordSchema` in
  `user/mutations.ts` caps at 20 and is too restrictive to reuse), plus
  `email`/`name`.
- Error → HTTP status via a shared mapper keyed on the tagged error's `_tag`:
  `EmailAlreadyRegistered` → 409, `InvalidCredentials` → 401,
  `ActorTypeNotAllowed` → 403, `SessionStoreFailed` → 503,
  `PasswordHashFailed`/`CredentialDbFailed`/`ActorProviderFailed` → 500, an
  Effect `Schema` decode error → 400. The handler `try/catch`es the rejected
  `runEffect` promise (and the sync decode) and runs it through the mapper.
- New files under `src/http/`: `sign-up.ts`, `sign-in.ts`, `sign-out.ts`. All
  cookie name/attribute knowledge lives in `CookieService` (3.3) — handlers
  hold none of it.

---

## 5. Session → `ctx.auth`

`ctx.auth` is populated by the auth module's `graphql.contexts` hook, replacing
the dead `graphql/context-factory.ts` (which is deleted).

### `contexts` contract change (`@czo/kit`)

Today `Module.graphql.contexts` is `(systemContext) => Partial<GraphQLContextMap>`
— **synchronous** — but session resolution is async. SP1 widens it:

```ts
// packages/kit/src/module/contract.ts — error channel is OPEN: a contributor
// may fail (e.g. SessionStoreFailed), and that failure must reach the request.
readonly contexts?: (systemContext: unknown) =>
  Effect.Effect<Partial<GraphQLContextMap>, unknown, never>
```

`makeGraphQLBuilder`'s `buildContext` (`packages/kit/src/graphql/builder.ts`)
already returns an `Effect`; it changes from

```ts
Object.assign({}, ...contexts.map(ctx => ctx(systemContext)))
```

to composing the contributors with `Effect.all` and `yield*`-ing them — and its
own error channel widens from `never` to carry a failed contributor. A failed
`buildContext` makes graphql-yoga reject the request (the desired outcome for
`SessionStoreFailed` — a 503-class error, *not* a silent anonymous downgrade).
The session contributor requires `SessionService`; that service is part of the
app layer (`appLayer = mergeAll(moduleLayers, GraphQLBuilderLayer)`), so the
captured app context satisfies it. Exact `R`/`E` typing — open contract vs.
`buildContext` pre-providing `SessionService` — is finalized in planning.

**Blast radius (verified):** a repo-wide grep found **no module implements
`graphql.contexts` today** — the auth module's `contexts` contributor (§5)
is the first. So the contract change is purely *kit-internal*: only the two
call sites in `@czo/kit` (`buildApp`'s `flatMap` and `makeGraphQLBuilder`)
need updating. No other module to migrate.

### The auth session contributor

- Reads the request's raw `Cookie` header from `systemContext` and extracts the
  token via `SessionService.readSessionToken(header)` (→ `CookieService.parse`).
- No cookie, or token resolves to `null` (absent/expired) →
  `{ auth: { session: null } }` — anonymous, request proceeds.
- Token resolves to a session → `{ auth: { session, user } }`.
- `SessionService.resolve` fails with `SessionStoreFailed` (infra down) → the
  contributor **propagates it**; `buildContext` fails and the request is
  rejected. Infra failure is *never* downgraded to anonymous.

### `AuthContext` typing

`graphql/index.ts`'s `AuthContext` drops its `any` fields for real types
derived from the `sessions` / `users` Drizzle row types:

```ts
interface AuthContext {
  session: ResolvedSession['session'] | null
  user?: ResolvedSession['user']
}
```

---

## 6. Module wiring — `module.ts`

- Compose `PasswordServiceLive`, `CookieServiceLive`, `SessionServiceLive`,
  and the persistence layer into the auth module's `layer` (`SessionService`
  depends on `CookieService`). The `signUp`/`signIn` functions need no layer —
  their `R` is discharged at call time by `runEffect`.
- `http` hook: register the three new handlers, keep the better-auth catch-all.
- `graphql.contexts`: add the session contributor.
- `graphql.authScope`: unchanged (`authScopes` already uses `ctx.runEffect`).

---

## 7. Errors

Tagged errors (`Data.TaggedError`), each doubling as a Pothos error via the
module's `registerError` pattern:

| Error | Raised by | HTTP |
|---|---|---|
| `PasswordHashFailed` | `PasswordService.hash` | 500 |
| `EmailAlreadyRegistered` | `signUp` | 409 |
| `InvalidCredentials` | `signIn` | 401 |
| `ActorTypeNotAllowed` | `signUp` / `signIn` | 403 |
| `ActorProviderFailed` | `signUp` / `signIn` (via `hasActorType`) | 500 |
| `CredentialDbFailed` | `signUp` / `signIn` (`users`/`accounts` DB ops) | 500 |
| `SessionStoreFailed` | `SessionService` — any L2/L3 op | 503 |

`PasswordHashFailed` is reused from `services/user.ts`; `ActorProviderFailed`
already exists in `services/actor.ts`. So SP1 *introduces* only
`EmailAlreadyRegistered`, `InvalidCredentials`, `ActorTypeNotAllowed`,
`CredentialDbFailed` (in `http/credential.ts`) and `SessionStoreFailed` (in
`services/session.ts`). `resolve` returns `null` for an absent/expired session
and fails *only* with `SessionStoreFailed` — never for "no session".

---

## 8. Testing — Testcontainers (new repo standard)

SP1 adopts **Testcontainers** for integration tests; this **replaces** the
`TEST_DATABASE_URL` convention going forward (decided). SP1's spec records the
intent to migrate all module tests to Testcontainers and retire
`TEST_DATABASE_URL`; the actual repo-wide migration of *existing* tests is
tracked separately and is not SP1 work.

| Target | Type | Infra |
|---|---|---|
| `PasswordService` hash/verify (incl. malformed hash, wrong password, salt uniqueness) | unit | none |
| `CookieService` create / createBlank / parse (round-trip, malformed header) | unit | none |
| `SessionService` create / resolve / expiry / revoke / purgeExpired / setCookie / readSessionToken / **infra failure → `SessionStoreFailed`** | integration | Testcontainers Postgres; `Persistence.layerMemory` |
| `signUp` / `signIn` functions (dup email, bad password, actorType reject, no enumeration, **transaction rollback leaves no orphan user**) | integration | Testcontainers Postgres |
| sign-up / sign-in / sign-out handlers (cookie set/clear, status codes incl. 503) | integration | Testcontainers Postgres |
| `contexts` session resolution (cookie → `ctx.auth`, anonymous fallback, **`SessionStoreFailed` → request rejected, not anonymous**) | integration | Testcontainers Postgres |

- Add `@testcontainers/postgresql` (and `@testcontainers/redis` for an optional
  L2 test) as `devDependencies` of `@czo/auth`.
- A shared Testcontainers Postgres setup helper (per-file or per-suite
  container; schema applied via the module's migrations) — location decided in
  planning (likely `packages/kit/src/testing/`).
- Tests follow the project TDD rule: written first (RED) before each
  implementation.

---

## 9. File layout

**New** (`packages/modules/auth/src/`):

```
services/password.ts          PasswordService Tag + make/layer + PasswordHashFailed
services/session.ts           SessionService Tag + make/layer + errors + Persistable key
services/cookie.ts            CookieService Tag + make/layer/layerConfig + Cookie/CookieAttributes
services/events/auth.ts       AuthEvents Tag + AuthEvent union (SignedUp) + make/layer
http/credential.ts            signUp / signIn Effect functions + tagged errors
http/sign-up.ts               POST /api/auth/sign-up handler
http/sign-in.ts               POST /api/auth/sign-in handler
http/sign-out.ts              POST /api/auth/sign-out handler
+ co-located *.test.ts files
```

**Modified:**

```
packages/kit/src/module/contract.ts    contexts hook → returns Effect
packages/kit/src/graphql/builder.ts     buildContext composes Effect contributors
packages/kit/src/testing/…              re-home expectSuccess / expectFailure (was @czo/kit/effect)
docker-compose.dev.yml                  add a redis service
packages/modules/auth/src/module.ts     wire 3 layers + persistence; http routes; contexts hook
packages/modules/auth/src/graphql/index.ts   AuthContext real types
packages/modules/auth/src/services/index.ts  barrel exports
packages/modules/auth/package.json       add @node-rs/argon2 dep + @testcontainers/* devDeps
pnpm-workspace.yaml                      add @node-rs/argon2 catalog entry
```

**Deleted:** `packages/modules/auth/src/graphql/context-factory.ts`.

Per the repo's destructive-refactor convention, files that are deleted or
substantially rewritten (`context-factory.ts`, the `http` hook body in
`module.ts`) are first mirrored into `old/<path>`; `old/` is removed at the end
of implementation.

---

## 10. Out of scope for SP1

- Password reset, email verification, change-password, change-email — dropped
  or deferred.
- Social/OAuth, 2FA/TOTP.
- Organizations, API keys, admin (SP2–SP4).
- Removing `better-auth` or any `layers/better-auth/` file (SP5).
- Migrating *existing* tests to Testcontainers (separate, tracked work).
- A cross-process L1 invalidation channel — accepted limitation; revisit in SP4.
- Scheduling `purgeExpired` (cron/interval) — the method ships in SP1; its
  periodic invocation is a separate follow-up.

---

## 11. Open items for the planning phase

1. Exact `R`/`E` typing for the Effect-returning `contexts` contract — open
   error channel vs. `buildContext` pre-providing `SessionService`; confirm
   `SessionService` is reachable from the app context.
2. `Persistable` key/value schema shape for `PersistedCache` (the `Schema`
   codec for `ResolvedSession`) and how `timeToLive` is derived (including the
   ~30 s value used for a `null` / not-found result).
3. Testcontainers helper location and container lifecycle (per-file vs.
   per-suite) — and how the module's migrations are applied to the container.
4. The `SameSite` value depends on the (undecided) frontend/API origin
   topology — SP1 ships it config-driven with a `lax` default; the deployment
   decision (and any cross-origin CORS-credentials work) is deferred.
