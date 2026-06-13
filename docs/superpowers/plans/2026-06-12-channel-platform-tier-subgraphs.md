# Channel platform tier + sub-graph tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform-channel tier to `@czo/channel` (`organizationId` nullable, global-role-managed) alongside org channels, then tag the GraphQL surface into `org`/`admin`/`['org','admin']` sub-graphs — mirroring the `@czo/attribute` tier model.

**Architecture:** Make `organizationId` nullable (+ a partial unique index for platform handles). Add a tier authz helper `channelPermission(verb, org|null)` + a tier-aware loader; rewire the id-based authScopes (`channel(id)`/`update`/`delete`) + the `Channel` node-guard to derive the tier from the row. Add `createPlatformChannel` + `platformChannels` (admin tier). Tag: org ops → `org`, platform ops → `admin`, id-based ops + `Channel` node → `['org','admin']`.

**Tech Stack:** Drizzle ORM (RQBv2, drizzle-kit migrations), Effect-TS, Pothos (`@pothos/plugin-sub-graph`/`-drizzle`/`-scope-auth`/`-errors`), graphql-yoga, Vitest / Testcontainers.

**Depends on:** sub-graph foundation (#130) + auth (#131), merged to `main` (kit enablement + `org`/`admin` names). **Branch off `main`.** Spec: `docs/superpowers/specs/2026-06-12-channel-platform-tier-subgraphs-design.md`.

**Commit policy:** Stage with `git add` only. Do NOT commit, push, branch, or stash. One commit at the very end after the user reviews. Rebuild kit `dist` (`pnpm --filter @czo/kit build`) before the channel E2E.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `packages/modules/channel/src/database/schema.ts` | `organizationId` nullable + partial unique index on platform handles | Modify |
| `packages/modules/channel/migrations/<ts>_*/` | generated migration (nullable + partial index) | Create (via `migrate:generate`) |
| `packages/modules/channel/src/services/channel.ts` | `create` accepts `organizationId: number \| null` | Modify |
| `packages/modules/channel/src/graphql/schema/channel/authz.ts` | `channelPermission` + `channelTierScope` + tier-aware `loadChannelTier` | Modify |
| `packages/modules/channel/src/graphql/schema/channel/queries.ts` | tier-aware `channel(id)`; add `platformChannels`; tag | Modify |
| `packages/modules/channel/src/graphql/schema/channel/mutations.ts` | tier-aware `update`/`delete`; add `createPlatformChannel`; tag | Modify |
| `packages/modules/channel/src/graphql/schema/channel/{types,inputs,errors}.ts` | tag types/inputs/errors per audience | Modify |
| `packages/modules/channel/src/graphql/node-guards.ts` | tier-aware `Channel` guard | Modify |
| `packages/modules/channel/src/graphql/schema/channel/subgraphs.ts` | `sg()` helper | Create |
| `packages/modules/channel/src/e2e/harness.ts` | serve sub-graphs | Modify |
| `packages/modules/channel/src/e2e/subgraph-audiences.e2e.test.ts` | exposure + node-authz E2E (org/admin/platform tier) | Create |

---

## Task 1: Schema — nullable org + partial unique index + service null-org

**Files:**
- Modify: `packages/modules/channel/src/database/schema.ts`
- Modify: `packages/modules/channel/src/services/channel.ts`
- Create: the generated migration

**Context:** `channels.organizationId` is `integer().notNull()` with `unique('channels_org_handle_uniq').on(organizationId, handle)`. SQL `UNIQUE` does NOT constrain rows where `organization_id IS NULL` (NULLs are distinct), so platform channels need a **partial unique index** on `handle WHERE organization_id IS NULL`. drizzle pg-core supports `uniqueIndex(...).on(...).where(sql\`...\`)`.

- [ ] **Step 1: Write the failing integration test**

In the channel service integration test file (find it: `ls packages/modules/channel/src/services/*.test.ts` or `src/e2e/`; mirror its `it.layer(...)` Testcontainers setup), add:

```ts
it.effect('creates a platform channel (organizationId null) and enforces unique platform handle', () =>
  Effect.gen(function* () {
    const svc = yield* ChannelService
    const a = yield* svc.create({ organizationId: null, handle: 'global-web', name: 'Global Web' })
    expect(a.organizationId).toBeNull()
    // a second platform channel with the same handle is rejected
    const dup = yield* svc.create({ organizationId: null, handle: 'global-web', name: 'Dup' }).pipe(Effect.flip)
    expect(dup._tag).toBe('ChannelHandleTaken')
    // an org channel may reuse the handle (different tier)
    const orgCh = yield* svc.create({ organizationId: 1, handle: 'global-web', name: 'Org Web' })
    expect(orgCh.organizationId).toBe(1)
  }))
```
> Adapt field names to the real `create` input (read `services/channel.ts`); the assertion that matters: platform create works, duplicate platform handle fails, org+platform share a handle.

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/modules/channel && pnpm test <the test file>`
Expected: FAIL — `create` rejects `organizationId: null` at the type level / the DB has no platform unique index.

- [ ] **Step 3: Make `organizationId` nullable + add the partial unique index**

In `schema.ts`: add `sql` + `uniqueIndex` to the `drizzle-orm/pg-core` import, drop `.notNull()` from `organizationId`, and add the partial index:

```ts
import { boolean, index, integer, jsonb, pgTable, sql, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core'
// …
  organizationId: integer('organization_id'),
// …
}, t => [
  index('channels_organization_id_idx').on(t.organizationId),
  unique('channels_org_handle_uniq').on(t.organizationId, t.handle),
  uniqueIndex('channels_platform_handle_uniq').on(t.handle).where(sql`organization_id IS NULL`),
])
```
> `sql` may come from `drizzle-orm` (not `pg-core`) in this repo — match how a sibling schema imports `sql` for an index `.where(...)`; if no precedent, `import { sql } from 'drizzle-orm'`.

- [ ] **Step 4: Generate the migration**

Run: `cd packages/modules/channel && pnpm migrate:generate`
Expected: a new `migrations/<ts>_*/migration.sql` containing `ALTER TABLE "channels" ALTER COLUMN "organization_id" DROP NOT NULL;` and `CREATE UNIQUE INDEX "channels_platform_handle_uniq" ON "channels" ("handle") WHERE "organization_id" IS NULL;` (+ updated `snapshot.json`). If the partial index isn't in the generated SQL, add that `CREATE UNIQUE INDEX … WHERE …` line by hand to `migration.sql`.

- [ ] **Step 5: Make the service `create` accept a null org**

In `services/channel.ts`, change the `create` input type's `organizationId: number` (around line 52) to `organizationId: number | null` and ensure the insert passes it through (it already inserts `organizationId`). No other method changes (`findFirst`/`findMany` accept arbitrary `where`).

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd packages/modules/channel && pnpm test <the test file>`
Expected: PASS (the Testcontainers layer applies the new migration; platform create works, dup platform handle fails, org+platform share a handle).

- [ ] **Step 7: Type-check + lint + stage**

Run: `cd packages/modules/channel && pnpm check-types && pnpm lint --max-warnings 0 src/database/schema.ts src/services/channel.ts`

```bash
git add packages/modules/channel/src/database/schema.ts packages/modules/channel/src/services/channel.ts packages/modules/channel/migrations
```

---

## Task 2: Authz tier helpers + tier-aware id-based gates + node-guard

**Files:**
- Modify: `packages/modules/channel/src/graphql/schema/channel/authz.ts`
- Modify: `packages/modules/channel/src/graphql/schema/channel/{queries,mutations}.ts` (the id-based authScopes only)
- Modify: `packages/modules/channel/src/graphql/node-guards.ts`

**Context:** Mirror `@czo/attribute`'s `attributePermission`/`tierScope` (`packages/modules/attribute/src/graphql/authz.ts:141-154`): `attributePermission(verb, org: number|null)` → `org==null ? { permission: { resource, actions:[verb] } } : { permission: { …, organization: org } }`; `tierScope(org: number|null|undefined, verb)` → `org===undefined ? { auth: true } : attributePermission(verb, org)`. The `undefined` tier = "row not found" (defer to 404); `null` = platform (global role); number = org.

- [ ] **Step 1: Add `channelPermission` + `channelTierScope`; make the loader tier-aware**

In `authz.ts`, add (and keep the existing `loadOrganizationId` usable, but return the tier-distinguishing value):

```ts
type Verb = 'read' | 'create' | 'update' | 'delete'

/** Platform (`org === null`) → GLOBAL `channel:<verb>`; org → `channel:<verb>` in that org. */
export function channelPermission(verb: Verb, org: number | null) {
  return org == null
    ? { permission: { resource: 'channel', actions: [verb] } }
    : { permission: { resource: 'channel', actions: [verb], organization: org } }
}

/** `undefined` (unknown row) → `{ auth: true }` so the resolver 404s, never a gate 403. */
export function channelTierScope(org: number | null | undefined, verb: Verb) {
  return org === undefined ? { auth: true as const } : channelPermission(verb, org)
}
```

Change the existing `loadOrganizationId` to distinguish "not found" (`undefined`) from "platform" (`null`):

```ts
/** Resolve a channel's tier by id: `undefined` = no live row; otherwise its org (`null` = platform). */
export function loadChannelTier(ctx: GraphQLContextMap, id: number): Promise<number | null | undefined> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* ChannelService
      const row = yield* svc.findFirst({ where: { id } }).pipe(
        Effect.catchTag('ChannelNotFound', () => Effect.succeed(undefined)),
      )
      return row === undefined ? undefined : row.organizationId
    }),
  )
}
```
(If `loadOrganizationId` is referenced elsewhere, keep it OR replace all call sites — `grep -rn loadOrganizationId packages/modules/channel/src`.)

- [ ] **Step 2: Rewire the id-based authScopes**

In `queries.ts` (`channel(id)`) and `mutations.ts` (`updateChannel`, `deleteChannel`), replace the current async authScope (which loads the org and returns `{ auth: true }` for null / `permission` for a number) with the tier-aware form:

```ts
      authScopes: async (_parent, args, ctx) => {
        const tier = await loadChannelTier(ctx, Number(args.input?.id?.id ?? args.id.id))
        return channelTierScope(tier, 'read') // 'read' for channel(id); 'update'/'delete' for the mutations
      },
```
> Use `args.id.id` for the query and `args.input.id.id` for the mutations (match each op's arg shape). The verb is `'read'` (`channel`), `'update'` (`updateChannel`), `'delete'` (`deleteChannel`). These now authorize BOTH tiers (platform → global role, org → org permission).

- [ ] **Step 3: Make the `Channel` node-guard tier-aware**

In `node-guards.ts`, change the guard's row type + scope to use the tier:

```ts
import { channelPermission } from './schema/channel/authz'

export const channelNodeGuards: Record<string, NodeGuard> = {
  Channel: (row: { organizationId: number | null }) => channelPermission('read', row.organizationId),
}
```
Update the header comment to note the platform tier (org null → global `channel:read`).

- [ ] **Step 4: Type-check + lint**

Run: `cd packages/modules/channel && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/channel/authz.ts src/graphql/schema/channel/queries.ts src/graphql/schema/channel/mutations.ts src/graphql/node-guards.ts`
Expected: clean. (End-to-end tier behavior is verified by Task 5's E2E.)

- [ ] **Step 5: Stage**

```bash
git add packages/modules/channel/src/graphql/schema/channel/authz.ts \
        packages/modules/channel/src/graphql/schema/channel/queries.ts \
        packages/modules/channel/src/graphql/schema/channel/mutations.ts \
        packages/modules/channel/src/graphql/node-guards.ts
```

---

## Task 3: New platform ops — `createPlatformChannel` + `platformChannels`

**Files:**
- Modify: `packages/modules/channel/src/graphql/schema/channel/mutations.ts`
- Modify: `packages/modules/channel/src/graphql/schema/channel/queries.ts`

**Context:** The admin-tier surface: a create with no org (→ `organizationId: null`, global `channel:create`) and a list of platform channels (global `channel:read`). Read the existing `createChannel` mutation + `channels` query to mirror their bodies (minus the org arg).

- [ ] **Step 1: Add `createPlatformChannel`**

In `mutations.ts`, add a mutation mirroring `createChannel` but WITHOUT the `organizationId` input field, with the global authScope, and inserting `organizationId: null`:

```ts
  builder.relayMutationField(
    'createPlatformChannel',
    { inputFields: t => ({
        handle: t.string({ required: true, description: 'URL-safe handle, unique among platform channels.' }),
        name: t.string({ required: true, description: 'Display name of the platform channel.' }),
        // …the SAME non-org fields createChannel exposes (description/isDefault/isActive/metadata) — copy them…
      }) },
    {
      description: 'Creates a platform-wide channel (no owning organization), manageable only by a platform operator.',
      errors: { types: [ValidationError, ChannelHandleTaken] },
      authScopes: channelPermission('create', null),
      resolve: async (_root, { input }, ctx) => {
        const channel = await ctx.runEffect(/* svc.create({ ...input, organizationId: null }) — mirror createChannel's resolve */)
        return { channel }
      },
    },
    { outputFields: t => ({ channel: t.field({ type: 'Channel', resolve: p => p.channel, description: 'The newly created platform channel.' }) }) },
  )
```
> Copy the EXACT non-org input fields + resolve body from `createChannel` (read it); only difference: no `organizationId` field, `organizationId: null` in the create call, and `authScopes: channelPermission('create', null)`. `channelPermission` is a static scope object here (no async needed — the tier is fixed null).

- [ ] **Step 2: Add `platformChannels`**

In `queries.ts`, add a query mirroring `channels` but listing platform rows with the global authScope:

```ts
  builder.queryField('platformChannels', t =>
    t.drizzleConnection({
      type: 'channels',
      description: 'Lists platform-wide channels (no owning organization).',
      authScopes: channelPermission('read', null),
      resolve: (query, _root, _args, ctx) => ctx.runEffect(/* svc.findMany(query({ where: { organizationId: { isNull: true } } })) — mirror channels' resolve, filtered to platform */),
    }))
```
> Mirror the existing `channels` connection (its `query(...)` threading + service call); the only differences: no `organizationId` arg, `where: { organizationId: { isNull: true } }`, and `authScopes: channelPermission('read', null)`. If `channels` is a `drizzleConnection`, keep the same shape (the sub-graph tags are added in Task 4).

- [ ] **Step 3: Type-check + lint + stage**

Run: `cd packages/modules/channel && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/channel/mutations.ts src/graphql/schema/channel/queries.ts`

```bash
git add packages/modules/channel/src/graphql/schema/channel/mutations.ts packages/modules/channel/src/graphql/schema/channel/queries.ts
```

---

## Task 4: `sg()` helper + tag the surface + exposure E2E

**Files:**
- Create: `packages/modules/channel/src/graphql/schema/channel/subgraphs.ts`
- Modify: `packages/modules/channel/src/graphql/schema/channel/{mutations,queries,types,inputs,errors}.ts`
- Modify: `packages/modules/channel/src/e2e/harness.ts`
- Create: `packages/modules/channel/src/e2e/subgraph-audiences.e2e.test.ts` (exposure half; node-authz half added in Task 5)

**Context:** Tag the surface per the audience map. An under-tagged mutation is silently dropped (the exposure E2E presence assertions are the guard).

- [ ] **Step 1: Create the `sg()` helper**

Create `subgraphs.ts` (identical to `@czo/auth`'s/`@czo/price`'s):

```ts
import type { SubGraphName } from '@czo/kit/graphql'

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

- [ ] **Step 2: Tag the mutations**

In `mutations.ts`, add `import { sg } from './subgraphs'`, then spread per audience:
- `const ORG = sg('org')` on `createChannel`, `addStockLocationsToChannel`, `removeStockLocationsFromChannel`.
- `const ADMIN = sg('admin')` on `createPlatformChannel`.
- `const BOTH = sg('org', 'admin')` on `updateChannel`, `deleteChannel`.
Each: `{ ...X.input, inputFields }`, `{ ...X.field, errors: { types: [...], ...X.errorOpts }, authScopes, resolve }`, `{ ...X.payload, outputFields }`. `...X.field` first.

- [ ] **Step 3: Tag the queries**

In `queries.ts`: `subGraphs: ['org']` on `channels` (+ connection-type/edge-type args if a `drizzleConnection`); `subGraphs: ['admin']` on `platformChannels` (+ conn/edge args); `subGraphs: ['org', 'admin']` on `channel` (the id-based read).

- [ ] **Step 4: Tag the types**

In `types.ts`: `subGraphs: ['org', 'admin']` on the `Channel` drizzleNode (one entity, both tiers).

- [ ] **Step 5: Tag the inputs**

In `inputs.ts`: tag each input/enum on the audience of the op that uses it — the `createChannel` input fields are inline (no shared input type) so likely nothing here unless a shared filter/order input exists; tag any shared management input `['org', 'admin']`. The shared `StringFilterInput` is kit-central — no tag. (If the build names an untagged input, tag it with the union of audiences that reference it.)

- [ ] **Step 6: Tag the errors**

In `errors.ts`: `subGraphs: ['org', 'admin']` on `registerError(builder, ChannelNotFound, …)` and `registerError(builder, ChannelHandleTaken, …)` (both referenced by org + admin ops); `subGraphs: ['org']` on `CrossOrgStockLocation` (only the org stock-location ops). Do NOT touch kit-shared `ValidationError`/`OptimisticLockError`.

- [ ] **Step 7: Serve sub-graphs in the harness**

In `e2e/harness.ts`, forward a `subGraphs` option to the boot (mirror `@czo/auth`'s harness). Serve `['public', 'org', 'admin']`.

- [ ] **Step 8: Write the exposure E2E**

Create `e2e/subgraph-audiences.e2e.test.ts`:

```ts
// <imports + boot via the channel e2e harness with ['public','org','admin'] served; obtain `h`>

const fieldNames = async (path: string, root: 'Query' | 'Mutation') => {
  const res = await h.app.fetch(new Request(`http://localhost${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: `query { __type(name: "${root}") { fields { name } } }` }),
  }))
  const body = await res.json()
  return (body.data?.__type?.fields ?? []).map((f: { name: string }) => f.name)
}

describe('channel sub-graph audiences', () => {
  it('/graphql/org has the org surface + id-based ops, not the platform ops', async () => {
    const q = await fieldNames('/graphql/org', 'Query')
    const m = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['channels', 'channel']) expect(q).toContain(f)
    for (const f of ['createChannel', 'updateChannel', 'deleteChannel', 'addStockLocationsToChannel', 'removeStockLocationsFromChannel']) expect(m).toContain(f)
    expect(q).not.toContain('platformChannels')
    expect(m).not.toContain('createPlatformChannel')
  })

  it('/graphql/admin has the platform ops + id-based ops, not the org-only ops', async () => {
    const q = await fieldNames('/graphql/admin', 'Query')
    const m = await fieldNames('/graphql/admin', 'Mutation')
    for (const f of ['platformChannels', 'channel']) expect(q).toContain(f)
    for (const f of ['createPlatformChannel', 'updateChannel', 'deleteChannel']) expect(m).toContain(f)
    expect(q).not.toContain('channels')
    for (const f of ['createChannel', 'addStockLocationsToChannel']) expect(m).not.toContain(f)
  })
})
```
> Adapt `h`/`h.app.fetch` to the harness's request surface. Introspection needs no auth.

- [ ] **Step 9: Rebuild kit dist + run**

Run: `pnpm --filter @czo/kit build`
Run: `cd packages/modules/channel && pnpm test src/e2e/subgraph-audiences.e2e.test.ts`
Expected: both PASS. A missing op → under-tagged (re-check 5 points); a build throw naming a type → tag it with the right audience(s).

- [ ] **Step 10: Type-check + lint + stage**

Run: `cd packages/modules/channel && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/channel src/e2e/harness.ts src/e2e/subgraph-audiences.e2e.test.ts`

```bash
git add packages/modules/channel/src/graphql/schema/channel \
        packages/modules/channel/src/e2e/harness.ts \
        packages/modules/channel/src/e2e/subgraph-audiences.e2e.test.ts
```

---

## Task 5: node-authz E2E (platform tier) + full validation

**Files:**
- Modify: `packages/modules/channel/src/e2e/subgraph-audiences.e2e.test.ts` (add node-authz block); or the module's existing node-authz e2e if present.

**Context:** Prove the tier authz end-to-end through `node(id:)` + the new ops. Reuse the harness helpers (sign-up, grant global role, create org with channel access) the existing channel e2e uses.

- [ ] **Step 1: Add the node-authz / tier block**

Append a block that:
- creates an ORG channel (org A) and a PLATFORM channel (`createPlatformChannel`, by a caller granted the GLOBAL `channel` role);
- asserts an org-A member reads the org channel via `node(id:)` (non-null) and gets `null` for the platform channel (no global role);
- asserts the global-role holder reads the platform channel via `node(id:)` (non-null);
- asserts `createPlatformChannel` is denied (errors / null data) for a plain org member, allowed for the global-role holder.

Mirror the existing channel `node(id:)` test for the request/deny-as-null shape (`data.node === null` AND `errors` undefined). Use the harness's role-grant helpers (the global `channel` role grant + org `channel` access).

- [ ] **Step 2: Run the E2E**

Run: `cd packages/modules/channel && pnpm test src/e2e/subgraph-audiences.e2e.test.ts`
Expected: all blocks PASS (exposure + tier node-authz). If a denied case returns the row, the guard/authScope tier logic is off (re-check `channelTierScope`/`channelPermission`).

- [ ] **Step 3: Full validation**

Run: `pnpm --filter @czo/kit build`
Run: `pnpm --filter @czo/channel check-types`
Run: `pnpm --filter life check-types`
Run: `cd packages/modules/channel && pnpm test` (the whole module — the existing channel tests + the new ones; the tier rewire must not regress existing org-channel tests)
Run: `pnpm --filter @czo/channel lint --max-warnings 0`
Expected: all green / clean.

- [ ] **Step 4: Review the staged diff**

Run: `git diff --cached --stat`
Expected: only the channel files in the File Structure table (+ the migration). No `console.log`, no broad `as any`, no `dist/` staged, no commit.

- [ ] **Step 5: STOP — hand to the user**

Do NOT commit. Report: validation results, the staged file list, and confirm: the migration makes `organizationId` nullable + adds the platform-handle unique index; `createPlatformChannel`/`platformChannels` work under the global role; `/graphql/org` vs `/graphql/admin` expose the right ops; `node(id:)` enforces the tier. The user reviews and decides the commit/PR.

---

## Self-review (against the spec)

- **Spec §Decisions 1 (nullable org tier):** Task 1 (schema + migration + service) + Task 2 (`channelPermission`/`channelTierScope`). ✓
- **Spec §Decisions 2 (split create/list):** Task 3 (`createPlatformChannel` + `platformChannels`); `createChannel`/`channels` stay org. ✓
- **Spec §Decisions 3 (multi-tier id-based):** Task 2 Step 2 (`channel`/`update`/`delete` tier-aware) + Task 4 tag `['org','admin']`. ✓
- **Spec §Decisions 4 (stock-location ops org-only):** Task 4 tags them `org`; no platform variant. ✓
- **Spec §Decisions 5 (no serving change):** harness serves sub-graphs for the test; `apps/life` untouched. ✓
- **Spec §Architecture 1 (uniqueness):** Task 1 Step 3-4 partial unique index. ✓
- **Spec §Architecture 5 (node-guard tier):** Task 2 Step 3. ✓
- **Spec §Testing:** Task 1 (migration/uniqueness integration), Task 5 (tier authz + node-authz E2E), Task 4 (exposure E2E). ✓
- **Placeholder scan:** the "copy createChannel's body" / "mirror channels' resolve" steps (Task 3) are deliberate — the unchanged resolver/input bodies are read at execution; the differences (no org field, `organizationId: null`, global authScope, platform `where`) are fully specified. The migration SQL is concrete.
- **Type consistency:** `channelPermission(verb, org|null)` / `channelTierScope(org|null|undefined, verb)` / `loadChannelTier → number|null|undefined` consistent across authz/queries/mutations/node-guard; `sg()` shape consistent; the `Channel` node-guard reads `organizationId: number|null` matching the nullable schema.
