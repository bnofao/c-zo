# B19 (A) — API-key request authentication — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **COMMIT POLICY (overrides every per-task "Commit" step):** stage with `git add` only; **one** commit at the very end after explicit user review. Never commit autonomously. Branch first (`feat/b19-api-key-request-auth`) — do not work on `main`.

**Goal:** Let an org-owned API key authenticate a GraphQL request (via an `x-api-key` header) and satisfy the `permission` auth scope through the key's own `permissions` grid — the missing prerequisite that today makes request auth and the `permission` scope session-only.

**Architecture:** Extend auth's single GraphQL context contributor to resolve an `x-api-key` header into a key principal on `ctx.auth.apiKey` (reusing `ApiKeyService.verify`), and extend the `permission` scope resolver to authorize an org-owned key (org match + `AccessService.authorize` over the key's grid). No DB migration, no new table/type/scope. Session always takes precedence; v1 supports org-owned keys satisfying org-scoped checks only.

**Tech Stack:** TypeScript, Effect-TS, Pothos GraphQL, `@czo/auth` services (`SessionService`, `ApiKeyService`, `AccessService`, `OrganizationService`, `UserService`), Testcontainers via `bootTestApp`/`bootAuthApp`.

**Spec:** `docs/superpowers/specs/2026-06-09-b19-api-key-request-auth-design.md`

---

## File Structure

- **Modify** `packages/modules/auth/src/graphql/index.ts` — add `apiKey?` to the `AuthContext` interface; rename the contributor import + usage.
- **Modify** `packages/modules/auth/src/graphql/session-context.ts` — rename `makeSessionContextContributor` → `makeAuthContextContributor`; add the `x-api-key` branch.
- **Modify** `packages/modules/auth/src/graphql/scopes.ts` — add the api-key branch to the `permission` resolver.
- **Create** `packages/modules/auth/src/graphql/require-user.ts` — `requireUserId(ctx)` / `requireSessionToken(ctx)` guards (throw `UnauthenticatedError` when the session user/session is absent).
- **Modify** `packages/modules/auth/src/graphql/schema/organization/mutations.ts` and `.../impersonation/mutations.ts` and `.../account/mutations.ts` — replace non-defensive `ctx.auth!.user!.id` / `ctx.auth!.session!.token` reads with the guards; drop the stale "is sound" comments (Task 2).
- **Create** `packages/modules/auth/src/e2e/api-key-auth.e2e.test.ts` — E2E proving grant / cross-org deny / grid deny / expired→anonymous / no-key→anonymous / session precedence.

No other files change. `ApiKeyService.create` already accepts `permissions`; `AccessService.authorize(granted, required)` already exists; the `organization(id)` query is already gated on `{ permission: { resource: 'organization', actions: ['read'], organization } }` (our E2E target).

**Design note — `ctx.auth.user` and the `auth` scope (do NOT change them):** a key principal deliberately does **not** populate `ctx.auth.user`, and the `auth` scope stays session-only (`!!ctx.auth.user`). A key empowers **only** the `permission` scope. This is correct and safe: `{ auth: true }`-gated fields (whose bodies read the acting user) remain unreachable by keys, and resolvers that read `ctx.auth.user` defensively already degrade cleanly (e.g. `@czo/inventory` `createReservation` → `createdBy = undefined`; `organizations` list → `throw UnauthenticatedError`). See the spec section "Interaction with `ctx.auth.user` and the `auth` scope". This plan does not touch the `auth` scope or any resolver body.

---

### Task 1: Add `apiKey` to `AuthContext`

**Files:**
- Modify: `packages/modules/auth/src/graphql/index.ts:12-15`

- [ ] **Step 1: Extend the `AuthContext` interface**

Replace the existing interface (currently lines 12-15):

```ts
export interface AuthContext {
  session: ResolvedSession['session'] | null
  user?: ResolvedSession['user']
}
```

with:

```ts
export interface AuthContext {
  session: ResolvedSession['session'] | null
  user?: ResolvedSession['user']
  /**
   * Present when the request authenticated via an `x-api-key` header instead of
   * a session (mutually exclusive with an authenticated `user`). Carries the
   * key's owner org and its `permissions` grid; the `permission` scope
   * authorizes against this. `organizationId` is null for a user-owned key.
   */
  apiKey?: {
    id: number
    organizationId: number | null
    permissions: Record<string, string[]>
  }
}
```

- [ ] **Step 2: Type-check (will still compile; field is additive + optional)**

Run: `pnpm --filter @czo/auth check-types`
Expected: PASS.

---

### Task 2: Write the failing E2E

**Files:**
- Create: `packages/modules/auth/src/e2e/api-key-auth.e2e.test.ts`

- [ ] **Step 1: Write the test**

```ts
// E2E: an org-owned API key authenticates a request via the `x-api-key` header
// and satisfies the `permission` scope through its own `permissions` grid.
// Target field: `organization(id)` is gated on
// `{ permission: { resource: 'organization', actions: ['read'], organization } }`.

import type { AuthHarness } from './harness'
import { Effect } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiKeyService } from '../services/api-key'
import { bootAuthApp } from './harness'

const GRAPHQL_URL = 'http://localhost/graphql'
const ORG_READ = `query ($id: ID!) { organization(id: $id) { id slug } }`

// POST a GraphQL op with an optional `x-api-key` header and/or session bearer.
async function gql(
  app: AuthHarness['app'],
  query: string,
  variables: Record<string, unknown>,
  creds: { apiKey?: string, token?: string } = {},
): Promise<{ data?: any, errors?: any[] }> {
  const res = await app.fetch(new Request(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(creds.apiKey ? { 'x-api-key': creds.apiKey } : {}),
      ...(creds.token ? { authorization: `Bearer ${creds.token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  }))
  return res.json() as Promise<{ data?: any, errors?: any[] }>
}

// Seed an org-owned key with the given grid; returns the one-time plaintext.
// `rateLimitEnabled: false` avoids the per-key cap across requests.
// `expiresIn` (seconds) < 0 mints an already-expired key.
function seedOrgKey(
  h: AuthHarness,
  referenceId: number,
  permissions: Record<string, string[]>,
  opts: { expiresIn?: number } = {},
): Promise<string> {
  return h.app.runEffect(Effect.gen(function* () {
    const svc = yield* ApiKeyService
    const { plain } = yield* svc.create(
      {
        name: 'sf',
        group: 'default',
        prefix: 'sf',
        referenceId,
        permissions,
        rateLimitEnabled: false,
        ...(opts.expiresIn !== undefined ? { expiresIn: opts.expiresIn } : {}),
      },
      { reference: 'organization' },
    )
    return plain
  }))
}

describe('api-key request auth (E2E)', () => {
  let h: AuthHarness
  let orgAGid: string
  let orgANum: number
  let adminToken: string  // org-A owner session
  let keyA: string        // org-A key, organization:read
  let keyB: string        // org-B key, organization:read (cross-org)
  let wrongGridKeyA: string // org-A key, product:read only (no organization:read)
  let expiredKeyA: string // org-A key, already expired

  beforeAll(async () => {
    h = await bootAuthApp()
    const admin = await h.signUp('sf-admin@ex.com', 'Admin', 'password123!')
    adminToken = admin.token
    const a = await h.createOrganization(admin.token, 'Acme', 'acme', admin.ip)
    orgAGid = a.orgGlobalId
    orgANum = a.orgNumericId

    const bAdmin = await h.signUp('sf-b@ex.com', 'B', 'password123!')
    const b = await h.createOrganization(bAdmin.token, 'Bravo', 'bravo', bAdmin.ip)

    keyA = await seedOrgKey(h, orgANum, { organization: ['read'] })
    keyB = await seedOrgKey(h, b.orgNumericId, { organization: ['read'] })
    wrongGridKeyA = await seedOrgKey(h, orgANum, { product: ['read'] })
    expiredKeyA = await seedOrgKey(h, orgANum, { organization: ['read'] }, { expiresIn: -3600 })
  }, 120_000)

  afterAll(() => h.close())

  it('org-owned key with organization:read reads its own org (no session)', async () => {
    const res = await gql(h.app, ORG_READ, { id: orgAGid }, { apiKey: keyA })
    expect(res.errors).toBeUndefined()
    expect(res.data.organization.id).toBe(orgAGid)
  })

  it('cross-org: an org-B key cannot read org A', async () => {
    const res = await gql(h.app, ORG_READ, { id: orgAGid }, { apiKey: keyB })
    expect(res.data?.organization ?? null).toBeNull()
  })

  it('grid deny: an org-A key without organization:read is denied', async () => {
    const res = await gql(h.app, ORG_READ, { id: orgAGid }, { apiKey: wrongGridKeyA })
    expect(res.data?.organization ?? null).toBeNull()
  })

  it('expired key → anonymous → denied', async () => {
    const res = await gql(h.app, ORG_READ, { id: orgAGid }, { apiKey: expiredKeyA })
    expect(res.data?.organization ?? null).toBeNull()
  })

  it('no key → anonymous → denied', async () => {
    const res = await gql(h.app, ORG_READ, { id: orgAGid })
    expect(res.data?.organization ?? null).toBeNull()
  })

  it('precedence: a valid session wins over a (cross-org) key header', async () => {
    // The org-A owner reads org A with their session AND a cross-org key header;
    // the session must be used (success), not the key (which would deny).
    const res = await gql(h.app, ORG_READ, { id: orgAGid }, { token: adminToken, apiKey: keyB })
    expect(res.errors).toBeUndefined()
    expect(res.data.organization.id).toBe(orgAGid)
  })
})
```

- [ ] **Step 2: Run it — expect the first test to FAIL**

Run: `pnpm --filter @czo/auth test src/e2e/api-key-auth.e2e.test.ts`
Expected: the first test (`reads its own org`) **FAILS** — the contributor ignores `x-api-key`, so the request is anonymous and `organization` resolves to `null` (its `permission` scope denies). The three deny tests already pass (anonymous is denied) but the suite is red overall.

---

### Task 3: Resolve `x-api-key` in the context contributor

**Files:**
- Modify: `packages/modules/auth/src/graphql/session-context.ts` (full rewrite below)
- Modify: `packages/modules/auth/src/graphql/index.ts:19` and `:211` (import + usage rename)

- [ ] **Step 1: Rewrite `session-context.ts`**

Replace the whole file with:

```ts
import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { ApiKeyService } from '../services/api-key'
import * as Session from '../services/session'

/**
 * The `graphql.contexts` contributor: resolve the request into `ctx.auth`.
 *
 * 1. Session token (`Authorization: Bearer` header, else session cookie) →
 *    `{ session, user }`. Rotation (impersonation walk-up) rewrites the cookie
 *    and, for Bearer clients, the `X-Session-Token` response header. An infra
 *    failure (`SessionStoreFailed`) propagates — the request fails.
 * 2. No authenticated session AND an `x-api-key` header → `ApiKeyService.verify`
 *    → `{ session: null, apiKey }`. A bad key (invalid/disabled/expired/…) is
 *    treated as anonymous, mirroring the session path; a `DbFailed` propagates.
 * 3. Otherwise → anonymous (`{ session: null }`).
 *
 * Session always wins: the api-key header is consulted only when no session
 * resolves, so an authenticated actor is never downgraded to a key's grid.
 */
export function makeAuthContextContributor() {
  return (
    systemContext: unknown,
  ): Effect.Effect<Partial<GraphQLContextMap>, unknown, Session.SessionService | ApiKeyService> =>
    Effect.gen(function* () {
      const session = yield* Session.SessionService
      const ctx = systemContext as {
        request?: Request
        setCookie?: (serialized: string) => void
        setHeader?: (name: string, value: string) => void
      }

      // ── 1. Session (Bearer header > cookie) ──────────────────────────────
      const fromHeader = session.readBearerToken(ctx.request?.headers.get('authorization'))
      const token = fromHeader ?? session.readSessionToken(ctx.request?.headers.get('cookie') ?? '')
      if (token) {
        const resolved = yield* session.resolve(token)
        if (resolved) {
          if (resolved.session.token !== token) {
            if (ctx.setCookie)
              ctx.setCookie(session.setCookie(resolved.session.token).serialize())
            if (fromHeader != null && ctx.setHeader)
              ctx.setHeader('X-Session-Token', resolved.session.token)
          }
          return { auth: resolved }
        }
      }

      // ── 2. API key (only when no session resolved) ───────────────────────
      const plainKey = ctx.request?.headers.get('x-api-key')
      if (plainKey) {
        const apiKeys = yield* ApiKeyService
        const principal = yield* apiKeys.verify(plainKey).pipe(
          Effect.map(key => ({
            id: key.id,
            organizationId: key.reference === 'organization' ? key.referenceId : null,
            permissions: (key.permissions ?? {}) as Record<string, string[]>,
          })),
          // Auth failures → anonymous. A genuine infra failure (DbFailed) propagates.
          Effect.catchIf(
            e => (e as { _tag?: string })._tag !== 'DbFailed',
            () => Effect.succeed(null),
          ),
        )
        if (principal)
          return { auth: { session: null, apiKey: principal } }
      }

      // ── 3. Anonymous ─────────────────────────────────────────────────────
      return { auth: { session: null } }
    })
}
```

- [ ] **Step 2: Update the wiring in `index.ts`**

At line 19, change the import:

```ts
import { makeAuthContextContributor } from './graphql/session-context'
```

At line ~211, change the usage:

```ts
      contexts: makeAuthContextContributor(),
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @czo/auth check-types`
Expected: PASS. (The contributor's `R` now includes `ApiKeyService`; the auth module layer already provides it, so `buildContext` is satisfied.)

- [ ] **Step 4: Run the E2E — still expect the first test to FAIL**

Run: `pnpm --filter @czo/auth test src/e2e/api-key-auth.e2e.test.ts`
Expected: the first test **still FAILS** — `ctx.auth.apiKey` is now set, but the `permission` resolver still returns `false` when there is no session user. Fixed in Task 4.

---

### Task 4: Authorize the api-key principal in the `permission` scope

**Files:**
- Modify: `packages/modules/auth/src/graphql/scopes.ts:3-44`

- [ ] **Step 1: Add the `AccessService` import**

At the top (alongside the existing service imports, lines 3-5), add:

```ts
import { AccessService } from '../services/access'
```

- [ ] **Step 2: Replace the `permission` resolver (lines 10-44)**

Replace the existing `permission: async (...) => { ... }` block with:

```ts
    permission: async (
      { resource, actions, organization }:
      { resource: string, actions: string[], organization?: number },
    ) => {
      const userId = ctx?.auth?.user?.id
      const apiKey = ctx?.auth?.apiKey
      if (!userId && !apiKey)
        return false

      return ctx.runEffect(
        Effect.gen(function* () {
          // ── API-key principal (no session user). v1: org-owned keys satisfy
          //    org-scoped checks only; authorize via the key's own grid. ──────
          if (!userId && apiKey) {
            if (organization == null)
              return false
            if (apiKey.organizationId == null || apiKey.organizationId !== organization)
              return false
            const access = yield* AccessService
            return yield* access.authorize(apiKey.permissions, { [resource]: actions })
          }

          // ── Session user (unchanged behaviour) ──────────────────────────
          if (organization != null) {
            // Org-scoped: authorize against the TARGET org using the actor's
            // member role IN that org. Non-member / roleless member → deny.
            const orgSvc = yield* OrganizationService
            const membership = yield* orgSvc.findFirstMember(organization, {
              where: { userId: Number(userId) },
            }).pipe(Effect.catchTag('MemberNotFound', () => Effect.succeed(null)))
            if (!membership?.role)
              return false
            const orgPerm = yield* OrganizationService
            return yield* orgPerm.hasPermission({
              orgId: String(organization),
              role: membership.role,
              permissions: { [resource]: actions },
            })
          }
          // No org context — session-based check via UserService.
          const users = yield* UserService
          return yield* users.hasPermission({
            role: ctx.auth?.user?.role ?? undefined,
            permissions: { [resource]: actions },
          })
        }),
      )
    },
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @czo/auth check-types`
Expected: PASS.

- [ ] **Step 4: Run the E2E — expect ALL tests to PASS**

Run: `pnpm --filter @czo/auth test src/e2e/api-key-auth.e2e.test.ts`
Expected: **6 passed** — grant works; cross-org, grid-deny, expired, and no-key are denied; session precedence holds.

---

### Task 5: Harden user-actor resolvers (`requireUserId` / `requireSessionToken`)

Several resolvers read the acting user/session **non-defensively** (`ctx.auth!.user!.id`, `ctx.auth!.session!.token`) under the now-stale assumption "permission/auth gate ⇒ a session user exists". B19 makes a key satisfy `permission` with **no** session user, so the two `permission`-gated sites would crash. Replace all such reads with guards that throw `UnauthenticatedError` (server-derived actor; never a client input).

**Files:**
- Create: `packages/modules/auth/src/graphql/require-user.ts`
- Modify: `packages/modules/auth/src/graphql/schema/organization/mutations.ts` (5 sites + comments)
- Modify: `packages/modules/auth/src/graphql/schema/impersonation/mutations.ts:39`
- Modify: `packages/modules/auth/src/graphql/schema/account/mutations.ts:76,117,147,197`

- [ ] **Step 1: Create the guards**

```ts
// packages/modules/auth/src/graphql/require-user.ts
import type { GraphQLContextMap } from '@czo/kit/graphql'
import { UnauthenticatedError } from '@czo/kit/graphql'

/**
 * The acting session user's id, or `UnauthenticatedError`. Use in resolvers that
 * need *the acting user* (inviter, impersonating admin, account owner). A request
 * authenticated by an API key has no session user, so this throws — a key can
 * never be the acting user. The actor is always server-derived; never accept it
 * as a client-supplied input (that would let a caller forge the actor).
 */
export function requireUserId(ctx: GraphQLContextMap): number {
  const id = ctx.auth?.user?.id
  if (id == null)
    throw new UnauthenticatedError()
  return Number(id)
}

/** The current session token, or `UnauthenticatedError`. */
export function requireSessionToken(ctx: GraphQLContextMap): string {
  const token = ctx.auth?.session?.token
  if (token == null)
    throw new UnauthenticatedError()
  return token
}
```

- [ ] **Step 2: Replace the non-defensive reads**

In each file, add the import (path relative to the file; e.g. from `schema/organization/` it is `../../require-user`):

```ts
import { requireSessionToken, requireUserId } from '../../require-user'
```

Then apply this mechanical substitution at every site, deleting the now-incorrect `// … is sound` comment immediately above each:

- `Number(ctx.auth!.user!.id)` → `requireUserId(ctx)`
- `Number(ctx.auth.user!.id)` → `requireUserId(ctx)`
- `ctx.auth!.session!.token` → `requireSessionToken(ctx)`

Exact sites (line numbers are pre-edit anchors):
- `organization/mutations.ts`: 215 (`inviteToOrganization`, **permission-gated — the real fix**), 244 (`acceptInvitation`), 272 (`rejectInvitation`), 348 + 376/377 (`setActiveOrganization` — both `requireUserId` and `requireSessionToken`). Import only `requireUserId` where the token guard is unused; import both in this file.
- `impersonation/mutations.ts`: 39 (`startImpersonation`, **permission-gated — the real fix**) — import `requireUserId` only.
- `account/mutations.ts`: 76, 117, 147, 197 — import `requireUserId` only.

Worked example (`inviteToOrganization`, org/mutations.ts ~203-217):

```ts
      resolve: async (_root, { input }, ctx) => {
        const orgId = input.organizationId.id
        const invitation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* OrganizationService
            return yield* svc.createInvitation({
              organizationId: Number(orgId),
              email: input.email,
              role: input.role,
              inviterId: requireUserId(ctx),
              resend: input.resend ?? undefined,
            })
          }),
        )
        return { invitation }
      },
```

- [ ] **Step 3: Type-check + lint**

Run: `pnpm --filter @czo/auth check-types && pnpm --filter @czo/auth lint --max-warnings 0`
Expected: PASS. (Verify no `ctx.auth!.user!` / `ctx.auth!.session!` non-defensive reads remain: `grep -rn "auth!\.user!\|auth\.user!\.id\|auth!\.session!" packages/modules/auth/src/graphql/schema` returns nothing.)

- [ ] **Step 4: Regression — existing auth E2Es still pass**

Run: `pnpm --filter @czo/auth test src/e2e/organization.e2e.test.ts src/e2e/impersonation.e2e.test.ts src/e2e/account.e2e.test.ts`
Expected: PASS — the guards are behaviourally identical for an authenticated session user (they only change the *unauthenticated* path from crash/`!` to a clean `UnauthenticatedError`).

---

### Task 6: Full validation + stage

**Files:** none (validation only)

- [ ] **Step 1: Lint (strict — no `--fix`)**

Run: `pnpm --filter @czo/auth lint --max-warnings 0`
Expected: PASS. (If it fails on formatting only, run `pnpm --filter @czo/auth lint:fix` then re-run both `check-types` and `lint --max-warnings 0` — see the spec's note: never trust `lint:fix` blindly.)

- [ ] **Step 2: Full auth suite (regression — session path unchanged)**

Run: `pnpm --filter @czo/auth test`
Expected: all suites pass (incl. the existing `rest-auth` / `organization` / `api-key` E2Es). The `57P01` pg-teardown flake is unrelated CI noise — re-run if it appears.

- [ ] **Step 3: Downstream type-check**

Run: `pnpm --filter life check-types`
Expected: PASS (the `AuthContext` change is additive).

- [ ] **Step 4: Stage (do NOT commit — see COMMIT POLICY)**

```bash
git add packages/modules/auth/src/graphql/index.ts \
        packages/modules/auth/src/graphql/session-context.ts \
        packages/modules/auth/src/graphql/scopes.ts \
        packages/modules/auth/src/graphql/require-user.ts \
        packages/modules/auth/src/graphql/schema/organization/mutations.ts \
        packages/modules/auth/src/graphql/schema/impersonation/mutations.ts \
        packages/modules/auth/src/graphql/schema/account/mutations.ts \
        packages/modules/auth/src/e2e/api-key-auth.e2e.test.ts
```

Report completion and await user review before the single end-of-sprint commit.

---

## Out of scope / follow-ups (not this plan)

- **Sub-project (B):** gate `@czo/product` storefront reads on the chosen permission (`channel:read` recommended, with a published-in-channel filter) — its own spec + plan.
- **Expose `permissions` on the `createApiKey` GraphQL mutation** so org admins can mint a storefront key (with `channel:read`) through the API rather than only via the service. Small, but a distinct api-key-surface change (B17 territory) — not required to prove request auth.
- User-owned keys as request principals; global (no-org) `permission` satisfaction; per-channel (instance-level) key scoping; per-key rate-limiting on the GraphQL path.
```
