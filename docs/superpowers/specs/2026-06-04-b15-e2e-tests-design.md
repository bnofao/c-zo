# B15 — E2E GraphQL test suites for `@czo/auth` and `@czo/stock-location`

**Date:** 2026-06-04
**Backlog item:** B15 (priorité moyenne)
**Status:** design approved, pending spec review

## Problem

`@czo/attribute` has a full E2E suite that boots the real `[auth, attribute]` app on
Testcontainers via `@czo/kit/testing`'s `bootTestApp` and drives the real h3/Yoga
fetch handler with real authorization (`packages/modules/attribute/src/e2e/`). `auth`
and `stock-location` have **only service-level integration tests** — their GraphQL
surface (resolvers, relay global-ID decoding, `authScopes` / node-guard enforcement,
error→union mapping, org scoping) is not covered end-to-end.

## Goal

Add E2E GraphQL suites for both modules that exercise the **GraphQL boundary**, not
the business logic the integration tests already cover. The E2E-unique value is:

- relay global-ID encode/decode round-trips,
- declarative `authScopes` (org-permission tier vs global-role tier) and node-guard
  enforcement, including **denials** (deny-as-null on `node(id:)`, typed-union error
  on mutations),
- error→union mapping at the schema boundary,
- explicit **org scoping** and **cross-org denial**.

Both run with **no mocks**: a real Postgres Testcontainer + real in-process fetch.

## Scope (full auth surface — per decision)

### `@czo/auth` — `bootTestApp([auth])`

| Suite file | Coverage |
|---|---|
| `rest-auth.e2e.test.ts` | sign-up, sign-in (cookie + Bearer token), sign-out (REST `/api/auth/**`); invalid credentials; duplicate-email rejection |
| `organization.e2e.test.ts` | `createOrganization`; invitations (invite / accept / reject); members (add / remove); roles (`setRole`); org + member queries; **authz tiers (org permission vs global role) + cross-org denials** |
| `api-key.e2e.test.ts` | create / revoke; queries; owner discriminator (USER vs ORG); cross-owner denial |
| `account.e2e.test.ts` | change-email (request / confirm); delete / restore; change-password — via GraphQL mutations |
| `impersonation.e2e.test.ts` | start / stop (global-admin role required); non-admin denial; session walk-up resolution |
| `user.e2e.test.ts` | user queries; update / ban / setRole — global-admin allowed vs denial |

### `@czo/stock-location` — `bootTestApp([auth, stock-location])`

| Suite file | Coverage |
|---|---|
| `stock-location.e2e.test.ts` | CRUD (create / update / delete / query); org scoping; **cross-org denial**; `node(id:)` guard (deny-as-null) |

## Architecture — two harnesses (mirror `attribute/src/e2e/harness.ts`)

### `packages/modules/auth/src/e2e/harness.ts`
Boots `bootTestApp([authModule(<config>)])` on a Testcontainer, returns:

- `app`, `close` — the booted fetchable app + teardown (scoped).
- `gql(query, variables?, token?)` — POST `/graphql`, returns `{ data, errors }`; sends
  `authorization: Bearer <token>` when a token is given.
- `signUp(email, name, password)` / `signIn(email, password)` / `signOut(token)` — drive
  the REST `/api/auth/**` routes; return `{ token, userId, ... }`.
- `grantGlobalRole(userId, role)` — set `users.role` directly (the **platform** tier).
- `createOrganization(name, token)` / `invite` / `accept` / `setRole` — the **org** tier
  helpers (built on `gql`).
- Token helpers for both cookie and Bearer paths.

### `packages/modules/stock-location/src/e2e/harness.ts`
Boots `bootTestApp([authModule(<cfg>), stockLocationModule(<cfg>)])`, **reuses** the auth
helpers (signUp, createOrganization, grantGlobalRole) and adds the stock-location access
grant. Imports the modules from **source** (`../../../auth/src/index`, `../index`) so
source edits are picked up without building (mirrors the attribute harness).

Both harnesses are imported by their suite files; each suite owns one boot (one container)
per file via the scoped lifecycle the attribute harness uses (`it.live`/`Scope`).

## Robustness vs B12 (rate-limiting)

B15 branches from `main` (no rate-limiting yet). But once **B12** (PR #106) and B15 both
merge, the auth E2E suites coexist with the per-IP rate-limits (sign-in 20/60s,
`request*` 5/60s). To stay green **regardless of merge order**, the auth harness assigns a
**unique `x-forwarded-for` per logical client** (each `signUp`/distinct actor gets its own
synthetic IP), so no suite ever shares a per-IP bucket or trips a cap. Zero cost, full
insurance. (The per-email caps are well above any single-actor test's request count.)

## Conventions

- **Real authz, no mocks.** Testcontainers Postgres + in-process fetch (`bootTestApp`).
- **Assert enforcement, not business logic.** Denials assert the real refusal shape:
  `node(id:)` → `data.node === null` (no leak); mutation authz → typed-union error member;
  REST → correct status. Don't re-assert what service integration tests already prove.
- `@effect/vitest` `it.live` + `Scope` for the boot lifecycle (the repo's `@effect/vitest`
  has no `it.scoped`; `it.live` provides `Scope` — same pattern T5/T8 used).
- No `Effect.runSync` in tests. No `console.log`. No-semicolon style. Match the attribute
  harness idioms.
- Tests live at `packages/modules/<m>/src/e2e/*.e2e.test.ts` (auth/attribute vitest
  `include: ['src/**/*.test.ts']` already matches `*.e2e.test.ts`).

## Build discipline

Both harnesses import `@czo/kit/testing` (and the GraphQL builder) via the package name →
resolves to **kit dist**. Kit is already built on `main`; no kit source changes in B15, so
no rebuild needed. Auth/stock-location modules are imported from **source** in the harness,
so module source is picked up directly.

## Testing / validation

- `cd packages/modules/auth && pnpm test src/e2e` → all auth E2E green.
- `cd packages/modules/stock-location && pnpm test src/e2e` → stock-location E2E green.
- `pnpm check-types` per module; downstream (`life`) unaffected (test-only additions).
- New files only (harnesses + suites); no production code changes expected. If a suite
  surfaces a real GraphQL-boundary bug (e.g. a missing authScope), that's a finding to
  raise separately — the suite asserts current intended behaviour.

## Out of scope

- No production code changes (this is test coverage). A genuine bug found by a suite is
  reported, not silently fixed in this sprint.
- No load/perf testing. No subscription E2E (none in these modules).
- Rate-limit interaction beyond the unique-IP robustness measure (B12 owns rate-limit
  tests).

## Risks

- **Surface size** — six auth suites + one stock-location suite + two harnesses is a large
  sprint; mitigated by one shared harness per module (most boilerplate is the harness, not
  the suites) and incremental per-suite execution/review.
- **Exact field/type names** — relay mutation payload + input type names are codegen'd;
  the plan must confirm each against the built schema (introspection) to avoid invalid
  queries. Not a design risk, a plan-time lookup.
- **Container time** — one Postgres container per suite file (7 files) lengthens the E2E
  run; acceptable (CI ubuntu runs Testcontainers; the suites run only under `src/e2e`).
