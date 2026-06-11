# GraphQL sub-graph architecture (foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Partition the single shared Pothos schema into audience sub-graphs (`public`/`account`/`org`/`admin`) via `@pothos/plugin-sub-graph`, serve one Yoga endpoint per served sub-graph, and prove it with a minimal `public` starter set — so a field is invisible to an audience unless explicitly tagged into it (opt-in, default = none).

**Architecture:** Add `SubGraphPlugin` to the kit builder (`packages/kit/src/graphql/builder.ts`) configured opt-in/none, with a typed `SubGraphName` union and root types tagged into every sub-graph but their fields opting in. `GraphQLBuilder.buildSchema(subGraph?)` returns `builder.toSchema({ subGraph })`. The kit app (`packages/kit/src/module/app.ts`) builds + mounts one Yoga per served sub-graph at `/graphql/<name>`, keeping the full `/graphql` during the transition. Modules tag fields/types with the Pothos `subGraphs: [...]` option; `resolvePrice`/`resolvePrices` (`@czo/price`) + `locales`/`defaultLocale` (`@czo/translation`) are the starter set.

**Tech Stack:** `@pothos/plugin-sub-graph@^4.4.0`, `@pothos/core@4.12.0`, `@pothos/plugin-relay`, `@pothos/plugin-scope-auth`, `graphql-yoga`, Effect-TS, Vitest / `@effect/vitest`, pnpm catalog.

**Pre-validated:** A throwaway composition spike already proved the plugin composes with relay + scope-auth and pinned the exact config (recipe in `docs/superpowers/specs/2026-06-10-graphql-subgraphs-design.md` §1). This plan codifies that recipe and adds it as regression tests. The spike used a relay `t.connection`; the drizzle-specific `t.drizzleConnection(fieldOpts, connTypeOpts, edgeTypeOpts)` argument plumbing is **not** needed by the starter set (no connections in it) and is validated for real when B19 (B) tags `channelProducts` — out of scope here.

**Commit policy:** Stage with `git add` only. Do NOT commit, push, branch, or stash. One commit at the very end after the user reviews. (Branch `feat/graphql-subgraphs` already exists and is checked out.)

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `pnpm-workspace.yaml` | pnpm catalog — pin the plugin version | Modify (add `@pothos/plugin-sub-graph`) |
| `packages/kit/package.json` | kit deps — consume the catalog pin | Modify |
| `packages/kit/src/graphql/builder.ts` | builder wiring: plugin, augmentable `BuilderSubGraphs` (seeds `public`) + `SubGraphName = keyof`, opt-in config, root-type tagging from a threaded `subGraphNames`, `buildSchema(subGraph?)` | Modify |
| `packages/kit/src/graphql/builder.test.ts` | builder unit tests: opt-in invariant + relay-connection-in-sub-graph regression | Modify |
| `packages/modules/auth/src/graphql/index.ts` | augment `BuilderSubGraphs` with `account`/`org`/`admin` (auth owns the principal-derived names) | Modify |
| `packages/kit/src/module/app.ts` | thread the served `subGraphs` list into the builder + serve one Yoga per served sub-graph at `/graphql/<name>` | Modify |
| `packages/kit/src/module/app.test.ts` | app unit test: served sub-graph endpoints mounted | Modify |
| `packages/modules/price/src/graphql/schema/price/queries.ts` | tag `resolvePrice`/`resolvePrices` into `public` | Modify |
| `packages/modules/price/src/graphql/schema/price/types.ts` | tag the `CalculatedPrice` union + members + `PriceResolution` (+ nested refs they expose) into `public` | Modify |
| `packages/modules/translation/src/graphql/schema/locale/queries.ts` | tag `locales`/`defaultLocale` into `public` | Modify |
| `packages/modules/translation/src/graphql/schema/locale/types.ts` | tag the `Locale` type into `public` | Modify |
| `packages/modules/price/src/e2e/subgraph-public.e2e.test.ts` | E2E: `/graphql/public` serves `resolvePrice`, omits an untagged admin field | Create |

---

## Task 1: Add `@pothos/plugin-sub-graph` via the pnpm catalog

**Files:**
- Modify: `pnpm-workspace.yaml` (the `catalog:` block)
- Modify: `packages/kit/package.json` (dependencies)

**Context:** The other `@pothos/*` plugins are pinned in the workspace catalog and consumed by kit as `"catalog:"`. Follow that exact pattern — do NOT add a direct version to `packages/kit/package.json`. The relay plugin carries a vendored pnpm patch; this plugin does not, so no `patchedDependencies` entry is needed.

- [ ] **Step 1: Inspect how the existing `@pothos/*` plugins are pinned**

Run: `grep -n "@pothos/" pnpm-workspace.yaml packages/kit/package.json`
Expected: each `@pothos/plugin-*` appears once in `pnpm-workspace.yaml` under `catalog:` with a version, and once in `packages/kit/package.json` as `"@pothos/plugin-x": "catalog:"`.

- [ ] **Step 2: Add the catalog pin**

In `pnpm-workspace.yaml`, inside the `catalog:` map, add an entry next to the other `@pothos/plugin-*` lines (keep alphabetical order if the block is sorted):

```yaml
  '@pothos/plugin-sub-graph': ^4.4.0
```

- [ ] **Step 3: Add the kit dependency**

In `packages/kit/package.json`, inside `dependencies`, next to the other `@pothos/plugin-*` entries, add:

```json
    "@pothos/plugin-sub-graph": "catalog:",
```

- [ ] **Step 4: Install**

Run: `pnpm install`
Expected: completes; `@pothos/plugin-sub-graph` resolves into `packages/kit/node_modules/@pothos/plugin-sub-graph` at `4.4.0`. (`pnpm-lock.yaml` updates — that is expected and will be staged in the final commit.)

- [ ] **Step 5: Verify the import resolves**

Run: `cd packages/kit && node -e "import('@pothos/plugin-sub-graph').then(m => console.log('ok', typeof m.default))"`
Expected: prints `ok function`.

- [ ] **Step 6: Stage**

```bash
git add pnpm-workspace.yaml packages/kit/package.json pnpm-lock.yaml
```

---

## Task 2: Wire `SubGraphPlugin` into the kit builder (opt-in / default-none)

**Files:**
- Modify: `packages/kit/src/graphql/builder.ts`
- Test: `packages/kit/src/graphql/builder.test.ts`

**Context:** `setupBuilder()` constructs the `PothosSchemaBuilder`. `makeGraphQLBuilder()` returns a `GraphQLBuilder` service whose `buildSchema()` runs the contributions and returns `builder.toSchema()`. We add the sub-graph plugin with the spike-validated opt-in config; declare the sub-graph names as an **augmentable interface** seeded with only `public` (kit-owned baseline) so `SubGraphName = keyof BuilderSubGraphs` (auth adds the rest in Task 4 — names are domain-owned, mirroring `BuilderAuthScopes`); tag the root types into every *known* sub-graph from a **threaded `subGraphNames` runtime list** (NOT hardcoded — it is the served list, default `['public']`); and let `buildSchema` accept an optional sub-graph name. The recipe is in the design spec §1.

> **Design note (deviation from the spec wording):** the spec originally mentioned `buildSubGraphSchema(name)` "alongside" `buildSchema()`. We instead give `buildSchema` an **optional** `subGraph` parameter (one method, DRY) — `buildSchema()` = full, `buildSchema('public')` = filtered. Same capability, less surface.

- [ ] **Step 1: Write the failing tests**

Add to `packages/kit/src/graphql/builder.test.ts`. First extend the local `buildSchema` helper to forward a sub-graph name AND pass the full set of known names so tests can build any sub-graph. Replace the existing `buildSchema` helper (lines ~28–41) with this signature-extended version:

```ts
function buildSchema(
  contributions: ReadonlyArray<Parameters<typeof makeGraphQLBuilder>[0][number]> = [],
  subGraph?: 'public' | 'account' | 'org' | 'admin',
): Promise<GraphQLSchema> {
  const layer = Layer.merge(
    // 6th arg = the runtime sub-graph-names list (root + PageInfo tagging). Tests
    // build several sub-graphs, so pass all four; production passes the served set.
    makeGraphQLBuilder(contributions, [], [], {} as never, {}, ['public', 'account', 'org', 'admin']),
    DrizzleDbLayer,
  )
  return Effect.runPromise(
    Effect.gen(function* () {
      const builder = yield* GraphQLBuilder
      return yield* builder.buildSchema(subGraph)
    }).pipe(Effect.provide(layer)),
  )
}
```

> The 5th arg `{}` is the existing `nodeGuards` default (previously omitted — `makeGraphQLBuilder` defaults it to `{}`); it must be passed explicitly now that a 6th arg follows it.

Then append a new describe block:

```ts
describe('makeGraphQLBuilder — sub-graphs (opt-in / default-none)', () => {
  const contribute = (b: Parameters<typeof buildSchema>[0][number] extends infer C ? C : never) => b

  // A contribution adding one public-tagged query field and one untagged field.
  const fields = [
    (b: any) => {
      b.queryField('publicPing', (t: any) =>
        t.string({ subGraphs: ['public'], resolve: () => 'pong' }))
      b.queryField('secretPing', (t: any) =>
        t.string({ resolve: () => 'shh' }))
    },
  ]

  itEffect('full schema (no subGraph) contains BOTH tagged and untagged fields', async () => {
    const schema = await buildSchema(fields)
    const q = schema.getQueryType()!.getFields()
    expect(q.publicPing).toBeDefined()
    expect(q.secretPing).toBeDefined()
  })

  itEffect('public sub-graph contains the tagged field and OMITS the untagged field', async () => {
    const schema = await buildSchema(fields, 'public')
    const qt = schema.getQueryType()
    expect(qt).toBeDefined()
    const q = qt!.getFields()
    expect(q.publicPing).toBeDefined()
    expect(q.secretPing).toBeUndefined()
  })

  itEffect('account sub-graph (nothing tagged into it) has a Query type but none of the fields', async () => {
    const schema = await buildSchema(fields, 'account')
    expect(schema.getQueryType()).toBeDefined()
    const q = schema.getQueryType()!.getFields()
    expect(q.publicPing).toBeUndefined()
    expect(q.secretPing).toBeUndefined()
  })
})
```

(The `contribute` line is unused scaffolding — delete it if your linter flags it; it is only there as a reminder that contributions are plain `(builder) => void`.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/kit && pnpm test src/graphql/builder.test.ts`
Expected: the three new tests FAIL — `buildSchema` does not yet accept a `subGraph` argument / `subGraphs` field option is unknown (and the public/account schemas are not filtered).

- [ ] **Step 3: Add the plugin import**

In `packages/kit/src/graphql/builder.ts`, with the other plugin imports (after `import ScopeAuthPlugin from '@pothos/plugin-scope-auth'`), add:

```ts
import SubGraphPlugin from '@pothos/plugin-sub-graph'
```

- [ ] **Step 4: Declare the augmentable `BuilderSubGraphs` interface + `SubGraphName`, and add it to the builder SchemaTypes**

Near the top of `builder.ts` (after the imports, before `NodeGuard`), add — note this mirrors the existing empty `BuilderAuthScopes` / `BuilderSchemaObjects` interfaces that auth augments:

```ts
/**
 * Audience sub-graph names. Kit owns only the platform baseline `public` so that
 * non-auth modules can tag `['public']` without depending on auth. Auth augments
 * this with the principal-derived names (`account`/`org`/`admin`) via
 * `declare module '@czo/kit/graphql'` — exactly like `BuilderAuthScopes`.
 * A field/type tagged `subGraphs: [...]` appears only in the named sub-graph
 * schemas (plus the internal full schema); an UNTAGGED field is in NONE of them
 * (opt-in, default-none). See docs/superpowers/specs/2026-06-10-graphql-subgraphs-design.md.
 */
export interface BuilderSubGraphs {
  public: true
}

export type SubGraphName = keyof BuilderSubGraphs
```

In `interface BuilderSchemaTypes`, add the `SubGraphs` member (alongside `Context`, `Directives`, …):

```ts
  SubGraphs: SubGraphName
```

- [ ] **Step 5: Register the plugin + configure opt-in + tag root types**

In `setupBuilder`, add `SubGraphPlugin` to the `plugins` array (append it after `TracingPlugin`):

```ts
      TracingPlugin,
      SubGraphPlugin,
```

Add the `subGraphs` builder option (a new top-level key in the `new PothosSchemaBuilder({...})` options, e.g. right after the `tracing: {...}` block):

```ts
    subGraphs: {
      // Opt-in / default-none: a type belongs to a sub-graph only when tagged;
      // an object type's fields inherit the type's sub-graphs (no per-field tag).
      defaultForTypes: [],
      fieldsInheritFromTypes: true,
    },
```

Extend the existing `relay: {...}` option with `pageInfoTypeOptions` so the shared relay `PageInfo` is present in every known sub-graph (validated by the spike — connections otherwise lose `pageInfo`). Add this key inside the `relay` object (next to `clientMutationId` / `cursorType`), using the `subGraphNames` param threaded into `setupBuilder` in Step 6:

```ts
      pageInfoTypeOptions: { subGraphs: subGraphNames as SubGraphName[] },
```

Finally, tag the root types into every known sub-graph but make their fields opt in. Replace the existing:

```ts
  builder.queryType({})
  builder.mutationType({})
```

with:

```ts
  // Root types live in every KNOWN sub-graph (so each filtered schema has a
  // Query/Mutation), but operations OPT IN: defaultSubGraphsForFields=[] means an
  // untagged query/mutation field is in none of them. `subGraphNames` is the
  // runtime list threaded from buildApp (the served set) — see Step 6.
  builder.queryType({ subGraphs: subGraphNames as SubGraphName[], defaultSubGraphsForFields: [] })
  builder.mutationType({ subGraphs: subGraphNames as SubGraphName[], defaultSubGraphsForFields: [] })
```

- [ ] **Step 6: Thread `subGraph` + `subGraphNames` through `buildSchema` / `makeGraphQLBuilder` / `setupBuilder`**

First, `setupBuilder` must receive the runtime names list. Change its signature + use the param in the relay/root-type tagging from Step 5:

```ts
function setupBuilder<Relations extends RelationsEntry>(
  db: Database,
  relations: Relations,
  authScope: ReadonlyArray<(ctx: GraphQLContextMap) => Record<string, unknown>>,
  nodeGuards: Record<string, NodeGuard>,
  subGraphNames: ReadonlyArray<SubGraphName>,
) {
```

Add the new param to `makeGraphQLBuilder` (after `nodeGuards`, with a `['public']` default so callers that don't serve extra sub-graphs are unaffected):

```ts
export function makeGraphQLBuilder(
  contributions: ReadonlyArray<(builder: SchemaBuilder) => void>,
  contexts: ReadonlyArray<(systemContext: unknown) => Effect.Effect<Partial<GraphQLContextMap>, unknown, any>>,
  authScope: ReadonlyArray<(ctx: GraphQLContextMap) => Record<string, unknown>>,
  relations: RelationsEntry,
  nodeGuards: Record<string, NodeGuard> = {},
  subGraphNames: ReadonlyArray<SubGraphName> = ['public'],
) {
```

In the `GraphQLBuilder` service interface (the `Context.Service<...>` body), change the `buildSchema` signature:

```ts
  readonly buildSchema: (subGraph?: SubGraphName) => Effect.Effect<GraphQLSchema, never, DrizzleDb>
```

In `makeGraphQLBuilder`, change the `buildSchema` implementation so it passes the names to `setupBuilder` and forwards the requested sub-graph to `toSchema`:

```ts
        buildSchema: (subGraph?: SubGraphName) =>
          Effect.gen(function* () {
            const db = yield* DrizzleDb
            const builder = setupBuilder(db, relations, authScope, nodeGuards, subGraphNames)

            stringFilterInputRef(builder)
            booleanFilterInputRef(builder)
            dateTimeFilterInputRef(builder)
            dateFilterInputRef(builder)
            timeFilterInputRef(builder)
            intFilterInputRef(builder)
            floatFilterInputRef(builder)
            idFilterInputRef(builder)

            for (const contribute of contributions) contribute(builder)

            return subGraph ? builder.toSchema({ subGraph }) : builder.toSchema()
          }),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd packages/kit && pnpm test src/graphql/builder.test.ts`
Expected: all builder tests PASS, including the three new sub-graph tests and every pre-existing test (full schema unaffected).

- [ ] **Step 8: Type-check + lint**

Run: `cd packages/kit && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/builder.ts src/graphql/builder.test.ts`
Expected: no errors. (Note: `lint:fix` may strip the `as SubGraphName[]` casts — if it does and `check-types` then fails, restore them by hand and DO NOT rerun `lint:fix` on this file. See memory `reference_lintfix_strips_pothos_enum_cast`.)

- [ ] **Step 9: Stage**

```bash
git add packages/kit/src/graphql/builder.ts packages/kit/src/graphql/builder.test.ts
```

---

## Task 2b: Auth augments `BuilderSubGraphs` with the principal-derived names

**Files:**
- Modify: `packages/modules/auth/src/graphql/index.ts`

**Context:** `account`/`org`/`admin` map to the auth principal (session ⇒ `account`, org member ⇒ `org`, global role ⇒ `admin`), so auth owns them — exactly as it already augments `BuilderAuthScopes`, `BuilderSchemaInputs`, `BuilderSchemaObjects`, and `GraphQLContextMap` in the same `declare module '@czo/kit/graphql'` block (lines ~17–37). Kit only ships `public`. This task is type-level only (no runtime/tagging change); it makes `SubGraphName` resolve to all four names wherever auth is in the compilation (e.g. `apps/life`), so future tagging into those sub-graphs type-checks. No field is tagged into `account`/`org`/`admin` yet — that is per-module follow-up work.

- [ ] **Step 1: Add the augmentation**

In `packages/modules/auth/src/graphql/index.ts`, inside the existing `declare module '@czo/kit/graphql' { ... }` block (alongside the `BuilderAuthScopes` interface), add:

```ts
  interface BuilderSubGraphs {
    account: true
    org: true
    admin: true
  }
```

- [ ] **Step 2: Type-check (the augmentation widens `SubGraphName` to all four)**

Run: `pnpm --filter @czo/auth check-types`
Then confirm the app that wires auth still type-checks at its baseline:
Run: `pnpm --filter life check-types`
Expected: no NEW errors. (`SubGraphName` is now `'public' | 'account' | 'org' | 'admin'` in compilations that include auth; kit-only compilations still see just `'public'`.)

- [ ] **Step 3: Lint + stage**

Run: `pnpm --filter @czo/auth lint --max-warnings 0 src/graphql/index.ts`

```bash
git add packages/modules/auth/src/graphql/index.ts
```

---

## Task 3: De-risk regression — relay connection + scope-auth inside a sub-graph

**Files:**
- Test: `packages/kit/src/graphql/builder.test.ts`

**Context:** The riskiest composition is a relay connection field inside a filtered sub-graph: its generated `Connection`/`Edge` types and the shared `PageInfo` must all survive filtering, and a `scope-auth` `authScopes` on the field must coexist with the `subGraphs` tag. The spike proved this; this task cements it as a kit regression test using the mock drizzle client (no DB needed — `toSchema()` never queries). The recipe: tag the field AND the connection-type AND the edge-type, and rely on `relay.pageInfoTypeOptions` (Task 2) for `PageInfo`.

- [ ] **Step 1: Write the failing test**

Append to `packages/kit/src/graphql/builder.test.ts`:

```ts
describe('makeGraphQLBuilder — relay connection inside a sub-graph', () => {
  const withConnection = [
    (b: any) => {
      const Thing = b.objectRef<{ id: string, name: string }>('Thing')
      Thing.implement({
        subGraphs: ['public'],
        fields: (t: any) => ({
          id: t.exposeID('id'),
          name: t.exposeString('name'),
        }),
      })
      b.queryField('things', (t: any) =>
        t.connection(
          {
            type: Thing,
            subGraphs: ['public'],
            authScopes: { public: true }, // a scope-auth gate co-located with the sub-graph tag
            resolve: () => ({
              edges: [],
              pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
            }),
          },
          { subGraphs: ['public'] }, // connection-type options
          { subGraphs: ['public'] }, // edge-type options
        ))
    },
  ]

  itEffect('public sub-graph includes the connection field + Connection/Edge/PageInfo types', async () => {
    const schema = await buildSchema(withConnection, 'public')
    const q = schema.getQueryType()!.getFields()
    expect(q.things).toBeDefined()
    expect(schema.getType('QueryThingsConnection')).toBeDefined()
    expect(schema.getType('QueryThingsConnectionEdge')).toBeDefined()
    expect(schema.getType('PageInfo')).toBeDefined()
    expect(schema.getType('Thing')).toBeDefined()
  })

  itEffect('a sub-graph with nothing tagged omits the connection AND its generated types', async () => {
    const schema = await buildSchema(withConnection, 'admin')
    expect(schema.getQueryType()!.getFields().things).toBeUndefined()
    expect(schema.getType('QueryThingsConnection')).toBeUndefined()
    expect(schema.getType('Thing')).toBeUndefined()
  })
})
```

> The `authScopes: { public: true }` uses a literal-boolean scope, which scope-auth accepts without a registered scope loader — sufficient to prove the two plugins coexist on one field. The kit builder's `scopeAuth.authScopes` map is empty in this test (`[]` authScope arg), and a boolean scope is evaluated directly.

- [ ] **Step 2: Run to verify it fails or passes**

Run: `cd packages/kit && pnpm test src/graphql/builder.test.ts`
Expected: with Task 2's `pageInfoTypeOptions` + opt-in config already in place, these SHOULD PASS immediately (the spike validated the recipe). If `PageInfo` is missing from the public schema, re-check that `relay.pageInfoTypeOptions.subGraphs` includes `'public'` (Task 2 Step 5). If the connection field is absent, confirm all THREE `subGraphs` tags (field + connection-type + edge-type) are present.

- [ ] **Step 3: Type-check + lint**

Run: `cd packages/kit && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/builder.test.ts`
Expected: no errors.

- [ ] **Step 4: Stage**

```bash
git add packages/kit/src/graphql/builder.test.ts
```

---

## Task 4: Tag the `public` starter set (price + translation)

**Files:**
- Modify: `packages/modules/price/src/graphql/schema/price/queries.ts` (`resolvePrice`, `resolvePrices`)
- Modify: `packages/modules/price/src/graphql/schema/price/types.ts` (`CalculatedPrice` union + `BasePrice`/`OverridePrice`/`SalePrice` + `PriceResolution`, and the nested `PriceList`/`PriceRule`/`PriceListRule` refs those expose)
- Modify: `packages/modules/translation/src/graphql/schema/locale/queries.ts` (`locales`, `defaultLocale`)
- Modify: `packages/modules/translation/src/graphql/schema/locale/types.ts` (`Locale`)

**Context:** These reads are already safe to expose publicly (`resolvePrice`/`resolvePrices` are public + org-scoped inside the service; `locales`/`defaultLocale` are the public registry). Tagging them into `public` proves the endpoint serves a correct filtered schema end-to-end. A query field's return TYPES must also be in `public` (Pothos errors if a public field references a type that is in no sub-graph), so we tag the union, its members, `PriceResolution`, the nested refs they expose, and `Locale`. `fieldsInheritFromTypes: true` means tagging the type is enough — its fields inherit.

Modules tag with the typed value: `import type { SubGraphName } from '@czo/kit/graphql'` is available, but since `subGraphs` takes a string-literal array, just write `subGraphs: ['public']` inline (Pothos validates it against the `SubGraphs` SchemaType).

- [ ] **Step 1: Tag the price query fields**

In `packages/modules/price/src/graphql/schema/price/queries.ts`, add `subGraphs: ['public'],` to the `resolvePrice` field options (inside `t.field({ ... })`, next to `type: 'CalculatedPrice'`):

```ts
    t.field({
      type: 'CalculatedPrice',
      subGraphs: ['public'],
      nullable: true,
      description: 'Resolve the effective price ...',
```

And the same on `resolvePrices`:

```ts
    t.field({
      type: ['PriceResolution'],
      subGraphs: ['public'],
      description: 'Bulk variant of `resolvePrice` ...',
```

- [ ] **Step 2: Tag the price types**

In `packages/modules/price/src/graphql/schema/price/types.ts`, add `subGraphs: ['public'],` to the `.implement({ ... })` / `unionType('CalculatedPrice', { ... })` options of EACH of these refs: `BasePriceRef`, `OverridePriceRef`, `SalePriceRef`, the `CalculatedPrice` `unionType`, `PriceResolution`, and the nested refs the union members expose — `PriceListRef` (and its `PriceRuleRef` / `PriceListRuleRef` if reachable from the public fields). For an object ref:

```ts
  const BasePriceRef = builder.objectRef<...>('BasePrice').implement({
    subGraphs: ['public'],
    fields: t => ({ ... }),
  })
```

For the union:

```ts
  builder.unionType('CalculatedPrice', {
    subGraphs: ['public'],
    types: [BasePriceRef, OverridePriceRef, SalePriceRef],
    // ...
  })
```

> **How to find exactly which nested types to tag:** after Step 5 builds the public schema, the test in Task 6 will fail with a Pothos error naming any type that a public field references but that is not in `public`. Tag each named type and re-run. Start with the union + 3 members + `PriceResolution`, then add whatever the build names (`PriceList`, `PriceRule`, `PriceListRule`, the `JSON` scalar is global and needs no tag).

- [ ] **Step 3: Tag the translation query fields**

In `packages/modules/translation/src/graphql/schema/locale/queries.ts`, add `subGraphs: ['public'],` to the `locales` and `defaultLocale` field options.

- [ ] **Step 4: Tag the `Locale` type**

In `packages/modules/translation/src/graphql/schema/locale/types.ts`, add `subGraphs: ['public'],` to the `Locale` ref's `.implement({ ... })` options.

- [ ] **Step 5: Verify the public schema builds (smoke)**

Run: `cd packages/modules/price && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/price/queries.ts src/graphql/schema/price/types.ts`
Then: `cd packages/modules/translation && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/locale/queries.ts src/graphql/schema/locale/types.ts`
Expected: no errors. (The full E2E build verification is Task 6; the type-check here confirms the `subGraphs` option type-checks against `SubGraphs`.)

- [ ] **Step 6: Stage**

```bash
git add packages/modules/price/src/graphql/schema/price/queries.ts \
        packages/modules/price/src/graphql/schema/price/types.ts \
        packages/modules/translation/src/graphql/schema/locale/queries.ts \
        packages/modules/translation/src/graphql/schema/locale/types.ts
```

---

## Task 5: Serve one Yoga per served sub-graph at `/graphql/<name>`

**Files:**
- Modify: `packages/kit/src/module/app.ts`
- Test: `packages/kit/src/module/app.test.ts`

**Context:** `assembleApp` (in `buildApp`) currently builds ONE schema, applies `rateLimitDirectiveTransformer`, creates ONE Yoga, and mounts it at `yoga.graphqlEndpoint` (`/graphql`). We keep that full mount and ADD one Yoga per served sub-graph at `/graphql/<name>`, reusing the identical context wiring (the rate-limit + per-request context closure). Default served set = `['public']`; configurable via a new `BuildAppOptions.subGraphs`.

- [ ] **Step 1: Write the failing test**

In `packages/kit/src/module/app.test.ts`, add a test that asserts the assembled h3 app responds on `/graphql/public`. Use the existing test scaffolding in that file (it already builds an app with a mock/Testcontainers DB and drives `httpApp.fetch`). Add:

```ts
it('mounts a Yoga endpoint for each served sub-graph (default public)', async () => {
  // <reuse the file's existing buildApp/assembleApp + appLayer harness to get `httpApp`>
  const res = await httpApp.fetch(new Request('http://local/graphql/public', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ __typename }' }),
  }))
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.data.__typename).toBe('Query')
})
```

> If `app.test.ts` has no existing full-assembly harness (only unit-level tests of `mergeModuleDb` etc.), put this assertion in the Task 6 E2E instead (which already boots a real app via `bootTestApp`) and skip Steps 1–2 here, noting that the endpoint-mounting is covered E2E. Check the file first.

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/kit && pnpm test src/module/app.test.ts`
Expected: FAIL — `/graphql/public` is not mounted (404 / no route).

- [ ] **Step 3: Add the `subGraphs` option**

In `packages/kit/src/module/app.ts`, import the name type + add the option. With the other type imports add:

```ts
import type { SubGraphName } from '@czo/kit/graphql'
```

In `interface BuildAppOptions`, add:

```ts
  /**
   * Audience sub-graphs to serve as dedicated endpoints at `/graphql/<name>`,
   * in addition to the full `/graphql`. Default `['public']`. Each is a
   * filtered view of the same builder (opt-in tagging; see the sub-graph spec).
   * This same list is threaded into the builder so the Query/Mutation roots +
   * PageInfo are tagged into exactly these names.
   */
  readonly subGraphs?: ReadonlyArray<SubGraphName>
```

Then thread the served list into the builder. In `buildApp`, find the `makeGraphQLBuilder(...)` call and add the served list as the 6th argument:

```ts
  const GraphQLBuilderLayer = makeGraphQLBuilder(
    graphQLContributions,
    graphQLContexts,
    authScopes,
    relations,
    nodeGuards,
    options.subGraphs ?? ['public'],
  ).pipe(Layer.provide(DrizzleLayer))
```

- [ ] **Step 4: Extract a Yoga factory and mount per sub-graph**

In `assembleApp`, the Yoga is currently created inline and mounted via `httpApp.all(yoga.graphqlEndpoint, fromNodeHandler(yoga))`. Refactor so the Yoga creation is a local factory parameterized by `(schema, endpoint)`, then mount the full schema at `/graphql` and each served sub-graph at `/graphql/<name>`.

Replace the inline `const yoga = options.graphQLApp?.(gqlSchema) ?? createYoga<...>({ ... })` block and the subsequent `httpApp.all(yoga.graphqlEndpoint, fromNodeHandler(yoga))` with:

```ts
    // One Yoga per schema. The context closure (runEffect + per-request
    // cookies/headers/clientIp) is identical across endpoints; only the schema
    // and the mounted path differ. `graphqlEndpoint` must match the mount path
    // so Yoga's own routing accepts the request.
    const makeYoga = (schema: GraphQLSchema, endpoint: string) =>
      createYoga<{ pendingCookies?: string[], pendingHeaders?: Array<[string, string]> }, GraphQLContextMap>({
        schema,
        graphqlEndpoint: endpoint,
        context: async (initialContext) => {
          const pendingCookies = initialContext.pendingCookies ?? []
          const setCookie = (serialized: string): void => { pendingCookies.push(serialized) }
          const pendingHeaders = initialContext.pendingHeaders ?? []
          const setHeader = (name: string, value: string): void => { pendingHeaders.push([name, value]) }
          Object.assign(initialContext, { setCookie, setHeader })
          const userCtx = await runEffect(graphQLBuilder.buildContext(initialContext))
          const socketIp = (initialContext as { req?: { socket?: { remoteAddress?: string } } }).req?.socket?.remoteAddress
          const clientIp = resolveClientIp(
            initialContext.request?.headers?.get('x-forwarded-for'),
            socketIp,
            trustedProxyHops,
          )
          return { ...userCtx, runEffect, setCookie, setHeader, clientIp }
        },
        plugins: [
          {
            onResponse({ response, serverContext }) {
              const pending = (serverContext as { pendingCookies?: string[] })?.pendingCookies ?? []
              for (const value of pending) response.headers.append('set-cookie', value)
              const pendingHeaders = (serverContext as { pendingHeaders?: Array<[string, string]> })?.pendingHeaders ?? []
              for (const [name, value] of pendingHeaders) response.headers.append(name, value)
            },
          },
        ],
      })

    // Full schema at /graphql (transition mount). A host override still applies to the full schema.
    const yoga = options.graphQLApp?.(gqlSchema) ?? makeYoga(gqlSchema, '/graphql')
    httpApp.all(yoga.graphqlEndpoint, fromNodeHandler(yoga))

    // One dedicated endpoint per served sub-graph.
    for (const name of options.subGraphs ?? ['public']) {
      const subSchema = rateLimitDirectiveTransformer(yield* graphQLBuilder.buildSchema(name))
      const subYoga = makeYoga(subSchema, `/graphql/${name}`)
      httpApp.all(subYoga.graphqlEndpoint, fromNodeHandler(subYoga))
    }
```

Notes:
- `gqlSchema` (the full schema) is already built earlier in `assembleApp` via `rateLimitDirectiveTransformer(yield* graphQLBuilder.buildSchema())` — keep that line; it now feeds the full mount.
- The `returned` `{ httpApp, runEffect, yoga }` keeps `yoga` = the FULL Yoga (the existing test/contract relies on `yoga.fetch` for the full schema). Sub-graph Yogas are reachable via `httpApp.fetch('/graphql/<name>')`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/kit && pnpm test src/module/app.test.ts`
Expected: the new endpoint test PASSES (200, `__typename === 'Query'`); existing app tests stay green.

- [ ] **Step 6: Type-check + lint**

Run: `cd packages/kit && pnpm check-types && pnpm lint --max-warnings 0 src/module/app.ts src/module/app.test.ts`
Expected: no errors.

- [ ] **Step 7: Stage**

```bash
git add packages/kit/src/module/app.ts packages/kit/src/module/app.test.ts
```

---

## Task 6: E2E — `/graphql/public` serves `resolvePrice`, omits an untagged field

**Files:**
- Create: `packages/modules/price/src/e2e/subgraph-public.e2e.test.ts`

**Context:** Prove exposure isolation at the running-endpoint level: a request to `/graphql/public` can run `resolvePrice` (tagged) but a query naming an untagged field fails schema validation (unknown field), while the full `/graphql` still has that field. Reuse the price E2E harness (`bootTestApp`/`bootProductApp`-style; see `packages/modules/price/src/e2e/` for the existing pattern and the modules it boots). Boot price + translation + at least one module that contributes an untagged query (e.g. `@czo/auth`'s `me`, or any non-public query in the booted set). The default served sub-graph is `public`, so no `subGraphs` option is needed.

- [ ] **Step 1: Inspect the existing price E2E harness**

Run: `ls packages/modules/price/src/e2e/ && sed -n '1,60p' packages/modules/price/src/e2e/*.e2e.test.ts | head -80`
Expected: shows the boot helper (the modules it composes, how it exposes `httpApp.fetch` / a `gql` helper, and the Testcontainers layer). Use the SAME helper and module set; ensure an untagged query field exists in the booted schema (if price+translation alone expose only public-tagged + their other untagged admin queries, pick one of those untagged queries as the "should be absent in public" probe — e.g. price's `priceSets` connection, which is NOT tagged public).

- [ ] **Step 2: Write the E2E test**

Create `packages/modules/price/src/e2e/subgraph-public.e2e.test.ts`. Adapt the boot/`gql` calls to the harness found in Step 1; the assertions are:

```ts
import { describe, expect, it } from '@effect/vitest' // or 'vitest' per the harness
// <import the price E2E boot helper exactly as the sibling e2e files do>

describe('GraphQL public sub-graph endpoint', () => {
  // <boot the app via the shared harness; obtain `httpApp` (h3 fetch app)>

  const post = (path: string, query: string) =>
    httpApp.fetch(new Request(`http://local${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    }))

  it('serves resolvePrice on /graphql/public', async () => {
    const res = await post('/graphql/public', `
      query { __type(name: "Query") { fields { name } } }
    `)
    const body = await res.json()
    const names = body.data.__type.fields.map((f: { name: string }) => f.name)
    expect(names).toContain('resolvePrice')
    expect(names).toContain('resolvePrices')
  })

  it('OMITS an untagged field from /graphql/public (exposure isolation, not just authz)', async () => {
    // `priceSets` (a non-public-tagged price query) must be ABSENT from the public schema.
    const res = await post('/graphql/public', `query { priceSets(first: 1) { edges { node { id } } } }`)
    const body = await res.json()
    // Field not in the public schema → GraphQL validation error, no data.
    expect(body.errors?.[0]?.message ?? '').toMatch(/Cannot query field "priceSets"/)
    expect(body.data).toBeFalsy()
  })

  it('the full /graphql still exposes the untagged field', async () => {
    const res = await post('/graphql', `query { __type(name: "Query") { fields { name } } }`)
    const body = await res.json()
    const names = body.data.__type.fields.map((f: { name: string }) => f.name)
    expect(names).toContain('priceSets')
    expect(names).toContain('resolvePrice')
  })
})
```

> Replace `priceSets` with whatever untagged query the booted schema actually has (confirm via Step 1). The point is: a real query field that is NOT tagged `public` is absent from `/graphql/public` but present on `/graphql`.

- [ ] **Step 3: Run the E2E**

Run: `cd packages/modules/price && pnpm test src/e2e/subgraph-public.e2e.test.ts`
Expected: all three PASS. If `resolvePrice` is missing from `/graphql/public`, a referenced return type is untagged — the server log / error names it; tag it (back to Task 4 Step 2) and re-run.

- [ ] **Step 4: Type-check + lint**

Run: `cd packages/modules/price && pnpm check-types && pnpm lint --max-warnings 0 src/e2e/subgraph-public.e2e.test.ts`
Expected: no errors.

- [ ] **Step 5: Stage**

```bash
git add packages/modules/price/src/e2e/subgraph-public.e2e.test.ts
```

---

## Task 7: Full validation + final review

**Files:** none (verification only)

- [ ] **Step 1: Type-check the touched packages**

Run: `pnpm --filter @czo/kit --filter @czo/price --filter @czo/translation check-types`
Then confirm no downstream regression in the app that wires them:
Run: `pnpm --filter life check-types`
Expected: all at their established baselines (no NEW errors introduced by this change).

- [ ] **Step 2: Run the affected test suites**

Run: `cd packages/kit && pnpm test src/graphql/builder.test.ts src/module/app.test.ts`
Run: `cd packages/modules/price && pnpm test src/e2e/subgraph-public.e2e.test.ts`
Expected: green. (The auth `user.e2e` 57P01 pg-teardown flake is unrelated — if a different suite is run and shows it, re-run that job; see memory `project_module_merge_train`.)

- [ ] **Step 3: Lint the full touched set**

Run: `pnpm --filter @czo/kit --filter @czo/price --filter @czo/translation lint --max-warnings 0`
Expected: clean. If `lint:fix` was ever run on `builder.ts` and stripped the `as SubGraphName[]` casts, restore them and re-run `check-types`.

- [ ] **Step 4: Review the staged diff**

Run: `git diff --cached --stat && git diff --cached`
Expected: only the files in the File Structure table (+ `pnpm-lock.yaml`). No stray spike file, no `console.log`, no `as any` where inference suffices, no committed changes (staging only).

- [ ] **Step 5: STOP — hand to the user for review**

Do NOT commit. Report: which validation commands ran and their results, the staged file list, and any type-check baselines. The user reviews, then explicitly asks for the single commit.

---

## Self-review (against the spec)

- **Spec §Architecture 1 (builder):** Task 2 — plugin, augmentable `BuilderSubGraphs` (kit seeds `public`) + `SubGraphName = keyof`, opt-in `{ defaultForTypes: [], fieldsInheritFromTypes: true }`, root-type tagging + `defaultSubGraphsForFields: []` from a threaded `subGraphNames`, `relay.pageInfoTypeOptions`, `buildSchema(subGraph?)`. ✓ (Deviation: one `buildSchema(subGraph?)` instead of a separate `buildSubGraphSchema` — documented in Task 2.)
- **Spec §Architecture 1 (names are domain-owned):** Task 2b — auth augments `BuilderSubGraphs` with `account`/`org`/`admin`, mirroring `BuilderAuthScopes`; kit stays domain-agnostic. ✓
- **Spec §Architecture 2 (app serving):** Task 5 — one Yoga per served sub-graph at `/graphql/<name>`, full `/graphql` kept, rate-limit + context wiring reused, served set threaded into the builder + drives endpoints (default `public`). ✓
- **Spec §Architecture 3 (tagging API):** Task 4 — modules add `subGraphs: ['public']` at field/type definitions. ✓
- **Spec §Architecture 4 (public starter set):** Task 4 — `resolvePrice`/`resolvePrices` + `locales`/`defaultLocale` + their return types. ✓
- **Spec §Risks (relay+scope-auth composition):** Task 3 — regression test (field + connection-type + edge-type + `PageInfo`, with an `authScopes` gate). ✓ Drizzle `drizzleConnection`/`node`/errors-payload tagging is explicitly out of scope (no connection/mutation in the starter set) and deferred to B19 (B) — matches the spec's "TO VALIDATE in integration."
- **Spec §Testing:** Task 2 (builder unit: filtering + opt-in invariant), Task 6 (E2E: public omits untagged field, full keeps it), Task 3 (relay composition). ✓
- **Placeholder scan:** every code step contains concrete code/commands; no TBD. The two "inspect the harness first" steps (Task 5 Step 1, Task 6 Step 1) are deliberate — the price E2E harness shape is read at execution time and the assertions are fully specified.
- **Type consistency:** `SubGraphName` / `ALL_SUB_GRAPHS` defined in Task 2 and reused in Tasks 2 & 5; `buildSchema(subGraph?)` signature consistent across builder, test helper, and app.ts.
