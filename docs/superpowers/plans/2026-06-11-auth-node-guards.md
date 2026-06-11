# Auth `node(id:)` read guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register per-type `node(id:)`/`nodes(ids:)` read guards for `@czo/auth`'s five relay nodes (`User`, `Organization`, `Member`, `Invitation`, `ApiKey`) so reading a node by global id requires the SAME effective authorization as its query — closing the ungated `node()` read path on the same branch as the sub-graph work.

**Architecture:** A new `auth/src/graphql/node-guards.ts` exports `authNodeGuards: Record<string, NodeGuard>` (keyed by GraphQL type name), registered via the module's `graphql.nodeGuards` slot; the kit relay resolver runs each guard after loading the row and resolves a denied read to `null`. Each guard returns the same scope its query computes (User → global `user:read`; Organization/Member → org-permission from the row; Invitation → self-email OR org-permission; ApiKey → ownership OR org-membership via an extended `apiKeyOwner` scope). `select: true` on the `Member`/`Invitation` nodes force-loads the columns the guards read.

**Tech Stack:** Pothos (`@pothos/plugin-drizzle` relay nodes), `@pothos/plugin-scope-auth`, Effect-TS, kit node-guard registry, Vitest / Testcontainers.

**Reference:** mirror `packages/modules/attribute/src/graphql/node-guards.ts` + `packages/modules/attribute/src/e2e/node-authz.e2e.test.ts` (the established pattern). Spec: `docs/superpowers/specs/2026-06-11-auth-node-guards-design.md`.

**Commit policy:** Stage with `git add` only. Do NOT commit, push, branch, or stash. Branch is `feat/auth-subgraphs` (this is the authorization complement of the already-staged sub-graph work; the final commit(s) after the user's review cover both). After any `packages/kit/` change rebuild kit `dist` before the auth E2E — this plan touches NO kit files, so a rebuild is only needed if a prior task left dist stale (it isn't).

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `packages/modules/auth/src/graphql/scopes.ts` | extend the `apiKeyOwner` scope with a `read` action: org keys → membership (mirror the query), user keys → ownership | Modify |
| `packages/modules/auth/src/graphql/index.ts` | the `apiKeyOwner` action union in `BuilderAuthScopes` gains `'read'` | Modify |
| `packages/modules/auth/src/graphql/node-guards.ts` | the 5 `NodeGuard`s + `authNodeGuards` map | Create |
| `packages/modules/auth/src/graphql/node-guards.test.ts` | unit: each guard returns the right scope/boolean for a given row+ctx | Create |
| `packages/modules/auth/src/index.ts` | register `nodeGuards: authNodeGuards` in the module `graphql` slot | Modify |
| `packages/modules/auth/src/graphql/schema/organization/types.ts` | `select: true` on the `members` + `invitations` drizzleNodes (force-load `organizationId`/`email` for the guards) | Modify |
| `packages/modules/auth/src/e2e/node-authz.e2e.test.ts` | E2E: per-node allow/deny enforcement through the real relay `node(id:)` path | Create |

---

## Task 1: Extend the `apiKeyOwner` scope with a `read` action (ownership OR org-membership)

**Files:**
- Modify: `packages/modules/auth/src/graphql/scopes.ts`
- Modify: `packages/modules/auth/src/graphql/index.ts` (the `BuilderAuthScopes` `apiKeyOwner` type)

**Context:** The `apiKeyOwner` scope (scopes.ts, the `apiKeyOwner: async (...)` handler) accepts `{ keyId, action: 'update' | 'delete' }` or `{ ownerType, ownerId, action: 'create' }`. For a `keyId` it loads the key, then for a **user**-owned key checks ownership (`referenceId === caller`), and for an **organization**-owned key requires the `api-key:<action>` PERMISSION. The `apiKey(id)` query, by contrast, authorizes an org key by bare **membership** (`OrganizationService.checkMembership`, any role). To let the ApiKey node-guard mirror the query exactly, add a `read` action whose **org branch uses membership, not the permission**.

- [ ] **Step 1: Read the full scope handler**

Run: `sed -n '1,140p' packages/modules/auth/src/graphql/scopes.ts`
Note the exact shape of the `apiKeyOwner` handler: how it gets the caller's user id from `ctx`, the `keyId` branch that loads the key and sets `ownerType`/`ownerId`, the user-ownership return, and the org-permission return (`permissions: { 'api-key': [input.action] }`).

- [ ] **Step 2: Add `'read'` to the action unions**

In the `apiKeyOwner` input type, add `'read'` to the `keyId` action union so it reads:

```ts
        | { keyId: number, action: 'read' | 'update' | 'delete' }
        | { ownerType: 'USER' | 'ORGANIZATION', ownerId: number, action: 'create' },
```

- [ ] **Step 3: Branch the org path on `read` → membership**

In the org-owned branch (where it currently returns the `api-key:<action>` permission check), special-case `read` to authorize by membership instead, mirroring `apiKey(id)`'s resolver. Using the handler's existing caller id + `OrganizationService` (import it if not already imported in scopes.ts):

```ts
        // org-owned key: reads mirror the apiKey(id) query (any member of the
        // owning org); writes (update/delete) still require the api-key permission.
        if (input.action === 'read') {
          const org = yield* OrganizationService
          return yield* org.checkMembership(ownerId, callerUserId)
        }
        // …existing permission check for update/delete…
```

> Adapt `ownerId` / `callerUserId` to the handler's actual local variable names (from Step 1). `checkMembership(orgId, userId): Effect<boolean>` is the same method `apiKey(id)` uses. The user-owned branch (ownership check) is unchanged — it already covers `read` correctly.

- [ ] **Step 4: Update the `BuilderAuthScopes` type**

In `packages/modules/auth/src/graphql/index.ts`, find the `apiKeyOwner` entry in the `BuilderAuthScopes` interface and add `'read'` to its `keyId` action union (same shape as Step 2) so callers can pass `{ apiKeyOwner: { keyId, action: 'read' } }` and type-check.

- [ ] **Step 5: Type-check + lint**

Run: `cd packages/modules/auth && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/scopes.ts src/graphql/index.ts`
Expected: clean. (End-to-end behavior is verified by Task 3's ApiKey E2E block; there's no standalone scope unit test harness.)

- [ ] **Step 6: Stage**

```bash
git add packages/modules/auth/src/graphql/scopes.ts packages/modules/auth/src/graphql/index.ts
```

---

## Task 2: The node-guards + registration

**Files:**
- Create: `packages/modules/auth/src/graphql/node-guards.ts`
- Test: `packages/modules/auth/src/graphql/node-guards.test.ts`
- Modify: `packages/modules/auth/src/index.ts`
- Modify: `packages/modules/auth/src/graphql/schema/organization/types.ts`

**Context:** `NodeGuard = (row: any, ctx: GraphQLContextMap) => boolean | Record<string, unknown>` (from `@czo/kit/graphql`). The kit relay resolver loads the row, then `passesNodeGuard(guard(row, ctx), ctx, authScope)` — a guard may return a literal `boolean` (sync allow/deny) or a scope object (evaluated like an `authScopes`). A denied read → null. Mirror `packages/modules/attribute/src/graphql/node-guards.ts` (read it first).

- [ ] **Step 1: Write the failing unit test**

Create `packages/modules/auth/src/graphql/node-guards.test.ts`. The guards are pure functions of `(row, ctx)`; unit-test the SCOPE they return (no DB). Mock `ctx` minimally as `{ auth: { user: { id, email } } }`:

```ts
import { describe, expect, it } from 'vitest'
import { authNodeGuards } from './node-guards'

const ctx = (user?: { id: string, email: string }) => ({ auth: { user } }) as any

describe('authNodeGuards', () => {
  it('User → global user:read', () => {
    expect(authNodeGuards.User({ id: 1 }, ctx())).toEqual({ permission: { resource: 'user', actions: ['read'] } })
  })

  it('Organization → organization:read on the row\'s own id', () => {
    expect(authNodeGuards.Organization({ id: 7 }, ctx())).toEqual({ permission: { resource: 'organization', actions: ['read'], organization: 7 } })
  })

  it('Member → member:read on the row\'s organizationId', () => {
    expect(authNodeGuards.Member({ id: 3, organizationId: 7 }, ctx())).toEqual({ permission: { resource: 'member', actions: ['read'], organization: 7 } })
  })

  it('Invitation → auth:true when addressed to the caller (self-email)', () => {
    expect(authNodeGuards.Invitation({ email: 'me@x.com', organizationId: 7 }, ctx({ id: '1', email: 'me@x.com' }))).toEqual({ auth: true })
  })

  it('Invitation → invitation:read on the org when NOT the caller\'s', () => {
    expect(authNodeGuards.Invitation({ email: 'other@x.com', organizationId: 7 }, ctx({ id: '1', email: 'me@x.com' }))).toEqual({ permission: { resource: 'invitation', actions: ['read'], organization: 7 } })
  })

  it('ApiKey → apiKeyOwner read on the row id', () => {
    expect(authNodeGuards.ApiKey({ id: 9 }, ctx())).toEqual({ apiKeyOwner: { keyId: 9, action: 'read' } })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/modules/auth && pnpm test src/graphql/node-guards.test.ts`
Expected: FAIL — module `./node-guards` does not exist.

- [ ] **Step 3: Create the guards**

Create `packages/modules/auth/src/graphql/node-guards.ts`:

```ts
// Auth module — per-type `node(id:)`/`nodes(ids:)` authorization guards.
//
// Auth exposes five relay `drizzleNode`s reachable via the global `node(id:)`
// field. Without a guard the kit relay resolver reads any row by global id with
// NO authorization — a weaker path than the gated queries. Each guard returns
// the SAME effective scope its query computes, so node() is never weaker. Kit
// runs these ONLY on the relay node/nodes path (never connections or mutation
// returns). A denied read resolves to null (existence is not leaked).
//
// `Member`/`Invitation` carry `select: true` on their drizzleNode so the
// guard's columns (`organizationId`, `email`) are loaded regardless of the
// client's field selection.

import type { NodeGuard } from '@czo/kit/graphql'

/** `user`/`users` require the global `user:read` permission. */
const userGuard: NodeGuard = () => ({ permission: { resource: 'user', actions: ['read'] } })

/** `organization(id)`: the org IS its own id. */
const organizationGuard: NodeGuard = row => ({
  permission: { resource: 'organization', actions: ['read'], organization: Number(row.id) },
})

/** `members(organizationId)`: gate on the member row's org. */
const memberGuard: NodeGuard = row => ({
  permission: { resource: 'member', actions: ['read'], organization: Number(row.organizationId) },
})

/**
 * `invitation(id)` (org `invitation:read`) OR `myInvitations` (the invitee, by
 * email). A row addressed to the caller is theirs to read; otherwise gate on the
 * invitation's org.
 */
const invitationGuard: NodeGuard = (row, ctx) =>
  ctx.auth?.user?.email != null && row.email === ctx.auth.user.email
    ? { auth: true }
    : { permission: { resource: 'invitation', actions: ['read'], organization: Number(row.organizationId) } }

/** `apiKey(id)`: ownership OR org-membership, via the polymorphic `apiKeyOwner` scope. */
const apiKeyGuard: NodeGuard = row => ({ apiKeyOwner: { keyId: Number(row.id), action: 'read' } })

export const authNodeGuards: Record<string, NodeGuard> = {
  User: userGuard,
  Organization: organizationGuard,
  Member: memberGuard,
  Invitation: invitationGuard,
  ApiKey: apiKeyGuard,
}
```

> `ctx.auth` typing: match how other auth GraphQL code reads the session user (`ctx.auth?.user?.email`/`.id`). If `NodeGuard`'s `ctx` type doesn't expose `auth`, cast narrowly as the existing node code / `session-context` does — no broad `as any`.

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd packages/modules/auth && pnpm test src/graphql/node-guards.test.ts`
Expected: all 6 PASS.

- [ ] **Step 5: Register the guards in the module**

In `packages/modules/auth/src/index.ts`, import the map and add it to the `graphql` slot (currently `{ contribution, authScope, contexts }`):

```ts
import { authScopes, registerAuthSchema } from '@czo/auth/graphql'
import { authNodeGuards } from './graphql/node-guards'
// …
    graphql: {
      contribution: builder => registerAuthSchema(builder),
      authScope: authScopes,
      contexts: makeSessionContextContributor(),
      nodeGuards: authNodeGuards,
    },
```

> Confirm the module `graphql` config type accepts `nodeGuards` (it does — attribute/product/etc. pass it). Match the exact import path style used in index.ts (it imports from `@czo/auth/graphql` and relative `./graphql/...`).

- [ ] **Step 6: Force-load the guard columns**

In `packages/modules/auth/src/graphql/schema/organization/types.ts`, add `select: true` to the `members` and `invitations` `builder.drizzleNode('...', { ... })` option objects (so `organizationId` and `email` are loaded for the guards regardless of client selection), mirroring attribute's `select: true`. `User`/`Organization`/`ApiKey` guards only read the node id (always loaded) so they need no `select` change.

- [ ] **Step 7: Type-check + lint**

Run: `cd packages/modules/auth && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/node-guards.ts src/graphql/node-guards.test.ts src/index.ts src/graphql/schema/organization/types.ts`
Expected: clean.

- [ ] **Step 8: Stage**

```bash
git add packages/modules/auth/src/graphql/node-guards.ts \
        packages/modules/auth/src/graphql/node-guards.test.ts \
        packages/modules/auth/src/index.ts \
        packages/modules/auth/src/graphql/schema/organization/types.ts
```

---

## Task 3: E2E — per-node `node(id:)` allow/deny enforcement

**Files:**
- Create: `packages/modules/auth/src/e2e/node-authz.e2e.test.ts`

**Context:** Prove enforcement through the REAL relay `node(id:)` path on a booted app (Testcontainers). Mirror `packages/modules/attribute/src/e2e/node-authz.e2e.test.ts` structure (`bootAuthApp` harness, `h.signUp`/`h.gql`, real fetch). For each node: an authorized caller reads the row; a denied caller (authenticated, lacking the right) gets `node` = `null` (no error, no leak). The node global id comes from creating the row via the existing mutations (admin user create, org create + invite + member, api-key create).

- [ ] **Step 1: Inspect the auth E2E harness + helpers**

Run: `ls packages/modules/auth/src/e2e/ && sed -n '1,60p' packages/modules/auth/src/e2e/harness.ts`
Learn the boot helper (`bootAuthApp`), the request helper (`h.gql(query, vars?, token?)` or `h.app.fetch`), sign-up/grant-role helpers, and how other auth e2e tests obtain a node global id + a session token. Reuse them exactly.

- [ ] **Step 2: Write the E2E**

Create `packages/modules/auth/src/e2e/node-authz.e2e.test.ts`. Boot via the shared harness. A reusable node read:

```ts
// <imports + bootAuthApp exactly as sibling auth e2e files do; obtain `h`>

const readNode = (gid: string, token?: string) =>
  h.gql(`query ($id: ID!) { node(id: $id) { id __typename } }`, { id: gid }, token)
```

Then one `describe` block per node. Use the existing mutations to mint each row + capture its returned global id, and the harness's role/permission grant helpers to set up authorized vs unauthorized callers. Assertions per node:

- **User:** an admin with global `user:read` → `node(id: userGid)` returns `{ __typename: 'User' }`; a plain authenticated user (no global role) → `node` is `null`.
- **Organization:** the org creator/member with `organization:read` → reads the org node; a non-member authed user → `null`.
- **Member:** a caller with `member:read` in the org → reads a member node; a non-member → `null`.
- **Invitation:** the invitee (the session user whose email the invitation targets) → reads their invitation node (self-email branch); a member with `invitation:read` → reads the org's invitation; an unrelated authed user → `null`.
- **ApiKey:** the owning user → reads their personal key node; a member of the owning org → reads an org key node; a non-owner / non-member → `null`.

Each denied case asserts `body.data.node === null` and `body.errors` is undefined (deny-as-null, no leak), matching the attribute node-authz pattern. Adapt the exact mutation field names to the current schema (`createUser`, `createOrganization`, `inviteMember`, `createApiKey`/`createOrganizationApiKey`) and the harness's grant helpers.

- [ ] **Step 3: Run the E2E**

Run: `cd packages/modules/auth && pnpm test src/e2e/node-authz.e2e.test.ts`
Expected: all node blocks PASS (Docker, ~60-90s). If a DENIED reader gets the row instead of null, the guard for that type isn't registered/matched (check the type-name key in `authNodeGuards` matches the GraphQL type name exactly) or its `select` column isn't loaded (Task 2 Step 6). If an ALLOWED reader gets null, the guard's scope is stricter than the query — re-check the scope shape against Task 2.

- [ ] **Step 4: Type-check + lint + stage**

Run: `cd packages/modules/auth && pnpm check-types && pnpm lint --max-warnings 0 src/e2e/node-authz.e2e.test.ts`

```bash
git add packages/modules/auth/src/e2e/node-authz.e2e.test.ts
```

---

## Task 4: Full validation + final review

**Files:** none (verification only)

- [ ] **Step 1: Type-check auth + the app**

Run: `pnpm --filter @czo/auth check-types`
Run: `pnpm --filter life check-types`
Expected: clean (no NEW errors).

- [ ] **Step 2: Run the affected suites**

Run: `cd packages/modules/auth && pnpm test src/graphql/node-guards.test.ts src/e2e/node-authz.e2e.test.ts src/e2e/subgraph-audiences.e2e.test.ts src/e2e/api-key.e2e.test.ts`
Expected: green (the node-guards unit + the new node-authz E2E + the prior sub-graph/api-key E2Es still pass — the `apiKeyOwner` `read` addition and `select: true` must not regress them).

- [ ] **Step 3: Lint**

Run: `pnpm --filter @czo/auth lint --max-warnings 0`
Expected: clean.

- [ ] **Step 4: Review the staged diff**

Run: `git diff --cached --stat`
Expected: the node-guards files + scopes.ts/index.ts + organization/types.ts + the e2e, ON TOP of the already-staged sub-graph work. No `console.log`, no broad `as any`, no `dist/` staged, no commit.

- [ ] **Step 5: STOP — hand to the user**

Do NOT commit. Report: validation results, the staged file list, and confirm every node's allow/deny is enforced (the E2E blocks). The user reviews and decides the commit(s)/PR for the combined `feat/auth-subgraphs` branch.

---

## Self-review (against the spec)

- **Spec §Decision 1 (mirror query authz):** Tasks 1-2 — each guard returns its query's effective scope; the `apiKeyOwner` `read` action makes ApiKey mirror the query's any-member behavior (Task 1). ✓
- **Spec §Decision 2 (all five nodes):** Task 2 — `User`/`Organization`/`Member`/`Invitation`/`ApiKey` in `authNodeGuards`. ✓
- **Spec §Decision 3 (deny → null):** kit behavior; Task 3 asserts `data.node === null` + no errors. ✓
- **Spec §Decision 4 (ApiKey = ownership OR membership any-role):** Task 1 org-`read` branch uses `checkMembership`, not the permission. ✓
- **Spec §Architecture 1 (node-guards.ts + map):** Task 2. ✓
- **Spec §Architecture 2 (load gating columns):** Task 2 Step 6 — `select: true` on `members`/`invitations`. ✓
- **Spec §Architecture 3 (registration):** Task 2 Step 5 — `graphql.nodeGuards`. ✓
- **Spec §Testing:** Task 2 (unit: guard scope shapes) + Task 3 (E2E: per-node allow/deny enforcement). ✓
- **Placeholder scan:** the two "read the actual file" steps (Task 1 Step 1, Task 3 Step 1) are deliberate — the scope handler's local var names + the harness helpers are read at execution; the scope shapes + assertions are fully specified.
- **Type consistency:** `authNodeGuards` keys (`User`/`Organization`/`Member`/`Invitation`/`ApiKey`) = the GraphQL type names; `apiKeyOwner` `read` action consistent across scopes.ts (Task 1), the `BuilderAuthScopes` type (Task 1), and the `ApiKey` guard (Task 2).
