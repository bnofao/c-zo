# Per-module E2E boot harness (`bootTestApp`) + Attribute `node()` authz — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable kit testing seam, `bootTestApp`, that boots a set of modules on a Testcontainers Postgres and returns a fetchable app, then use it to prove (real-authz, in `pnpm test`) that a relay `node()` lookup of an org-owned `Attribute` is denied cross-org.

**Architecture:** Extract the h3-app assembly out of `buildApp`'s `main` into a reusable `assembleApp`, and make the `DrizzleDb` layer injectable. `bootTestApp` reuses that assembly over a container DB and exposes `{ fetch, runEffect, close }`. The attribute `drizzleNode` gains a type-level `authScopes` + `runScopesOnType: true`; a pilot E2E test drives the real HTTP fetch handler with real sign-up/sign-in tokens.

**Tech Stack:** Effect-TS, `@czo/kit` module system, h3 (`H3` fetch handler), graphql-yoga, Pothos scope-auth + relay + drizzle, `@testcontainers/postgresql`, `@effect/vitest`.

---

## Pre-flight (read once)

- **No autonomous commits.** This repo stages with `git add` during execution and commits ONCE at the end after explicit user review (CLAUDE.md). Every "Stage" step below uses `git add` only — do **not** `git commit`.
- **Build before cross-package e2e.** Task 5 imports `@czo/auth` from the attribute package; the shared `DrizzleDb` `Context.Tag` identity must be a single module instance. Run `pnpm --filter @czo/auth build && pnpm --filter @czo/kit build` before running Task 5's test. Task 0 verifies this assumption first.
- **Run tests from the package dir**, e.g. `cd packages/modules/attribute && pnpm test <file>`.

---

## Task 0: De-risk — cross-package boot + DrizzleDb Tag identity

Proves the riskiest assumption (Task 5 depends on it) before building anything.

**Files:**
- Create (temporary): `scratchpad/boot-spike.ts`

- [ ] **Step 1: Write a throwaway spike that boots auth+attribute via `buildApp` and runs one trivial query**

```ts
// scratchpad/boot-spike.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { buildApp } from '@czo/kit/module'
import authModule from '@czo/auth'
import attributeModule from '@czo/attribute'

const pg = await new PostgreSqlContainer('postgres:17').start()
process.env.DATABASE_URL = pg.getConnectionUri()
process.env.AUTH_SECRET = 'x'.repeat(40)
process.env.AUTH_APP = 'spike'

const built = buildApp({
  modules: [authModule({} as never), attributeModule()],
  http: { port: 0 },
})
console.log('modules:', built.modules.map(m => m.name).join(', '))
await pg.stop()
```

- [ ] **Step 2: Run it and confirm it composes without a Tag-identity error**

Run: `pnpm --filter @czo/auth build && pnpm --filter @czo/kit build && cd packages/modules/attribute && node --import tsx ../../../scratchpad/boot-spike.ts`
Expected: prints `modules: auth, attribute` with no "Service not found" / duplicate-Tag error.
- If it FAILS with a DrizzleDb/Tag resolution error → record the exact resolution path (src vs dist) in the plan notes; the fix is to ensure `@czo/auth`/`@czo/kit` resolve to built `dist` (already built above) or to align `tsconfig` paths. Do not proceed to Task 5 until green.

- [ ] **Step 3: Delete the spike**

Run: `rm -f scratchpad/boot-spike.ts`

- [ ] **Step 4: Stage** (nothing to stage; spike deleted). Note the outcome in the PR description later.

---

## Task 1: kit seam — extract `assembleApp`, make DB injectable

**Files:**
- Modify: `packages/kit/src/module/app.ts` (the `main` Effect in `buildApp`, ~lines 185-296; `BuildAppOptions` type; the `DrizzleLayer` wiring ~lines 137-148)
- Test: `packages/kit/src/module/app.test.ts` (create if absent; else add a case)

- [ ] **Step 1: Add an injectable `db` option to `BuildAppOptions`**

In the `BuildAppOptions` interface (top of `app.ts` / its types module), add:

```ts
  /**
   * Override the database layer. Production omits this (DB comes from env via
   * `DrizzleDbLayer ⊕ DatabaseConfigFromEnv`). Tests inject a Testcontainers
   * `DrizzleDb` so the booted app talks to an ephemeral container.
   */
  readonly db?: Layer.Layer<DrizzleDb, unknown, never>
```

- [ ] **Step 2: Use the injected DB layer when present**

Replace the `DrizzleLayer` construction (currently lines ~139-142):

```ts
  const DrizzleLayer = options.db ?? DrizzleDbLayer.pipe(
    Layer.provide(SchemaRegistryLayer),
    Layer.provide(DatabaseConfigFromEnv),
  )
```

(The injected layer is already a fully-built `DrizzleDb`; the env branch keeps the `SchemaRegistryLayer`/`DatabaseConfigFromEnv` wiring.)

- [ ] **Step 3: Extract the app assembly out of `main` into `assembleApp`**

Inside `buildApp`, define `assembleApp` BEFORE `main`, containing the current body of `main` from the `appContext` capture through the `options.extend` hook (current lines ~195-278), and returning the handler + runEffect:

```ts
  // Assemble the h3 fetch app (schema → Yoga → module routes → OpenAPI →
  // extend) WITHOUT serving. Shared by prod (`main`, which adds serve+never)
  // and `@czo/kit/testing`'s `bootTestApp` (which drives `httpApp.fetch`).
  const assembleApp = Effect.gen(function* () {
    const appContext = yield* Effect.context<GraphQLBuilder>()
    const graphQLBuilder = yield* GraphQLBuilder
    const gqlSchema = yield* graphQLBuilder.buildSchema()

    const httpApp = typeof options.httpApp === 'function'
      ? options.httpApp()
      : options.httpApp ?? new H3()

    const runEffect = <A, E>(effect: Effect.Effect<A, E, any>): Promise<A> =>
      Effect.runPromiseWith(appContext)(effect)

    httpApp.use((event) => {
      event.context.runEffect = runEffect
    })

    const yoga = options.graphQLApp?.(gqlSchema) ?? createYoga<{ pendingCookies?: string[] }, GraphQLContextMap>({
      schema: gqlSchema,
      context: async (initialContext) => {
        const pendingCookies = initialContext.pendingCookies ?? []
        const setCookie = (serialized: string): void => { pendingCookies.push(serialized) }
        Object.assign(initialContext, { setCookie })
        const userCtx = await runEffect(graphQLBuilder.buildContext(initialContext))
        return { ...userCtx, runEffect, setCookie }
      },
      plugins: [
        {
          onResponse({ response, serverContext }) {
            const pending = (serverContext as { pendingCookies?: string[] })?.pendingCookies ?? []
            for (const value of pending)
              response.headers.append('set-cookie', value)
          },
        },
      ],
    })

    httpApp.all(yoga.graphqlEndpoint, fromNodeHandler(yoga))

    for (const m of options.modules) {
      if (m.http)
        yield* m.http(httpApp)
    }

    const apiRoutes = options.modules.flatMap(m => m.routes ? [...m.routes] : [])
    for (const dup of findDuplicateRoutes(apiRoutes))
      yield* Effect.logWarning(`OpenAPI: duplicate route ${dup} — last operation wins in the document`)

    const oa = options.openapi
    const exposeDocs = oa ? (oa.enabled ?? process.env.NODE_ENV !== 'production') : false
    mountOpenApi(
      httpApp,
      apiRoutes,
      oa && exposeDocs
        ? {
            info: { title: oa.title, version: oa.version, description: oa.description },
            jsonPath: oa.jsonPath ?? '/openapi.json',
            uiPath: oa.uiPath ?? '/reference',
            cdn: oa.cdn,
          }
        : undefined,
    )

    if (options.extend)
      yield* options.extend(httpApp)

    return { httpApp, runEffect }
  })
```

- [ ] **Step 4: Rewrite `main` to consume `assembleApp` + serve (prod unchanged in behaviour)**

```ts
  const main = Effect.gen(function* () {
    yield* startup
    yield* started

    const { httpApp } = yield* assembleApp

    yield* Effect.acquireRelease(
      Effect.sync(() => serve(httpApp, { port, hostname })),
      s => Effect.promise(async () => { await s.close() }),
    )
    yield* Effect.addFinalizer(() => teardown)
    yield* Effect.log(`Server listening on http://${hostname}:${port}`)
    yield* Effect.never
  })
```

- [ ] **Step 5: Expose `assembleApp` + `appLayer` on the return value** so `bootTestApp` can reuse them

Change the return of `buildApp` from `{ program, modules, startup, started, teardown }` to also include the assembly seam. Add the three fields:

```ts
  return { program, modules: options.modules, startup, started, teardown, assembleApp, appLayer }
```

Update the `BuiltApp` type to include:

```ts
  readonly assembleApp: Effect.Effect<{ httpApp: H3, runEffect: <A, E>(e: Effect.Effect<A, E, any>) => Promise<A> }, unknown, GraphQLBuilder>
  readonly appLayer: Layer.Layer<GraphQLBuilder | DrizzleDb, unknown, never>
```

- [ ] **Step 6: Write a kit test that the prod return shape still builds + new fields exist**

```ts
// packages/kit/src/module/app.test.ts
import { describe, expect, it } from 'vitest'
import { buildApp } from './app'

describe('buildApp', () => {
  it('exposes the assembly seam and an injectable db option', () => {
    const built = buildApp({ modules: [], http: { port: 0 } })
    expect(built.assembleApp).toBeDefined()
    expect(built.appLayer).toBeDefined()
    expect(typeof built.program).toBe('object')
  })
})
```

- [ ] **Step 7: Run kit type-check + tests**

Run: `pnpm --filter @czo/kit check-types && pnpm --filter @czo/kit test`
Expected: PASS (existing kit tests unchanged; new test passes).

- [ ] **Step 8: Stage**

```bash
git add packages/kit/src/module/app.ts packages/kit/src/module/app.test.ts
```

---

## Task 2: `bootTestApp` in `@czo/kit/testing`

**Files:**
- Create: `packages/kit/src/testing/boot.ts`
- Modify: `packages/kit/src/testing/index.ts` (add export)

- [ ] **Step 1: Implement `bootTestApp`**

```ts
// packages/kit/src/testing/boot.ts
import type { BuildAppOptions } from '../module/app'
import type { Module } from '../module/contract'
import type { H3 } from 'h3'
import { DrizzleDb, makePgClientLayer } from '../db'
import { buildApp } from '../module/app'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { PgDrizzle } from '@effect/sql-drizzle/Pg'
import { Effect, Layer } from 'effect'
import { acquireContainerUrl } from './postgres'

export interface BootTestApp {
  /** Drive the real h3 fetch handler — GraphQL at `/graphql`, module routes (e.g. `/api/auth/**`). */
  readonly fetch: (req: Request) => Promise<Response>
  /** Re-enter the app's Effect runtime (same context the resolvers use) for direct seeding. */
  readonly runEffect: <A, E>(e: Effect.Effect<A, E, any>) => Promise<A>
  /** Tear down the app (module `teardown`) + release the container/pool scope. */
  readonly close: () => Promise<void>
}

export interface BootTestAppOptions {
  /** Modules to boot, dependency-first (e.g. `[authModule(cfg), attributeModule()]`). */
  readonly modules: Module[]
  /** Each module's `migrations/` folder, applied in array order on the one container. */
  readonly migrations: readonly string[]
  /** Extra `buildApp` options (e.g. `openapi`); `db`/`http`/`modules` are managed here. */
  readonly buildOptions?: Omit<BuildAppOptions, 'modules' | 'db' | 'http'>
  readonly image?: string
}

/**
 * Boot a kit app on an ephemeral Postgres (Testcontainers) and return a
 * fetchable handler — no socket, no `serve`. Scoped: the container + pool live
 * for the returned scope; `close()` (or scope exit) releases them.
 */
export function bootTestApp(options: BootTestAppOptions): Effect.Effect<BootTestApp, unknown, never> {
  return Effect.gen(function* () {
    const url = yield* acquireContainerUrl(options.image ?? 'postgres:17')

    // Build the app composition (shares buildApp's schema/relations merge), but
    // inject a container-backed DrizzleDb instead of the env layer.
    const dbSchemas = Object.assign({}, ...options.modules.map(m => m.db?.schema ?? {}))
    const relations = Object.assign(
      {},
      ...options.modules.flatMap(m => m.db?.relations ? [m.db.relations(dbSchemas)] : []),
    )

    const dbLayer = Layer.effect(
      DrizzleDb,
      PgDrizzle.makeWithDefaults({ relations }).pipe(
        Effect.flatMap(db =>
          Effect.forEach(options.migrations, folder =>
            migrate(db, { migrationsFolder: folder }).pipe(Effect.orDie),
          ).pipe(Effect.as(db)),
        ),
      ),
    ).pipe(Layer.provide(makePgClientLayer(url)))

    const built = buildApp({
      modules: options.modules,
      db: dbLayer as never,
      http: { port: 0 },
      ...options.buildOptions,
    })

    // Run startup → started → assemble, keeping the app scope OPEN (so the
    // runtime + DB stay alive for fetch calls). We build the appLayer's scope
    // here and expose a manual close().
    const scope = yield* Effect.scope
    const ctx = yield* Layer.buildWithScope(built.appLayer, scope)

    const assembled = yield* built.assembleApp.pipe(
      Effect.provide(ctx),
      Effect.tap(() => built.startup.pipe(Effect.provide(ctx))),
    )

    // startup/started must run BEFORE first request (AccessService freeze).
    yield* built.startup.pipe(Effect.provide(ctx))
    yield* built.started.pipe(Effect.provide(ctx))

    const httpApp = assembled.httpApp as H3

    return {
      fetch: (req: Request) => httpApp.fetch(req),
      runEffect: assembled.runEffect,
      close: () =>
        Effect.runPromise(built.teardown.pipe(Effect.provide(ctx))).catch(() => undefined),
    }
  })
}
```

> NOTE for the implementer: `Layer.buildWithScope` + ordering of `startup`/`started`/`assembleApp` is the one delicate spot. The invariant: `startup` (registrations) then `started` (freeze) must complete before any `fetch`. If `@effect/sql-drizzle/Pg` import path or `migrate` import path differs in this repo, copy the exact paths from `packages/kit/src/testing/postgres.ts` and `packages/kit/src/db/index.ts` (Task 2 Step 2 verifies).

- [ ] **Step 2: Reconcile imports with the existing testing/db modules**

Open `packages/kit/src/testing/postgres.ts` and `packages/kit/src/db/index.ts`; confirm the exact import specifiers for `migrate`, `PgDrizzle`, `makePgClientLayer`, and `acquireContainerUrl`. Fix `boot.ts`'s imports to match. (postgres.ts already imports `migrate`, `PgDrizzle.makeWithDefaults`, `makePgClientLayer`, and defines/uses `acquireContainerUrl`.)

- [ ] **Step 3: Export `bootTestApp`**

```ts
// packages/kit/src/testing/index.ts  (add)
export { type BootTestApp, type BootTestAppOptions, bootTestApp } from './boot'
```

- [ ] **Step 4: Type-check kit**

Run: `pnpm --filter @czo/kit check-types`
Expected: PASS.

- [ ] **Step 5: Build kit (Task 3/5 import it cross-package)**

Run: `pnpm --filter @czo/kit build`
Expected: build succeeds.

- [ ] **Step 6: Stage**

```bash
git add packages/kit/src/testing/boot.ts packages/kit/src/testing/index.ts
```

---

## Task 3: Attribute smoke E2E — prove boot + fetch (single module)

Proves `bootTestApp` + the real fetch handler work end-to-end with ONE package
(no cross-package auth yet), de-risking the seam independently of authz.

**Files:**
- Create: `packages/modules/attribute/src/e2e/boot-smoke.e2e.test.ts`

- [ ] **Step 1: Write the smoke test (introspect `__typename` over real HTTP)**

```ts
// packages/modules/attribute/src/e2e/boot-smoke.e2e.test.ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootTestApp } from '@czo/kit/testing'
import { Effect } from 'effect'
import { afterAll, beforeAll, expect, it } from 'vitest'
import attributeModule from '../index'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')

let app: Awaited<ReturnType<typeof boot>>
let release: () => Promise<void>

function boot() {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const a = yield* bootTestApp({ modules: [attributeModule()], migrations: [MIGRATIONS] })
        // Hand the scope's release out so afterAll can close it.
        return a
      }),
    ).pipe(Effect.provide(Effect.Service as never)) as never,
  )
}

beforeAll(async () => {
  // Boot with a long-lived scope (manual close in afterAll).
  const scope = await Effect.runPromise(Effect.scopeMake())
  app = await Effect.runPromise(bootTestApp({ modules: [attributeModule()], migrations: [MIGRATIONS] }).pipe(Effect.provideService(/* Scope */ undefined as never, scope)) as never)
  release = () => app.close()
}, 120_000)

afterAll(async () => { await release?.() })

it('boots and serves GraphQL over the fetch handler', async () => {
  const res = await app.fetch(new Request('http://t/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ __typename }' }),
  }))
  const json = await res.json()
  expect(json.data.__typename).toBe('Query')
})
```

> NOTE: the `beforeAll` scope wiring above is intentionally explicit because
> `bootTestApp` is scoped. The implementer SHOULD prefer the `@effect/vitest`
> `layer()` form if it reads cleaner — wrap `bootTestApp` in a `Layer.scoped`
> service Tag and use `layer(BootLayer)`. Pick whichever compiles; the assertion
> body (`__typename === 'Query'`) is the contract.

- [ ] **Step 2: Run the smoke test**

Run: `cd packages/modules/attribute && pnpm test src/e2e/boot-smoke.e2e.test.ts`
Expected: PASS — `__typename` is `Query`. If scope wiring fights you, switch to the `layer()` form before moving on.

- [ ] **Step 3: Stage**

```bash
git add packages/modules/attribute/src/e2e/boot-smoke.e2e.test.ts
```

---

## Task 4: Apply the node gate (unit under test)

**Files:**
- Modify: `packages/modules/attribute/src/graphql/schema/types.ts`

- [ ] **Step 1: Add `nodeReadScope` helper** (next to `choiceAuthScope`)

```ts
/**
 * Type-level gate for the Attribute node itself, derived from the row's own org.
 * With `runScopesOnType: true` on the node, scope-auth enforces this even when the
 * Attribute is reached through the relay `Node` interface (`node(id:)`/`nodes(ids:)`).
 *   • platform row (organizationId = null) → any authenticated caller.
 *   • org-owned row (organizationId = X)   → `attribute:read` in X.
 */
function nodeReadScope(attr: { organizationId: number | null }) {
  return attr.organizationId == null
    ? { auth: true as const }
    : { permission: { resource: 'attribute', actions: ['read'], organization: attr.organizationId } }
}
```

- [ ] **Step 2: Add `authScopes` + `runScopesOnType` to `drizzleNode('attributes')`**

In the `builder.drizzleNode('attributes', { ... })` options, add the two fields (keep existing `name`, `select: true`, `id`, `fields`):

```ts
  builder.drizzleNode('attributes', {
    name: 'Attribute',
    select: true,
    runScopesOnType: true,
    authScopes: nodeReadScope,
    id: { column: a => a.id },
    fields: t => ({
      // …unchanged…
    }),
  })
```

- [ ] **Step 3: Type-check + existing tests still green**

Run: `cd packages/modules/attribute && pnpm check-types && pnpm lint --max-warnings 0 && pnpm test`
Expected: PASS (38 existing tests + boot-smoke). `runScopesOnType`/`authScopes` accepted on `DrizzleNodeOptions`; `nodeReadScope`'s `false`-free return unions fine.

- [ ] **Step 4: Stage**

```bash
git add packages/modules/attribute/src/graphql/schema/types.ts
```

---

## Task 5: Oracle E2E — `node()` cross-org denied (auth + attribute)

The verdict on whether `runScopesOnType` fires for drizzle relay nodes.

**Files:**
- Create: `packages/modules/attribute/src/e2e/node-authz.e2e.test.ts`

**Prereq:** Task 0 green; `@czo/auth` + `@czo/kit` built (`pnpm --filter @czo/auth build && pnpm --filter @czo/kit build`).

- [ ] **Step 1: Write helpers for the HTTP flow**

```ts
// packages/modules/attribute/src/e2e/node-authz.e2e.test.ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootTestApp } from '@czo/kit/testing'
import { Effect } from 'effect'
import { afterAll, beforeAll, expect, it } from 'vitest'
import authModule from '@czo/auth'
import attributeModule from '../index'

const here = dirname(fileURLToPath(import.meta.url))
const ATTR_MIGRATIONS = resolve(here, '../../migrations')
// Resolve auth's migrations folder relative to its package root.
const AUTH_MIGRATIONS = resolve(here, '../../../auth/migrations')

let app: Awaited<ReturnType<typeof Effect.runPromise>>
let close: () => Promise<void>

async function post(path: string, body: unknown, token?: string) {
  const res = await app.fetch(new Request(`http://t${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }))
  return { status: res.status, json: await res.json().catch(() => null) }
}

async function gql(query: string, variables: Record<string, unknown>, token?: string) {
  return post('/graphql', { query, variables }, token)
}
```

- [ ] **Step 2: Boot auth+attribute in `beforeAll`**

```ts
beforeAll(async () => {
  process.env.AUTH_SECRET = 'x'.repeat(40)
  process.env.AUTH_APP = 'test'
  const scope = await Effect.runPromise(Effect.scopeMake())
  app = await Effect.runPromise(
    bootTestApp({
      modules: [authModule({} as never), attributeModule()],
      migrations: [AUTH_MIGRATIONS, ATTR_MIGRATIONS],
    }).pipe(Effect.provideService(undefined as never, scope)) as never,
  ) as never
  close = () => (app as { close: () => Promise<void> }).close()
}, 180_000)

afterAll(async () => { await close?.() })
```

> NOTE: mirror the SAME scope wiring chosen in Task 3 (plain scope or `layer()`).
> `authModule({} as never)` — pass whatever minimal config the auth module
> factory requires; read `packages/modules/auth/src/index.ts`'s default export
> signature and supply it (e.g. `{}` if it reads all config from `Config`/env).

- [ ] **Step 3: Write the oracle test**

```ts
it('node() of an org-owned attribute is denied cross-org, allowed to a member', async () => {
  // 1. User A signs up.
  const signA = await post('/api/auth/sign-up', { email: 'a@t.io', name: 'A', password: 'password123' })
  expect(signA.status).toBeLessThan(300)
  const tokenA: string = signA.json?.token ?? signA.json?.session?.token
  expect(tokenA).toBeTruthy()

  // 2. A creates an organization (A becomes its owner/member).
  const org = await gql(
    'mutation($input: CreateOrganizationInput!){ createOrganization(input:$input){ ... on CreateOrganizationSuccess { organization { id } } } }',
    { input: { name: 'Org A', slug: 'org-a' } },
    tokenA,
  )
  const orgId: string = org.json?.data?.createOrganization?.organization?.id
  expect(orgId).toBeTruthy()

  // 3. A creates an ORG-OWNED attribute in that org.
  //    If this returns FORBIDDEN, A's owner role lacks attribute:create — see
  //    Step 4 fallback (grant the role) and re-run.
  const attr = await gql(
    'mutation($input: CreateAttributeInput!){ createAttribute(input:$input){ ... on CreateAttributeSuccess { attribute { id slug } } } }',
    { input: { name: 'Secret Pick', type: 'DROPDOWN', organizationId: orgId } },
    tokenA,
  )
  const nodeId: string = attr.json?.data?.createAttribute?.attribute?.id
  expect(nodeId).toBeTruthy()

  // 4. User B signs up — no relation to Org A.
  const signB = await post('/api/auth/sign-up', { email: 'b@t.io', name: 'B', password: 'password123' })
  const tokenB: string = signB.json?.token ?? signB.json?.session?.token
  expect(tokenB).toBeTruthy()

  // 5. B reads the node → MUST be denied.
  const asB = await gql(
    'query($id: ID!){ node(id:$id){ ... on Attribute { slug } } }',
    { id: nodeId },
    tokenB,
  )
  expect(asB.json?.data?.node).toBeNull()
  expect(asB.json?.errors?.length ?? 0).toBeGreaterThan(0)

  // 6. A reads the node → allowed (control: gate is not always-deny).
  const asA = await gql(
    'query($id: ID!){ node(id:$id){ ... on Attribute { slug } } }',
    { id: nodeId },
    tokenA,
  )
  expect(asA.json?.data?.node?.slug).toBe('secret-pick')
}, 60_000)
```

- [ ] **Step 4: Run the oracle test — record the verdict**

Run: `pnpm --filter @czo/auth build && pnpm --filter @czo/kit build && cd packages/modules/attribute && pnpm test src/e2e/node-authz.e2e.test.ts`

Two real outcomes (this test is the experiment):
- **PASS** → `runScopesOnType` enforces on the drizzle relay node. Keep Task 4's change. Done.
- **Step 5 (B) gets data instead of null** → `runScopesOnType` does NOT fire for brand-resolved drizzle nodes. **Revert Task 4** (`git checkout -- packages/modules/attribute/src/graphql/schema/types.ts`), keep this test as `it.skip` with a comment documenting the finding, and surface to the user (the value path stays closed by `choiceAuthScope`; only attribute scalars leak via `node()`).
- **Step 3 (createAttribute) FORBIDDEN** → owner lacks `attribute:create`. Add this seed before Step 5, then re-run:

```ts
  // Fallback seed: grant A's membership a role covering attribute:* in the org.
  // Use the auth OrganizationService via the app runtime. Read
  // packages/modules/auth/src/services/organization.ts for the exact method
  // (e.g. addMember / setMemberRole) and the role name registered for attribute
  // (`attribute:manager` grants create/update).
  await (app as { runEffect: <A,E>(e: Effect.Effect<A,E,any>) => Promise<A> }).runEffect(
    Effect.gen(function* () {
      // const org = yield* OrganizationService
      // yield* org.setMemberRole({ orgId: decode(orgId), userId: A.id, role: 'attribute:manager' })
    }),
  )
```

- [ ] **Step 6: Stage**

```bash
git add packages/modules/attribute/src/e2e/node-authz.e2e.test.ts
# plus types.ts if reverted in the failure branch
```

---

## Task 6: Final verification + memory

- [ ] **Step 1: Full module test + type-check + lint**

Run: `cd packages/modules/attribute && pnpm check-types && pnpm lint --max-warnings 0 && pnpm test`
Expected: all green (38 prior + boot-smoke + node-authz, or node-authz skipped per the failure branch).

- [ ] **Step 2: kit unchanged-prod sanity**

Run: `pnpm --filter @czo/kit check-types && pnpm --filter @czo/kit test`
Expected: PASS.

- [ ] **Step 3: Update memory**

Update `project_attribute_module.md` and add a `reference_kit_boottestapp.md` (one-line `MEMORY.md` index entry) capturing: `bootTestApp({modules, migrations})` boots a fetchable kit app on Testcontainers; the node()-authz verdict (works / does-not-fire) recorded from Task 5.

- [ ] **Step 4: Report** which validations ran and the Task 5 verdict. Do NOT commit — await user review (CLAUDE.md).

---

## Self-review notes (author)

- **Spec coverage:** kit seam (Task 1), `bootTestApp` (Task 2), node change (Task 4), pilot E2E (Task 5), risks — owner-role (Task 5 Step 4 fallback), cross-package dist/Tag (Task 0 + pre-flight), `runEffect` reentry (Task 2 `assembled.runEffect`). All mapped.
- **Empirical points are explicit:** Task 0 (Tag identity) and Task 5 (the oracle) have real PASS/FAIL branches rather than assumed outcomes — by design; this plan's purpose is to settle an unverified mechanism.
- **No commits:** every "Stage" uses `git add` only, per project rule (overrides the skill's commit steps).
- **Known soft spots flagged for the implementer:** scoped-Effect wiring of `bootTestApp` in tests (Task 3 NOTE — prefer `layer()` if cleaner) and exact import specifiers (Task 2 Step 2) — both have a concrete reconciliation step rather than a guess.
