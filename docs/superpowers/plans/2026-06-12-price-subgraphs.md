# Price sub-graph tagging (org management + resolve public+org) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag `@czo/price`'s org-scoped management surface into the `org` sub-graph and widen the already-`public` resolve surface to `['public', 'org']`, so `/graphql/org` exposes the full price surface while `/graphql/public` keeps only the storefront resolve.

**Architecture:** A module-local `sg()` helper tags the 8 `relayMutationField` mutations at the 5 points; the 4 management queries + the `PriceSet`/`Price`/`PriceList` nodes + their `PriceRule`/`PriceListRule` refs + inputs + domain errors take `subGraphs: ['org']`; the 8 existing `subGraphs: ['public']` sites (resolve fields + output types + `PriceContextRuleInput`) are widened to `['public', 'org']`. The 3 price nodes are already guarded — no node-guard work. An exposure E2E proves it.

**Tech Stack:** Pothos (`@pothos/plugin-sub-graph`, `@pothos/plugin-drizzle`, `@pothos/plugin-scope-auth`, `@pothos/plugin-errors`), Effect-TS, graphql-yoga, Vitest / Testcontainers.

**Depends on:** the sub-graph foundation (#130) + auth sub-graph work (#131) — both merged to `main`. **Branch off `main`** (the kit enablement + the `public`/`org` names are on `main`). Spec: `docs/superpowers/specs/2026-06-12-price-subgraphs-design.md`.

**Commit policy:** Stage with `git add` only. Do NOT commit, push, branch, or stash. One commit at the very end after the user reviews. Rebuild kit `dist` (`pnpm --filter @czo/kit build`) before the price E2E (it consumes `@czo/kit` from dist) — needed once after checking out `main`.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `packages/modules/price/src/graphql/schema/price/subgraphs.ts` | the `sg()` audience helper | Create |
| `packages/modules/price/src/graphql/schema/price/subgraphs.test.ts` | unit test for `sg()` | Create |
| `packages/modules/price/src/graphql/schema/price/mutations/{price,priceList,priceSet}.ts` | tag the 8 mutations into `org` | Modify |
| `packages/modules/price/src/graphql/schema/price/queries.ts` | tag the 4 management queries `org`; widen `resolvePrice`/`resolvePrices` to `public,org` | Modify |
| `packages/modules/price/src/graphql/schema/price/types.ts` | tag the 3 nodes + `PriceRule`/`PriceListRule` refs `org`; widen the 5 resolve output types to `public,org` | Modify |
| `packages/modules/price/src/graphql/schema/price/inputs.ts` | tag management inputs `org`; widen `PriceContextRuleInput` to `public,org` | Modify |
| `packages/modules/price/src/graphql/schema/price/errors.ts` | tag the 4 domain errors `org` | Modify |
| `packages/modules/price/src/e2e/harness.ts` | serve sub-graphs (forward `subGraphs` to the boot) | Modify |
| `packages/modules/price/src/e2e/subgraph-org.e2e.test.ts` | exposure E2E (`/graphql/org` full surface; `/graphql/public` resolve-only) | Create |

---

## Task 1: Module-local `sg()` audience helper

**Files:**
- Create: `packages/modules/price/src/graphql/schema/price/subgraphs.ts`
- Test: `packages/modules/price/src/graphql/schema/price/subgraphs.test.ts`

**Context:** Each `relayMutationField` needs `subGraphs` at 5 points (field/input/payload + `errors.union`/`errors.result`). `sg()` expands one audience into those fragments — identical to `@czo/auth`'s and `@czo/stock-location`'s helpers. `SubGraphName` is from `@czo/kit/graphql`; `'org'`/`'public'` are valid names (auth's `BuilderSubGraphs` augmentation is visible because price's `permission` authScopes already depend on auth's augmentation).

- [ ] **Step 1: Write the failing test**

Create `packages/modules/price/src/graphql/schema/price/subgraphs.test.ts`:

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

Run: `cd packages/modules/price && pnpm test src/graphql/schema/price/subgraphs.test.ts`
Expected: FAIL — module `./subgraphs` does not exist.

- [ ] **Step 3: Create the helper**

Create `packages/modules/price/src/graphql/schema/price/subgraphs.ts`:

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

Run: `cd packages/modules/price && pnpm test src/graphql/schema/price/subgraphs.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + lint + stage**

Run: `cd packages/modules/price && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/price/subgraphs.ts src/graphql/schema/price/subgraphs.test.ts`

```bash
git add packages/modules/price/src/graphql/schema/price/subgraphs.ts packages/modules/price/src/graphql/schema/price/subgraphs.test.ts
```

---

## Task 2: Tag the surface (widen resolve → public+org, management → org) + exposure E2E

**Files:**
- Modify: `packages/modules/price/src/graphql/schema/price/mutations/{price,priceList,priceSet}.ts`
- Modify: `packages/modules/price/src/graphql/schema/price/{queries,types,inputs,errors}.ts`
- Modify: `packages/modules/price/src/e2e/harness.ts`
- Create: `packages/modules/price/src/e2e/subgraph-org.e2e.test.ts`

**Context:** Two changes: (a) **widen** the 8 existing `subGraphs: ['public']` sites to `['public', 'org']` (resolve fields + output types + the resolve arg input); (b) **tag** the management surface into `org`. An under-tagged mutation is **silently dropped** (no error) → the exposure E2E presence assertions are the guard. Kit-shared types (`ValidationError`/`OptimisticLockError`/`StringFilterInput`/`JSON`) are tagged centrally — do NOT tag them per-module.

> Read first: `@czo/stock-location`'s `e2e/harness.ts` (how it forwards `subGraphs` to the boot) + its `e2e/subgraph-org.e2e.test.ts` (the exposure-test shape) — the templates; and the price `e2e/harness.ts` you'll extend + a sibling price e2e for the request surface.

- [ ] **Step 1: Widen the resolve surface to `['public', 'org']`**

Change these EXACT existing `subGraphs: ['public']` lines to `subGraphs: ['public', 'org']`:
- `queries.ts:113` (`resolvePrice` field) and `queries.ts:151` (`resolvePrices` field).
- `types.ts:153`, `162`, `172`, `183`, `191` (the `BasePrice`/`OverridePrice`/`SalePrice` refs, the `CalculatedPrice` union, and `PriceResolution`).
- `inputs.ts:32` (`PriceContextRuleInput`).

(Line numbers are the current sites; if shifted, find each `subGraphs: ['public']` in these files and widen it — there are exactly 8.)

- [ ] **Step 2: Tag the 8 management mutations into `org`**

In each of `mutations/price.ts`, `mutations/priceList.ts`, `mutations/priceSet.ts`, add `import { sg } from '../subgraphs'` + `const O = sg('org')` at the top of the registrar, and spread into every `relayMutationField` (field/input/payload + `errors` merge):

```ts
  builder.relayMutationField(
    'createPrice',
    { ...O.input, inputFields: t => ({ /* …unchanged… */ }) },
    {
      ...O.field,
      description: '…unchanged…',
      errors: { types: [ValidationError, PriceSetNotFound, PriceListNotFound, InvalidPriceRule], ...O.errorOpts },
      authScopes: /* …unchanged… */,
      resolve: /* …unchanged… */,
    },
    { ...O.payload, outputFields: t => ({ /* …unchanged… */ }) },
  )
```

The 8 mutations + their existing `errors.types` (keep each verbatim, only merge `...O.errorOpts`):
- `price.ts`: `createPrice` (`[ValidationError, PriceSetNotFound, PriceListNotFound, InvalidPriceRule]`), `updatePrice` (`[ValidationError, PriceNotFound, InvalidPriceRule, OptimisticLockError]`), `deletePrice` (`[PriceNotFound, OptimisticLockError]`).
- `priceList.ts`: `createPriceList` (`[ValidationError, InvalidPriceRule]`), `updatePriceList` (`[ValidationError, PriceListNotFound, InvalidPriceRule, OptimisticLockError]`), `deletePriceList` (`[PriceListNotFound, OptimisticLockError]`).
- `priceSet.ts`: `createPriceSet` (`errors: { types: [] }` — **empty, but STILL add `...O.errorOpts`** or the mutation is silently dropped), `deletePriceSet` (`[PriceSetNotFound, OptimisticLockError]`).

- [ ] **Step 3: Tag the 4 management queries into `org`**

In `queries.ts`: add `subGraphs: ['org']` to `priceSet`, `priceSets`, `priceList`, `priceLists` (for any that are `drizzleConnection`, also tag the connection-type 2nd-arg + edge-type 3rd-arg `{ subGraphs: ['org'] }`). Do NOT change `resolvePrice`/`resolvePrices` here (handled in Step 1).

- [ ] **Step 4: Tag the management types into `org`**

In `types.ts`: add `subGraphs: ['org']` to the `PriceRuleRef` (`'PriceRule'`, ~line 42) and `PriceListRuleRef` (`'PriceListRule'`, ~line 52) object refs, and to the `PriceSet` (`priceSets`, ~line 63), `Price` (`prices`, ~line 91), `PriceList` (`priceLists`, ~line 119) drizzleNodes. (The resolve output types at lines 153-191 are widened in Step 1, not here.) If the build (Step 8) names another management ref reachable from these (e.g. a `PriceListRef`), tag it `['org']` too.

- [ ] **Step 5: Tag the management inputs into `org`**

In `inputs.ts`: add `subGraphs: ['org']` to the management input/enum types (the create/update inputs for price/priceList/priceSet, any where-filter input, order enums). Do NOT change `PriceContextRuleInput` (widened in Step 1). The shared `StringFilterInput`/`JSON` are kit-central — no per-module tag.

- [ ] **Step 6: Tag the 4 domain errors into `org`**

In `errors.ts`: add `subGraphs: ['org']` to the module `registerError(...)` calls — `PriceSetNotFound`, `PriceListNotFound`, `PriceNotFound`, `InvalidPriceRule`. Do NOT touch `ValidationError`/`OptimisticLockError` (kit-shared).

- [ ] **Step 7: Serve sub-graphs in the E2E harness**

In `packages/modules/price/src/e2e/harness.ts`, forward a `subGraphs` option to the boot so `/graphql/org` + `/graphql/public` mount — mirror `@czo/stock-location`'s `e2e/harness.ts` (`subGraphs?: ReadonlyArray<SubGraphName>` folded into the build options). Serve `['public', 'org']`.

- [ ] **Step 8: Write the exposure E2E**

Create `packages/modules/price/src/e2e/subgraph-org.e2e.test.ts` (mirror stock-location's `subgraph-org.e2e.test.ts`):

```ts
// <imports + boot via the price e2e harness with subGraphs ['public','org'] served; obtain `h`>

const fieldNames = async (path: string, root: 'Query' | 'Mutation') => {
  const res = await h.app.fetch(new Request(`http://localhost${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: `query { __type(name: "${root}") { fields { name } } }` }),
  }))
  const body = await res.json()
  return (body.data?.__type?.fields ?? []).map((f: { name: string }) => f.name)
}

describe('price org sub-graph', () => {
  it('/graphql/org exposes the management surface + resolve (silent-drop guard)', async () => {
    const q = await fieldNames('/graphql/org', 'Query')
    const m = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['priceSet', 'priceSets', 'priceList', 'priceLists', 'resolvePrice', 'resolvePrices']) expect(q).toContain(f)
    for (const f of ['createPrice', 'updatePrice', 'deletePrice', 'createPriceList', 'updatePriceList', 'deletePriceList', 'createPriceSet', 'deletePriceSet'])
      expect(m).toContain(f)
  })

  it('/graphql/public keeps resolve but omits the management surface', async () => {
    const q = await fieldNames('/graphql/public', 'Query')
    expect(q).toContain('resolvePrice')
    expect(q).toContain('resolvePrices')
    expect(q).not.toContain('priceSets')
    expect(q).not.toContain('priceList')
  })
})
```

> Adapt `h`/`h.app.fetch` to the harness's exact request surface. The introspection query needs no auth.

- [ ] **Step 9: Rebuild kit dist + run the E2E**

Run: `pnpm --filter @czo/kit build`
Run: `cd packages/modules/price && pnpm test src/e2e/subgraph-org.e2e.test.ts`
Expected: both PASS. A missing mutation/query in `/graphql/org` → under-tagged (silent drop); re-check its tags. A build throw naming a type → tag that management input/ref/error `['org']` (Step 4/5/6). If `resolvePrice` is missing from `/graphql/org`, a resolve output type or `PriceContextRuleInput` wasn't widened (Step 1).

- [ ] **Step 10: Type-check + lint + stage**

Run: `cd packages/modules/price && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/price src/e2e/harness.ts src/e2e/subgraph-org.e2e.test.ts`

```bash
git add packages/modules/price/src/graphql/schema/price \
        packages/modules/price/src/e2e/harness.ts \
        packages/modules/price/src/e2e/subgraph-org.e2e.test.ts
```

---

## Task 3: Full validation + final review

**Files:** none (verification only)

- [ ] **Step 1: Rebuild kit + type-check**

Run: `pnpm --filter @czo/kit build`
Run: `pnpm --filter @czo/price check-types`
Run: `pnpm --filter life check-types`
Expected: clean (no NEW errors).

- [ ] **Step 2: Run the affected suites**

Run: `cd packages/modules/price && pnpm test src/graphql/schema/price/subgraphs.test.ts src/e2e/subgraph-org.e2e.test.ts`
Then the module's existing E2E/node-authz suite to confirm no regression (the resolve widening + management tags must not break existing tests):
Run: `cd packages/modules/price && pnpm test`
Expected: green. (The existing price node-authz tests for `PriceSet`/`Price`/`PriceList` stay green — no guard change.)

- [ ] **Step 3: Lint**

Run: `pnpm --filter @czo/price lint --max-warnings 0`
Expected: clean.

- [ ] **Step 4: Review the staged diff**

Run: `git diff --cached --stat`
Expected: only the price files in the File Structure table. No `console.log`, no broad `as any`, no `dist/` staged, no commit.

- [ ] **Step 5: STOP — hand to the user**

Do NOT commit. Report: validation results, the staged file list, and confirm `/graphql/org` exposes the 8 mutations + 4 management queries + the 2 resolve queries, and `/graphql/public` keeps resolve but omits management. The user reviews and decides the commit/PR.

---

## Self-review (against the spec)

- **Spec §Decisions 1 (management → org):** Task 2 Steps 2-6 — 8 mutations via `sg('org')`, 4 queries, 3 nodes + 2 refs, inputs, 4 errors. ✓
- **Spec §Decisions 2 (resolve → public+org):** Task 2 Step 1 — the 8 `['public']` sites widened to `['public','org']`. ✓
- **Spec §Decisions 3 (no node-guard work):** none — the 3 nodes are already guarded; Task 3 Step 2 confirms they stay green. ✓
- **Spec §Decisions 4 (no serving change):** the harness serves sub-graphs for the test; `apps/life` untouched. ✓
- **Spec §Testing:** Task 2 Step 8 (exposure E2E: org full surface + public resolve-only) + Task 3 (existing node-authz stays green). ✓
- **Placeholder scan:** the exact management refs to tag are enumerated (PriceRule/PriceListRule + 3 nodes) with a build-driven catch for any additional ref; the "read the harness/template first" step is deliberate (shapes read at execution). No TBD.
- **Type consistency:** `sg()` shape consistent (Task 1 → Task 2); `createPriceSet`'s empty `errors.types` still gets `...O.errorOpts` (Task 2 Step 2 — the silent-drop guard); the 8 widen sites match the 8 grep'd `['public']` locations.
