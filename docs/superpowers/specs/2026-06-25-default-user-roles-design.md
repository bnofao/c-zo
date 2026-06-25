# Default User Roles at Creation — Design Spec

**Date:** 2026-06-25
**Status:** Approved (design) — ready for implementation plan
**Scope:** single subsystem (`@czo/auth` user creation)

## Goal

A **configurable list of default roles** assigned to a user at creation when no
explicit role is given. The logic lives in `UserService.create` (single source
of truth); the HTTP `signUp` handler delegates to it. Default roles are
validated against the access registry at boot (fail-fast).

## Why

User creation today is inconsistent and uses a phantom role:

- `UserService.create` defaults to `role: 'user'` — but `'user'` is **not** a
  registered role in any hierarchy (`org:*`, `admin:*`, `api-key:*`, `apps:*`),
  and the default **bypasses** `ensureValidRole`.
- The HTTP `signUp` handler (`http/credential.ts`) sets **no** role → `null`.

So an API-created user gets `'user'`, a self-registered user gets `null`. This
unifies creation on one path with a configurable, validated default.

## Decisions (resolved during brainstorming)

| Decision | Choice |
|----------|--------|
| Default roles source | New `AUTH_DEFAULT_USER_ROLES` (CSV) in `authConfig` → `defaultUserRoles: string[]`, default `[]`. |
| Storage | `users.role` stays a single `text` column; multiple roles stored as CSV (matching the existing `validateRole` join-by-`,` convention). |
| Where applied | Centralized in `UserService.create`; `signUp` **delegates** to `create`. |
| Default when config unset | **`null`** (no role). The `'user'` magic string is removed. |
| Role composition | **Merge (deduped union)** on every role write: the written role = provided role(s) **plus** the configured defaults. Order: provided first, then defaults; duplicates removed. Stored as CSV (or `null` if empty). |
| Which methods | `create` (always merges — defaults even with no explicit role), `setRole` (always merges its arg), `update` (merges **only when** `input.role` is provided — a role-less update leaves `role` untouched). Applies to the initial-admin seed too (defaults `['member']` + `'admin'` → `'admin,member'`). |
| Shared helper | `mergeRoles(provided: string[], defaults: string[]): string[]` (deduped union, provided-first) used by all three methods. Provided roles validated per-call via `ensureValidRole`; defaults validated once at boot. |
| Validation | Reuse `services/utils/validate-roles.ts` (`validateRole`) — do not hand-roll role parsing. Boot check: a default role is invalid iff `validateRole(role, registered) === false`. |
| Validation | **Fail-fast at boot**: each configured default role must exist in the frozen `access.roles`, else boot fails. |
| Transactionality | `UserService.create` becomes transactional (user + credential atomic). |

## Architecture

```
AUTH_DEFAULT_USER_ROLES (CSV env)
   │  Config → string[]  (DefaultUserRolesConfig)
   ├──────────────► User.makeLayer(defaultUserRoles) ──► UserService.create
   │                                                       (applies default when no explicit role)
   └──────────────► auth onStarted (after freeze): validate each ∈ access.roles → fail boot if not

UserService.create  ◄── delegated by ──  http/credential.ts signUp
   (single creation path: existence check → hash → tx{user+credential} → publish)
```

## Components

### 1. Config — shared reader + `authConfig`

- `parseCsvRoles(s: string): string[]` — split on `,`, trim, drop empties.
  Exported from `services/user.ts` (colocated with the consumer) so the config
  reader, the boot validation, and tests all use the same parser. DRY.
- `DefaultUserRolesConfig` — a single shared `Config`/Effect (in `services/user.ts`):
  ```ts
  export const DefaultUserRolesConfig = Config.string('AUTH_DEFAULT_USER_ROLES').pipe(
    Config.withDefault(''),
    Config.map(parseCsvRoles), // '' → [], 'a, b' → ['a','b']
  )
  ```
- In `index.ts` `authConfig`: `const defaultUserRoles = yield* DefaultUserRolesConfig`,
  returned alongside the existing keys. The `onStarted` boot validation reads the
  **same** `DefaultUserRolesConfig`, so index and the validation never diverge.

### 2. `UserService` role writes (create / update / setRole) — `packages/modules/auth/src/services/user.ts`

- **Parametrize the layer:** replace `export const layer = Layer.effect(UserService, make)`
  with `export function makeLayer(defaultUserRoles: ReadonlyArray<string>): Layer.Layer<…>`
  (mirrors `Organization.makeLayer(orgOwnerRole)`). `make` closes over
  `defaultUserRoles`. Keep a back-compat `export const layer = makeLayer([])`
  only if an existing caller needs the no-arg form (tests can call `makeLayer([...])`).
- **Shared merge helper** (pure, exported):
  ```ts
  export function mergeRoles(provided: ReadonlyArray<string>, defaults: ReadonlyArray<string>): string[] {
    return [...new Set([...provided, ...defaults])]   // provided first, deduped
  }
  ```
- **`create`** — provided may be empty; result is defaults (or `null`):
  ```ts
  const provided = input.role ? parseCsvRoles(yield* ensureValidRole(input.role)) : []
  const merged = mergeRoles(provided, defaultUserRoles)
  const role = merged.length > 0 ? merged.join(',') : null   // nullable; NO '?? user'
  ```
- **`setRole`** — always merges its (required) arg with the defaults:
  ```ts
  const provided = parseCsvRoles(yield* ensureValidRole(role))
  const newRole = mergeRoles(provided, defaultUserRoles).join(',')   // non-empty
  // updateUserRow(id, { role: newRole }); event newRole: newRole
  ```
- **`update`** — merges only when a role is provided; otherwise leaves it untouched:
  ```ts
  let role: string | null | undefined           // undefined ⇒ updateUserRow skips it
  if (input.role) {
    const provided = parseCsvRoles(yield* ensureValidRole(input.role))
    const merged = mergeRoles(provided, defaultUserRoles)
    role = merged.length > 0 ? merged.join(',') : null
  }
  // updateUserRow(id, { ...input, role })
  ```
  Provided roles validated per-call (`ensureValidRole`); defaults trusted (boot-validated).
- **Transactional creation** (fixes partial-state / orphan user):
  ```
  existence check (→ UserAlreadyExists)
  if password: hash (→ CredentialLinkFailed on failure)   // before tx, keep tx short
  tx {
    insert user (role, emailVerified)
    if password: insertCredential(tx, user.id, hashed)
  }
  publish UserCreated (forkDetach, post-commit)
  return user
  ```
  Use `db.transaction(tx => …)`; `insertCredential` already accepts a tx/db
  handle. The `UserCreated` publish moves to AFTER the transaction commits.

### 3. `signUp` delegates — `packages/modules/auth/src/http/credential.ts`

- Replace the manual `password.hash` + `db.transaction(insert user + insertCredential)`
  with a call to `UserService.create({ name, email, password })`.
- Map `UserAlreadyExists → EmailAlreadyRegistered({ email })` via `Effect.catchTag`.
  (Create's existence check runs before hashing, so the "fail before the
  expensive Argon2 hash on a taken email" property is preserved.)
- Map create's remaining errors into `signUp`'s `CredentialError` channel:
  `CredentialLinkFailed`/`PasswordHashFailed`/`UserDbFailed` → `CredentialDbFailed`;
  `InvalidRole` cannot occur (no explicit role; defaults pre-validated) but must
  be handled for types → treat as `CredentialDbFailed`.
- Add `UserService` to `signUp`'s requirements (`R` channel); keep
  `Password`/`Session`/`AuthActorService`/`DrizzleDb`/`AuthEvents` for the
  session + event steps. Drop the now-unused direct `users` insert / local hash.
- **Unchanged:** `assertActorType`, `session.create`, `setCookie`, and the
  post-commit `SignedUp` publish (it drives `account.onSignedUp` → verification
  email). The added `UserCreated` event from `create` has **no subscriber**
  (only `UserBanned`/`UserRoleChanged` are consumed) → harmless.

### 4. Boot validation — `packages/modules/auth/src/index.ts` (`onStarted`)

- After `access.freeze` (registry final) and before the initial-admin seed,
  via the `assertDefaultUserRolesValid` helper which **reuses `validateRole`**
  (no hand-rolled parsing):
  ```ts
  // assertDefaultUserRolesValid(defaultUserRoles, registered):
  const invalid = defaultUserRoles.filter(r => validateRole(r, registered) === false)
  if (invalid.length)
    yield* Effect.fail(new InvalidDefaultUserRoles({ roles: invalid }))
  ```
  This is a **propagating** failure (NOT wrapped in the seed's `catchCause`), so
  an invalid config aborts boot with a clear message. `defaultUserRoles` is read
  in `onStarted` the same way the seed reads its config (via the shared
  `DefaultUserRolesConfig` Effect, so index's `authConfig` and `onStarted` agree).
- `InvalidDefaultUserRoles` — a `Data.TaggedError` in `user.ts` (or `index.ts`)
  with a message listing the offending roles.

## Data flow

1. Boot: `authConfig` reads `AUTH_DEFAULT_USER_ROLES` → `User.makeLayer(defaultUserRoles)`.
   `onStarted` validates the list against the frozen registry (fail-fast).
2. `signUp` / admin `createUser` / admin seed → `UserService.create`:
   - stored role = deduped union of any explicit role(s) (validated) + the
     configured defaults (CSV), or `null` if both are empty.
3. GraphQL `User.role` field keeps its display fallback `u.role ?? 'user'`
   (`schema/user/types.ts:57`) — API consumers still see `'user'` for a null
   stored role. (Presentation only; out of scope to change.)

## Error handling

| Site | Behavior |
|------|----------|
| Explicit `input.role` invalid | `InvalidRole` (unchanged). |
| Configured default role invalid | `InvalidDefaultUserRoles` at boot → **boot aborts**. |
| `create` credential/db failure | rolls back the transaction (no orphan user); surfaces `CredentialLinkFailed`/`UserDbFailed`. |
| `signUp` on taken email | `create` → `UserAlreadyExists` → mapped to `EmailAlreadyRegistered`. |

## Testing

- **`parseCsvRoles`** unit: `''→[]`, `'a'→['a']`, `'a, b ,'→['a','b']`.
- **`mergeRoles`** unit: `(['admin'],['m','v'])→['admin','m','v']`; dedup `(['m'],['m'])→['m']`; `([],['x'])→['x']`; `([],[])→[]`.
- **`assertDefaultUserRolesValid`** unit: passes when all registered; fails `InvalidDefaultUserRoles` listing only the unregistered ones (uses `validateRole`).
- **`UserService` create/update/setRole** integration (`AuthPostgresLayer` + `seededAccessLayer`):
  - `create`: no role + `makeLayer([])` → `role === null`.
  - `create`: no role + `makeLayer(['admin:manager','admin:viewer'])` → CSV `'admin:manager,admin:viewer'`.
  - `create`: explicit + defaults **merge** → `'admin,admin:manager,admin:viewer'`; dedup overlap → no duplicate.
  - `setRole`: `makeLayer(['admin:viewer'])`, `setRole(id,'admin')` → `'admin,admin:viewer'` (defaults re-merged).
  - `update`: `makeLayer(['admin:viewer'])`, `update(id,{role:'admin'})` → `'admin,admin:viewer'`; `update(id,{name:'x'})` (no role) → role **unchanged**.
  - explicit role validated (`InvalidRole` on bogus explicit, via `ensureValidRole`).
  - **atomicity:** a forced credential-insert failure leaves **no** user row.
- **`signUp`** integration: delegates → user + `credential` account row created;
  default role applied; duplicate email → `EmailAlreadyRegistered`; `SignedUp`
  still published (existing signUp event test stays green).
- **Boot validation:** `makeLayer`/onStarted with an invalid default role →
  validation fails (assert `InvalidDefaultUserRoles`).

## Out of scope (YAGNI)

- Changing the GraphQL `User.role` display fallback (`?? 'user'`).
- Per-organization membership default roles (this is the platform `users.role`).
- Backfilling existing users' roles.
- A general role-assignment/admin UI.

## Blast radius (verified)

- Only two role-related `'user'` strings exist: `create`'s `?? 'user'` (removed)
  and the GraphQL display fallback (kept). All other `'user'` occurrences are
  unrelated (`actorType`, `resource: 'user'`, api-key `reference`).
- Role-writing methods affected: `create`, `update`, `setRole` (all re-merge
  defaults). Callers: admin `createUser`/`updateUser`/`setUserRole` mutations
  (inherit the merge), initial-admin seed (now `'admin'` + defaults).
- `userCounts` buckets by `'admin'`, never `'user'` → unaffected (a user whose
  role is `'admin,member'` still matches `eq(role,'admin')`? NO — exact match.
  See note). **Note:** `userCounts.admins` uses `eq(users.role, 'admin')` (exact
  string). If defaults are configured, an admin's stored role becomes
  `'admin,member'` and would no longer match. With **no** defaults configured
  (the default state) admins stay `'admin'` and the count is unaffected. If a
  deployment configures defaults, the admins count query should switch to a
  CSV-contains match — flagged as a follow-up, out of scope here.
- Making `create` transactional changes all callers' internals (improvement;
  no API change).

## Files touched

- **Modify:** `packages/modules/auth/src/services/user.ts` — `parseCsvRoles`,
  `mergeRoles`, `DefaultUserRolesConfig`, `InvalidDefaultUserRoles`,
  `assertDefaultUserRolesValid` (via `validateRole`), `makeLayer(defaultUserRoles)`,
  default-merge in `create` + `update` + `setRole`, transactional `create`.
- **Modify:** `packages/modules/auth/src/index.ts` — `authConfig.defaultUserRoles`,
  `User.makeLayer(cfg.defaultUserRoles)`, `onStarted` boot validation.
- **Modify:** `packages/modules/auth/src/http/credential.ts` — `signUp` delegates
  to `UserService.create`; error mapping; deps.
- **New tests:** `user.roles.test.ts` (parseCsvRoles + mergeRoles + assertDefaultUserRolesValid units);
  `user.default-roles.integration.test.ts` (create/update/setRole merge + dedup).
  Existing `credential.test.ts` signUp tests must stay green.
- **Modify (if present):** any test asserting a created user's `role === 'user'` (none found).
