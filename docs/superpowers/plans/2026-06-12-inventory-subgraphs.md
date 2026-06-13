# Inventory sub-graph tagging (org) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag `@czo/inventory`'s entire GraphQL surface into the `org` audience sub-graph (it is uniformly org-scoped); the three inventory nodes are already guarded, so no node-guard work.

**Architecture:** A module-local `sg()` helper tags the 10 `relayMutationField` mutations at the 5 points; the 2 queries, 3 drizzleNodes, inputs/enums, and domain errors take `subGraphs: ['org']`. An exposure E2E proves it; the existing node-authz tests confirm no regression.

**Tech Stack:** Pothos (`@pothos/plugin-sub-graph`/`-drizzle`/`-scope-auth`/`-errors`), Effect-TS, graphql-yoga, Vitest / Testcontainers.

**Depends on:** sub-graph foundation (#130) + auth (#131), merged to `main`. **Branch off `main`.** Spec: `docs/superpowers/specs/2026-06-12-inventory-subgraphs-design.md`.

**Commit policy:** Stage with `git add` only. Do NOT commit, push, branch, or stash. One commit at the very end after the user reviews. Rebuild kit `dist` (`pnpm --filter @czo/kit build`) before the inventory E2E.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `packages/modules/inventory/src/graphql/schema/inventory/subgraphs.ts` | the `sg()` helper | Create |
| `packages/modules/inventory/src/graphql/schema/inventory/subgraphs.test.ts` | unit test | Create |
| `packages/modules/inventory/src/graphql/schema/inventory/mutations/{item,level,reservation}.ts` | tag the 10 mutations into `org` | Modify |
| `packages/modules/inventory/src/graphql/schema/inventory/queries.ts` | tag `inventoryItem`/`inventoryItems` into `org` | Modify |
| `packages/modules/inventory/src/graphql/schema/inventory/types.ts` | tag the 3 drizzleNodes + management refs into `org` | Modify |
| `packages/modules/inventory/src/graphql/schema/inventory/inputs.ts` | tag inputs + order enums into `org` | Modify |
| `packages/modules/inventory/src/graphql/schema/inventory/errors.ts` | tag domain errors into `org` | Modify |
| `packages/modules/inventory/src/e2e/harness.ts` | serve sub-graphs | Modify |
| `packages/modules/inventory/src/e2e/subgraph-org.e2e.test.ts` | exposure E2E | Create |

---

## Task 1: Module-local `sg()` audience helper

**Files:**
- Create: `packages/modules/inventory/src/graphql/schema/inventory/subgraphs.ts`
- Test: `packages/modules/inventory/src/graphql/schema/inventory/subgraphs.test.ts`

**Context:** Each `relayMutationField` needs `subGraphs` at 5 points (field/input/payload + `errors.union`/`errors.result`). `sg()` expands one audience into those fragments — identical to `@czo/auth`'s/`@czo/price`'s helpers. `'org'` is a valid `SubGraphName` (auth's `BuilderSubGraphs` augmentation is visible because inventory's `permission` authScopes already depend on it).

- [ ] **Step 1: Write the failing test**

Create `packages/modules/inventory/src/graphql/schema/inventory/subgraphs.test.ts`:

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

Run: `cd packages/modules/inventory && pnpm test src/graphql/schema/inventory/subgraphs.test.ts`
Expected: FAIL — module `./subgraphs` does not exist.

- [ ] **Step 3: Create the helper**

Create `packages/modules/inventory/src/graphql/schema/inventory/subgraphs.ts`:

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

Run: `cd packages/modules/inventory && pnpm test src/graphql/schema/inventory/subgraphs.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + lint + stage**

Run: `cd packages/modules/inventory && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/inventory/subgraphs.ts src/graphql/schema/inventory/subgraphs.test.ts`

```bash
git add packages/modules/inventory/src/graphql/schema/inventory/subgraphs.ts packages/modules/inventory/src/graphql/schema/inventory/subgraphs.test.ts
```

---

## Task 2: Tag the surface into `org` + exposure E2E

**Files:**
- Modify: `packages/modules/inventory/src/graphql/schema/inventory/mutations/{item,level,reservation}.ts`
- Modify: `packages/modules/inventory/src/graphql/schema/inventory/{queries,types,inputs,errors}.ts`
- Modify: `packages/modules/inventory/src/e2e/harness.ts`
- Create: `packages/modules/inventory/src/e2e/subgraph-org.e2e.test.ts`

**Context:** Everything inventory is org-scoped → tag the whole surface into `org`. An under-tagged mutation is **silently dropped** (no error) — the exposure E2E presence assertions are the guard. Kit-shared `ValidationError`/`OptimisticLockError`/`StringFilterInput` are tagged centrally — do NOT tag them per-module.

> Read first: `@czo/price`'s or `@czo/stock-location`'s `e2e/harness.ts` (the `subGraphs`-forwarding template) + the inventory `e2e/harness.ts` you'll extend + `e2e/inventory.e2e.test.ts` for the request surface; and how `@czo/price` applied `sg()`.

- [ ] **Step 1: Tag the 10 mutations**

In each of `mutations/item.ts`, `mutations/level.ts`, `mutations/reservation.ts`, add `import { sg } from '../subgraphs'` + `const O = sg('org')` at the top of the registrar, and spread into every `relayMutationField` (field/input/payload + `errors` merge). `...O.field` FIRST in the field-options object:

```ts
  builder.relayMutationField(
    'createInventoryItem',
    { ...O.input, inputFields: t => ({ /* …unchanged… */ }) },
    {
      ...O.field,
      description: '…unchanged…',
      errors: { types: [ValidationError, SkuTaken], ...O.errorOpts },
      authScopes: /* …unchanged… */,
      resolve: /* …unchanged… */,
    },
    { ...O.payload, outputFields: t => ({ /* …unchanged… */ }) },
  )
```

The 10 mutations (keep each existing `errors.types` verbatim, only merge `...O.errorOpts`):
- `item.ts`: `createInventoryItem` (`[ValidationError, SkuTaken]`), `updateInventoryItem` (`[ValidationError, InventoryItemNotFound, OptimisticLockError]`), `deleteInventoryItem` (`[InventoryItemNotFound, OptimisticLockError]`).
- `level.ts`: `createInventoryLevel` (`[InventoryItemNotFound, CrossOrgStockLocation, LevelAlreadyExists]`), `setInventoryLevel` (`[InventoryLevelNotFound, OptimisticLockError, InsufficientStock]`), `adjustInventoryStock` (`[InventoryLevelNotFound, InsufficientStock]`), `deleteInventoryLevel` (`[InventoryLevelNotFound, LevelHasReservations]`).
- `reservation.ts`: `createReservation` (`[InventoryLevelNotFound, InsufficientInventory]`), `updateReservation` (`[ReservationNotFound, InsufficientInventory]`), `deleteReservation` (`[ReservationNotFound]`).

> If a mutation lacks an explicit input or payload options object (3-arg form), add one carrying just the spread.

- [ ] **Step 2: Tag the queries**

In `queries.ts`: add `subGraphs: ['org']` to `inventoryItem` (drizzleField) and `inventoryItems` (drizzleConnection — also tag its connection-type 2nd-arg + edge-type 3rd-arg `{ subGraphs: ['org'] }`).

- [ ] **Step 3: Tag the types**

In `types.ts`: add `subGraphs: ['org']` to the `InventoryItem` (`inventoryItems`), `InventoryLevel` (`inventoryLevels`), `Reservation` (`reservations`) drizzleNode option objects, and to any management object ref they expose.

- [ ] **Step 4: Tag the inputs + enums**

In `inputs.ts`: add `subGraphs: ['org']` to the management input/enum types (`InventoryItemOrderField`, `InventoryItemOrderDirection`, `InventoryItemOrderByInput`, any where-filter + create/update inputs). The shared `StringFilterInput`/etc. are kit-central — no per-module tag.

- [ ] **Step 5: Tag the domain errors**

In `errors.ts`: add `subGraphs: ['org']` to each module `registerError(...)` call — `SkuTaken`, `InventoryItemNotFound`, `CrossOrgStockLocation`, `LevelAlreadyExists`, `InventoryLevelNotFound`, `InsufficientStock`, `LevelHasReservations`, `InsufficientInventory`, `ReservationNotFound`. Do NOT touch kit-shared `ValidationError`/`OptimisticLockError`.

- [ ] **Step 6: Serve sub-graphs in the harness**

In `packages/modules/inventory/src/e2e/harness.ts`, forward a `subGraphs` option to the boot (mirror `@czo/price`'s/`@czo/stock-location`'s harness — `subGraphs?: ReadonlyArray<SubGraphName>` folded into build options). Serve `['public', 'org']`.

- [ ] **Step 7: Write the exposure E2E**

Create `packages/modules/inventory/src/e2e/subgraph-org.e2e.test.ts`:

```ts
// <imports + boot via the inventory e2e harness with ['public','org'] served; obtain `h`>

const fieldNames = async (path: string, root: 'Query' | 'Mutation') => {
  const res = await h.app.fetch(new Request(`http://localhost${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: `query { __type(name: "${root}") { fields { name } } }` }),
  }))
  const body = await res.json()
  return (body.data?.__type?.fields ?? []).map((f: { name: string }) => f.name)
}

describe('inventory org sub-graph', () => {
  it('/graphql/org exposes all inventory ops (silent-drop guard)', async () => {
    const q = await fieldNames('/graphql/org', 'Query')
    const m = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['inventoryItem', 'inventoryItems']) expect(q).toContain(f)
    for (const f of ['createInventoryItem', 'updateInventoryItem', 'deleteInventoryItem', 'createInventoryLevel', 'setInventoryLevel', 'adjustInventoryStock', 'deleteInventoryLevel', 'createReservation', 'updateReservation', 'deleteReservation'])
      expect(m).toContain(f)
  })

  it('omits inventory ops from a non-org served sub-graph', async () => {
    const q = await fieldNames('/graphql/public', 'Query')
    expect(q).not.toContain('inventoryItems')
  })
})
```
> Adapt `h`/`h.app.fetch` to the harness's request surface. Introspection needs no auth. If `/graphql/public` isn't served, assert against another served-but-not-org name or drop the second test — the point is inventory ops are absent outside `org`.

- [ ] **Step 8: Rebuild kit dist + run**

Run: `pnpm --filter @czo/kit build`
Run: `cd packages/modules/inventory && pnpm test src/e2e/subgraph-org.e2e.test.ts`
Expected: both PASS. A missing mutation/query → under-tagged (silent drop); re-check tags. A build throw naming a type → tag that input/ref/error `['org']`.

- [ ] **Step 9: Type-check + lint + stage**

Run: `cd packages/modules/inventory && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/inventory src/e2e/harness.ts src/e2e/subgraph-org.e2e.test.ts`

```bash
git add packages/modules/inventory/src/graphql/schema/inventory \
        packages/modules/inventory/src/e2e/harness.ts \
        packages/modules/inventory/src/e2e/subgraph-org.e2e.test.ts
```

---

## Task 3: Full validation + final review

**Files:** none (verification only)

- [ ] **Step 1: Rebuild kit + type-check**

Run: `pnpm --filter @czo/kit build`
Run: `pnpm --filter @czo/inventory check-types`
Run: `pnpm --filter life check-types`
Expected: clean (no NEW errors).

- [ ] **Step 2: Run the affected suites**

Run: `cd packages/modules/inventory && pnpm test src/graphql/schema/inventory/subgraphs.test.ts src/e2e/subgraph-org.e2e.test.ts`
Then the whole module (the existing inventory tests + the new ones — the tagging must not regress the existing node-authz / op tests):
Run: `cd packages/modules/inventory && pnpm test`
Expected: green. (The existing `InventoryItem`/`InventoryLevel`/`Reservation` node-authz tests stay green — no guard change.)

- [ ] **Step 3: Lint**

Run: `pnpm --filter @czo/inventory lint --max-warnings 0`
Expected: clean.

- [ ] **Step 4: Review the staged diff**

Run: `git diff --cached --stat`
Expected: only the inventory files in the File Structure table. No `console.log`, no broad `as any`, no `dist/` staged, no commit.

- [ ] **Step 5: STOP — hand to the user**

Do NOT commit. Report: validation results, the staged file list, and confirm `/graphql/org` exposes the 10 mutations + 2 queries and they are absent from `/graphql/public`. The user reviews and decides the commit/PR.

---

## Self-review (against the spec)

- **Spec §Decisions 1 (everything → org):** Task 2 — `sg('org')` on 10 mutations, `subGraphs: ['org']` on 2 queries + 3 nodes + inputs/enums + 9 errors. ✓
- **Spec §Decisions 2 (no node-guard work):** none — the 3 nodes are already guarded; Task 3 Step 2 confirms they stay green. ✓
- **Spec §Decisions 3 (no serving change):** the harness serves sub-graphs for the test; `apps/life` untouched. ✓
- **Spec §Testing:** Task 2 Step 7 (exposure E2E presence + isolation) + Task 3 (existing node-authz stays green). ✓
- **Placeholder scan:** every mutation + its exact `errors.types` is enumerated; the "read the harness/template first" step is deliberate (shapes read at execution). No TBD.
- **Type consistency:** `sg()` shape consistent (Task 1 → Task 2); the 10 mutation names + their error lists match the inspected source; the GraphQL type-name keys match the node `name:` values.
