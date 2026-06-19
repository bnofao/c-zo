# Per-Request Permission Cache (@czo/auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deduplicate identical permission checks within a single GraphQL request so a multi-field graft read issues one `members` lookup per `(user, org, resource, action)` tuple instead of one per field.

**Architecture:** Add a tiny per-request memo, keyed by the GraphQL context object's identity via a module-level `WeakMap`. The `permission` auth scope (`graphql/scopes.ts`) wraps its existing evaluation in this memo. The context object is built once per request by kit's `buildContext`, so keying on its identity gives per-request lifetime with automatic GC and no change to kit's `GraphQLContextMap` type. Caching the in-flight `Promise` (not just the resolved boolean) also coalesces concurrent scope evaluations.

**Tech Stack:** TypeScript (strict), Effect-TS, Pothos `@pothos/plugin-scope-auth`, Vitest (`@effect/vitest` for DB-backed tests; plain `vitest` for pure unit tests), Testcontainers Postgres for E2E.

## Global Constraints

- **No autonomous commits.** Repo rule (CLAUDE.md): stage with `git add` during execution, never `git commit` autonomously. A single commit happens at the end after explicit user review. Every "stage" step below uses `git add` only.
- **TypeScript strict mode** throughout; no `as any` where inference suffices.
- **No `console.log`** in committed code (hooks warn). Not needed here.
- **Effect-native module**: no `async`/`await`/`try`/`catch` inside *service/Effect* code. The cache helper is a thin Promise-level utility living in the GraphQL scope layer (which is already Promise-based — `scopes.ts` scopes are `async` functions calling `ctx.runEffect(...)`), so plain Promises are correct and idiomatic here.
- **Validation per change** (CLAUDE.md table): `pnpm lint` (NOT `lint:fix` — it can strip needed casts), targeted `pnpm test <file>`, `pnpm check-types`. Run from `packages/modules/auth`.
- **Security-critical module.** The final task runs the full `@czo/auth` suite; permission allow/deny semantics MUST be unchanged.

## Background (why this exists)

A storefront overlay read (`product(id:, viewerOrg:B)`) selecting several graft-gated fields was captured via Postgres `log_statement=all`. It emitted **8 byte-identical** queries:

```sql
select "d0"."id", "d0"."organization_id", "d0"."user_id", "d0"."role", "d0"."created_at"::text
from "members" as "d0" where (("d0"."user_id" = $1) and ("d0"."organization_id" = $2)) limit $3
```

Root cause (verified in code):
- `graphql/scopes.ts:10-44` — the `permission` scope, for an org-scoped check, runs `OrganizationService.findFirstMember(...)` (the `members` query) then `OrganizationService.hasPermission(...)` (pure, in-memory) **on every invocation**.
- Each graft-gated field (`assignedAttributes`, `assignedAttribute`, per-variant `priceSet`/`inventoryItems`, …) calls `graftAuthScopes(args)` (`packages/modules/product/src/graphql/schema/product/types/merge.ts`), which returns a **fresh** `{ permission: { resource, actions, organization } }` object. `@pothos/plugin-scope-auth` keys its scope-loader cache on the argument object's identity, so distinct objects ⇒ cache misses ⇒ re-evaluation.
- No per-request memo exists in `@czo/auth` (only process-level caches: `cacheOrgRoles` for role *definitions*, not membership — and it is not even consulted on this path because the `permission` scope calls `hasPermission` without `useMemoryCache`).

Within a single request the actor's membership/role is a consistent snapshot, so memoizing the permission result per `(user, org, resource, action)` for the request's lifetime is safe and standard.

## File Structure

- **Create** `packages/modules/auth/src/graphql/permission-cache.ts` — the per-request memo helper. Single responsibility: given a context object, a string key, and a thunk returning `Promise<boolean>`, compute once per `(ctx, key)` and reuse. No auth/domain knowledge; trivially unit-testable.
- **Create** `packages/modules/auth/src/graphql/permission-cache.test.ts` — pure Vitest unit test (no Postgres) proving the dedup, per-key recompute, per-ctx isolation, and in-flight coalescing.
- **Modify** `packages/modules/auth/src/graphql/scopes.ts` — wrap the `permission` scope body in `cachedPermission(ctx, key, …)`.

Out of scope (YAGNI): the `apiKeyOwner` scope also calls `findFirstMember`, but it is not evaluated many times per request; not wrapped. Note it as a possible follow-up, do not implement.

---

### Task 1: Per-request permission memo helper

**Files:**
- Create: `packages/modules/auth/src/graphql/permission-cache.ts`
- Test: `packages/modules/auth/src/graphql/permission-cache.test.ts`

**Interfaces:**
- Consumes: nothing (standalone utility).
- Produces: `cachedPermission(ctx: object, key: string, compute: () => Promise<boolean>): Promise<boolean>` — returns the memoized `Promise<boolean>` for `(ctx, key)`; runs `compute` at most once per distinct `(ctx-identity, key)` pair. Cache entries live as long as `ctx` is reachable (a `WeakMap` keyed by `ctx`), so they are released when the request's context object is GC'd.

- [ ] **Step 1: Write the failing test**

Create `packages/modules/auth/src/graphql/permission-cache.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { cachedPermission } from './permission-cache'

describe('cachedPermission', () => {
  it('computes once per (ctx, key) and reuses the result', async () => {
    const ctx = {}
    const compute = vi.fn(async () => true)
    const a = await cachedPermission(ctx, 'u1:7:product:read', compute)
    const b = await cachedPermission(ctx, 'u1:7:product:read', compute)
    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('recomputes for a different key on the same ctx', async () => {
    const ctx = {}
    const compute = vi.fn(async () => false)
    await cachedPermission(ctx, 'u1:7:product:read', compute)
    await cachedPermission(ctx, 'u1:7:product:write', compute)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('isolates per ctx (per-request): same key, different ctx → recompute', async () => {
    const compute = vi.fn(async () => true)
    await cachedPermission({}, 'u1:7:product:read', compute)
    await cachedPermission({}, 'u1:7:product:read', compute)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent in-flight checks into a single compute', async () => {
    const ctx = {}
    let resolve!: (v: boolean) => void
    const compute = vi.fn(() => new Promise<boolean>((r) => { resolve = r }))
    const p1 = cachedPermission(ctx, 'u1:7:product:read', compute)
    const p2 = cachedPermission(ctx, 'u1:7:product:read', compute)
    resolve(true)
    expect(await p1).toBe(true)
    expect(await p2).toBe(true)
    expect(compute).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @czo/auth test src/graphql/permission-cache.test.ts`
Expected: FAIL — `Failed to resolve import "./permission-cache"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `packages/modules/auth/src/graphql/permission-cache.ts`:

```ts
// Per-request memo for permission-scope evaluations.
//
// Each graft-gated GraphQL field independently evaluates the `permission` auth
// scope (see `scopes.ts`), and an org-scoped check issues a `members` lookup
// every time. Within ONE request the actor's membership/role is a consistent
// snapshot, so the same `(user, org, resource, action)` decision is stable and
// can be reused across fields.
//
// The cache is keyed by the GraphQL context object's IDENTITY: kit's
// `buildContext` (packages/kit/src/graphql/builder.ts) creates exactly one
// context object per request and passes that same object to every scope/resolver
// evaluation. A `WeakMap` keyed on it therefore scopes entries to the request and
// releases them automatically when the context is GC'd — no manual eviction, no
// cross-request leakage, and no change to kit's `GraphQLContextMap` type.
//
// We store the in-flight `Promise<boolean>` (not the resolved boolean) so that
// scope evaluations racing across fields share a single computation.
const requestCaches = new WeakMap<object, Map<string, Promise<boolean>>>()

/**
 * Compute `compute()` at most once per distinct `(ctx, key)` and reuse the
 * resulting `Promise<boolean>` for the lifetime of `ctx` (one request).
 */
export function cachedPermission(
  ctx: object,
  key: string,
  compute: () => Promise<boolean>,
): Promise<boolean> {
  let cache = requestCaches.get(ctx)
  if (cache === undefined) {
    cache = new Map<string, Promise<boolean>>()
    requestCaches.set(ctx, cache)
  }
  const hit = cache.get(key)
  if (hit !== undefined)
    return hit
  const pending = compute()
  cache.set(key, pending)
  return pending
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @czo/auth test src/graphql/permission-cache.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Lint + type-check**

Run: `pnpm --filter @czo/auth lint src/graphql/permission-cache.ts src/graphql/permission-cache.test.ts && pnpm --filter @czo/auth check-types`
Expected: both exit 0, no output errors.

- [ ] **Step 6: Stage (no commit — see Global Constraints)**

```bash
git add packages/modules/auth/src/graphql/permission-cache.ts packages/modules/auth/src/graphql/permission-cache.test.ts
```

---

### Task 2: Wire the memo into the `permission` scope

**Files:**
- Modify: `packages/modules/auth/src/graphql/scopes.ts:10-44` (the `permission` scope)
- Test: existing `packages/modules/auth/src/e2e/node-authz.e2e.test.ts` (org-scoped permission allow/deny via `node(id:)` guards — closest automated coverage of this code path) + the full `@czo/auth` suite.

**Interfaces:**
- Consumes: `cachedPermission(ctx, key, compute)` from Task 1 (`./permission-cache`).
- Produces: no new exported surface. The `permission` scope's external contract (a Pothos scope loader returning `boolean | Promise<boolean>`) is unchanged; only its internals are memoized.

**Current code (for reference — `scopes.ts:10-44`):**

```ts
    permission: async (
      { resource, actions, organization }:
      { resource: string, actions: string[], organization?: number },
    ) => {
      const userId = ctx?.auth?.user?.id
      if (!userId)
        return false

      return ctx.runEffect(
        Effect.gen(function* () {
          if (organization != null) {
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
          const users = yield* UserService
          return yield* users.hasPermission({
            role: ctx.auth?.user?.role ?? undefined,
            permissions: { [resource]: actions },
          })
        }),
      )
    },
```

- [ ] **Step 1: Verify the existing permission E2E passes BEFORE the change (baseline)**

Run: `pnpm --filter @czo/auth test src/e2e/node-authz.e2e.test.ts`
Expected: PASS (record the test count). This is the regression baseline for permission allow/deny semantics; it must still pass after the change.

- [ ] **Step 2: Add the import**

In `packages/modules/auth/src/graphql/scopes.ts`, add to the import block (keep imports sorted — `./permission-cache` sorts after `../services/user`; run `pnpm lint` in Step 5 to confirm ordering):

```ts
import { cachedPermission } from './permission-cache'
```

So the import block becomes:

```ts
import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { ApiKeyService } from '../services/api-key'
import { OrganizationService } from '../services/organization'
import { UserService } from '../services/user'
import { cachedPermission } from './permission-cache'
```

- [ ] **Step 3: Wrap the `permission` body in the memo**

Replace the `permission` scope (`scopes.ts:10-44`) with:

```ts
    permission: (
      { resource, actions, organization }:
      { resource: string, actions: string[], organization?: number },
    ) => {
      const userId = ctx?.auth?.user?.id
      if (!userId)
        return false

      // Per-request memo: identical permission checks across multiple graft
      // fields reuse one evaluation (one `members` lookup) instead of N. Keyed
      // on the full decision tuple; `ctx` identity scopes it to this request.
      const key = `${userId}:${organization ?? ''}:${resource}:${actions.join(',')}`
      return cachedPermission(ctx, key, () =>
        ctx.runEffect(
          Effect.gen(function* () {
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
        ),
      )
    },
```

Notes for the implementer:
- The function is no longer declared `async`; it now returns `boolean` (the `!userId` deny path) or `Promise<boolean>` (`cachedPermission`). Pothos scope loaders accept `boolean | Promise<boolean>`, so this is valid and intentional.
- The Effect body is byte-for-byte the previous logic, only relocated inside the `compute` thunk. Do not alter the allow/deny logic.
- Do NOT touch the `apiKeyOwner` scope.

- [ ] **Step 4: Run the permission E2E to verify semantics unchanged**

Run: `pnpm --filter @czo/auth test src/e2e/node-authz.e2e.test.ts`
Expected: PASS with the SAME test count as the Step 1 baseline (allow stays allow, deny stays deny).

- [ ] **Step 5: Lint + type-check**

Run: `pnpm --filter @czo/auth lint src/graphql/scopes.ts && pnpm --filter @czo/auth check-types`
Expected: both exit 0. If lint reports an import-order warning for `./permission-cache`, fix the ordering by hand and re-run (do NOT use `lint:fix` — it can strip needed casts elsewhere in the module).

- [ ] **Step 6: Full `@czo/auth` regression (security-critical gate)**

Run: `pnpm --filter @czo/auth test`
Expected: entire suite green (unit + integration + E2E). This is the gate that permission semantics across every audience/scope are unchanged. (Note: the suite spins multiple Testcontainers Postgres instances and takes several minutes; Docker required. If the known-flaky email-injection E2E fails with a `57P01` pg-teardown race, re-run it once — see project memory `project_module_merge_train`.)

- [ ] **Step 7: Stage (no commit)**

```bash
git add packages/modules/auth/src/graphql/scopes.ts
```

---

## Optional end-to-end verification (manual, not a committed test)

Automating "exactly one `members` query" would require Postgres `log_statement=all` instrumentation in the test harness (env-gated in `packages/kit/src/testing/postgres.ts`, then `pnpm --filter @czo/kit build` because `@czo/kit/testing` resolves to dist), which is heavy and not worth committing. The committed proof is Task 1's unit test (dedup mechanics) plus Task 2's unchanged-semantics E2E. If you want to *see* the collapse end-to-end:

1. Temporarily instrument `acquireContainerUrl` (`packages/kit/src/testing/postgres.ts`) to start the container with `.withCommand(['postgres', '-c', 'log_statement=all'])` and a `.withLogConsumer(...)` writing stderr to `/tmp/pg-sql-dump.log`, gated on `process.env.DUMP_SQL === '1'`.
2. `pnpm --filter @czo/kit build`.
3. From `packages/modules/product`: `DUMP_SQL=1 pnpm test src/e2e/product-global.e2e.test.ts`.
4. `grep -c 'from "members"' /tmp/pg-sql-dump.log` for a graft-multi-field read region — expect the per-request count for one `(user, org, product, read)` tuple to drop from 8 to 1.
5. Revert the instrumentation and `pnpm --filter @czo/kit build` to restore a clean dist.

---

## Self-Review

**1. Spec coverage.** The goal (dedupe identical per-request permission checks) is implemented by Task 1 (the memo) + Task 2 (wiring the `permission` scope). The diagnosed N+1 source (`scopes.ts` permission path issuing a `members` query per field) is exactly the code wrapped. ✔

**2. Placeholder scan.** No "TBD/TODO/handle edge cases" — every code step shows complete code; every run step gives an exact command and expected outcome. ✔

**3. Type consistency.** Helper signature `cachedPermission(ctx: object, key: string, compute: () => Promise<boolean>): Promise<boolean>` is identical in Task 1's "Produces", its implementation, its test, and Task 2's call site (`cachedPermission(ctx, key, () => ctx.runEffect(...))` where `ctx.runEffect` returns `Promise<boolean>`). The cache key string is consistent. ✔

**Risk notes.**
- *Per-request staleness*: a mutation that changes the actor's own permissions earlier in the same request could let a later field reuse a pre-change decision. This is the standard, accepted trade-off of per-request authz caching (a request is a consistent snapshot); mutations and their gated reads in one request rarely flip the *same* `(user, org, resource, action)` decision mid-flight. Documented in the helper's header comment.
- *Promise caching of failures*: if `compute()` rejects (e.g. a DB error in `runEffect`), the rejected Promise is cached and reused for the rest of the request. Within one request the failure would recur anyway; this keeps behavior deterministic rather than alternating.
