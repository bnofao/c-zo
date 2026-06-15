# `@czo/translation` Sub-Graph Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag the `@czo/translation` GraphQL surface into audience sub-graphs — locale reads into `['public','admin']`, locale management (mutations + errors) into `['admin']` — closing the last module in the sub-graph rollout sprint.

**Architecture:** `@pothos/plugin-sub-graph` opt-in tagging via a module-local `sg()` helper. Reads (already partly `['public']`) widen to `['public','admin']` so the admin app is self-contained; the untagged by-id `locale` query gets the gap-fix; the three global-admin mutations + their two errors get tagged `['admin']`. No service/migration/authz/node-guard change. An exposure E2E proves isolation at `/graphql/public` and `/graphql/admin`.

**Tech Stack:** Pothos, `@pothos/plugin-sub-graph`, `@pothos/plugin-drizzle` (relay connections/nodes), Effect-TS, Vitest + Testcontainers (`bootTestApp`).

**Spec:** `docs/superpowers/specs/2026-06-14-translation-subgraphs-design.md`

---

## File Structure

- Create: `packages/modules/translation/src/graphql/schema/subgraphs.ts` — `sg()` helper.
- Modify: `packages/modules/translation/src/graphql/schema/locale/queries.ts` — tag 3 reads `['public','admin']` (incl. 3-position connection + by-id gap-fix).
- Modify: `packages/modules/translation/src/graphql/schema/locale/types.ts` — tag `Locale` node `['public','admin']`.
- Modify: `packages/modules/translation/src/graphql/schema/locale/mutations.ts` — 5-point tag 3 mutations `['admin']` via `sg()`.
- Modify: `packages/modules/translation/src/graphql/schema/locale/errors.ts` — tag 2 errors `['admin']`.
- Modify: `packages/modules/translation/src/e2e/harness.ts` — add `subGraphs?` boot option forwarded to `bootTestApp`.
- Create: `packages/modules/translation/src/e2e/subgraph-exposure.e2e.test.ts` — endpoint-level isolation E2E.

---

### Task 1: Add the `sg()` helper

**Files:**
- Create: `packages/modules/translation/src/graphql/schema/subgraphs.ts`

- [ ] **Step 1: Create the helper file**

```ts
import type { SubGraphName } from '@czo/kit/graphql'

/**
 * Expand one or more audiences into the option fragments a `relayMutationField`
 * needs. Spread `field`/`input`/`payload` into the 3rd/2nd/4th args and merge
 * `errorOpts` into the field's `errors` option (alongside `types`).
 */
export function sg(...names: SubGraphName[]) {
  const subGraphs = names
  return {
    field: { subGraphs },
    input: { subGraphs },
    payload: { subGraphs },
    errorOpts: { union: { subGraphs }, result: { subGraphs } },
  } as const
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @czo/translation check-types`
Expected: PASS (no new errors; helper is unused until later tasks).

- [ ] **Step 3: Stage**

```bash
git add packages/modules/translation/src/graphql/schema/subgraphs.ts
```

(Do NOT commit. Staging only — single commit at sprint end after user review.)

---

### Task 2: Tag the read surface `['public','admin']`

Widen the three reads and the node, and fix the untagged by-id `locale` query. The connection gets the full 3-position tag (field options + connection-type 2nd arg + edge-type 3rd arg) — matching the proven inventory recipe.

**Files:**
- Modify: `packages/modules/translation/src/graphql/schema/locale/queries.ts`
- Modify: `packages/modules/translation/src/graphql/schema/locale/types.ts`

- [ ] **Step 1: Tag the `Locale` node in `types.ts`**

Replace `subGraphs: ['public'],` (line 5) with:

```ts
    subGraphs: ['public', 'admin'],
```

Full context after the edit (the `drizzleNode` call opening):

```ts
  builder.drizzleNode('locales', {
    name: 'Locale',
    subGraphs: ['public', 'admin'],
    description: 'A platform-wide locale in the global registry. Consumer modules key their translations by a locale `code`; one locale is the platform default.',
```

- [ ] **Step 2: Tag all three queries in `queries.ts`**

Replace the entire body of `registerLocaleQueries` with the version below. Changes: `locales` connection now tags **3 positions**; `locale` (by-id) **gains** `subGraphs`; `defaultLocale` widens to `['public','admin']`.

```ts
export function registerLocaleQueries(builder: TranslationGraphQLSchemaBuilder): void {
  builder.queryField('locales', t =>
    t.drizzleConnection({
      type: 'locales',
      subGraphs: ['public', 'admin'],
      description: 'Paginated (relay) connection over the platform locale registry. Public read.',
      args: { activeOnly: t.arg.boolean({ description: 'When true, return only active locales; defaults to false (all).' }) },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.listLocales({ activeOnly: args.activeOnly ?? false, query: query({}) })
        })) as Promise<any>,
    }, { subGraphs: ['public', 'admin'] }, { subGraphs: ['public', 'admin'] }))

  builder.queryField('locale', t =>
    t.drizzleField({
      type: 'locales',
      subGraphs: ['public', 'admin'],
      nullable: true,
      description: 'Fetch a single locale by id. Public read; returns null if not found.',
      args: { id: t.arg.globalID({ for: 'Locale', required: true, description: 'Relay global id of the Locale to fetch.' }) },
      resolve: async (_query, _root, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.findLocaleById(Number(args.id.id))
        }).pipe(Effect.catchTag('LocaleNotFound', () => Effect.succeed(null)))),
    }))

  builder.queryField('defaultLocale', t =>
    t.drizzleField({
      type: 'locales',
      subGraphs: ['public', 'admin'],
      nullable: true,
      description: 'The platform default locale, used as the fallback when a translation is missing. Null if none is configured. Public read.',
      resolve: async (_query, _root, _args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.getDefaultLocale()
        })) as Promise<any>,
    }))
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @czo/translation check-types`
Expected: PASS.

- [ ] **Step 4: Stage**

```bash
git add packages/modules/translation/src/graphql/schema/locale/queries.ts packages/modules/translation/src/graphql/schema/locale/types.ts
```

---

### Task 3: Tag mutations `['admin']` (5-point) + errors `['admin']`

All three mutations carry an `errors` block, so each gets the full 5-point spread. The errors merge into the existing `errors: { types: [...] }` via `...sg('admin').errorOpts`.

**Files:**
- Modify: `packages/modules/translation/src/graphql/schema/locale/mutations.ts`
- Modify: `packages/modules/translation/src/graphql/schema/locale/errors.ts`

- [ ] **Step 1: Import `sg` in `mutations.ts`**

Add this import alongside the existing imports (after the `./errors` import line):

```ts
import { sg } from '../subgraphs'
```

- [ ] **Step 2: 5-point tag `createLocale`**

In the `createLocale` call:

Input-options object (2nd arg) — add `...sg('admin').input,` as the FIRST key, before `inputFields`:

```ts
    {
      ...sg('admin').input,
      inputFields: t => ({
        code: t.string({ required: true, validate: z.string().min(2).max(16).transform(v => v.trim().toLowerCase()), description: 'BCP-47 locale code; trimmed and lowercased. Must be unique in the registry.' }),
        name: t.string({ required: true, validate: z.string().min(1).max(128), description: 'Human-readable display name of the locale.' }),
        isActive: t.boolean({ description: 'Whether the locale is active on creation; defaults to the service default.' }),
      }),
    },
```

Field-options object (3rd arg) — add `...sg('admin').field,` as the FIRST key, and merge `...sg('admin').errorOpts` into `errors`:

```ts
    {
      ...sg('admin').field,
      description: 'Add a locale to the platform registry. Requires the global `locale:create` permission. Fails with LocaleCodeTaken if the code already exists.',
      errors: { types: [ValidationError, LocaleCodeTaken], ...sg('admin').errorOpts },
      authScopes: () => ({ permission: { resource: 'locale', actions: ['create'] } }),
      resolve: async (_root, args, ctx) => {
        const locale = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.createLocale({ code: args.input.code, name: args.input.name, isActive: args.input.isActive ?? undefined })
        }))
        return { locale }
      },
    },
```

Payload-options object (4th arg) — add `...sg('admin').payload,` as the FIRST key, before `outputFields`:

```ts
    {
      ...sg('admin').payload,
      outputFields: t => ({
        locale: t.field({ type: 'Locale', resolve: p => p.locale, description: 'The newly created locale.' }),
      }),
    },
```

- [ ] **Step 3: 5-point tag `updateLocale`**

Same three insertions. Input-options (2nd arg):

```ts
    {
      ...sg('admin').input,
      inputFields: t => ({
        id: t.globalID({ for: 'Locale', required: true, description: 'The Locale to update.' }),
        version: t.int({ required: true, description: 'Optimistic-lock version; must match the current row or the update is rejected.' }),
        name: t.string({ validate: z.string().min(1).max(128).optional(), description: 'New display name; omit to leave unchanged.' }),
        isActive: t.boolean({ description: 'New active state; omit to leave unchanged.' }),
      }),
    },
```

Field-options (3rd arg):

```ts
    {
      ...sg('admin').field,
      description: 'Update a locale\'s name or active state. Requires the global `locale:update` permission.',
      errors: { types: [ValidationError, LocaleNotFound, OptimisticLockError], ...sg('admin').errorOpts },
      authScopes: () => ({ permission: { resource: 'locale', actions: ['update'] } }),
      resolve: async (_root, args, ctx) => {
        const locale = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.updateLocale(Number(args.input.id.id), args.input.version, { name: args.input.name ?? undefined, isActive: args.input.isActive ?? undefined })
        }))
        return { locale }
      },
    },
```

Payload-options (4th arg):

```ts
    {
      ...sg('admin').payload,
      outputFields: t => ({
        locale: t.field({ type: 'Locale', resolve: p => p.locale, description: 'The updated locale.' }),
      }),
    },
```

- [ ] **Step 4: 5-point tag `deleteLocale`**

Input-options (2nd arg):

```ts
    {
      ...sg('admin').input,
      inputFields: t => ({
        id: t.globalID({ for: 'Locale', required: true, description: 'The Locale to soft-delete.' }),
        version: t.int({ required: true, description: 'Optimistic-lock version; must match the current row or the delete is rejected.' }),
      }),
    },
```

Field-options (3rd arg):

```ts
    {
      ...sg('admin').field,
      description: 'Soft-delete a locale from the registry. Requires the global `locale:delete` permission.',
      errors: { types: [LocaleNotFound, OptimisticLockError], ...sg('admin').errorOpts },
      authScopes: () => ({ permission: { resource: 'locale', actions: ['delete'] } }),
      resolve: async (_root, args, ctx) => {
        const locale = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.softDeleteLocale(Number(args.input.id.id), args.input.version)
        }))
        return { locale }
      },
    },
```

Payload-options (4th arg):

```ts
    {
      ...sg('admin').payload,
      outputFields: t => ({
        locale: t.field({ type: 'Locale', resolve: p => p.locale, description: 'The soft-deleted locale.' }),
      }),
    },
```

- [ ] **Step 5: Tag the errors in `errors.ts`**

Replace the two `registerError` calls with the `subGraphs`-tagged versions:

```ts
export function registerLocaleErrors(builder: TranslationGraphQLSchemaBuilder): void {
  registerError(builder, LocaleNotFound, { name: 'LocaleNotFoundError', subGraphs: ['admin'] })
  registerError(builder, LocaleCodeTaken, { name: 'LocaleCodeTakenError', subGraphs: ['admin'], fields: t => ({ localeCode: t.exposeString('localeCode') }) })
}
```

- [ ] **Step 6: Type-check + lint**

Run: `pnpm --filter @czo/translation check-types && pnpm --filter @czo/translation lint --max-warnings 0`
Expected: PASS.

- [ ] **Step 7: Stage**

```bash
git add packages/modules/translation/src/graphql/schema/locale/mutations.ts packages/modules/translation/src/graphql/schema/locale/errors.ts
```

---

### Task 4: Harness `subGraphs` option + exposure E2E

Thread a `subGraphs` boot option through the harness, then add an endpoint-level isolation suite.

**Files:**
- Modify: `packages/modules/translation/src/e2e/harness.ts`
- Create: `packages/modules/translation/src/e2e/subgraph-exposure.e2e.test.ts`

- [ ] **Step 1: Add `SubGraphName` import to `harness.ts`**

Add to the imports block (top of file):

```ts
import type { SubGraphName } from '@czo/kit/graphql'
```

- [ ] **Step 2: Add a `BootTranslationOptions` param and forward `subGraphs`**

Change the function signature line:

```ts
export async function bootTranslationApp(): Promise<TranslationHarness> {
```

to:

```ts
export interface BootTranslationOptions {
  readonly subGraphs?: ReadonlyArray<SubGraphName>
}

export async function bootTranslationApp(options: BootTranslationOptions = {}): Promise<TranslationHarness> {
```

Then in the `bootTestApp({ ... })` call, add the `buildOptions` forward as the last key inside the options object (after `migrations: [...]`):

```ts
    bootTestApp({
      modules: [authModule, translationModule, widgetFixtureModule],
      migrations: [AUTH_MIGRATIONS, TRANSLATION_MIGRATIONS, WIDGET_FIXTURE_MIGRATIONS],
      ...(options.subGraphs ? { buildOptions: { subGraphs: options.subGraphs } } : {}),
    }).pipe(Effect.provideService(Scope.Scope, scope)),
```

- [ ] **Step 3: Create the exposure E2E**

Create `packages/modules/translation/src/e2e/subgraph-exposure.e2e.test.ts`:

```ts
import type { TranslationHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootTranslationApp } from './harness'

// Endpoint-level exposure isolation. The kit mounts the full schema at
// `/graphql` and one filtered Yoga per served sub-graph at `/graphql/<name>`.
// A field is in a named sub-graph only when tagged with that audience; an
// under-tagged field VANISHES with no build error, so these presence/absence
// assertions are the guard for the tagging in this sprint.

const QUERY_FIELDS = `{ __type(name: "Query") { fields { name } } }`
const MUTATION_FIELDS = `{ __type(name: "Mutation") { fields { name } } }`
interface IntrospectResult { data?: { __type?: { fields?: { name: string }[] } | null }, errors?: { message: string }[] }

const READ_QUERIES = ['locales', 'locale', 'defaultLocale'] as const
const MUTATIONS = ['createLocale', 'updateLocale', 'deleteLocale'] as const

describe('translation sub-graph exposure', () => {
  let h: TranslationHarness

  beforeAll(async () => {
    h = await bootTranslationApp({ subGraphs: ['public', 'admin'] })
  }, 180_000)
  afterAll(async () => {
    await h.close()
  })

  const fieldNames = async (path: string, query: string): Promise<string[]> => {
    const res = await h.app.fetch(new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    }))
    const body = (await res.json()) as IntrospectResult
    expect(body.errors).toBeUndefined()
    return (body.data?.__type?.fields ?? []).map(f => f.name)
  }

  it('/graphql/public exposes locale reads, not management mutations', async () => {
    const q = await fieldNames('/graphql/public', QUERY_FIELDS)
    const m = await fieldNames('/graphql/public', MUTATION_FIELDS)
    for (const f of READ_QUERIES) expect(q).toContain(f)
    for (const f of MUTATIONS) expect(m).not.toContain(f)
  })

  it('/graphql/admin exposes management mutations and the widened reads', async () => {
    const q = await fieldNames('/graphql/admin', QUERY_FIELDS)
    const m = await fieldNames('/graphql/admin', MUTATION_FIELDS)
    for (const f of READ_QUERIES) expect(q).toContain(f)
    for (const f of MUTATIONS) expect(m).toContain(f)
  })

  it('exposes the Locale node and a working locales connection on /graphql/public', async () => {
    const res = await h.app.fetch(new Request('http://localhost/graphql/public', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `query { locales { edges { node { code } } } defaultLocale { code } }` }),
    }))
    const body = (await res.json()) as { data?: any, errors?: { message: string }[] }
    expect(body.errors).toBeUndefined()
    expect(body.data.locales.edges.some((e: any) => e.node.code === 'en')).toBe(true)
    expect(body.data.defaultLocale.code).toBe('en')
  })
})
```

- [ ] **Step 4: Run the exposure E2E**

Run: `pnpm --filter @czo/translation test src/e2e/subgraph-exposure.e2e.test.ts`
Expected: PASS (3/3). The third test proves the 3-position connection tag is complete — if the connection or edge type were dropped from `public`, `locales { edges { node } }` would error here.

- [ ] **Step 5: Stage**

```bash
git add packages/modules/translation/src/e2e/harness.ts packages/modules/translation/src/e2e/subgraph-exposure.e2e.test.ts
```

---

### Task 5: Full validation

**Files:** none (verification only).

- [ ] **Step 1: Full module suite**

Run: `pnpm --filter @czo/translation test`
Expected: PASS — existing `translation.e2e.test.ts` (3 tests) + new exposure suite (3 tests), plus unit/integration tests. The existing suite hits the default `/graphql` and is unaffected by the tagging.

- [ ] **Step 2: Type-check translation + downstream**

Run: `pnpm --filter @czo/translation check-types && pnpm --filter life check-types`
Expected: PASS. `apps/life` already serves `['public','account','org','admin']` — no serving change needed.

- [ ] **Step 3: Lint**

Run: `pnpm --filter @czo/translation lint --max-warnings 0`
Expected: PASS.

- [ ] **Step 4: Confirm staged set**

Run: `git status --short`
Expected staged files (and ONLY these — do not stage the `docs/superpowers/...` spec/plan or the B19-B docs):

```
A  packages/modules/translation/src/graphql/schema/subgraphs.ts
M  packages/modules/translation/src/graphql/schema/locale/queries.ts
M  packages/modules/translation/src/graphql/schema/locale/types.ts
M  packages/modules/translation/src/graphql/schema/locale/mutations.ts
M  packages/modules/translation/src/graphql/schema/locale/errors.ts
M  packages/modules/translation/src/e2e/harness.ts
A  packages/modules/translation/src/e2e/subgraph-exposure.e2e.test.ts
```

- [ ] **Step 5: Report**

Report validation results to the user. Do NOT commit — the sprint convention is a single commit after explicit user review.

---

## Notes for the executor

- **No commits, no branches, no stash.** Stage only (`git add`). The controller opens the branch + single commit after user review.
- **Do not tag kit-shared types** (`ValidationError`, `OptimisticLockError`, `DateTime`) — they are tagged centrally in kit.
- **Later-wins ordering matters:** `...sg(...).field` / `.input` / `.payload` go FIRST in their option objects so explicit `authScopes` / `resolve` / `description` / `inputFields` / `outputFields` override.
- **The third exposure test is the connection guard** — it is the only check that proves the 3-position connection tag actually round-trips through a real `/graphql/public` query, not just introspection of the field name.
