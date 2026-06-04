# Per-module E2E boot harness (`bootTestApp`) + Attribute `node()` authz verification

Date: 2026-06-03
Status: design — awaiting review
Branch: `feat/attribute-module`

## Problem

We need to verify a **security property** that no current test covers: a relay
`node(id:)` / `nodes(ids:)` lookup of an **org-owned** `Attribute` must be denied
to a caller lacking `attribute:read` in that org. Today the attribute module's
node is unguarded on the relay path, and the proposed fix — a type-level
`authScopes` on the `drizzleNode` plus `runScopesOnType: true` — relies on Pothos
`scope-auth` actually firing on the relay `node()` path. Source reading could not
confirm this: `scope-auth` enforces type scopes through `isTypeOf`
(`completeObjectValue`), but the relay `Node` interface resolves the concrete type
by **brand** (`resolveType`), and a `drizzleNode` may not expose an `isTypeOf` that
`graphql-js` invokes. **Only execution can settle it.**

Separately, the project wants a **reusable, per-module HTTP/GraphQL test
capability**: each module should be able to boot itself (plus its dependencies)
through kit and exercise its real endpoints — not via mocks. There is no such
harness today; integration tests call services directly and never build the
GraphQL/HTTP surface. (Bruno and MSW were considered and rejected: Bruno adds an
external CLI + boot orchestration outside `pnpm test`; MSW *mocks outbound*
requests and would replace the very resolver/authz under test.)

## Goals

1. A kit testing seam, `bootTestApp`, that boots a set of modules on an ephemeral
   Postgres (Testcontainers) and returns a **fetchable** app (`fetch(Request)`),
   `runEffect`, and `close()` — no socket, no `serve`, inside `pnpm test`.
2. A pilot E2E test in the attribute module proving the `node()` cross-org gate
   with **real auth** (real sign-up/sign-in tokens, real `AccessService`).
3. Apply the unit under test: `authScopes: nodeReadScope` + `runScopesOnType: true`
   on `drizzleNode('attributes')`.

## Non-goals

- No Bruno, no MSW.
- No broad per-module Bruno-style collections; the attribute `node()` test is the
  pilot. Other modules adopt `bootTestApp` later, on their own schedule.
- No change to production boot behaviour (`buildApp`/`runApp` output identical).
- Not re-verifying the already-closed value-connection path (`choiceAuthScope`).

## Architecture

### 1. kit seam — make the assembled app reusable without serving

`buildApp` (`packages/kit/src/module/app.ts`) currently composes everything inside
one `main` Effect that **assembles** an h3 `httpApp` and then `serve`s it +
`Effect.never`. Two changes, both behaviour-preserving for production:

- **Extract assembly.** Factor the body of `main` from "build schema → make
  `httpApp` → mount Yoga + routes + OpenAPI + `extend`" into a reusable
  `assembleApp(...)` that returns `{ httpApp, runEffect }` (the h3 instance is a
  standard fetch handler). `buildApp`'s `main` becomes: `const { httpApp } =
  yield* assembleApp(...)` then the existing `acquireRelease(serve…)` +
  `addFinalizer(teardown)` + `Effect.never`. No prod change.
- **Injectable DB layer.** Add optional `db?: Layer<DrizzleDb, …>` to
  `BuildAppOptions` (and to the internal assembly). When present it replaces the
  env-derived `DrizzleLayer` (`DrizzleDbLayer ⊕ DatabaseConfigFromEnv`); when
  absent, production behaviour is unchanged. The `SchemaRegistryLayer`
  (`buildSchemaRegistryLayer(dbSchemas, relations)`) is still provided so the
  injected DB is typed against the merged module schemas.

### 2. `@czo/kit/testing` → `bootTestApp`

```
bootTestApp(options: {
  modules: Module[]          // deps-first, e.g. [authModule(...), attributeModule()]
  migrations: string[]       // each module's migrations/ folder, applied in order
  image?: string             // default 'postgres:17'
}): Effect<{
  fetch(req: Request): Promise<Response>
  runEffect: <A,E>(e: Effect<A,E,any>) => Promise<A>
  close(): Promise<void>
}, …, Scope>
```

Behaviour:
1. Acquire a `PostgreSqlContainer` (reuse `PostgresContainer` / `acquireContainerUrl`
   from `@czo/kit/testing`), build a `DrizzleDb` via `makePgClientLayer(url)` +
   `PgDrizzle.makeWithDefaults({ relations })` with the **merged** module relations.
2. Apply each `migrations[]` folder sequentially with the existing `migrate(db, …)`
   effect (auth then attribute; no cross-FK — `attributes.organizationId` is a bare
   integer, no reference).
3. Provide that `DrizzleDb` as the injected `db` layer to the assembly, run
   `startup` + `started` (so `AccessService` registries are populated and frozen),
   and call `assembleApp` to get `{ httpApp, runEffect }`.
4. Return `fetch = (req) => httpApp.fetch(req)`, `runEffect`, and `close()` that
   plays `teardown` + releases the scope (container + pool).

Exposed as a scoped Effect so a suite can drive it with `@effect/vitest`'s
`layer()` (mirrors `AttributePostgresLayer`), or via `Effect.acquireRelease` in a
`beforeAll`/`afterAll`.

### 3. Unit under test — attribute node gate

In `packages/modules/attribute/src/graphql/schema/types.ts`:
- Add `nodeReadScope(attr)`: platform row (`organizationId == null`) → `{ auth: true }`;
  org-owned (`= X`) → `{ permission: { resource: 'attribute', actions: ['read'], organization: X } }`.
- On `drizzleNode('attributes')`: add `authScopes: nodeReadScope` and
  `runScopesOnType: true`. (`select: true` is already present, so `attr.organizationId`
  is loaded on every parent.)

## Test flow (pilot) — `attribute/src/e2e/node-authz.e2e.test.ts`

Using `bootTestApp([authModule(testConfig), attributeModule()], [authMigrations, attributeMigrations])`,
all over the real `fetch` handler:

1. `POST /api/auth/sign-up` → User A (token A).
2. GraphQL `createOrganization` as A → org X (relay id).
3. GraphQL `createAttribute(organizationId: X, type: DROPDOWN, …)` as A → attribute
   relay node id.
4. `POST /api/auth/sign-up` → User B (token B; no relation to X).
5. GraphQL `node(id: attrX) { ... on Attribute { slug } }` as **B** → **expect a
   `FORBIDDEN`/authorization error and `data.node == null`**. ← the assertion.
6. Same query as **A** → **expect `data.node.slug`** (gate allows the owner).

Assertions read the Yoga JSON envelope (`errors[].extensions.code` / `data`).

**Oracle semantics.** Step 5 is the verdict on `runScopesOnType` for drizzle
nodes. If B is denied → mechanism works, keep the node change. If B receives data
→ `runScopesOnType` does not fire on brand-resolved drizzle nodes; we record the
finding, revert the node change, and revisit (the value path stays closed by
`choiceAuthScope`; only attribute scalars leak via `node()`).

## Risks / open questions (resolved during implementation)

1. **Owner → `attribute:create` mapping.** Step 3 needs A to hold `attribute:create`
   in the org A just created. If `createOrganization` does not grant the creator a
   role covering dynamically-registered `attribute:*` permissions, the seed adds an
   explicit membership/role grant (via the org mutations or a direct `runEffect`
   service call) before step 3.
2. **Cross-package module imports resolve to `dist`, not `src`.** The attribute test
   imports `authModule` from `@czo/auth`. Per prior experience the shared
   `DrizzleDb` `Context.Tag` identity must match across packages, which can require
   the imported package to be **built** (dist) rather than a `src` alias. Mitigation:
   ensure `@czo/auth` (and `@czo/kit`) are built before the e2e run, or align
   tsconfig paths so the Tag is a single module instance. The plan must pin this
   down first (a one-import smoke check) before writing the full flow.
3. **`runEffect` reentry in `bootTestApp`.** `assembleApp`'s `runEffect` closes over
   the app `Context`; `bootTestApp` must capture and expose the same one so test-side
   `runEffect` (used for any direct seeding) shares the runtime.

## Files

- `packages/kit/src/module/app.ts` — extract `assembleApp`; add injectable `db`.
- `packages/kit/src/testing/postgres.ts` (or a new `testing/boot.ts`) — `bootTestApp`.
- `packages/kit/src/testing/index.ts` — export `bootTestApp`.
- `packages/modules/attribute/src/graphql/schema/types.ts` — node `authScopes` +
  `runScopesOnType`.
- `packages/modules/attribute/src/e2e/node-authz.e2e.test.ts` — pilot E2E.

## Verification

- `pnpm --filter @czo/kit check-types` + `pnpm --filter @czo/kit test` (assembly seam
  doesn't regress existing kit tests).
- `pnpm --filter @czo/attribute test` includes the new e2e (Testcontainers).
- Manual reasoning check: production `buildApp`/`runApp` path unchanged (the `db`
  option defaults to env; `assembleApp` is the same code path).
