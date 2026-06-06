# `@czo/channel` Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Effect-native module `@czo/channel` — an org-scoped sales-channel CRUD entity plus an M:N association to stock locations — cloned from `@czo/stock-location` with novel junction/link/connection parts.

**Architecture:** Mirror `@czo/stock-location` (defineModule, Drizzle schema+relations into the global `SchemaRegistryShape`, one colocated `ChannelService`, code-first Pothos GraphQL, `permission` authz + node-guard, access domain in `onStart`, Testcontainers E2E). Adds a `channel_stock_locations` junction, `add/removeStockLocations` service ops with a cross-org guard via `StockLocationService`, and a `Channel.stockLocations` relay connection.

**Tech Stack:** Effect 4, Drizzle RQBv2 (`@effect/sql-pg`), Pothos (drizzle/relay/errors/scope-auth), Testcontainers.

**Spec:** `docs/superpowers/specs/2026-06-06-channel-module-design.md`

> **Commit policy (project rule):** Do NOT `git commit` autonomously. Each task **stages** with `git add`. One commit at the end (Task 13) after the user reviews. Branch: `feat/channel-module` (create before Task 1).
>
> **Cloning convention:** "Clone from stock-location" = copy the named file to the channel path, then apply the rename map: `stock-location`→`channel`, `stockLocation(s)`→`channel(s)`, `StockLocation`→`Channel`, `STOCK_LOCATION`→`CHANNEL`, `stock-loc:`→`channel:`, scoped ids `@czo/stock-location/...`→`@czo/channel/...`, resource string `'stock-location'`→`'channel'`. Keep `handle`/`name`/`version`/`organizationId` as-is. Trims/additions are called out per task. After each clone, the named **drops** (address, setStatus, setDefault, hard delete) must be removed.

---

## File Structure

```
packages/modules/channel/
  package.json tsconfig.json build.config.ts vitest.config.ts drizzle.config.ts eslint.config.js
  migrations/<ts>_init/migration.sql
  src/
    index.ts                                   # defineModule (+ StockLocationService dep, access domain)
    database/schema.ts                         # channels + channel_stock_locations + registry augmentation
    database/relations.ts                      # channelRelations (channels, junction, stockLocations)
    services/index.ts                          # ChannelModuleLive
    services/channel.ts                        # ChannelService (CRUD + add/removeStockLocations + cross-org guard)
    services/events/channel.ts                 # ChannelEvents
    graphql/index.ts graphql/schema/index.ts
    graphql/schema/channel/{types,inputs,errors,queries,mutations,authz}.ts
    graphql/node-guards.ts                     # channelNodeGuards
    e2e/harness.ts e2e/channel.e2e.test.ts
    services/channel.integration.test.ts
```

**MVP trims vs stock-location:** no `address` table/inputs/relation; no `setStatus`/`setDefault`/`forceDelete` mutations (the generic `update` carries `isActive`/`isDefault`; single-default uniqueness is NOT enforced in MVP — documented). Adds `description` column.

---

## Task 1: Scaffold the package

**Files:** Create `packages/modules/channel/{package.json,tsconfig.json,build.config.ts,vitest.config.ts,drizzle.config.ts,eslint.config.js}`.

- [ ] **Step 1: Branch + copy the eslint config**

```bash
cd /workspace/c-zo
git checkout -b feat/channel-module
mkdir -p packages/modules/channel/src
cp packages/modules/stock-location/eslint.config.* packages/modules/channel/ 2>/dev/null || true
ls packages/modules/stock-location/eslint.config.* # note the exact filename to mirror
```

- [ ] **Step 2: `package.json`** — clone stock-location's, rename, and set deps. Write `packages/modules/channel/package.json`:

```json
{
  "name": "@czo/channel",
  "type": "module",
  "version": "0.0.1",
  "description": "Sales channel module for c-zo — storefronts/points of sale and their stock-location links",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/bnofao/czo.git", "directory": "packages/modules/channel" },
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./dist/index.mjs" },
    "./schema": { "types": "./src/database/schema.ts", "default": "./dist/database/schema.mjs" },
    "./relations": { "types": "./src/database/relations.ts", "default": "./dist/database/relations.mjs" },
    "./services": { "types": "./src/services/index.ts", "default": "./dist/services/index.mjs" },
    "./graphql": { "types": "./src/graphql/index.ts", "default": "./dist/graphql/index.mjs" }
  },
  "main": "./dist/index.mjs",
  "types": "./src/index.ts",
  "files": ["dist"],
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "build": "unbuild",
    "lint": "eslint . --max-warnings 0",
    "lint:fix": "eslint . --fix",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "migrate:generate": "drizzle-kit generate",
    "migrate:latest": "drizzle-kit migrate",
    "migrate:status": "drizzle-kit check",
    "check-types": "pnpm tsc --noEmit"
  },
  "peerDependencies": { "@czo/auth": "workspace:*", "@czo/stock-location": "workspace:*" },
  "dependencies": { "@czo/kit": "workspace:*", "drizzle-orm": "catalog:common", "effect": "catalog:", "zod": "catalog:common" },
  "devDependencies": {
    "@czo/auth": "workspace:*",
    "@czo/stock-location": "workspace:*",
    "@vitest/coverage-v8": "catalog:testing",
    "@workspace/eslint-config": "workspace:*",
    "@workspace/typescript-config": "workspace:*",
    "drizzle-kit": "catalog:dev",
    "vitest": "catalog:testing"
  }
}
```

(Note the added `@czo/stock-location` in peer+dev deps — the module uses its service + schema.)

- [ ] **Step 3: `tsconfig.json`** — clone stock-location's, swap the path alias:

```json
{
  "extends": "@workspace/typescript-config/library.json",
  "compilerOptions": {
    "baseUrl": ".",
    "rootDir": "../../..",
    "module": "preserve",
    "moduleResolution": "bundler",
    "paths": { "@czo/channel/*": ["./src/*"] },
    "outDir": "dist"
  },
  "include": ["."],
  "exclude": ["node_modules", "dist", "old"]
}
```

- [ ] **Step 4: `build.config.ts`**:

```ts
import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: 'node16',
  entries: [
    'src/index',
    'src/database/schema',
    'src/database/relations',
    'src/services/index',
    'src/graphql/index',
  ],
  externals: [
    '@czo/kit', '@czo/kit/module', '@czo/kit/db', '@czo/kit/graphql',
    '@czo/auth', '@czo/auth/services', '@czo/auth/graphql',
    '@czo/stock-location', '@czo/stock-location/services', '@czo/stock-location/graphql', '@czo/stock-location/schema',
    'drizzle-orm', 'drizzle-orm/pg-core',
  ],
})
```

- [ ] **Step 5: `drizzle.config.ts`** — identical to stock-location's (schema path `./src/database/schema.ts`, out `./migrations`, postgres). Copy verbatim.

- [ ] **Step 6: `vitest.config.ts`** — clone stock-location's `vitest.config.ts`, then in the `resolve.alias` map: rename the four `@czo/stock-location/*` aliases to `@czo/channel/*` pointing at this module's `src/...`, AND ADD the four `@czo/stock-location/*` aliases pointing at the sibling module's src (so the booted stock-location module resolves to one realm, like the auth aliases). Final alias additions for stock-location:

```ts
      '@czo/stock-location/services': resolve(__dirname, '../stock-location/src/services/index.ts'),
      '@czo/stock-location/graphql': resolve(__dirname, '../stock-location/src/graphql/index.ts'),
      '@czo/stock-location/schema': resolve(__dirname, '../stock-location/src/database/schema.ts'),
      '@czo/stock-location/relations': resolve(__dirname, '../stock-location/src/database/relations.ts'),
      '@czo/stock-location': resolve(__dirname, '../stock-location/src/index.ts'),
```

Keep ALL the auth + kit/email aliases from the template (the E2E boots auth too). Order: channel subpaths, stock-location subpaths, auth subpaths, then bare `@czo/stock-location`, bare `@czo/auth` last.

- [ ] **Step 7: Install + stage**

```bash
cd /workspace/c-zo && pnpm install
git add packages/modules/channel/
```
Run `pnpm install` (the workspace glob `packages/modules/*` picks the new package up). Expected: completes; `@czo/channel` linked.

---

## Task 2: Database schema + migration

**Files:** Create `packages/modules/channel/src/database/schema.ts`. Generate `migrations/<ts>_init/`.

- [ ] **Step 1: Write `schema.ts`**

```ts
import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const channels = pgTable('channels', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  handle: text('handle').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('channels_organization_id_idx').on(t.organizationId),
  unique('channels_org_handle_uniq').on(t.organizationId, t.handle),
])

export const channelStockLocations = pgTable('channel_stock_locations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  channelId: integer('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  // Cross-module ref to stock_locations.id — NO inter-module DB FK (same
  // convention as organizationId). Ownership is enforced in the service layer.
  stockLocationId: integer('stock_location_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [
  index('channel_stock_locations_channel_id_idx').on(t.channelId),
  unique('channel_stock_locations_uniq').on(t.channelId, t.stockLocationId),
])

// Register into the kit's global SchemaRegistryShape (travels with the schema
// import; applies in downstream packages reachable via the import graph).
declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    channels: typeof channels
    channelStockLocations: typeof channelStockLocations
  }
}
```

- [ ] **Step 2: Generate the migration**

```bash
cd packages/modules/channel && pnpm migrate:generate
```
- [ ] **Step 3: Verify the migration is the directory format**

```bash
ls packages/modules/channel/migrations/
```
Expected: a `<timestamp>_<name>/migration.sql` DIRECTORY (NOT a flat `0000_*.sql`). The runtime/test migrator reads the timestamped-directory format. If drizzle-kit emitted a flat file + `meta/`, that's the wrong format for this repo's migrator — check how `packages/modules/stock-location/migrations/` is laid out (`20260604221656_init/migration.sql`) and restructure to match (move the SQL into a `<ts>_init/migration.sql` directory). Open the generated SQL and confirm `integer ... generated always as identity` PKs.

- [ ] **Step 4: Stage**

```bash
git add packages/modules/channel/src/database/schema.ts packages/modules/channel/migrations/
```

---

## Task 3: Relations

**Files:** Create `packages/modules/channel/src/database/relations.ts`.

- [ ] **Step 1: Write `relations.ts`**

```ts
import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'

// Pick only the tables this part uses (channels + junction + the cross-module
// stockLocations table). Picking keys keeps callers valid once sibling modules
// augment the registry (mirrors attribute/stock-location relations).
type ChannelSchema = Pick<SchemaRegistryShape, 'channels' | 'channelStockLocations' | 'stockLocations'>

export function channelRelations(schema: ChannelSchema) {
  const { channels, channelStockLocations, stockLocations } = schema

  return defineRelationsPart(
    { channels, channelStockLocations, stockLocations },
    r => ({
      channels: {
        // 1:N to the junction — drives the service's add/remove + the fallback
        // connection. Always supported.
        stockLocationLinks: r.many.channelStockLocations({
          from: r.channels.id,
          to: r.channelStockLocations.channelId,
        }),
      },
      channelStockLocations: {
        channel: r.one.channels({ from: r.channelStockLocations.channelId, to: r.channels.id }),
        // Cross-module: resolve the StockLocation row via the junction FK.
        stockLocation: r.one.stockLocations({ from: r.channelStockLocations.stockLocationId, to: r.stockLocations.id }),
      },
    }),
  )
}

export type Relations = ReturnType<typeof channelRelations>
```

- [ ] **Step 2: Stage** (type-check happens once the service exists — Task 4)

```bash
git add packages/modules/channel/src/database/relations.ts
```

---

## Task 4: `ChannelService` — CRUD + events + module layer

**Files:** Create `services/events/channel.ts`, `services/channel.ts`, `services/index.ts`. Test: `services/channel.integration.test.ts` (CRUD part).

- [ ] **Step 1: `services/events/channel.ts`** — clone stock-location's `services/events/stock-location.ts`, apply the rename map, and replace the event union with channel variants:

```ts
export type ChannelEvent
  = | { readonly _tag: 'ChannelCreated', readonly id: number, readonly organizationId: number, readonly handle: string, readonly name: string }
  | { readonly _tag: 'ChannelUpdated', readonly id: number, readonly organizationId: number, readonly changes: ReadonlyArray<string> }
  | { readonly _tag: 'ChannelDeleted', readonly id: number, readonly organizationId: number, readonly handle: string }
  | { readonly _tag: 'ChannelStockLocationsChanged', readonly id: number, readonly organizationId: number, readonly added: ReadonlyArray<number>, readonly removed: ReadonlyArray<number> }
```
Keep the `PubSub.dropping({ capacity: 256 })` layer, the Tag id `'@czo/channel/ChannelEvents'`, `publish`/`publishAll`/`subscribe`. (Span names → `ChannelEvents.publish`, etc.)

- [ ] **Step 2: Write the failing CRUD integration test**

Create `services/channel.integration.test.ts`. Compose the ChannelService over Postgres. Use the `@czo/kit/testing` Postgres helpers (the same `makePostgresTestLayer`/`truncateTables` used by stock-location's tests — check `packages/modules/stock-location/src/e2e/harness.ts` and any `*.integration.test.ts` for the exact layer; if stock-location has no service-level integration test, mirror `packages/modules/auth/src/services/soft-delete.integration.test.ts`'s `AuthPostgresLayer` approach but with the channel schema/migrations). Minimal first test:

```ts
import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import * as Channel from './channel'
// + the channel Postgres test layer (see note above) provided via it.layer/Effect.provide

it.effect('create + findFirst round-trips a channel', () =>
  Effect.gen(function* () {
    const svc = yield* Channel.ChannelService
    const created = yield* svc.create({ organizationId: 1, name: 'Web Store', handle: 'web-store' })
    expect(created.handle).toBe('web-store')
    const found = yield* svc.findFirst({ where: { id: created.id } })
    expect(found.id).toBe(created.id)
  }))
```
Provide a `DrizzleDb` bound to a Testcontainers Postgres with the channel migrations applied + `ChannelEvents.layer`. (Pin the exact test-layer composition against the helper the repo exposes; run `grep -rn "makePostgresTestLayer\|PostgresContainer" packages/kit/src/testing` to find it.)

- [ ] **Step 3: Run, confirm fail** — `pnpm --filter @czo/channel test src/services/channel.integration.test.ts` → FAIL (`./channel` missing).

- [ ] **Step 4: Write `services/channel.ts` (CRUD only)** — clone stock-location's `services/channel.ts` via the rename map, then **trim** to MVP: keep `findFirst`, `findMany`, `create`, `update`, `softDelete`, plus `generateHandle`. **Remove** `delete` (hard), `setStatus`, `setDefault`, all `address` handling, and the `stockLocationAddresses` import. Adapt:
  - Errors: `ChannelNotFound`, `HandleTaken`→rename to `ChannelHandleTaken` (code `CHANNEL_HANDLE_TAKEN`), `ChannelDbFailed`. Keep `OptimisticLockError` from `@czo/kit/db`.
  - `CreateChannelInput { organizationId, name, handle, description?, isDefault?, isActive?, metadata? }` (no address).
  - `UpdateChannelInput { name?, handle?, description?, isActive?, isDefault?, metadata? }` (generic optimistic update; single-default NOT enforced in MVP).
  - `create`: same handle pre-check, then a single insert (no address transaction needed — drop the `db.transaction` wrapper, just `db.insert(channels).values({...}).returning()`), publish `ChannelCreated`.
  - `update`: existence check via `findFirst({ where: { id } })`, then `optimisticUpdate({ db, table: channels, id, expectedVersion, values: input })`, publish `ChannelUpdated` with `changes: Object.keys(input)`.
  - `softDelete`: existence check, `optimisticUpdate(... values: { deletedAt: sql\`NOW()\` as any })`, publish `ChannelDeleted`.
  - The `add/removeStockLocations` methods are ADDED in Task 5 — declare them in the Service interface NOW as stubs only if needed for the `satisfies` shape, OR add the whole interface in Task 5. To keep Task 4 self-contained, define the Service WITHOUT the link methods here; Task 5 extends the interface + impl.

- [ ] **Step 5: `services/index.ts`** — clone stock-location's, rename: exports `Channel`, `ChannelEvents`, and `ChannelModuleLive = Channel.layer.pipe(Layer.provideMerge(ChannelEvents.layer))`.

- [ ] **Step 6: Run, confirm pass** — `pnpm --filter @czo/channel test src/services/channel.integration.test.ts` → PASS. Add 2-3 more CRUD assertions (update optimistic-lock reject on stale version; softDelete then findFirst → NotFound).

- [ ] **Step 7: check-types + lint + stage**

```bash
pnpm --filter @czo/channel check-types && pnpm --filter @czo/channel lint --fix
git add packages/modules/channel/src/services/
```

---

## Task 5: Link/unlink service methods + cross-org guard

**Files:** Modify `services/channel.ts`. Test: extend `services/channel.integration.test.ts`.

- [ ] **Step 1: Write the failing test (link + cross-org reject)**

Append to `channel.integration.test.ts` (the test layer must now also provide a `StockLocationService` — compose the real `StockLocation.layer` from `@czo/stock-location/services` over the same `DrizzleDb`, OR provide a stub `StockLocationService` whose `findFirst` returns rows with a chosen `organizationId`. Prefer the real layer so the migration for stock_locations is applied too; if that complicates the test DB, a stub is acceptable — pin in implementation):

```ts
it.effect('addStockLocations links same-org locations; rejects cross-org', () =>
  Effect.gen(function* () {
    const svc = yield* Channel.ChannelService
    const ch = yield* svc.create({ organizationId: 1, name: 'C', handle: 'c' })
    // seed two stock locations: one in org 1, one in org 2 (via StockLocationService or direct insert)
    // ... (sl1 in org 1, sl2 in org 2)
    yield* svc.addStockLocations(ch.id, [sl1.id])
    const links = yield* svc.findFirst({ where: { id: ch.id }, with: { stockLocationLinks: true } })
    expect(links.stockLocationLinks.map(l => l.stockLocationId)).toContain(sl1.id)

    const err = yield* svc.addStockLocations(ch.id, [sl2.id]).pipe(Effect.flip)
    expect(err._tag).toBe('CrossOrgStockLocation')
  }))
```

- [ ] **Step 2: Run, confirm fail** (`addStockLocations` undefined).

- [ ] **Step 3: Add the `CrossOrgStockLocation` error + the two methods**

In `services/channel.ts`:
- Add the error:
```ts
export class CrossOrgStockLocation extends Data.TaggedError('CrossOrgStockLocation')<{
  readonly channelId: number
  readonly stockLocationId: number
}> {
  readonly code = 'CROSS_ORG_STOCK_LOCATION'
  get message() { return `Stock location ${this.stockLocationId} is not in channel ${this.channelId}'s organization` }
}
```
- Import the stock-location service + schema table:
```ts
import { StockLocationService } from '@czo/stock-location/services'
import { channelStockLocations } from '../database/schema'
```
- In `make`, after `const events = ...`, add `const stockLocations = yield* StockLocationService` (this adds `StockLocationService` to the layer's `R` — fine; `buildApp` provides it since stock-location is listed first).
- Add to the Service interface:
```ts
    readonly addStockLocations: (channelId: number, stockLocationIds: ReadonlyArray<number>) =>
      Effect.Effect<readonly number[], ChannelNotFound | CrossOrgStockLocation | ChannelDbFailed>
    readonly removeStockLocations: (channelId: number, stockLocationIds: ReadonlyArray<number>) =>
      Effect.Effect<readonly number[], ChannelNotFound | ChannelDbFailed>
```
- Implement (in the `.of({...})`):
```ts
    addStockLocations: (channelId, stockLocationIds) =>
      Effect.gen(function* () {
        const channel = yield* findFirst({ where: { id: channelId } }) // NotFound if absent
        if (stockLocationIds.length === 0)
          return []
        // Validate each SL is in the channel's org (cross-module).
        for (const slId of stockLocationIds) {
          const sl = yield* stockLocations.findFirst({ where: { id: slId } }).pipe(
            Effect.catchTag('StockLocationNotFound', () => Effect.succeed(null)),
            Effect.mapError(cause => new ChannelDbFailed({ cause })),
          )
          if (!sl || sl.organizationId !== channel.organizationId)
            return yield* Effect.fail(new CrossOrgStockLocation({ channelId, stockLocationId: slId }))
        }
        yield* dbErr(db.insert(channelStockLocations)
          .values(stockLocationIds.map(stockLocationId => ({ channelId, stockLocationId })))
          .onConflictDoNothing())
        yield* publish({ _tag: 'ChannelStockLocationsChanged', id: channelId, organizationId: channel.organizationId, added: [...stockLocationIds], removed: [] })
        return [...stockLocationIds]
      }),

    removeStockLocations: (channelId, stockLocationIds) =>
      Effect.gen(function* () {
        const channel = yield* findFirst({ where: { id: channelId } })
        if (stockLocationIds.length === 0)
          return []
        yield* dbErr(db.delete(channelStockLocations).where(and(
          eq(channelStockLocations.channelId, channelId),
          inArray(channelStockLocations.stockLocationId, [...stockLocationIds]),
        )))
        yield* publish({ _tag: 'ChannelStockLocationsChanged', id: channelId, organizationId: channel.organizationId, added: [], removed: [...stockLocationIds] })
        return [...stockLocationIds]
      }),
```
Add `inArray` to the `drizzle-orm` import (`import { and, eq, inArray, sql } from 'drizzle-orm'`).

- [ ] **Step 4: Run, confirm pass** — `pnpm --filter @czo/channel test src/services/channel.integration.test.ts` → all green.

- [ ] **Step 5: check-types + lint + stage** — `pnpm --filter @czo/channel check-types && pnpm --filter @czo/channel lint --fix`; `git add packages/modules/channel/src/services/`.

---

## Task 6: GraphQL scaffolding (builder, types, errors, inputs, queries, authz)

**Files:** Create `graphql/index.ts`, `graphql/schema/index.ts`, `graphql/schema/channel/{types,errors,inputs,queries,authz}.ts`.

- [ ] **Step 1: `graphql/index.ts`** — clone stock-location's, rename. The `WhereInput` keeps `name`/`handle`/`organizationId`/`isActive`/`isDefault`/`createdAt`. `BuilderSchemaObjects` declares `Channel: Channel`. Add `import '@czo/stock-location/graphql'` next to `import '@czo/auth/graphql'` (so `for: 'StockLocation'` resolves in the combined schema). Export `channelNodeGuards` + `registerChannelSchema`.

- [ ] **Step 2: `graphql/schema/channel/authz.ts`** — clone stock-location's `authz.ts`, rename. `loadOrganizationId(ctx, id)` resolves a `channels` row's org via `ChannelService.findFirst({ where: { id } })`, catching `ChannelNotFound`→null.

- [ ] **Step 3: `graphql/schema/channel/errors.ts`** — clone, rename. Register `ChannelNotFound`, `ChannelHandleTaken` (with the `handle` field), and `CrossOrgStockLocation` (with `channelId`/`stockLocationId` int fields):
```ts
  registerError(builder, ChannelNotFound, { name: 'ChannelNotFoundError' })
  registerError(builder, ChannelHandleTaken, { name: 'ChannelHandleTakenError', fields: t => ({ handle: t.exposeString('handle') }) })
  registerError(builder, CrossOrgStockLocation, { name: 'CrossOrgStockLocationError', fields: t => ({ channelId: t.exposeInt('channelId'), stockLocationId: t.exposeInt('stockLocationId') }) })
```

- [ ] **Step 4: `graphql/schema/channel/inputs.ts`** — clone stock-location's, **drop** the two `*AddressInput` blocks. Keep `ChannelWhereInput` (name/handle/organizationId/isActive/isDefault/createdAt) and `ChannelOrderByInput`/`ChannelOrderField`/`ChannelOrderDirection` (values NAME/HANDLE/CREATED_AT).

- [ ] **Step 5: `graphql/schema/channel/types.ts`** — clone stock-location's `types.ts`, **drop** the `StockLocationAddress` node + the `address` relation field. The `Channel` node has `select: true`, fields `handle/name/description(nullable)/isDefault/isActive/metadata/createdAt/updatedAt/version` + `organization: t.relation('organization')`. The `stockLocations` connection is ADDED in Task 9 (leave a placeholder comment `// stockLocations connection — added in Task 9`).

- [ ] **Step 6: `graphql/schema/channel/queries.ts`** — clone stock-location's `queries.ts`, rename. `channel(id: globalID<Channel>)` (nullable, authz via `loadOrganizationId`, resolve via `ChannelService.findFirst`, catch `ChannelNotFound`→null). `channels(organizationId: globalID<Organization>, search, where, orderBy)` — org-scoped connection, search over `name`/`handle`. Resource string `'channel'`.

- [ ] **Step 7: `graphql/schema/index.ts`** — clone, rename: `registerChannelSchema` calls types→errors→inputs→queries→mutations (mutations added in Tasks 7-8; keep the call, it'll exist by Task 8).

- [ ] **Step 8: (defer build until Task 7 adds mutations)** Stage:
```bash
git add packages/modules/channel/src/graphql/
```
> No standalone test here — the schema is exercised by the E2E (Task 12). `check-types` runs after mutations exist (Task 7).

---

## Task 7: CRUD mutations

**Files:** Create `graphql/schema/channel/mutations.ts`.

- [ ] **Step 1: Write `mutations.ts`** — clone stock-location's `mutations.ts`, rename, and keep ONLY `createChannel`, `updateChannel`, `deleteChannel` (drop `forceDelete`/`setStatus`/`setDefault`). Adapt:
  - `createChannel` inputFields: `organizationId: globalID<Organization>`, `name` (required, trimmed), `handle` (optional, `handleSchema`), `description: t.string()`, `isDefault: t.boolean()`, `isActive: t.boolean()`, `metadata: JSONObject`. **Drop** `address`. Resolver: `handle = input.handle ?? generateHandle(input.name)`; `svc.create({ organizationId: Number(orgId), name, handle, description: input.description ?? undefined, isDefault, isActive, metadata })`. Errors `[ValidationError, ChannelHandleTaken]`. authScope `channel:create`.
  - `updateChannel` inputFields: `id: globalID<Channel>`, `version: int`, `name?`, `handle?`, `description: t.string()`, `isActive: t.boolean()`, `isDefault: t.boolean()`, `metadata`. Resolver maps to `svc.update(Number(id), version, { name, handle, description, isActive, isDefault, metadata })` (coalesce nulls to undefined). Errors `[ValidationError, ChannelNotFound, OptimisticLockError]`. authScope `channel:update` via `loadOrganizationId`.
  - `deleteChannel`: `id`+`version` → `svc.softDelete`. Errors `[ChannelNotFound, OptimisticLockError]`. authScope `channel:delete`.
  - Output field `channel: t.field({ type: 'Channel', resolve: p => p.channel })`.

- [ ] **Step 2: check-types (schema now builds)** — `pnpm --filter @czo/channel check-types`. Expected clean. (The module isn't wired into an app yet, but the GraphQL files type-check against the builder.)

- [ ] **Step 3: lint + stage** — `pnpm --filter @czo/channel lint --fix`; `git add packages/modules/channel/src/graphql/schema/channel/mutations.ts`.

---

## Task 8: Link/unlink mutations

**Files:** Modify `graphql/schema/channel/mutations.ts`.

- [ ] **Step 1: Add `addStockLocationsToChannel` + `removeStockLocationsFromChannel`**

Append two `relayMutationField`s. Each takes `channelId: t.globalID({ for: 'Channel', required: true })` and `stockLocationIds: t.globalIDList({ for: 'StockLocation', required: true })`, authScope `channel:update` in the channel's org (via `loadOrganizationId(ctx, Number(input.channelId.id))`), errors `[ChannelNotFound, CrossOrgStockLocation]` (add only `ChannelNotFound` for remove), resolver calls `svc.addStockLocations(Number(input.channelId.id), input.stockLocationIds.map(g => Number(g.id)))` / `svc.removeStockLocations(...)`, then **returns the updated channel** by re-reading it: `const channel = yield* svc.findFirst({ where: { id: Number(input.channelId.id) } })`. Output field `channel: t.field({ type: 'Channel', resolve: p => p.channel })`.

```ts
  builder.relayMutationField(
    'addStockLocationsToChannel',
    { inputFields: t => ({
      channelId: t.globalID({ for: 'Channel', required: true }),
      stockLocationIds: t.globalIDList({ for: 'StockLocation', required: true }),
    }) },
    {
      errors: { types: [ChannelNotFound, CrossOrgStockLocation] },
      authScopes: async (_p, args, ctx) => {
        const organization = await loadOrganizationId(ctx, Number(args.input.channelId.id))
        if (organization == null) return { auth: true }
        return { permission: { resource: 'channel', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const cid = Number(args.input.channelId.id)
        const slIds = args.input.stockLocationIds.map(g => Number(g.id))
        const channel = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* ChannelService
          yield* svc.addStockLocations(cid, slIds)
          return yield* svc.findFirst({ where: { id: cid } })
        }))
        return { channel }
      },
    },
    { outputFields: t => ({ channel: t.field({ type: 'Channel', resolve: p => p.channel }) }) },
  )
```
(`remove` is the same with `errors: { types: [ChannelNotFound] }` and `svc.removeStockLocations`.) Verify `t.globalIDList` exists on the builder (attribute uses it); if the API differs, use `t.arg`-style list of globalIDs as attribute does.

- [ ] **Step 2: check-types + lint + stage** — `pnpm --filter @czo/channel check-types && pnpm --filter @czo/channel lint --fix`; `git add .../mutations.ts`.

---

## Task 9: `Channel.stockLocations` relay connection

**Files:** Modify `graphql/schema/channel/types.ts` (and possibly `database/relations.ts`).

- [ ] **Step 1: Attempt the M:N connection (nodes = StockLocation)**

In `database/relations.ts`, add an M:N relation on `channels` through the junction:
```ts
      channels: {
        stockLocationLinks: r.many.channelStockLocations({ from: r.channels.id, to: r.channelStockLocations.channelId }),
        stockLocations: r.many.stockLocations({
          from: r.channels.id.through(r.channelStockLocations.channelId),
          to: r.stockLocations.id.through(r.channelStockLocations.stockLocationId),
        }),
      },
```
In `types.ts`, add to the `Channel` node fields:
```ts
      stockLocations: t.relatedConnection('stockLocations', {
        type: 'stockLocations',
        // The association is the channel's own data; gate on channel:read in the
        // channel's org (parent-derived; `select: true` loads organizationId).
        authScopes: parent => ({ permission: { resource: 'channel', actions: ['read'], organization: parent.organizationId } }),
      }),
```

- [ ] **Step 2: Build the schema to verify**

Run the E2E harness boot once (or `pnpm --filter @czo/channel check-types`). If the Pothos-drizzle plugin resolves the M:N `relatedConnection` (`.through()` supported), keep it. Add a quick E2E assertion (Task 12) that `channel.stockLocations.edges[].node.id` are the linked StockLocations' global ids.

- [ ] **Step 3: FALLBACK if `.through()` / M:N relatedConnection is unsupported**

If Step 2 errors (drizzle `.through()` not available in this version, or Pothos can't traverse it): revert the M:N relation, and instead expose the junction as a node + connection:
- Add a `ChannelStockLocation` drizzleNode in `types.ts` (`name: 'ChannelStockLocation'`, `select: true`, fields: `createdAt`, `stockLocation: t.relation('stockLocation')`).
- On `Channel`, expose `stockLocations: t.relatedConnection('stockLocationLinks', { type: 'channelStockLocations', authScopes: parent => ({ permission: { resource: 'channel', actions: ['read'], organization: parent.organizationId } }), query: (_args) => ({}) })`.
- Client traverses `channel.stockLocations.edges.node.stockLocation`. Document in a code comment which path was used and why.

- [ ] **Step 4: check-types + lint + stage** — `pnpm --filter @czo/channel check-types && pnpm --filter @czo/channel lint --fix`; `git add packages/modules/channel/src/graphql/schema/channel/types.ts packages/modules/channel/src/database/relations.ts`.

---

## Task 10: node-guard + module definition + app wiring

**Files:** Create `graphql/node-guards.ts`, `src/index.ts`. Modify `apps/life/src/modules.ts`.

- [ ] **Step 1: `graphql/node-guards.ts`** — clone stock-location's:
```ts
import type { NodeGuard } from '@czo/kit/graphql'

export const channelNodeGuards: Record<string, NodeGuard> = {
  Channel: (row: { organizationId: number }) => ({
    permission: { resource: 'channel', actions: ['read'], organization: row.organizationId },
  }),
}
```

- [ ] **Step 2: `src/index.ts`** — clone stock-location's `index.ts`, rename, and set the access domain + deps:
```ts
const CHANNEL_STATEMENTS = { channel: ['create', 'read', 'update', 'delete'] } as const
const CHANNEL_HIERARCHY: Access.HierarchyLevel<typeof CHANNEL_STATEMENTS>[] = [
  { name: 'channel:viewer', permissions: { channel: ['read'] } },
  { name: 'channel:manager', permissions: { channel: ['create', 'update'] } },
  { name: 'channel:admin', permissions: { channel: ['delete'] } },
]

export default defineModule(() => ({
  name: 'channel',
  version: '0.0.1',
  layer: ChannelModuleLive as unknown as Layer.Layer<never, never, never>,
  db: { schema: channelSchema as unknown as Record<string, unknown>, relations: channelRelations },
  graphql: {
    contribution: builder => registerChannelSchema(builder as never),
    nodeGuards: channelNodeGuards,
  },
  onStart: Effect.gen(function* () {
    const access = yield* Access.AccessService
    yield* access.register({ name: 'channel', statements: CHANNEL_STATEMENTS, hierarchy: CHANNEL_HIERARCHY })
  }) as unknown as Effect.Effect<void, never, never>,
}))
```
Imports: `Access` from `@czo/auth/services`, `defineModule` from `@czo/kit/module`, `registerChannelSchema`+`channelNodeGuards` from `@czo/channel/graphql`, `channelRelations` from `@czo/channel/relations`, `* as channelSchema` from `@czo/channel/schema`, `ChannelModuleLive` from `@czo/channel/services`. Update the module doc comment to note the dependency on **both** auth and stock-location (the layer's `R` includes `StockLocationService`, provided because stock-location is listed earlier).

- [ ] **Step 3: Wire into `apps/life/src/modules.ts`**

Add the import `import channelModule from '@czo/channel'` and append `channelModule` to the `modules` array — AFTER `stockLocationModule` (channel uses StockLocationService) and `authModule`. Final: `[authModule, attributeModule, stockLocationModule, channelModule]`. Add `@czo/channel` to `apps/life/package.json` deps (`"@czo/channel": "workspace:*"`), then `pnpm install`.

- [ ] **Step 4: Type-check the app + module**

```bash
pnpm --filter @czo/channel check-types
pnpm --filter @czo/life check-types
```
Expected: clean. (Confirms the module def + manifest wiring + the `StockLocationService` requirement resolve in the app layer fold.)

- [ ] **Step 5: lint + stage** — `pnpm --filter @czo/channel lint --fix`; `git add packages/modules/channel/src/index.ts packages/modules/channel/src/graphql/node-guards.ts apps/life/src/modules.ts apps/life/package.json pnpm-lock.yaml`.

---

## Task 11: E2E harness

**Files:** Create `e2e/harness.ts`.

- [ ] **Step 1: Clone stock-location's `e2e/harness.ts`**

Copy `packages/modules/stock-location/src/e2e/harness.ts` → `packages/modules/channel/src/e2e/harness.ts`. Apply the rename map. Change the boot to `bootTestApp({ modules: [authModule, stockLocationModule, channelModule], migrations: [AUTH_MIGRATIONS, STOCK_LOCATION_MIGRATIONS, CHANNEL_MIGRATIONS] })` (import the three modules + their migration sets; find how stock-location's harness references its migrations and mirror for channel + add stock-location's). Keep the `signUp` with the per-call `x-forwarded-for` IP (rate-limit), `createOrganization`, `setMemberRole`, `gql`, `close` helpers. Export a `ChannelHarness` / `bootChannelApp`.

- [ ] **Step 2: Type-check + stage** — `pnpm --filter @czo/channel check-types`; `git add packages/modules/channel/src/e2e/harness.ts`.
> (The harness compiles but is exercised by Task 12.)

---

## Task 12: E2E test

**Files:** Create `e2e/channel.e2e.test.ts`.

- [ ] **Step 1: Write the E2E suite** (mirrors `stock-location/src/e2e/stock-location.e2e.test.ts`, plus link/connection coverage). GraphQL ops + cases:
  - `createChannel` within an org (full role) → read back via `channel(id)` (global id round-trips).
  - `denies createChannel without channel:create` (org owner, no `channel:*` role) → errors + null.
  - `denies cross-org reads of a channel` (B owns own org, reads A's channel) → denied.
  - `updateChannel` optimistic lock (stale version → OptimisticLockError).
  - `soft-deletes a channel`.
  - `lists channels for a member and denies a non-member` (the `channels(organizationId)` connection).
  - `reads a Channel via node(id:) — member ok, non-member denied` (node-guard).
  - `addStockLocationsToChannel` — create a stock location in the SAME org (via the stock-location mutations, available in the booted app), link it, assert the `Channel.stockLocations` connection returns it; then attempt to link a stock location from ANOTHER org → `CrossOrgStockLocation` (typed error in the union `__typename`, NOT top-level `errors`).
  - `removeStockLocationsFromChannel` — unlink, assert the connection no longer returns it.

Use the harness helpers. For the cross-org link case, create a second org + a stock location in it. For asserting the typed `CrossOrgStockLocation` error, check the mutation payload `__typename` (typed errors surface in `data.<field>.__typename`, NOT `errors[]` — same as the api-key/B17 pattern).

- [ ] **Step 2: Run the E2E** — `pnpm --filter @czo/channel test src/e2e/channel.e2e.test.ts`. Expected: all green. (Boots `[auth, stock-location, channel]` on Testcontainers.) Debug any schema-build / migration-format issues here (the combined schema must resolve `for: 'StockLocation'`, `'Organization'`, `'Channel'`).

- [ ] **Step 3: Full module suite + stage** — `pnpm --filter @czo/channel test` (integration + E2E green); `git add packages/modules/channel/src/e2e/channel.e2e.test.ts`.

---

## Task 13: Backlog/docs + full verification + single commit

**Files:** Optionally note the module in a docs index; verify; commit.

- [ ] **Step 1: Full verification**

```bash
pnpm --filter @czo/channel check-types && pnpm --filter @czo/channel lint && pnpm --filter @czo/channel test
pnpm --filter @czo/stock-location check-types
pnpm --filter @czo/auth check-types
pnpm --filter @czo/life check-types
```
Expected: channel types/lint/tests green; stock-location/auth/life still type-check (no regression from the new cross-module relation + manifest entry).

- [ ] **Step 2: Stage everything + review**

```bash
git add -A
git status && git diff --cached --stat
```

- [ ] **Step 3: Single commit (ONLY after the user reviews)**

```bash
git commit -m "feat(channel): @czo/channel module — org-scoped sales channels + stock-location links

New Effect-native module cloned from @czo/stock-location: channels CRUD
(org-scoped, soft-delete, optimistic lock) + an M:N channel_stock_locations
junction. ChannelService adds add/removeStockLocations with a cross-org guard
(validates each stock location is in the channel's org via StockLocationService).
GraphQL: Channel drizzleNode + stockLocations relay connection, CRUD + link/unlink
mutations, channel:* access domain, Channel node-guard. Wired into apps/life after
stock-location. Integration + E2E (bootTestApp([auth, stock-location, channel]))."
```

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin feat/channel-module
gh pr create --base main --title "feat(channel): @czo/channel sales-channel module (+ stock-location links)" --body "<summary per the spec>"
```

---

## Self-Review

**Spec coverage:** tables (channels + junction) → Task 2; relations (incl. M:N) → Tasks 3, 9; ChannelService CRUD → Task 4; link/unlink + cross-org guard → Task 5; GraphQL types/queries/inputs/errors/authz → Task 6; CRUD mutations → Task 7; link mutations → Task 8; `Channel.stockLocations` connection (channel:read authz, verify+fallback) → Task 9; node-guard + access domain + module wiring + manifest order → Task 10; E2E harness/test → Tasks 11-12; verify/commit → Task 13. All spec sections covered. The spec's out-of-scope (products, API keys, reverse `StockLocation.channels`, set-replace) are not built.

**Placeholder scan:** The clone tasks reference a precise template file + rename map + explicit trims (not "similar to") — concrete. The one genuine unknown (M:N `.through()` support) is handled with a verify step + a fully-specified fallback in Task 9, not a TODO. Test bodies for the novel logic (cross-org guard, link round-trip) are written; the cloned CRUD tests reuse the stock-location/soft-delete test layer pattern (referenced by path).

**Type consistency:** `ChannelService` methods (`findFirst/findMany/create/update/softDelete` in Task 4; `addStockLocations/removeStockLocations` in Task 5) match their GraphQL callers (Tasks 7-8). Error names consistent: `ChannelNotFound`, `ChannelHandleTaken`, `ChannelDbFailed`, `CrossOrgStockLocation` (defined Task 4-5, registered Task 6, used in mutation unions Tasks 7-8). `channelStockLocations` table (Task 2) ↔ `stockLocationLinks` relation (Task 3) ↔ junction usage (Tasks 5, 9) consistent. Access resource string `'channel'` consistent across authz (Task 6), mutations (Tasks 7-8), node-guard + hierarchy (Task 10).
```
