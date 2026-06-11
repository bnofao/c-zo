# Stock-location sub-graph tagging (org) + StockLocationAddress node-guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag `@czo/stock-location`'s entire GraphQL surface into the `org` audience sub-graph (it is uniformly org-scoped), and close the ungated `StockLocationAddress` relay-node read path with a node-guard.

**Architecture:** A module-local `sg()` helper tags the 6 `relayMutationField` mutations at the spike's 5 points; queries/nodes/inputs/enums/errors take `subGraphs: ['org']` directly. The `StockLocationAddress` drizzleNode loads its parent stock location's `organizationId` via `select`, and a new node-guard gates its `node(id:)` read on the same `stock-location:read` permission as `StockLocation`. Exposure + node-authz E2Es prove it.

**Tech Stack:** Pothos (`@pothos/plugin-sub-graph`, `@pothos/plugin-drizzle` relay nodes, `@pothos/plugin-scope-auth`, `@pothos/plugin-errors`), Effect-TS, graphql-yoga, Vitest / Testcontainers.

**Depends on:** `feat/auth-subgraphs` (PR #131) — the kit enablement (sub-graph `registerError` option, shared error/filter-input/relay-node tagging) and the `org` sub-graph name. **Branch off `feat/auth-subgraphs`** (or `main` once #131 merges). Spec: `docs/superpowers/specs/2026-06-11-stock-location-subgraphs-design.md`.

**Commit policy:** Stage with `git add` only. Do NOT commit, push, branch, or stash. One commit at the very end after the user reviews. Rebuild kit `dist` (`pnpm --filter @czo/kit build`) before the stock-location E2E (it consumes `@czo/kit` from dist) — only needed if dist is stale (branching off #131, it is current).

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `packages/modules/stock-location/src/graphql/schema/subgraphs.ts` | the `sg()` audience helper (org) | Create |
| `packages/modules/stock-location/src/graphql/schema/subgraphs.test.ts` | unit test for `sg()` | Create |
| `packages/modules/stock-location/src/graphql/schema/stock-location/mutations.ts` | tag the 6 mutations into `org` | Modify |
| `packages/modules/stock-location/src/graphql/schema/stock-location/queries.ts` | tag `stockLocation`/`stockLocations` into `org` | Modify |
| `packages/modules/stock-location/src/graphql/schema/stock-location/types.ts` | tag `StockLocation`/`StockLocationAddress` nodes; add the parent-org `select` to the address node | Modify |
| `packages/modules/stock-location/src/graphql/schema/stock-location/inputs.ts` | tag inputs + order enums into `org` | Modify |
| `packages/modules/stock-location/src/graphql/schema/stock-location/errors.ts` | tag domain errors into `org` | Modify |
| `packages/modules/stock-location/src/graphql/node-guards.ts` | add the `StockLocationAddress` guard | Modify |
| `packages/modules/stock-location/src/e2e/harness.ts` | serve sub-graphs (forward `subGraphs` to `buildApp`) | Modify |
| `packages/modules/stock-location/src/e2e/subgraph-org.e2e.test.ts` | exposure E2E (`/graphql/org` has the ops) | Create |
| `packages/modules/stock-location/src/e2e/stock-location.e2e.test.ts` | extend node-authz coverage for `StockLocationAddress` | Modify |

---

## Task 1: Module-local `sg()` audience helper

**Files:**
- Create: `packages/modules/stock-location/src/graphql/schema/subgraphs.ts`
- Test: `packages/modules/stock-location/src/graphql/schema/subgraphs.test.ts`

**Context:** Each `relayMutationField` needs `subGraphs` at 5 points (field/input/payload + `errors.union`/`errors.result`). `sg()` expands one audience into those fragments (identical to `@czo/auth`'s helper). `SubGraphName` is from `@czo/kit/graphql`; `'org'` is a valid name (auth augments `BuilderSubGraphs`, visible here because the module's `permission` authScopes already depend on auth's augmentation).

- [ ] **Step 1: Write the failing test**

Create `packages/modules/stock-location/src/graphql/schema/subgraphs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sg } from './subgraphs'

describe('sg() audience helper', () => {
  it('expands an audience into the four relayMutationField option fragments', () => {
    const O = sg('org')
    expect(O.field).toEqual({ subGraphs: ['org'] })
    expect(O.input).toEqual({ subGraphs: ['org'] })
    expect(O.payload).toEqual({ subGraphs: ['org'] })
    expect(O.errorOpts).toEqual({ union: { subGraphs: ['org'] }, result: { subGraphs: ['org'] } })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/modules/stock-location && pnpm test src/graphql/schema/subgraphs.test.ts`
Expected: FAIL — module `./subgraphs` does not exist.

- [ ] **Step 3: Create the helper**

Create `packages/modules/stock-location/src/graphql/schema/subgraphs.ts`:

```ts
import type { SubGraphName } from '@czo/kit/graphql'

/**
 * Expand one audience into the option fragments a `relayMutationField` needs.
 * Spread `field`/`input`/`payload` into the 3rd/2nd/4th args and merge
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

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/modules/stock-location && pnpm test src/graphql/schema/subgraphs.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + lint + stage**

Run: `cd packages/modules/stock-location && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/subgraphs.ts src/graphql/schema/subgraphs.test.ts`

```bash
git add packages/modules/stock-location/src/graphql/schema/subgraphs.ts packages/modules/stock-location/src/graphql/schema/subgraphs.test.ts
```

---

## Task 2: Tag the surface into `org` + exposure E2E

**Files:**
- Modify: `packages/modules/stock-location/src/graphql/schema/stock-location/{mutations,queries,types,inputs,errors}.ts`
- Modify: `packages/modules/stock-location/src/e2e/harness.ts`
- Create: `packages/modules/stock-location/src/e2e/subgraph-org.e2e.test.ts`

**Context:** Everything stock-location is org-scoped → tag the whole surface into `org`. An under-tagged mutation is **silently dropped** (no error) — the exposure E2E presence assertions are the guard. The 6 mutations: `createStockLocation` (errors `[ValidationError, HandleTaken]`), `updateStockLocation` (`[ValidationError, StockLocationNotFound, OptimisticLockError]`), `deleteStockLocation`/`forceDeleteStockLocation`/`setStockLocationStatus`/`setDefaultStockLocation` (`[StockLocationNotFound, OptimisticLockError]`). `ValidationError`/`OptimisticLockError` are kit-shared (already tagged into every served sub-graph by #131) — do NOT tag them per-module.

- [ ] **Step 1: Tag the 6 mutations**

In `mutations.ts`, add `import { sg } from '../subgraphs'` + `const O = sg('org')` at the top of the registrar, and spread into all 6 `relayMutationField`s (field/input/payload + `errors` merge):

```ts
  builder.relayMutationField(
    'createStockLocation',
    { ...O.input, inputFields: t => ({ /* …unchanged… */ }) },
    {
      ...O.field,
      description: '…unchanged…',
      errors: { types: [ValidationError, HandleTaken], ...O.errorOpts },
      authScopes: /* …unchanged… */,
      resolve: /* …unchanged… */,
    },
    { ...O.payload, outputFields: t => ({ /* …unchanged… */ }) },
  )
  // …apply the identical 3-spread + errors-merge to updateStockLocation,
  //   deleteStockLocation, forceDeleteStockLocation, setStockLocationStatus,
  //   setDefaultStockLocation — each keeps its own existing errors.types.
```

> If any mutation lacks an explicit input or payload options object (e.g. a 3-arg form), add one carrying just the spread. Each generated `Input`/`Payload`/`Result`/`Success` needs its own tag; Step 6 verifies none of the 6 is silently dropped.

- [ ] **Step 2: Tag the queries**

In `queries.ts`: add `subGraphs: ['org']` to `stockLocation` (drizzleField) and `stockLocations` (drizzleConnection — also tag its connection-type 2nd-arg + edge-type 3rd-arg `{ subGraphs: ['org'] }`).

- [ ] **Step 3: Tag the types + inputs + enums**

In `types.ts`: add `subGraphs: ['org']` to the `StockLocation` (`stockLocations`) and `StockLocationAddress` (`stockLocationAddresses`) drizzleNode option objects.
In `inputs.ts`: add `subGraphs: ['org']` to `CreateStockLocationAddressInput`, `UpdateStockLocationAddressInput`, the where-filter input type, and the `StockLocationOrderField` + `StockLocationOrderDirection` enums. (The shared `StringFilterInput` referenced by the where-filter is already tagged into every served sub-graph by the kit enablement — no per-module tag.)

- [ ] **Step 4: Tag the domain errors**

In `errors.ts`: add `subGraphs: ['org']` to each module `registerError(...)` call (e.g. `HandleTaken`, `StockLocationNotFound`). Do NOT touch `ValidationError`/`OptimisticLockError` — those are kit-shared and tagged centrally.

- [ ] **Step 5: Serve sub-graphs in the E2E harness**

In `packages/modules/stock-location/src/e2e/harness.ts`, forward a `subGraphs` option to the `buildApp`/`bootTestApp` call so the test app mounts `/graphql/org`. Mirror how `@czo/auth`'s `e2e/harness.ts` does it (it adds `subGraphs?: ReadonlyArray<SubGraphName>` to its boot options and folds it into `buildOptions`). Read the auth harness for the exact shape; serve `['public', 'org']` (the module only tags `org`; `public` is the kit baseline). If the harness already exposes a way to pass build options, use it; otherwise add the option.

- [ ] **Step 6: Write the exposure E2E**

Create `packages/modules/stock-location/src/e2e/subgraph-org.e2e.test.ts`. Boot via the harness with sub-graphs served; introspect `/graphql/org`:

```ts
// <imports + boot via the stock-location e2e harness with subGraphs served; obtain a `fetch`/`h`>

const fieldNames = async (path: string, root: 'Query' | 'Mutation') => {
  const res = await h.app.fetch(new Request(`http://localhost${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: `query { __type(name: "${root}") { fields { name } } }` }),
  }))
  const body = await res.json()
  return (body.data?.__type?.fields ?? []).map((f: { name: string }) => f.name)
}

describe('stock-location org sub-graph', () => {
  it('/graphql/org exposes all stock-location ops (silent-drop guard)', async () => {
    const q = await fieldNames('/graphql/org', 'Query')
    const m = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['stockLocation', 'stockLocations']) expect(q).toContain(f)
    for (const f of ['createStockLocation', 'updateStockLocation', 'deleteStockLocation', 'forceDeleteStockLocation', 'setStockLocationStatus', 'setDefaultStockLocation'])
      expect(m).toContain(f)
  })

  it('omits stock-location ops from a non-org served sub-graph', async () => {
    // `public` is served (kit baseline) but stock-location tags nothing into it.
    const q = await fieldNames('/graphql/public', 'Query')
    expect(q).not.toContain('stockLocations')
  })
})
```

> Adapt `h`/`h.app.fetch` to the harness's exact request surface (it may expose `h.gql`). The introspection query needs no auth. If `/graphql/public` isn't served by the harness, assert against another served-but-not-org name, or drop the second test to a single-name check — the point is stock-location ops are absent outside `org`.

- [ ] **Step 7: Rebuild kit dist (if stale) + run**

Run: `pnpm --filter @czo/kit build` (only if dist is stale)
Run: `cd packages/modules/stock-location && pnpm test src/e2e/subgraph-org.e2e.test.ts`
Expected: both PASS. A missing mutation in the presence list → under-tagged (silent drop) — re-check its 5 points. A build throw naming a type → tag that input/enum/error `['org']`.

- [ ] **Step 8: Type-check + lint + stage**

Run: `cd packages/modules/stock-location && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/stock-location src/e2e/harness.ts src/e2e/subgraph-org.e2e.test.ts`

```bash
git add packages/modules/stock-location/src/graphql/schema/stock-location \
        packages/modules/stock-location/src/e2e/harness.ts \
        packages/modules/stock-location/src/e2e/subgraph-org.e2e.test.ts
```

---

## Task 3: `StockLocationAddress` node-guard

**Files:**
- Modify: `packages/modules/stock-location/src/graphql/schema/stock-location/types.ts`
- Modify: `packages/modules/stock-location/src/graphql/node-guards.ts`
- Modify: `packages/modules/stock-location/src/e2e/stock-location.e2e.test.ts`

**Context:** `StockLocationAddress` is a relay `drizzleNode` (node(id:)-reachable) but ungated → cross-org read of an address by global id. It has no `organizationId` column (only `stockLocationId`, FK 1:1 to `stockLocations`). A `NodeGuard` is sync, so it can't async-load the parent — instead the node loads the parent org via `select` and the guard reads it. The `stockLocation` relation is registered (`database/relations.ts`). Mirror the existing `StockLocation` guard (`stock-location:read` on the owning org).

- [ ] **Step 1: Load the parent org on the address node**

In `types.ts`, change the `StockLocationAddress` (`stockLocationAddresses`) drizzleNode `select` so the parent org is loaded for the guard. The current address node has no `select`; add one that loads the `stockLocation` relation's `organizationId`:

```ts
  builder.drizzleNode('stockLocationAddresses', {
    name: 'StockLocationAddress',
    subGraphs: ['org'],
    // Load the parent location's org so the node(id:) guard can scope the read,
    // regardless of the client's field selection (the address has no own org).
    select: { with: { stockLocation: { columns: { organizationId: true } } } },
    description: '…unchanged…',
    id: { column: a => a.id },
    fields: t => ({ /* …unchanged… */ }),
  })
```

> The exact `select`-with-relation shape for the kit drizzle plugin is verified by Step 4's E2E: if `row.stockLocation` is undefined in the guard, the member-ok assertion fails — adjust the shape (e.g. `select: { columns: { id: true, stockLocationId: true }, with: { stockLocation: { columns: { organizationId: true } } } }`) until the relation loads. The relation name is `stockLocation` (per `database/relations.ts`).

- [ ] **Step 2: Add the guard**

In `node-guards.ts`, add a `StockLocationAddress` entry to `stockLocationNodeGuards`:

```ts
export const stockLocationNodeGuards: Record<string, NodeGuard> = {
  StockLocation: (row: { organizationId: number }) => ({
    permission: { resource: 'stock-location', actions: ['read'], organization: row.organizationId },
  }),
  StockLocationAddress: (row: { stockLocation: { organizationId: number } }) => ({
    permission: { resource: 'stock-location', actions: ['read'], organization: row.stockLocation.organizationId },
  }),
}
```

Update the file's header comment to note both `StockLocation` and `StockLocationAddress` are guarded (the address via its parent location's org).

- [ ] **Step 3: Extend the node-authz E2E**

In `packages/modules/stock-location/src/e2e/stock-location.e2e.test.ts`, add a block mirroring the existing `StockLocation` node(id:) test but for `StockLocationAddress`. Reuse the harness helpers that create a stock location (with an address) in an org and the cross-org/member callers the existing tests use. The node query selects the address fragment:

```ts
const ADDRESS_NODE = `query ($id: ID!) { node(id: $id) { ... on StockLocationAddress { id city } } }`

it('reads a StockLocationAddress via node(id:) — member ok, non-member denied', async () => {
  // <create a stock location WITH an address in org A as a member; capture the address global id>
  // member of org A:
  const ok = await /* h.gql(ADDRESS_NODE, { id: addressGid }, memberToken) */
  expect(ok.data.node).not.toBeNull()
  expect(ok.data.node.__typename ?? 'StockLocationAddress')
  // a caller from org B (or a non-member):
  const denied = await /* h.gql(ADDRESS_NODE, { id: addressGid }, otherToken) */
  expect(denied.data.node).toBeNull()
  expect(denied.errors).toBeUndefined()
})
```

> Adapt to the existing test's exact harness calls (how it creates a location, adds an address, mints member vs cross-org tokens, and captures global ids). The existing `StockLocation` node test (around the `NODE`/`node(id:)` assertions) is the template. Deny-as-null: `data.node === null` AND no `errors`.

- [ ] **Step 4: Rebuild kit dist (if stale) + run**

Run: `cd packages/modules/stock-location && pnpm test src/e2e/stock-location.e2e.test.ts`
Expected: the existing tests + the new `StockLocationAddress` block PASS. If the member-ok case is `null`, the `select` relation didn't load `row.stockLocation.organizationId` — fix the `select` shape (Step 1). If the cross-org case returns the row, the guard isn't matched (confirm the type-name key `StockLocationAddress` matches the GraphQL type name).

- [ ] **Step 5: Type-check + lint + stage**

Run: `cd packages/modules/stock-location && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/stock-location/types.ts src/graphql/node-guards.ts src/e2e/stock-location.e2e.test.ts`

```bash
git add packages/modules/stock-location/src/graphql/schema/stock-location/types.ts \
        packages/modules/stock-location/src/graphql/node-guards.ts \
        packages/modules/stock-location/src/e2e/stock-location.e2e.test.ts
```

---

## Task 4: Full validation + final review

**Files:** none (verification only)

- [ ] **Step 1: Rebuild kit + type-check**

Run: `pnpm --filter @czo/kit build`
Run: `pnpm --filter @czo/stock-location check-types`
Run: `pnpm --filter life check-types`
Expected: clean (no NEW errors).

- [ ] **Step 2: Run the affected suites**

Run: `cd packages/modules/stock-location && pnpm test src/graphql/schema/subgraphs.test.ts src/e2e/subgraph-org.e2e.test.ts src/e2e/stock-location.e2e.test.ts`
Expected: green (the helper unit + exposure E2E + the extended node-authz E2E, incl. the pre-existing stock-location tests).

- [ ] **Step 3: Lint**

Run: `pnpm --filter @czo/stock-location lint --max-warnings 0`
Expected: clean.

- [ ] **Step 4: Review the staged diff**

Run: `git diff --cached --stat`
Expected: only the stock-location files in the File Structure table. No `console.log`, no broad `as any`, no `dist/` staged, no commit.

- [ ] **Step 5: STOP — hand to the user**

Do NOT commit. Report: validation results, the staged file list, and confirm `/graphql/org` exposes the 6 mutations + 2 queries and that `StockLocationAddress` node reads are org-scoped (cross-org → null). The user reviews and decides the commit/PR (and whether this lands on `feat/auth-subgraphs` or a branch off `main` after #131 merges).

---

## Self-review (against the spec)

- **Spec §Decisions 1 (everything → org):** Tasks 1-2 — `sg('org')` on 6 mutations, `subGraphs: ['org']` on 2 queries + 2 nodes + inputs/enums + errors. ✓
- **Spec §Decisions 2 / §Architecture 2 (StockLocationAddress node-guard):** Task 3 — `select` parent org + guard + node-authz E2E. ✓
- **Spec §Decisions 3 (#131 dependency):** header + the `org` name type-checks via auth's augmentation. ✓
- **Spec §Decisions 4 (no serving change):** the harness serves sub-graphs for the test; `apps/life` already serves `org` in production (untouched). ✓
- **Spec §Testing:** Task 2 (exposure E2E presence + isolation) + Task 3 (node-authz for the address). ✓
- **Placeholder scan:** the "read the harness/existing test first" steps (Task 2 Step 5/6, Task 3 Step 3) are deliberate — the harness/test shapes are read at execution; the assertions + tagging are fully specified. The `select`-with-relation shape is the one runtime-verified detail, gated by the node-authz E2E with a concrete fallback shape given.
- **Type consistency:** `sg()` shape consistent across Task 1 + Task 2 usage; `StockLocationAddress` guard reads `row.stockLocation.organizationId` matching the `select` relation in Task 3 Step 1; the GraphQL type-name keys (`StockLocation`/`StockLocationAddress`) match the node `name:` values.
