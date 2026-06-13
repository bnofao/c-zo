# Attribute per-tier split + sub-graph tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `@czo/attribute`'s two tier-ambiguous top-level ops into explicit platform/org variants (`createAttribute`/`createOrganizationAttribute`, `attributes`/`organizationAttributes`) and tag the whole GraphQL surface into the `org`/`admin` audience sub-graphs.

**Architecture:** Platform ops → `admin`, org ops → `org`, row-tier-derived ops (single `attribute` query, by-id update/delete, reorders, value-creates) → `['org','admin']`. A module-local `sg()` helper tags `relayMutationField`s at 5 points; `subGraphs` on queries/nodes/inputs/enums/errors. `organizationId` is already nullable and platform attributes already work — **no schema migration, no new authz helper**. The org list adds an `includeGlobal: Boolean = false` arg via one additive, tri-state `ReadScope`/`visible()` change (existing internal callers unaffected). Value-creates are unchanged (their `organizationId` input is meaningful — org-graft onto platform parents).

**Tech Stack:** Pothos (`@pothos/plugin-sub-graph`/`-drizzle`/`-relay`/`-scope-auth`/`-errors`), Effect-TS, Drizzle RQBv2, graphql-yoga, Vitest + Testcontainers.

**Depends on:** sub-graph foundation (#130) + auth (#131), merged to `main`. **Branch off `main`.** Spec: `docs/superpowers/specs/2026-06-12-attribute-subgraphs-design.md`.

**Commit policy:** Stage with `git add` only. Do NOT commit, push, branch, or stash. One commit at the very end after the user reviews. Rebuild kit `dist` (`pnpm --filter @czo/kit build`) before any attribute E2E.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/graphql/schema/subgraphs.ts` | `sg()` helper | Create |
| `src/graphql/schema/subgraphs.test.ts` | unit test | Create |
| `src/graphql/schema/mutations/attribute.ts` | split `createAttribute`; tag attribute mutations | Modify |
| `src/services/attribute.ts` | `ReadScope.includeGlobal?` + `visible()` org-only branch | Modify |
| `src/services/scoping.integration.test.ts` | `includeGlobal` tri-state test | Modify |
| `src/graphql/schema/queries.ts` | split `attributes`; add `includeGlobal` arg; tag queries | Modify |
| `src/graphql/schema/mutations/choice-value.ts` | tag value mutations (unchanged behavior) | Modify |
| `src/graphql/schema/mutations/typed-value.ts` | tag value mutations (unchanged behavior) | Modify |
| `src/graphql/schema/types.ts` | tag 9 nodes + related connections | Modify |
| `src/graphql/schema/inputs.ts`, `enums.ts`, `scalars.ts` | tag module inputs/enums/refs | Modify |
| `src/graphql/schema/errors.ts` | tag 12 module errors | Modify |
| `src/e2e/harness.ts` | serve sub-graphs (optional `subGraphs`) | Modify |
| `src/e2e/subgraph-exposure.e2e.test.ts` | exposure E2E | Create |
| `src/e2e/*.e2e.test.ts` (existing) | migrate to the split op names | Modify |

All paths are under `packages/modules/attribute/`.

---

## Task 1: Module-local `sg()` audience helper

**Files:**
- Create: `packages/modules/attribute/src/graphql/schema/subgraphs.ts`
- Test: `packages/modules/attribute/src/graphql/schema/subgraphs.test.ts`

**Context:** Each `relayMutationField` needs `subGraphs` at 5 points (field/input/payload + `errors.union`/`errors.result`). `sg()` expands audiences into those fragments — identical to the helpers already in `@czo/auth`/`@czo/price`/`@czo/inventory` (e.g. `packages/modules/inventory/src/graphql/schema/inventory/subgraphs.ts`). `SubGraphName` (`'public'|'account'|'org'|'admin'`) is exported from `@czo/kit/graphql`.

- [ ] **Step 1: Write the failing test**

Create `packages/modules/attribute/src/graphql/schema/subgraphs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sg } from './subgraphs'

describe('sg() audience helper', () => {
  it('expands one audience into the four relayMutationField option fragments', () => {
    const O = sg('org')
    expect(O.field).toEqual({ subGraphs: ['org'] })
    expect(O.input).toEqual({ subGraphs: ['org'] })
    expect(O.payload).toEqual({ subGraphs: ['org'] })
    expect(O.errorOpts).toEqual({ union: { subGraphs: ['org'] }, result: { subGraphs: ['org'] } })
  })

  it('expands multiple audiences', () => {
    expect(sg('org', 'admin').field).toEqual({ subGraphs: ['org', 'admin'] })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/modules/attribute && pnpm test src/graphql/schema/subgraphs.test.ts`
Expected: FAIL — module `./subgraphs` does not exist.

- [ ] **Step 3: Create the helper**

Create `packages/modules/attribute/src/graphql/schema/subgraphs.ts`:

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

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/modules/attribute && pnpm test src/graphql/schema/subgraphs.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Type-check, lint, stage**

Run: `cd packages/modules/attribute && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/subgraphs.ts src/graphql/schema/subgraphs.test.ts`

```bash
git add packages/modules/attribute/src/graphql/schema/subgraphs.ts packages/modules/attribute/src/graphql/schema/subgraphs.test.ts
```

---

## Task 2: Split `createAttribute` + tag attribute mutations

**Files:**
- Modify: `packages/modules/attribute/src/graphql/schema/mutations/attribute.ts`
- Modify (migrate to new names): `packages/modules/attribute/src/e2e/attribute-mutations.e2e.test.ts` (and any other e2e file that calls `createAttribute` WITH an org)

**Context:** Today a single `createAttribute` takes an optional `organizationId` (omit → platform, set → org). Split it, using the auth `createApiKey`/`createOrganizationApiKey` naming convention: **unqualified = platform default, org-qualified = org**.
- `createAttribute` → platform: NO `organizationId` input; authScope `attributePermission('create', null)`; inserts `organizationId: null`. Audience `admin`.
- `createOrganizationAttribute` → org: `organizationId` **required**; authScope `attributePermission('create', <decoded org>)`. Audience `org`.

The two share 9 input fields and one resolve body. Extract a shared fields helper and a shared create helper to stay DRY. The existing service `Attribute.AttributeService.create` already accepts `organizationId: number | null` — no service change.

Read the current file first: `packages/modules/attribute/src/graphql/schema/mutations/attribute.ts` (the `createAttribute` registration spans the top of `registerAttributeMutations`; `updateAttribute`/`deleteAttribute` follow).

- [ ] **Step 1: Add imports + the `sg()` audience constants**

At the top of `registerAttributeMutations`, after `const enums = attributeEnumRefs()`, add the audience constants; and add the import:

```ts
import { sg } from '../subgraphs'
```
```ts
  const enums = attributeEnumRefs()
  const ADMIN = sg('admin')
  const ORG = sg('org')
  const BOTH = sg('org', 'admin')
```

- [ ] **Step 2: Extract shared create input-fields + resolve helpers**

Inside `registerAttributeMutations` (before the mutation registrations), add a helper that builds the 9 shared input fields (everything except `organizationId`) and a helper that runs the create. Use a structural type for the resolver input so both variants pass:

```ts
  // Shared create fields (no organizationId) — used by both create variants.
  const sharedCreateFields = (t: Parameters<Parameters<typeof builder.relayMutationField>[1]['inputFields']>[0]) => ({
    name: t.string({ required: true, description: 'Human-readable display name of the attribute.' }),
    slug: t.string({ description: 'URL-safe identifier, unique within the attribute\'s scope; auto-derived from the name when omitted.' }),
    type: t.field({ type: enums.AttributeType, required: true, description: 'Data type of the attribute, which determines the shape of its values.' }),
    referenceEntity: t.string({ description: 'Target entity referenced by a REFERENCE-typed attribute; required for REFERENCE and rejected otherwise.' }),
    unit: t.field({ type: enums.AttributeUnit, description: 'Measurement unit, applicable only to NUMBER-typed attributes.' }),
    isRequired: t.boolean({ description: 'Whether a value for this attribute is mandatory.' }),
    isFilterable: t.boolean({ description: 'Whether this attribute can be used as a filter facet.' }),
    externalSource: t.string({ description: 'Name of the external system this attribute was imported from.' }),
    externalId: t.string({ description: 'Identifier of this attribute in the external source system.' }),
    metadata: t.field({ type: 'JSONObject', description: 'Freeform JSON metadata associated with the attribute.' }),
  })

  interface SharedCreateInput {
    name: string
    slug?: string | null
    type: unknown
    referenceEntity?: string | null
    unit?: unknown
    isRequired?: boolean | null
    isFilterable?: boolean | null
    externalSource?: string | null
    externalId?: string | null
    metadata?: unknown
  }

  const runCreate = (ctx: Parameters<Parameters<typeof builder.relayMutationField>[2]['resolve']>[3], input: SharedCreateInput, organizationId: number | null) =>
    ctx.runEffect(
      Effect.gen(function* () {
        const svc = yield* Attribute.AttributeService
        return yield* svc.create({
          organizationId,
          name: input.name,
          slug: input.slug ?? undefined,
          type: input.type as Attribute.CreateAttributeInput['type'],
          referenceEntity: input.referenceEntity ?? null,
          unit: (input.unit ?? null) as Attribute.CreateAttributeInput['unit'],
          isRequired: input.isRequired ?? undefined,
          isFilterable: input.isFilterable ?? undefined,
          externalSource: input.externalSource ?? null,
          externalId: input.externalId ?? null,
          metadata: input.metadata,
        })
      }),
    )
```

> If the `Parameters<...>` types prove awkward against Pothos's generics, fall back to typing `t`/`ctx` as the concrete builder field-builder / context types already imported in the file; the goal is just: shared 9 fields + one `svc.create` call. Do NOT introduce `any`.

- [ ] **Step 3: Replace the single `createAttribute` with the two split variants**

Replace the whole existing `createAttribute` `builder.relayMutationField('createAttribute', …)` block with:

```ts
  // ── createAttribute — PLATFORM (admin) ──────────────────────────────────────
  builder.relayMutationField(
    'createAttribute',
    { ...ADMIN.input, inputFields: t => sharedCreateFields(t) },
    {
      ...ADMIN.field,
      description: 'Creates a platform-wide attribute owned by no organization. Requires the global attribute:create role.',
      errors: {
        types: [
          Attribute.AttributeSlugTaken,
          Attribute.ReferenceEntityRequired,
          Attribute.ReferenceEntityNotAllowed,
          Attribute.UnitNotAllowed,
        ],
        ...ADMIN.errorOpts,
      },
      authScopes: () => attributePermission('create', null),
      resolve: async (_root, args, ctx) => ({ attribute: await runCreate(ctx, args.input, null) }),
    },
    {
      ...ADMIN.payload,
      outputFields: t => ({
        attribute: t.field({ type: 'Attribute', resolve: p => p.attribute, description: 'The newly created platform attribute.' }),
      }),
    },
  )

  // ── createOrganizationAttribute — ORG ───────────────────────────────────────
  builder.relayMutationField(
    'createOrganizationAttribute',
    {
      ...ORG.input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'Owning organization of the new attribute.' }),
        ...sharedCreateFields(t),
      }),
    },
    {
      ...ORG.field,
      description: 'Creates an attribute scoped to an organization. Requires attribute:create in that organization.',
      errors: {
        types: [
          Attribute.AttributeSlugTaken,
          Attribute.ReferenceEntityRequired,
          Attribute.ReferenceEntityNotAllowed,
          Attribute.UnitNotAllowed,
        ],
        ...ORG.errorOpts,
      },
      authScopes: (_parent, args) => attributePermission('create', decodeOrgInput(args.input.organizationId)),
      resolve: async (_root, args, ctx) => ({ attribute: await runCreate(ctx, args.input, decodeOrgInput(args.input.organizationId)) }),
    },
    {
      ...ORG.payload,
      outputFields: t => ({
        attribute: t.field({ type: 'Attribute', resolve: p => p.attribute, description: 'The newly created organization attribute.' }),
      }),
    },
  )
```

> `decodeOrgInput` on a `required` global-ID returns a `number` (never null); the `attributePermission('create', number)` path is the org-tier scope. Keep the existing `import { attributePermission, attributeScope, decodeOrgInput } from '../../authz'`.

- [ ] **Step 4: Tag `updateAttribute` + `deleteAttribute` into `['org','admin']`**

These keep their `attributeScope(ctx, …, 'update'|'delete')` authScope (row-tier-derived). Add the 5-point spread with `BOTH`: `...BOTH.input` first in the input opts, `...BOTH.field` first in the field opts, `errors: { types: [...same...], ...BOTH.errorOpts }`, `...BOTH.payload` first in the payload opts. Keep every existing `errors.types`, `authScopes`, and `resolve` verbatim.

- [ ] **Step 5: Migrate existing e2e callers to the new op names**

In `packages/modules/attribute/src/e2e/attribute-mutations.e2e.test.ts` (and grep the whole `src/e2e/` dir): every `createAttribute(...)` mutation call that passes an `organizationId` must become `createOrganizationAttribute(...)`. Calls that create a **platform** attribute (no org) stay as `createAttribute` — but drop any now-invalid `organizationId: null` argument from their input. Run a grep to find all call sites:

Run: `cd packages/modules/attribute && grep -rn "createAttribute" src/e2e`
For each: org-creating call → `createOrganizationAttribute`; platform-creating call → keep `createAttribute`, remove `organizationId`.

- [ ] **Step 6: Build kit, run the attribute mutation e2e**

Run: `pnpm --filter @czo/kit build`
Run: `cd packages/modules/attribute && pnpm test src/e2e/attribute-mutations.e2e.test.ts`
Expected: PASS. (The full `/graphql` endpoint still serves both new mutations regardless of sub-graph tags, so these tests exercise the split.)

- [ ] **Step 7: Type-check, lint, stage**

Run: `cd packages/modules/attribute && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/mutations/attribute.ts src/e2e/attribute-mutations.e2e.test.ts`

```bash
git add packages/modules/attribute/src/graphql/schema/mutations/attribute.ts packages/modules/attribute/src/e2e/attribute-mutations.e2e.test.ts
```

---

## Task 3: Add `includeGlobal` to the read scope + split the `attributes` list + tag queries

**Files:**
- Modify: `packages/modules/attribute/src/services/attribute.ts` (`ReadScope` + `visible()`)
- Test: `packages/modules/attribute/src/services/scoping.integration.test.ts`
- Modify: `packages/modules/attribute/src/graphql/schema/queries.ts`
- Modify (migrate): `packages/modules/attribute/src/e2e/queries.e2e.test.ts` (any `attributes(organizationId: …)` call)

**Context:** Today `attributes` takes an optional `organizationId` arg (omit → platform-only view, requires global role; set → platform ∪ that org, requires the org role). Split into:
- `attributes` → platform: NO `organizationId` arg; authScope `attributePermission('read', null)`; lists `where: { organizationId: { isNull: true } }`. Audience `admin`.
- `organizationAttributes` → org: `organizationId` **required**; authScope `attributePermission('read', <decoded org>)`; plus a new **`includeGlobal: Boolean = false`** arg. Audience `org`.

`includeGlobal` is carried by a **tri-state additive** change to the service's `ReadScope`/`visible()` so existing internal callers are untouched: for an org scope, `visible()` returns org-only **only** on an explicit `includeGlobal: false`; `undefined` (every current caller) or `true` keeps the platform ∪ org behavior. The resolver passes `includeGlobal: args.includeGlobal ?? false`, making the GraphQL default org-only.

The single `attribute` query (by id/slug, `attributeReadScope`) is unchanged except for the audience tag `['org','admin']`. Read `packages/modules/attribute/src/graphql/schema/queries.ts` first — note the existing `orgScope`, `orgAuthScope`, and the `attributes` `resolve` body (it wraps user `where` in `{ AND: [userWhere] }`). Also read `services/attribute.ts` around the `ReadScope` interface (line ~99) and the `visible()` function (line ~203).

- [ ] **Step 1: Write the failing service test for `includeGlobal`**

In `packages/modules/attribute/src/services/scoping.integration.test.ts`, add a case inside the existing `layer(TestLayer, …)` block (it already seeds platform + org attributes via `AttributeService`). Append:

```ts
  // ── Case — includeGlobal tri-state on the org list ─────────────────────────
  it.effect('org list: includeGlobal false → org-only; true/omitted → platform ∪ org', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const attrs = yield* AttributeService
      yield* attrs.create({ name: 'Color', slug: 'color', type: 'DROPDOWN', organizationId: null })
      yield* attrs.create({ name: 'Acme Fabric', slug: 'acme-fabric', type: 'DROPDOWN', organizationId: 1 })

      const orgOnly = yield* attrs.findMany(undefined, { organizationId: 1, includeGlobal: false })
      expect(orgOnly.map(a => a.slug)).toEqual(['acme-fabric'])

      const withGlobal = yield* attrs.findMany(undefined, { organizationId: 1, includeGlobal: true })
      expect(withGlobal.map(a => a.slug).sort()).toEqual(['acme-fabric', 'color'])

      // Legacy callers (no includeGlobal) keep platform ∪ org.
      const legacy = yield* attrs.findMany(undefined, { organizationId: 1 })
      expect(legacy.map(a => a.slug).sort()).toEqual(['acme-fabric', 'color'])
    }))
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd packages/modules/attribute && pnpm test src/services/scoping.integration.test.ts`
Expected: FAIL — `includeGlobal` is not yet on `ReadScope` (type error) or the org-only assertion fails (still returns platform ∪ org).

- [ ] **Step 3: Extend `ReadScope` + `visible()` (`services/attribute.ts`)**

Replace the `ReadScope` interface:

```ts
/** Read visibility scope: `null` = admin (sees everything), a number = an org. */
export interface ReadScope {
  organizationId: number | null
  /**
   * For an org scope (`organizationId != null`): when explicitly `false`,
   * restrict to that org's own rows (exclude platform). When omitted/`true`,
   * platform ∪ org — the default for internal callers. Ignored for the
   * platform scope (`organizationId == null`).
   */
  includeGlobal?: boolean
}
```

Replace the `visible()` function:

```ts
function visible(scope: ReadScope): AttributeWhere {
  if (scope.organizationId == null)
    return { organizationId: { isNull: true } }
  // org scope: platform ∪ org unless the caller explicitly opts out of globals.
  return scope.includeGlobal === false
    ? { organizationId: scope.organizationId }
    : { OR: [{ organizationId: { isNull: true } }, { organizationId: scope.organizationId }] }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `cd packages/modules/attribute && pnpm test src/services/scoping.integration.test.ts`
Expected: PASS (the new case + the existing platform-∪-org cases all green).

- [ ] **Step 5: Import `sg` and tag the single `attribute` query**

Add `import { sg } from './subgraphs'` (path is `./subgraphs` — queries.ts sits in `schema/`). Add `subGraphs: ['org', 'admin']` to the `attribute` `t.drizzleField({ … })` options object (top-level key; everything else verbatim).

- [ ] **Step 6: Replace the `attributes` connection with the two split queries**

Replace the existing `builder.queryField('attributes', …)` block with two query fields. The platform one lists org-null rows; the org one takes the required org + the `includeGlobal` flag. Both are `t.drizzleConnection` tagged at 3 positions.

```ts
  // ── attributes — PLATFORM (admin): org-null rows only ─────────────────────
  builder.queryField('attributes', t =>
    t.drizzleConnection({
      subGraphs: ['admin'],
      type: 'attributes',
      description: 'Paginated (relay) connection over platform attributes (owned by no organization). Requires the global attribute:read role.',
      authScopes: () => attributePermission('read', null),
      args: {
        where: t.arg({ type: 'AttributeWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['AttributeOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* Attribute.AttributeService
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const configWhere = userWhere != null ? { AND: [userWhere] } : undefined
            return yield* svc.findMany(
              query({
                where: configWhere,
                orderBy: args.orderBy?.length ? args.orderBy.map(o => ({ [o.field]: o.direction })) : { createdAt: 'desc' },
              }),
              { organizationId: null },
            )
          }),
        ),
    }, { subGraphs: ['admin'] }, { subGraphs: ['admin'] }))

  // ── organizationAttributes — ORG: org-only by default, platform ∪ org when includeGlobal ──
  builder.queryField('organizationAttributes', t =>
    t.drizzleConnection({
      subGraphs: ['org'],
      type: 'attributes',
      description: 'Paginated (relay) connection over an organization\'s attributes. By default returns only that org\'s own attributes; set `includeGlobal: true` to also include platform (global) attributes. Requires attribute:read in the given organization.',
      authScopes: (_root, args) => attributePermission('read', decodeOrgInput(args.organizationId)),
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'Viewer organization whose attributes to list.' }),
        includeGlobal: t.arg.boolean({ defaultValue: false, description: 'When true, also include platform (global, org-null) attributes alongside this org\'s. Defaults to false (org-only).' }),
        where: t.arg({ type: 'AttributeWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['AttributeOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* Attribute.AttributeService
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const configWhere = userWhere != null ? { AND: [userWhere] } : undefined
            return yield* svc.findMany(
              query({
                where: configWhere,
                orderBy: args.orderBy?.length ? args.orderBy.map(o => ({ [o.field]: o.direction })) : { createdAt: 'desc' },
              }),
              { organizationId: decodeOrgInput(args.organizationId), includeGlobal: args.includeGlobal ?? false },
            )
          }),
        ),
    }, { subGraphs: ['org'] }, { subGraphs: ['org'] }))
```

> `decodeOrgInput(args.organizationId)` on a `required` arg yields a `number`. `t.arg.boolean({ defaultValue: false })` makes `args.includeGlobal` a `boolean`; the extra `?? false` is belt-and-suspenders. After this edit `orgScope`/`orgAuthScope` may be unused — remove whichever helpers become dead (don't leave unused functions).

- [ ] **Step 7: Migrate existing query e2e callers**

Run: `cd packages/modules/attribute && grep -rn "attributes(" src/e2e`
Every `attributes(organizationId: X, …)` call → `organizationAttributes(organizationId: X, …)`. Platform listing `attributes(…)` (no org) stays. **Any migrated org-list assertion that expected platform rows mixed in must now pass `includeGlobal: true`** (org-only is the new default). Update the GraphQL query strings and any `__typename`/field-path assertions accordingly.

- [ ] **Step 8: Build kit, run the query e2e**

Run: `pnpm --filter @czo/kit build`
Run: `cd packages/modules/attribute && pnpm test src/e2e/queries.e2e.test.ts`
Expected: PASS.

- [ ] **Step 9: Type-check, lint, stage**

Run: `cd packages/modules/attribute && pnpm check-types && pnpm lint --max-warnings 0 src/services/attribute.ts src/services/scoping.integration.test.ts src/graphql/schema/queries.ts src/e2e/queries.e2e.test.ts`

```bash
git add packages/modules/attribute/src/services/attribute.ts packages/modules/attribute/src/services/scoping.integration.test.ts packages/modules/attribute/src/graphql/schema/queries.ts packages/modules/attribute/src/e2e/queries.e2e.test.ts
```

---

## Task 4: Tag the remaining surface + serve sub-graphs + exposure E2E

**Files:**
- Modify: `packages/modules/attribute/src/graphql/schema/mutations/choice-value.ts`, `mutations/typed-value.ts`
- Modify: `packages/modules/attribute/src/graphql/schema/types.ts`, `inputs.ts`, `enums.ts`, `scalars.ts`, `errors.ts`
- Modify: `packages/modules/attribute/src/e2e/harness.ts`
- Create: `packages/modules/attribute/src/e2e/subgraph-exposure.e2e.test.ts`
- Modify (only if they create org attributes/values via the renamed ops): `packages/modules/attribute/src/e2e/value-mutations.e2e.test.ts`, `node-authz.e2e.test.ts`

**Context:** All remaining ops are row-tier-derived → unified `['org','admin']`. Value-creates keep their `organizationId` input and `valueCreateScope` authz **unchanged** — tagging only. Under-tagging a mutation silently drops it from a sub-graph; the exposure E2E is the guard. Reference: the `@czo/inventory` tagging (`packages/modules/inventory/src/graphql/schema/inventory/`) and its `e2e/harness.ts` + `e2e/subgraph-org.e2e.test.ts`.

- [ ] **Step 1: Tag the value mutations (`choice-value.ts`, `typed-value.ts`)**

In each file: add `import { sg } from '../subgraphs'` and `const BOTH = sg('org', 'admin')` at the top of the registrar. Apply the 5-point spread to EVERY `relayMutationField` (all `create*`/`update*`/`delete*`/`reorder*`): `...BOTH.input` first in the input opts, `...BOTH.field` first in the field opts, `errors: { types: [...verbatim...], ...BOTH.errorOpts }`, `...BOTH.payload` first in the payload opts. **Do not change any input field, authScope, or resolve** — tagging only. Mutations with `errors: { types: [] }` (the 3 `reorder*`) still need `errors: { types: [], ...BOTH.errorOpts }`.

The mutations to tag (all `['org','admin']`):
- `choice-value.ts`: `createAttributeValue`, `updateAttributeValue`, `deleteAttributeValue`, `reorderAttributeValues`, `createAttributeSwatch`, `updateAttributeSwatch`, `deleteAttributeSwatch`, `reorderAttributeSwatches`, `createAttributeReference`, `updateAttributeReference`, `deleteAttributeReference`, `reorderAttributeReferences`.
- `typed-value.ts`: `create*`/`update*`/`delete*` for `text`/`numeric`/`boolean`/`date`/`file` (15 mutations).

- [ ] **Step 2: Tag the nodes + related connections (`types.ts`)**

Add `subGraphs: ['org', 'admin']` to each of the 9 `builder.drizzleNode(...)` option objects: `Attribute`, `AttributeValue`, `AttributeSwatchValue`, `AttributeReferenceValue`, `AttributeTextValue`, `AttributeNumericValue`, `AttributeBooleanValue`, `AttributeDateValue`, `AttributeFileValue`. For the `Attribute` node's `t.relatedConnection(...)` fields (`values`, `swatchValues`, `referenceValues`): add `subGraphs: ['org', 'admin']` to the field options and tag the connection-type + edge-type args `{ subGraphs: ['org', 'admin'] }` (3 positions each), mirroring the connection tagging in Task 3. Keep `select: true` and the parent-aware `authScopes` verbatim.

- [ ] **Step 3: Tag module inputs/enums/refs (`inputs.ts`, `enums.ts`, `scalars.ts`)**

Add `subGraphs: ['org', 'admin']` to the options of each module-defined type:
- `inputs.ts`: `AttributeTypeFilterInput`, `AttributeUnitFilterInput`, `AttributeWhereInput`, `AttributeOrderByInput` (inputType/inputRef), `AttributeOrderField`, `AttributeOrderDirection` (enumType).
- `enums.ts`: `AttributeType`, `AttributeUnit`.
- `scalars.ts`: `FileInfo` (objectRef/implement), `FileInfoInput` (inputRef/implement).

Do NOT tag kit-shared `StringFilterInput`/`BooleanFilterInput`/`DateTimeFilterInput`/`DateTime`/`JSONObject` (tagged centrally in kit).

- [ ] **Step 4: Tag the 12 module errors (`errors.ts`)**

Add `subGraphs: ['org', 'admin']` to each module `registerError(builder, X, { name, … })` call: `AttributeNotFound`, `AttributeSlugTaken`, `AttributeDbFailed`, `ReferenceEntityRequired`, `ReferenceEntityNotAllowed`, `UnitNotAllowed`, `AttributeValueNotFound`, `AttributeValueSlugTaken`, `SwatchRequiresColorOrFile`, `SwatchVisualInvalid`, `AttributeParentNotOwned`, `TypedValueNotFound`. Do NOT touch kit-shared `OptimisticLockError`/`ValidationError`.

- [ ] **Step 5: Serve sub-graphs in the harness (`e2e/harness.ts`)**

Add an optional `subGraphs` forward (mirror `packages/modules/inventory/src/e2e/harness.ts`): a `BootAttributeOptions { readonly subGraphs?: ReadonlyArray<SubGraphName> }` param, threaded into `bootTestApp({ …, ...(options.subGraphs ? { buildOptions: { subGraphs: options.subGraphs } } : {}) })`. Import `type { SubGraphName } from '@czo/kit/graphql'`. Keep the existing no-arg call working (default `{}`).

- [ ] **Step 6: Write the exposure E2E (`e2e/subgraph-exposure.e2e.test.ts`)**

Create the test, booting the harness serving `['org', 'admin']`, introspecting Query/Mutation field names per endpoint. Use lowercase `it` titles. Skeleton (adapt `h.app.fetch` to the harness's request surface — check the existing e2e for how requests are issued):

```ts
import type { AttributeHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAttributeApp } from './harness'

const QUERY_FIELDS = `{ __type(name: "Query") { fields { name } } }`
const MUTATION_FIELDS = `{ __type(name: "Mutation") { fields { name } } }`

interface IntrospectResult { data?: { __type?: { fields?: { name: string }[] } | null }, errors?: { message: string }[] }

const VALUE_MUTATIONS = [
  'createAttributeValue', 'updateAttributeValue', 'deleteAttributeValue', 'reorderAttributeValues',
  'createAttributeSwatch', 'updateAttributeSwatch', 'deleteAttributeSwatch', 'reorderAttributeSwatches',
  'createAttributeReference', 'updateAttributeReference', 'deleteAttributeReference', 'reorderAttributeReferences',
  'createAttributeTextValue', 'updateAttributeTextValue', 'deleteAttributeTextValue',
  'createAttributeNumericValue', 'updateAttributeNumericValue', 'deleteAttributeNumericValue',
  'createAttributeBooleanValue', 'updateAttributeBooleanValue', 'deleteAttributeBooleanValue',
  'createAttributeDateValue', 'updateAttributeDateValue', 'deleteAttributeDateValue',
  'createAttributeFileValue', 'updateAttributeFileValue', 'deleteAttributeFileValue',
] as const
const SHARED_MUTATIONS = ['updateAttribute', 'deleteAttribute', ...VALUE_MUTATIONS] as const

describe('attribute sub-graph exposure', () => {
  let h: AttributeHarness
  beforeAll(async () => { h = await bootAttributeApp({ subGraphs: ['org', 'admin'] }) }, 180_000)
  afterAll(async () => { await h.close() })

  const fieldNames = async (path: string, query: string): Promise<string[]> => {
    const res = await h.app.fetch(new Request(`http://localhost${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }),
    }))
    const body = (await res.json()) as IntrospectResult
    expect(body.errors).toBeUndefined()
    return (body.data?.__type?.fields ?? []).map(f => f.name)
  }

  it('/graphql/org exposes org + shared ops, not platform ops', async () => {
    const q = await fieldNames('/graphql/org', QUERY_FIELDS)
    const m = await fieldNames('/graphql/org', MUTATION_FIELDS)
    expect(q).toContain('attribute')
    expect(q).toContain('organizationAttributes')
    expect(q).not.toContain('attributes')
    expect(m).toContain('createOrganizationAttribute')
    expect(m).not.toContain('createAttribute')
    for (const f of SHARED_MUTATIONS) expect(m).toContain(f)
  })

  it('/graphql/admin exposes platform + shared ops, not org ops', async () => {
    const q = await fieldNames('/graphql/admin', QUERY_FIELDS)
    const m = await fieldNames('/graphql/admin', MUTATION_FIELDS)
    expect(q).toContain('attribute')
    expect(q).toContain('attributes')
    expect(q).not.toContain('organizationAttributes')
    expect(m).toContain('createAttribute')
    expect(m).not.toContain('createOrganizationAttribute')
    for (const f of SHARED_MUTATIONS) expect(m).toContain(f)
  })
})
```

- [ ] **Step 7: Migrate any remaining e2e callers, rebuild kit, run E2E**

Run: `cd packages/modules/attribute && grep -rn "createAttribute(\|attributes(" src/e2e` — fix any remaining org-creating `createAttribute` → `createOrganizationAttribute` and org-listing `attributes(` → `organizationAttributes(` in `value-mutations.e2e.test.ts` / `node-authz.e2e.test.ts` (value-create CALLS themselves are unchanged — only the parent-attribute setup may use the renamed create).
Run: `pnpm --filter @czo/kit build`
Run: `cd packages/modules/attribute && pnpm test src/e2e/subgraph-exposure.e2e.test.ts`
Expected: PASS (2 tests). A missing mutation/query at an endpoint → under-tagged (silent drop) → re-check its 5 points / referenced types. A loud build throw naming a type → tag that input/enum/error `['org','admin']`.

- [ ] **Step 8: Type-check, lint, stage**

Run: `cd packages/modules/attribute && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema src/e2e`

```bash
git add packages/modules/attribute/src/graphql/schema packages/modules/attribute/src/e2e
```

---

## Task 5: Full validation + final review

**Files:** none (verification only)

- [ ] **Step 1: Rebuild kit + type-check attribute and life**

Run: `pnpm --filter @czo/kit build`
Run: `pnpm --filter @czo/attribute check-types`
Run: `pnpm --filter life check-types`
Expected: clean (no NEW errors).

- [ ] **Step 2: Run the full attribute suite**

Run: `cd packages/modules/attribute && pnpm test`
Expected: green. The existing query/mutation/value/node-authz E2E pass against the split op names; the new `subgraphs.test.ts` + `subgraph-exposure.e2e.test.ts` + the `includeGlobal` case in `scoping.integration.test.ts` pass. The value-create integration tests (incl. `createValue — org extends a PLATFORM attribute`) and the existing platform-∪-org scoping cases are untouched and stay green.

- [ ] **Step 3: Lint the whole module**

Run: `pnpm --filter @czo/attribute lint --max-warnings 0`
Expected: clean.

- [ ] **Step 4: Review the staged diff**

Run: `git diff --cached --stat`
Expected: only attribute module files + the two attribute docs (added at commit time by the controller, not here). No `console.log`, no broad `as any` (only the pre-existing `as Record<string, unknown>` / typed casts), no `dist/` staged, no commit.

- [ ] **Step 5: STOP — hand to the user**

Do NOT commit. Report: validation results; the staged file list; and confirm `/graphql/admin` exposes `createAttribute`/`attributes` (not the org variants), `/graphql/org` exposes `createOrganizationAttribute`/`organizationAttributes` (not the platform variants), and both expose the shared `attribute` query + value/update/delete/reorder ops. The user reviews and decides the commit/PR.

---

## Self-review (against the spec)

- **Spec §Decision 1 (split per tier):** Task 2 (`createAttribute`/`createOrganizationAttribute`) + Task 3 (`attributes`/`organizationAttributes`). ✓
- **Spec §Decision 2 (value-creates keep input, tag only):** Task 4 Step 1 tags them `['org','admin']` with no input/authz/service change. ✓
- **Spec §Decision 3 (everything else `['org','admin']`):** Task 2 Step 4 (update/delete), Task 3 Step 1 (single `attribute`), Task 4 Steps 1–4 (value mutations, nodes, inputs/enums, errors). ✓
- **Spec §Decision 4 (no migration/authz change):** no schema, no `authz.ts`; `attributePermission`/`decodeOrgInput`/`valueCreateScope` reused. The only service change is the additive `ReadScope.includeGlobal?`/`visible()` (Decision 7). ✓
- **Spec §Decision 7 (`includeGlobal` opt-in):** Task 3 Steps 1–4 (tri-state `ReadScope`/`visible()` + integration test) and Step 6 (the `organizationAttributes` `includeGlobal: Boolean = false` arg threading `includeGlobal: args.includeGlobal ?? false`). Existing platform-∪-org callers unaffected (undefined branch). ✓
- **Spec §Decision 5 (no node-guard work):** `node-guards.ts` not modified; Task 5 confirms node-authz stays green. ✓
- **Spec §Decision 6 (no serving change):** only the e2e harness gains a `subGraphs` forward; `apps/life` untouched. ✓
- **Spec §Architecture naming (auth convention):** `createAttribute`/`attributes` = platform/`admin`; `createOrganizationAttribute`/`organizationAttributes` = `org`. Consistent across Tasks 2/3/4 and the exposure E2E. ✓
- **Spec §Testing:** Task 4 Step 6 exposure E2E (both endpoints, presence + absence); Task 2/3 migrate existing E2E; Task 5 full suite incl. node-authz + value integration. ✓
- **Placeholder scan:** the split/query/exposure code is given in full; the per-mutation tagging is mechanical (spread pattern shown, every op enumerated). The DRY-helper typing note in Task 2 Step 2 is a deliberate adaptation hook, not a TBD.
- **Type consistency:** `sg()` shape (Task 1) used identically in Tasks 2/3/4; op names match the exposure-E2E assertions and the auth convention; the 9 node names + 27 value/attribute mutation names match the inspected source.
