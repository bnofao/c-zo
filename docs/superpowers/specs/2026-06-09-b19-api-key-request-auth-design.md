# B19 — Sub-project (A): API-key request authentication — Design

**Date:** 2026-06-09
**Backlog:** B19 (Storefront access via API keys). This spec covers **sub-project (A)** only — the reusable auth prerequisite. Sub-project (B) (gating @czo/product storefront reads) is a separate, thin follow-up that depends on (A).

## Goal

Let an **API key** authenticate a GraphQL request and satisfy the `permission` auth scope — exactly as a session does today, but via the key's own `permissions` grid. This is the missing prerequisite: request auth and the `permission` scope are **session-only** today, so a key can authorize nothing.

A storefront's server (e.g. the Next.js BFF) holds an org-owned key in a server-side env var and makes catalog reads with it; (B) will later gate those reads on a concrete permission (e.g. `channel:read`).

## Decisions (settled during brainstorming)

1. **Reuse, don't add.** The publishable key is just a normal **secret** api-key — an `apikeys` row, org-owned, carrying a `permissions` grid. **No `publishable` type, no new table, no new auth scope.** The browser-safety concern that would justify a dedicated "publishable" type does not apply: the key lives **server-side** in the front's env (no `NEXT_PUBLIC_` prefix), never in the browser bundle.
2. **Reuse `ApiKeyService.verify`** (hash lookup + enabled + expiry) and `AccessService.authorize` (grid check) — both already exist.
3. **Reuse the single auth context contributor.** The kit contract allows one `graphql.contexts` contributor per module; auth already has it. We extend it rather than add a second.
4. **The gate permission is (B)'s call.** (A) makes the `permission` scope satisfiable by a key generically; whether storefront reads gate on `channel:read` vs `product:read` (and the published-in-channel filter) is decided when designing (B).

## v1 scope (YAGNI)

- **Org-owned keys** satisfying **org-scoped** `permission` checks via their `permissions` grid.
- **Out of scope (deferred):** user-owned keys; global / no-organization `permission` checks; per-channel (per-instance) scoping of a key (the `permissions` grid is `resource:action`, not `resource:action:instanceId`, so `channel:read` means "all the org's channels"); client-side key exposure (would reintroduce a publishable-type concern).

## Architecture

No DB migration. Three auth GraphQL touch-points + tests.

### 1. Context contributor — `packages/modules/auth/src/graphql/session-context.ts`

Rename `makeSessionContextContributor` → `makeAuthContextContributor` (it now resolves both auth methods). Logic:

1. Resolve the session token (Bearer / cookie) exactly as today. If it yields an authenticated session → `ctx.auth = { session, user }` and **return** (session wins; the key header is not consulted).
2. Else, read the `x-api-key` request header. If present → `ApiKeyService.verify(plainKey)`:
   - **success** → `ctx.auth = { session: null, apiKey: <principal> }` where `<principal> = { id, organizationId, permissions }` and `organizationId = reference === 'organization' ? referenceId : null`.
   - **failure** (`InvalidApiKey` / `KeyDisabled` / `KeyExpired` / rate-limit / etc.) → treat as **anonymous** (`{ session: null }`), mirroring the session contributor's "absent/expired → anonymous". Public fields still resolve; gated fields deny cleanly. A genuine infra failure (`DbFailed`) propagates (the request fails), matching how `SessionStoreFailed` is already propagated.

`verify` is called **without** the `permissions` option here — the contributor only resolves *which* key it is; per-field authorization happens in the `permission` resolver (each gated field has its own `resource:actions`).

### 2. Context type — `packages/modules/auth/src/graphql/index.ts`

```ts
export interface AuthContext {
  session: ResolvedSession['session'] | null
  user?: ResolvedSession['user']
  apiKey?: {
    id: number
    organizationId: number | null   // the owner org, or null for a user-owned key
    permissions: Record<string, string[]>
  }
}
```

### 3. `permission` scope resolver — `packages/modules/auth/src/graphql/scopes.ts`

The `permission` resolver gains an api-key branch. Session-user path is unchanged. New behaviour when there is **no** session user but `ctx.auth.apiKey` is present:

- **Org-scoped check** (`organization` argument supplied): authorize iff
  `apiKey.organizationId != null && apiKey.organizationId === organization`
  **and** `AccessService.authorize(apiKey.permissions, { [resource]: actions })` is true.
  A key for another org → deny (no cross-org leak).
- **No-organization check** (global): **deny** in v1 (org-owned keys do not satisfy global checks).

The existing `apiKeyOwner` scope (key *management* authz) is untouched — it governs who may create/update/delete keys; this change governs a key *acting* as a request principal.

### Data flow

```
request
  → makeAuthContextContributor
      → session token? → ctx.auth = { session, user }            (session path)
      → else x-api-key header? → verify → ctx.auth = { session: null, apiKey }
      → else ctx.auth = { session: null }                        (anonymous)
  → resolver field with authScopes: { permission: { resource, actions, organization } }
      → session user present → role check (today)
      → else apiKey present → org match + grid authorize          (new)
      → else deny
```

## Error handling

- Bad/disabled/expired key → anonymous (no hard error); consistent with the session path and avoids leaking key state.
- `DbFailed` during verify → propagate (request fails), like `SessionStoreFailed`.
- Cross-org key → the `permission` resolver denies (returns false), surfaced as the normal authz denial for that field.

## Security considerations

- **Cross-org isolation:** a key only ever satisfies `permission` checks for its own owner org.
- **Server-side key assumption (documented):** the key is expected to live in the front's **server** env. If the front ever performs catalog reads **client-side**, the key would be exposed and this model must be revisited (reintroduce a publishable/low-trust key notion). Recorded so a future change doesn't silently expose it.
- **No privilege escalation:** a key authorizes strictly via its own `permissions` grid; it never inherits an owner user's roles (org-owned keys have no user) and cannot satisfy global checks in v1.
- **Precedence:** session wins over a key header, so an authenticated admin is never silently downgraded to a key's narrower grid.

## Interaction with `ctx.auth.user` and the `auth` scope

Most resolvers and the `auth` scope read `ctx.auth.user`. A key principal **does not populate `ctx.auth.user`** — faking a user would let the key act with that user's identity everywhere, a privilege-escalation smell. A key empowers **only** the `permission` scope (org-scoped, via its grid). The consequences are self-consistent and safe:

- **`auth` scope stays session-only** (`auth = !!ctx.auth.user`). A key does **not** satisfy `{ auth: true }`. This is the guardrail: the fields gated `{ auth: true }` are precisely the ones whose bodies need the acting user, so keys can't reach them.
- **`apiKeyOwner` scope (key management) is untouched** — session-only; a key cannot manage keys.

Two resolver patterns already exist in the codebase, **both safe** when the actor is a key (no user):

1. **Mandatory user** — the resolver throws if there is no user. Example: `organization`'s `organizations` list resolver does `if (!authUser) throw new UnauthenticatedError()`. A key hitting it is already denied at the `{ auth: true }` gate; even past a gate, the throw is clean.
2. **Optional user (attribution)** — the resolver reads the user optionally and degrades. Example: `@czo/inventory` `createReservation` does `const createdBy = ctx.auth?.user?.id != null ? Number(ctx.auth.user.id) : undefined`. A key (no user) → `createdBy = undefined`; the operation proceeds **without crashing**, just without a creator attribution.

**Rule going forward:** read resolvers scoped by an **explicit arg** (org / channel id) work for keys (this is exactly the storefront read shape in sub-project B); resolvers that need *the acting user* must read `ctx.auth.user` defensively (throw if mandatory, default if optional) — most already do.

**What (A) does about it — harden the user-actor resolvers.** A handful of resolvers read the acting user **non-defensively** via `ctx.auth!.user!.id` (and one reads `ctx.auth!.session!.token`), relying on a now-stale comment "the permission/auth authScope rejects anonymous so `ctx.auth!.user!` is sound". B19 invalidates that reasoning for the `permission`-gated ones. (A) therefore:

- Adds `requireUserId(ctx): number` and `requireSessionToken(ctx): string` (new `packages/modules/auth/src/graphql/require-user.ts`) that `throw new UnauthenticatedError()` when the session user / session is absent, else return the value. The acting identity is **server-derived** (never a client-supplied input — that would let a caller forge the actor).
- Replaces the **non-defensive reads** with these helpers and removes the stale "is sound" comments. Full site list (audited):
  - **`permission`-gated (the 2 B19 actually breaks):** `organization/mutations.ts` `inviteToOrganization` (inviterId); `impersonation/mutations.ts` `startImpersonation` (adminId).
  - **`{ auth: true }`-gated (safe today; hardened for defense-in-depth + to drop the fragile `!`):** `organization/mutations.ts` `acceptInvitation`, `rejectInvitation`, two sites in `setActiveOrganization` (userId + `requireSessionToken`); `account/mutations.ts` four self-service flows.

After this, a key (no user) reaching any user-actor resolver gets a clean `UnauthenticatedError`, never a crash, and never acts as a phantom user.

**v1 operational invariant:** keys are granted only narrow **read** grids on arg-scoped resolvers (a storefront key carries `channel:read`, never `inventory:update` / `user:create`), so they never reach a user-actor write in the first place — the hardening above is the code-level backstop that makes this safe even if a key is mis-granted.

**Follow-up (not v1):** if a key is ever granted a write permission, writes it makes record `createdBy = null` (no user). If key-initiated writes need traceability, capture the key identity separately (e.g. a `createdByApiKeyId`) — out of scope here.

## Testing

E2E in `packages/modules/auth/src/e2e/` via `bootTestApp` + the api-key harness (create returns the one-time plaintext, per B17):

1. **Grant:** org-owned key with `{ channel: ['read'] }` → request with `x-api-key` header on a field gated `permission(channel, read, org)` → **allowed**.
2. **Cross-org deny:** the same key against a *different* org's gated field → **denied**.
3. **Grid deny:** key without the required action (e.g. only `product:read`) on a `channel:read`-gated field → **denied**.
4. **Disabled/expired key** → anonymous: a public field resolves, a gated field denies.
5. **No header** → anonymous.
6. **Session + header** → the session principal is used (precedence).
7. **(unit)** `permission` resolver: api-key branch — org match + grid combinations.

A small gated test field may be added in the auth test schema if no existing field exercises `permission(organization)` reachably by a key (verify against the existing organization/api-key queries first; reuse if possible).

## Out of scope / follow-ups

- **Sub-project (B):** gate @czo/product storefront reads on the chosen permission (`channel:read` recommended, with a published-in-channel filter) — its own spec/plan.
- User-owned keys as request principals; global (no-org) `permission` satisfaction.
- Per-channel (instance-level) key scoping — needs the permission model to express `resource:action:instanceId`.
- Rate-limiting per key on the GraphQL path (the `apikeys` table has rate-limit columns; wiring them into the contributor is a separate concern).
