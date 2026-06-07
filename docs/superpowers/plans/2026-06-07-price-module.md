# `@czo/price` Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@czo/price` — an org-scoped, Effect-native pricing engine: price-sets grouping multi-currency prices, generic operator-based rules resolved by specificity, quantity tiers, time-bounded price lists (sale/override), and a public org-scoped `resolvePrice` returning a tagged `CalculatedPrice` union.

**Architecture:** Rules-as-data evaluated **service-side** (no rules-engine binary): one indexed SQL cut (`price_set` + `currency_code` + temporal gate) hydrates a handful of candidate prices with their rules/list; a **pure Effect core** (`services/resolve.ts`) evaluates operators, applies quantity tiers, tier-overrides price-lists over base, ranks by `rules_matched → Σ priority → amount (BigDecimal) → id`, and shapes a `Base | Override | Sale | null` union. Money is Postgres `numeric` (string at the JS boundary), compared via Effect `BigDecimal`. Mirrors the `@czo/inventory` / `@czo/channel` module template exactly.

**Tech Stack:** Effect-TS 4 (`Context.Service`, `Data.TaggedError`, `Effect.gen`, `BigDecimal`, `Schema`), Drizzle RQBv2 + `@effect/sql-pg`, Pothos (`drizzleNode`, `unionType`, `relayMutationField`, scope-auth, errors), Testcontainers, `@effect/vitest`.

**Reference templates (read before starting):** `packages/modules/inventory/src/**` is the closest sibling — every pattern here is adapted from it. Spec: `docs/superpowers/specs/2026-06-07-price-module-design.md`.

**Conventions (non-negotiable):** No `async`/`await`/`try`/`catch` in service code (use `Effect.*`). Soft-delete via `deletedAt`, never hard delete. Immutability (spread, no mutation). `version` optimistic lock on top-level entities. No `console.log`. No `as any` where inference works (targeted casts only). One commit per task. **No events module** — the spec defines none; do not add one.

---

## File Structure

```
packages/modules/price/
  package.json              T1  — deps, exports, scripts (peer: @czo/auth only)
  tsconfig.json             T1
  drizzle.config.ts         T1
  vitest.config.ts          T1
  eslint.config.mjs         T1
  migrations/               T4  — generated (<ts>_<name>/migration.sql + snapshot.json)
  src/
    database/
      schema.ts             T2  — 3 enums + 5 tables + checks/uniques + SchemaRegistryShape
      relations.ts          T3  — price_set→prices, price_list→prices, *→rules, price→organization
    services/
      price.ts              T5-7 — PriceService: Tag, errors, types, CRUD, layer
      resolve.ts            T8-9 — PURE: ruleSatisfied, evaluatePrice, rankCandidates, toCalculatedPrice
      validation.ts         T11 — operator↔value coherence (Zod) at the mutation boundary
      index.ts              T5  — PriceModuleLive = Price.layer
      price.integration.test.ts   T5-7,10 — Testcontainers CRUD + resolver
      resolve.test.ts             T8-9,11 — pure unit tests
    graphql/
      index.ts              T12 — builder augmentation, where-inputs, object map
      node-guards.ts        T12 — PriceSet/Price/PriceList → price:read
      schema/
        index.ts            T12 — registerPriceSchema fan-out
        price/
          types.ts          T13 — 3 drizzleNodes + CalculatedPrice union refs
          errors.ts         T13 — registerError for every tagged error
          inputs.ts         T14 — operator enum, RuleInput, context input, where/orderBy
          authz.ts          T15 — load{Set,Price,List}OrganizationId
          queries.ts        T15 — priceSet(s), priceList(s), resolvePrice (public, org-scoped)
          mutations/
            index.ts        T16
            priceSet.ts     T16
            price.ts         T16
            priceList.ts     T16
    e2e/
      harness.ts            T17 — bootTestApp([auth, price])
      price.e2e.test.ts     T17 — CRUD + resolvePrice + org-scope (H1)
    index.ts                T17 — defineModule + access domain
  (apps/life/src/modules.ts) T17 — register priceModule before inventory
```

---

## Task 1: Scaffold the package

**Files:**
- Create: `packages/modules/price/package.json`
- Create: `packages/modules/price/tsconfig.json`
- Create: `packages/modules/price/drizzle.config.ts`
- Create: `packages/modules/price/vitest.config.ts`
- Create: `packages/modules/price/eslint.config.mjs`

- [ ] **Step 1: Copy the four config files verbatim from inventory** (they are module-agnostic):

```bash
cd /workspace/c-zo/packages/modules
mkdir -p price/src
cp inventory/tsconfig.json price/tsconfig.json
cp inventory/drizzle.config.ts price/drizzle.config.ts
cp inventory/vitest.config.ts price/vitest.config.ts
cp inventory/eslint.config.mjs price/eslint.config.mjs
```

- [ ] **Step 2: Write `package.json`** — identical to inventory's except name/description and **drop the `@czo/stock-location` peer/dev dep** (price depends only on auth):

```json
{
  "name": "@czo/price",
  "type": "module",
  "version": "0.0.1",
  "description": "Pricing module for c-zo — price sets, operator rules, price lists, and a context-driven resolver",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/bnofao/czo.git", "directory": "packages/modules/price" },
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
  "peerDependencies": { "@czo/auth": "workspace:*" },
  "dependencies": { "@czo/kit": "workspace:*", "drizzle-orm": "catalog:common", "effect": "catalog:", "zod": "catalog:common" },
  "devDependencies": {
    "@czo/auth": "workspace:*",
    "@effect/vitest": "catalog:",
    "@vitest/coverage-v8": "catalog:testing",
    "@workspace/eslint-config": "workspace:*",
    "@workspace/typescript-config": "workspace:*",
    "drizzle-kit": "catalog:dev",
    "vitest": "catalog:testing"
  }
}
```

- [ ] **Step 3: Install** so the workspace links the new package:

```bash
cd /workspace/c-zo && pnpm install
```
Expected: lockfile updates, `@czo/price` linked. No type-check yet (no src).

- [ ] **Step 4: Commit**

```bash
git add packages/modules/price pnpm-lock.yaml
git commit -m "chore(price): scaffold @czo/price package"
```

---

## Task 2: Database schema

**Files:**
- Create: `packages/modules/price/src/database/schema.ts`

- [ ] **Step 1: Write the schema** — 3 pg enums, 5 tables, checks + partial uniques, and the global `SchemaRegistryShape` augmentation:

```ts
import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core'

export const priceRuleOperator = pgEnum('price_rule_operator', ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in'])
export const priceListType = pgEnum('price_list_type', ['sale', 'override'])
export const priceListStatus = pgEnum('price_list_status', ['draft', 'active'])

export const priceSets = pgTable('price_sets', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('price_sets_organization_id_idx').on(t.organizationId),
])

export const priceLists = pgTable('price_lists', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  type: priceListType('type').notNull(),
  status: priceListStatus('status').notNull().default('draft'),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('price_lists_organization_id_idx').on(t.organizationId),
])

export const prices = pgTable('prices', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  priceSetId: integer('price_set_id').notNull().references(() => priceSets.id, { onDelete: 'cascade' }),
  priceListId: integer('price_list_id').references(() => priceLists.id, { onDelete: 'cascade' }),
  currencyCode: text('currency_code').notNull(),
  amount: numeric('amount').notNull(),
  minQuantity: integer('min_quantity'),
  maxQuantity: integer('max_quantity'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('prices_price_set_id_idx').on(t.priceSetId),
  index('prices_price_list_id_idx').on(t.priceListId),
  index('prices_set_currency_idx').on(t.priceSetId, t.currencyCode),
  check('chk_price_amount_nonneg', sql`${t.amount} >= 0`),
  check('chk_price_min_qty', sql`${t.minQuantity} IS NULL OR ${t.minQuantity} >= 1`),
  check('chk_price_max_qty', sql`${t.maxQuantity} IS NULL OR ${t.maxQuantity} >= 1`),
  check('chk_price_max_ge_min', sql`${t.maxQuantity} IS NULL OR ${t.minQuantity} IS NULL OR ${t.maxQuantity} >= ${t.minQuantity}`),
])

export const priceRules = pgTable('price_rules', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  priceId: integer('price_id').notNull().references(() => prices.id, { onDelete: 'cascade' }),
  attribute: text('attribute').notNull(),
  operator: priceRuleOperator('operator').notNull().default('eq'),
  value: jsonb('value').notNull(),
  priority: integer('priority').notNull().default(0),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [
  uniqueIndex('price_rules_price_attr_uniq').on(t.priceId, t.attribute).where(sql`${t.deletedAt} IS NULL`),
  index('price_rules_price_id_idx').on(t.priceId),
])

export const priceListRules = pgTable('price_list_rules', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  priceListId: integer('price_list_id').notNull().references(() => priceLists.id, { onDelete: 'cascade' }),
  attribute: text('attribute').notNull(),
  operator: priceRuleOperator('operator').notNull().default('eq'),
  value: jsonb('value').notNull(),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [
  uniqueIndex('price_list_rules_list_attr_uniq').on(t.priceListId, t.attribute).where(sql`${t.deletedAt} IS NULL`),
  index('price_list_rules_list_id_idx').on(t.priceListId),
])

declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    priceSets: typeof priceSets
    priceLists: typeof priceLists
    prices: typeof prices
    priceRules: typeof priceRules
    priceListRules: typeof priceListRules
  }
}
```

- [ ] **Step 2: Type-check** (no migration yet — just that the schema compiles):

```bash
cd packages/modules/price && pnpm check-types
```
Expected: PASS (the `declare module` augmentation resolves against `@czo/kit/db`).

- [ ] **Step 3: Commit**

```bash
git add packages/modules/price/src/database/schema.ts
git commit -m "feat(price): drizzle schema — sets, prices, rules, lists"
```

---

## Task 3: Relations

**Files:**
- Create: `packages/modules/price/src/database/relations.ts`

- [ ] **Step 1: Write relations** — prices belong to a set/list; sets/lists/prices expose their children; price→organization for the GraphQL `organization` field. Side-effect import auth's schema so `organizations` resolves when this module's relations compile in isolation:

```ts
import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'
// Side-effect import: bring auth's registry augmentation into scope so
// `organizations` resolves in the Pick AND when auth's own relations.ts
// compiles as part of this module's type graph. Mirrors inventory/channel.
import '@czo/auth/schema'

type PriceSchema = Pick<
  SchemaRegistryShape,
  'priceSets' | 'priceLists' | 'prices' | 'priceRules' | 'priceListRules' | 'organizations'
>

export function priceRelations(schema: PriceSchema) {
  const { priceSets, priceLists, prices, priceRules, priceListRules, organizations } = schema

  return defineRelationsPart(
    { priceSets, priceLists, prices, priceRules, priceListRules, organizations },
    r => ({
      priceSets: {
        organization: r.one.organizations({ from: r.priceSets.organizationId, to: r.organizations.id }),
        prices: r.many.prices({ from: r.priceSets.id, to: r.prices.priceSetId }),
      },
      priceLists: {
        organization: r.one.organizations({ from: r.priceLists.organizationId, to: r.organizations.id }),
        prices: r.many.prices({ from: r.priceLists.id, to: r.prices.priceListId }),
        rules: r.many.priceListRules({ from: r.priceLists.id, to: r.priceListRules.priceListId }),
      },
      prices: {
        organization: r.one.organizations({ from: r.prices.organizationId, to: r.organizations.id }),
        priceSet: r.one.priceSets({ from: r.prices.priceSetId, to: r.priceSets.id }),
        priceList: r.one.priceLists({ from: r.prices.priceListId, to: r.priceLists.id }),
        rules: r.many.priceRules({ from: r.prices.id, to: r.priceRules.priceId }),
      },
      priceRules: {
        price: r.one.prices({ from: r.priceRules.priceId, to: r.prices.id }),
      },
      priceListRules: {
        priceList: r.one.priceLists({ from: r.priceListRules.priceListId, to: r.priceLists.id }),
      },
    }),
  )
}

export type Relations = ReturnType<typeof priceRelations>
```

- [ ] **Step 2: Type-check**

```bash
cd packages/modules/price && pnpm check-types
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/modules/price/src/database/relations.ts
git commit -m "feat(price): drizzle relations"
```

---

## Task 4: Generate the migration

**Files:**
- Create: `packages/modules/price/migrations/<timestamp>_<name>/migration.sql` + `snapshot.json` (generated)

- [ ] **Step 1: Generate**

```bash
cd packages/modules/price && pnpm migrate:generate
```
Expected: a new `migrations/<ts>_<name>/` dir containing `migration.sql` + `snapshot.json`. (Directory format — NOT flat files — is what `bootTestApp`/`makePostgresTestLayer` expect.)

- [ ] **Step 2: Eyeball the SQL** — confirm 3 `CREATE TYPE` enums, 5 `CREATE TABLE`, the 4 price CHECKs, and the 2 partial unique indexes (`... WHERE deleted_at IS NULL`). Run:

```bash
cat packages/modules/price/migrations/*/migration.sql
```
Expected: enums + tables + `chk_price_*` + `price_rules_price_attr_uniq` / `price_list_rules_list_attr_uniq` partial indexes present.

- [ ] **Step 3: Commit**

```bash
git add packages/modules/price/migrations
git commit -m "feat(price): initial migration"
```

---

## Task 5: PriceService skeleton + price-set CRUD

**Files:**
- Create: `packages/modules/price/src/services/price.ts`
- Create: `packages/modules/price/src/services/index.ts`
- Create: `packages/modules/price/src/services/price.integration.test.ts`

- [ ] **Step 1: Write the failing test** (`price.integration.test.ts`):

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { organizations } from '@czo/auth/schema'
import { makePostgresTestLayer, truncateTables } from '@czo/kit/testing'
import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { priceRelations } from '../database/relations'
import { priceListRules, priceLists, priceRules, prices, priceSets } from '../database/schema'
import * as Price from './price'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')
const PricePostgresLayer = makePostgresTestLayer({
  migrationsFolder: MIGRATIONS,
  relations: priceRelations({ priceSets, priceLists, prices, priceRules, priceListRules, organizations }),
})
const truncatePrice = truncateTables(priceListRules, priceRules, prices, priceLists, priceSets)

const TestLayer = Price.layer.pipe(Layer.provideMerge(PricePostgresLayer))

layer(TestLayer, { timeout: 120_000 })('PriceService', (it) => {
  it.effect('createPriceSet + findPriceSet round-trips', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const set = yield* svc.createPriceSet({ organizationId: 1 })
      expect(set.organizationId).toBe(1)
      const found = yield* svc.findPriceSetById(set.id)
      expect(found.id).toBe(set.id)
    }))

  it.effect('findPriceSetById fails PriceSetNotFound for unknown id', () =>
    Effect.gen(function* () {
      yield* truncatePrice
      const svc = yield* Price.PriceService
      const err = yield* svc.findPriceSetById(999999).pipe(Effect.flip)
      expect(err._tag).toBe('PriceSetNotFound')
    }))
})
```

- [ ] **Step 2: Run — expect FAIL** (module missing):

```bash
cd packages/modules/price && pnpm test src/services/price.integration.test.ts
```
Expected: FAIL ("Cannot find module './price'" / `PriceService` undefined).

- [ ] **Step 3: Write `price.ts`** — Tag, errors, types, helpers, `make` with price-set CRUD, `layer`:

```ts
import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { priceListRules, priceLists, priceRules, prices, priceSets } from '../database/schema'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { and, eq, sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { isSqlError } from 'effect/unstable/sql/SqlError'
import {
  priceListRules as priceListRulesTable,
  priceLists as priceListsTable,
  priceRules as priceRulesTable,
  prices as pricesTable,
  priceSets as priceSetsTable,
} from '../database/schema'

// ─── Tagged errors ───────────────────────────────────────────────────────────

export class PriceSetNotFound extends Data.TaggedError('PriceSetNotFound') {
  readonly code = 'PRICE_SET_NOT_FOUND'
  get message() { return 'Price set not found' }
}
export class PriceNotFound extends Data.TaggedError('PriceNotFound') {
  readonly code = 'PRICE_NOT_FOUND'
  get message() { return 'Price not found' }
}
export class PriceListNotFound extends Data.TaggedError('PriceListNotFound') {
  readonly code = 'PRICE_LIST_NOT_FOUND'
  get message() { return 'Price list not found' }
}
export class InvalidPriceRule extends Data.TaggedError('InvalidPriceRule')<{
  readonly attribute: string
  readonly reason: string
}> {
  readonly code = 'PRICE_INVALID_RULE'
  get message() { return `Invalid rule on '${this.attribute}': ${this.reason}` }
}
export class PriceDbFailed extends Data.TaggedError('PriceDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'PRICE_DB_FAILED'
  get message() { return 'Database operation failed' }
}

export type PriceError
  = | PriceSetNotFound | PriceNotFound | PriceListNotFound
    | InvalidPriceRule | PriceDbFailed | OptimisticLockError

// ─── Rule + context value types ───────────────────────────────────────────────

export type RuleOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'
export type JsonScalar = string | number
export type RuleValue = JsonScalar | ReadonlyArray<JsonScalar>

export interface RuleInput {
  attribute: string
  operator: RuleOperator
  value: RuleValue
}

// ─── Input types ───────────────────────────────────────────────────────────────

export interface CreatePriceSetInput {
  organizationId: number
  metadata?: Record<string, unknown> | null
}
export interface CreatePriceInput {
  priceSetId: number
  priceListId?: number | null
  currencyCode: string
  amount: string
  minQuantity?: number | null
  maxQuantity?: number | null
  rules?: ReadonlyArray<RuleInput>
}
export interface UpdatePriceInput {
  currencyCode?: string
  amount?: string
  minQuantity?: number | null
  maxQuantity?: number | null
  /** When present, the price's rule set is replaced wholesale. */
  rules?: ReadonlyArray<RuleInput>
}
export interface CreatePriceListInput {
  organizationId: number
  title: string
  description?: string | null
  type: 'sale' | 'override'
  status?: 'draft' | 'active'
  startsAt?: Date | null
  endsAt?: Date | null
  rules?: ReadonlyArray<RuleInput>
  metadata?: Record<string, unknown> | null
}
export interface UpdatePriceListInput {
  title?: string
  description?: string | null
  type?: 'sale' | 'override'
  status?: 'draft' | 'active'
  startsAt?: Date | null
  endsAt?: Date | null
  rules?: ReadonlyArray<RuleInput>
  metadata?: Record<string, unknown> | null
}

export interface PriceContext {
  currencyCode: string
  quantity?: number
  at?: Date
  attributes?: ReadonlyArray<{ attribute: string, value: JsonScalar }>
}

// ─── Domain model ───────────────────────────────────────────────────────────────

export type PriceSet = InferSelectModel<typeof priceSets>
export type Price = InferSelectModel<typeof prices>
export type PriceList = InferSelectModel<typeof priceLists>
export type PriceRule = InferSelectModel<typeof priceRules>
export type PriceListRule = InferSelectModel<typeof priceListRules>

// ─── Calculated price (tagged union — Step 9 fills the shaping) ──────────────────

export type CalculatedPrice =
  | { readonly _tag: 'Base', readonly amount: string, readonly currencyCode: string, readonly priceId: number }
  | { readonly _tag: 'Override', readonly amount: string, readonly currencyCode: string, readonly priceId: number, readonly priceListId: number }
  | { readonly _tag: 'Sale', readonly amount: string, readonly originalAmount: string, readonly currencyCode: string, readonly priceId: number, readonly priceListId: number }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map ONLY SqlError → PriceDbFailed; domain errors pass through transactions. */
function dbErrSql<A, E>(eff: Effect.Effect<A, E, never>): Effect.Effect<A, E | PriceDbFailed, never> {
  return eff.pipe(Effect.catchIf(isSqlError, cause => Effect.fail(new PriceDbFailed({ cause }))))
}

// ─── Service contract ───────────────────────────────────────────────────────────

export interface PriceServiceImpl {
  readonly createPriceSet: (input: CreatePriceSetInput) => Effect.Effect<PriceSet, PriceDbFailed>
  readonly findPriceSetById: (id: number) => Effect.Effect<PriceSet, PriceSetNotFound | PriceDbFailed>
  readonly findPriceSet: (config: Parameters<Database['query']['priceSets']['findFirst']>[0]) => Effect.Effect<PriceSet, PriceSetNotFound | PriceDbFailed>
  readonly findPriceSets: (config: Parameters<Database['query']['priceSets']['findMany']>[0]) => Effect.Effect<ReadonlyArray<PriceSet>, PriceDbFailed>
  readonly softDeletePriceSet: (id: number, version: number) => Effect.Effect<PriceSet, PriceSetNotFound | OptimisticLockError | PriceDbFailed>
  // Price + PriceList methods are added in Tasks 6/7; resolvePrice in Task 10.
}

export class PriceService extends Context.Tag('@czo/price/PriceService')<PriceService, PriceServiceImpl>() {}

export const make = Effect.gen(function* () {
  const db = yield* DrizzleDb

  const createPriceSet: PriceServiceImpl['createPriceSet'] = input =>
    dbErrSql(Effect.gen(function* () {
      const [row] = yield* db.insert(priceSetsTable).values({
        organizationId: input.organizationId,
        metadata: input.metadata ?? null,
      }).returning()
      return row!
    }))

  const findPriceSet: PriceServiceImpl['findPriceSet'] = config =>
    dbErrSql(Effect.gen(function* () {
      const row = yield* db.query.priceSets.findFirst(config as any)
      if (!row)
        return yield* Effect.fail(new PriceSetNotFound())
      return row as PriceSet
    }))

  const findPriceSetById: PriceServiceImpl['findPriceSetById'] = id =>
    findPriceSet({ where: { id, deletedAt: { isNull: true } } })

  const findPriceSets: PriceServiceImpl['findPriceSets'] = config =>
    dbErrSql(Effect.gen(function* () {
      return (yield* db.query.priceSets.findMany(config as any)) as ReadonlyArray<PriceSet>
    }))

  const softDeletePriceSet: PriceServiceImpl['softDeletePriceSet'] = (id, version) =>
    Effect.gen(function* () {
      const existing = yield* findPriceSetById(id)
      yield* optimisticUpdate({
        table: priceSetsTable,
        id,
        version,
        set: { deletedAt: sql`NOW()` },
      })
      return existing
    })

  return PriceService.of({
    createPriceSet,
    findPriceSet,
    findPriceSetById,
    findPriceSets,
    softDeletePriceSet,
  } as PriceServiceImpl)
})

export const layer = Layer.effect(PriceService, make)
```

> **Note on `optimisticUpdate`:** confirm its exact signature against `@czo/kit/db` (used in inventory's `price.ts` sibling — `optimisticUpdate({ table, id, version, set })` returns the updated row or fails `OptimisticLockError`). If inventory calls it differently, match that call site.

- [ ] **Step 4: Write `services/index.ts`**:

```ts
import * as Price from './price'

export { Price }

/** Composite layer for the price module (no event bus — none in spec). */
export const PriceModuleLive = Price.layer
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd packages/modules/price && pnpm test src/services/price.integration.test.ts
```
Expected: 2 passing.

- [ ] **Step 6: Lint + type-check + commit**

```bash
cd packages/modules/price && pnpm lint:fix && pnpm check-types
cd /workspace/c-zo && git add packages/modules/price/src/services
git commit -m "feat(price): PriceService skeleton + price-set CRUD"
```

---

## Task 6: Price CRUD with operator rules

**Files:**
- Modify: `packages/modules/price/src/services/price.ts` (extend contract + `make`)
- Modify: `packages/modules/price/src/services/price.integration.test.ts` (add tests)

- [ ] **Step 1: Write failing tests** (append inside the `layer(...)` block):

```ts
it.effect('createPrice with rules, then findPrice loads them', () =>
  Effect.gen(function* () {
    yield* truncatePrice
    const svc = yield* Price.PriceService
    const set = yield* svc.createPriceSet({ organizationId: 1 })
    const price = yield* svc.createPrice({
      priceSetId: set.id,
      currencyCode: 'eur',
      amount: '19.99',
      rules: [{ attribute: 'region_id', operator: 'eq', value: 'eu' }],
    })
    expect(price.organizationId).toBe(1)
    const rules = yield* svc.findPriceRules(price.id)
    expect(rules.length).toBe(1)
    expect(rules[0]!.attribute).toBe('region_id')
  }))

it.effect('updatePrice replaces its rule set under optimistic lock', () =>
  Effect.gen(function* () {
    yield* truncatePrice
    const svc = yield* Price.PriceService
    const set = yield* svc.createPriceSet({ organizationId: 1 })
    const price = yield* svc.createPrice({
      priceSetId: set.id, currencyCode: 'eur', amount: '10',
      rules: [{ attribute: 'region_id', operator: 'eq', value: 'eu' }],
    })
    const updated = yield* svc.updatePrice(price.id, price.version, {
      amount: '12',
      rules: [{ attribute: 'channel_id', operator: 'eq', value: 'web' }],
    })
    expect(updated.amount).toBe('12')
    const rules = yield* svc.findPriceRules(price.id)
    expect(rules.map(r => r.attribute)).toEqual(['channel_id'])
    // stale version conflicts
    const err = yield* svc.updatePrice(price.id, price.version, { amount: '99' }).pipe(Effect.flip)
    expect(err._tag).toBe('OptimisticLockError')
  }))
```

- [ ] **Step 2: Run — expect FAIL** (`createPrice`/`findPriceRules`/`updatePrice` undefined):

```bash
cd packages/modules/price && pnpm test src/services/price.integration.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Extend the contract** in `price.ts` (`PriceServiceImpl`):

```ts
  readonly createPrice: (input: CreatePriceInput) => Effect.Effect<Price, PriceSetNotFound | PriceListNotFound | PriceDbFailed>
  readonly findPriceById: (id: number) => Effect.Effect<Price, PriceNotFound | PriceDbFailed>
  readonly findPriceRules: (priceId: number) => Effect.Effect<ReadonlyArray<PriceRule>, PriceDbFailed>
  readonly updatePrice: (id: number, version: number, input: UpdatePriceInput) => Effect.Effect<Price, PriceNotFound | OptimisticLockError | PriceDbFailed>
  readonly softDeletePrice: (id: number, version: number) => Effect.Effect<Price, PriceNotFound | OptimisticLockError | PriceDbFailed>
```

- [ ] **Step 4: Implement in `make`** (insert each `const` before the `return PriceService.of(...)` and add to the returned object). `organizationId` is denormalized from the parent set; rule replacement runs in the parent's optimistic-lock transaction:

```ts
  const insertRules = (tx: typeof db, priceId: number, rules: ReadonlyArray<RuleInput>) =>
    rules.length === 0
      ? Effect.void
      : tx.insert(priceRulesTable).values(
          rules.map(r => ({ priceId, attribute: r.attribute, operator: r.operator, value: r.value as unknown })),
        )

  const createPrice: PriceServiceImpl['createPrice'] = input =>
    dbErrSql(db.transaction(tx => Effect.gen(function* () {
      const set = yield* tx.query.priceSets.findFirst({ where: { id: input.priceSetId, deletedAt: { isNull: true } } })
      if (!set)
        return yield* Effect.fail(new PriceSetNotFound())
      if (input.priceListId != null) {
        const list = yield* tx.query.priceLists.findFirst({ where: { id: input.priceListId, deletedAt: { isNull: true } } })
        if (!list)
          return yield* Effect.fail(new PriceListNotFound())
      }
      const [row] = yield* tx.insert(pricesTable).values({
        organizationId: (set as PriceSet).organizationId,
        priceSetId: input.priceSetId,
        priceListId: input.priceListId ?? null,
        currencyCode: input.currencyCode,
        amount: input.amount,
        minQuantity: input.minQuantity ?? null,
        maxQuantity: input.maxQuantity ?? null,
      }).returning()
      yield* insertRules(tx, (row as Price).id, input.rules ?? [])
      return row as Price
    })))

  const findPriceById: PriceServiceImpl['findPriceById'] = id =>
    dbErrSql(Effect.gen(function* () {
      const row = yield* db.query.prices.findFirst({ where: { id, deletedAt: { isNull: true } } })
      if (!row)
        return yield* Effect.fail(new PriceNotFound())
      return row as Price
    }))

  const findPriceRules: PriceServiceImpl['findPriceRules'] = priceId =>
    dbErrSql(Effect.gen(function* () {
      return (yield* db.query.priceRules.findMany({ where: { priceId, deletedAt: { isNull: true } } })) as ReadonlyArray<PriceRule>
    }))

  const updatePrice: PriceServiceImpl['updatePrice'] = (id, version, input) =>
    dbErrSql(db.transaction(tx => Effect.gen(function* () {
      const existing = yield* tx.query.prices.findFirst({ where: { id, deletedAt: { isNull: true } } })
      if (!existing)
        return yield* Effect.fail(new PriceNotFound())
      const [row] = yield* tx.update(pricesTable).set({
        currencyCode: input.currencyCode ?? (existing as Price).currencyCode,
        amount: input.amount ?? (existing as Price).amount,
        minQuantity: input.minQuantity === undefined ? (existing as Price).minQuantity : input.minQuantity,
        maxQuantity: input.maxQuantity === undefined ? (existing as Price).maxQuantity : input.maxQuantity,
        version: sql`${pricesTable.version} + 1`,
        updatedAt: sql`NOW()`,
      }).where(and(eq(pricesTable.id, id), eq(pricesTable.version, version), sql`${pricesTable.deletedAt} IS NULL`)).returning()
      if (!row)
        return yield* Effect.fail(new OptimisticLockError({ entity: 'price', id }))
      if (input.rules !== undefined) {
        yield* tx.update(priceRulesTable).set({ deletedAt: sql`NOW()` })
          .where(and(eq(priceRulesTable.priceId, id), sql`${priceRulesTable.deletedAt} IS NULL`))
        yield* insertRules(tx, id, input.rules)
      }
      return row as Price
    })))

  const softDeletePrice: PriceServiceImpl['softDeletePrice'] = (id, version) =>
    Effect.gen(function* () {
      const existing = yield* findPriceById(id)
      yield* optimisticUpdate({ table: pricesTable, id, version, set: { deletedAt: sql`NOW()` } })
      return existing
    })
```

> **Verify `OptimisticLockError` constructor shape** against `@czo/kit/db` (inventory uses it — match its field names; here assumed `{ entity, id }`). If `optimisticUpdate` is available, you may reuse it instead of the hand-rolled guarded `UPDATE` for the scalar fields — but rule replacement must stay in the SAME transaction, so the inline guarded update above keeps it atomic.

Add the five new methods to the `return PriceService.of({ ... })` object.

- [ ] **Step 5: Run — expect PASS**

```bash
cd packages/modules/price && pnpm test src/services/price.integration.test.ts
```
Expected: 4 passing.

- [ ] **Step 6: Lint, type-check, commit**

```bash
cd packages/modules/price && pnpm lint:fix && pnpm check-types
cd /workspace/c-zo && git add packages/modules/price/src/services
git commit -m "feat(price): price CRUD with operator rules (optimistic-lock rule replace)"
```

---

## Task 7: PriceList CRUD with list rules

**Files:**
- Modify: `packages/modules/price/src/services/price.ts`
- Modify: `packages/modules/price/src/services/price.integration.test.ts`

- [ ] **Step 1: Write failing tests**:

```ts
it.effect('createPriceList with list-rules + status/window', () =>
  Effect.gen(function* () {
    yield* truncatePrice
    const svc = yield* Price.PriceService
    const list = yield* svc.createPriceList({
      organizationId: 1, title: 'Summer Sale', type: 'sale', status: 'active',
      rules: [{ attribute: 'customer_group_id', operator: 'eq', value: 'vip' }],
    })
    expect(list.type).toBe('sale')
    expect(list.status).toBe('active')
    const rules = yield* svc.findPriceListRules(list.id)
    expect(rules.map(r => r.attribute)).toEqual(['customer_group_id'])
  }))

it.effect('updatePriceList flips status + replaces rules under lock', () =>
  Effect.gen(function* () {
    yield* truncatePrice
    const svc = yield* Price.PriceService
    const list = yield* svc.createPriceList({ organizationId: 1, title: 'L', type: 'override' })
    const updated = yield* svc.updatePriceList(list.id, list.version, { status: 'active', rules: [{ attribute: 'region_id', operator: 'in', value: ['eu', 'us'] }] })
    expect(updated.status).toBe('active')
    const rules = yield* svc.findPriceListRules(list.id)
    expect(rules[0]!.operator).toBe('in')
  }))
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/modules/price && pnpm test src/services/price.integration.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Extend the contract**:

```ts
  readonly createPriceList: (input: CreatePriceListInput) => Effect.Effect<PriceList, PriceDbFailed>
  readonly findPriceListById: (id: number) => Effect.Effect<PriceList, PriceListNotFound | PriceDbFailed>
  readonly findPriceLists: (config: Parameters<Database['query']['priceLists']['findMany']>[0]) => Effect.Effect<ReadonlyArray<PriceList>, PriceDbFailed>
  readonly findPriceListRules: (priceListId: number) => Effect.Effect<ReadonlyArray<PriceListRule>, PriceDbFailed>
  readonly updatePriceList: (id: number, version: number, input: UpdatePriceListInput) => Effect.Effect<PriceList, PriceListNotFound | OptimisticLockError | PriceDbFailed>
  readonly softDeletePriceList: (id: number, version: number) => Effect.Effect<PriceList, PriceListNotFound | OptimisticLockError | PriceDbFailed>
```

- [ ] **Step 4: Implement in `make`** (list-rules use a separate insert helper; replacement mirrors prices):

```ts
  const insertListRules = (tx: typeof db, priceListId: number, rules: ReadonlyArray<RuleInput>) =>
    rules.length === 0
      ? Effect.void
      : tx.insert(priceListRulesTable).values(
          rules.map(r => ({ priceListId, attribute: r.attribute, operator: r.operator, value: r.value as unknown })),
        )

  const createPriceList: PriceServiceImpl['createPriceList'] = input =>
    dbErrSql(db.transaction(tx => Effect.gen(function* () {
      const [row] = yield* tx.insert(priceListsTable).values({
        organizationId: input.organizationId,
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        status: input.status ?? 'draft',
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        metadata: input.metadata ?? null,
      }).returning()
      yield* insertListRules(tx, (row as PriceList).id, input.rules ?? [])
      return row as PriceList
    })))

  const findPriceListById: PriceServiceImpl['findPriceListById'] = id =>
    dbErrSql(Effect.gen(function* () {
      const row = yield* db.query.priceLists.findFirst({ where: { id, deletedAt: { isNull: true } } })
      if (!row)
        return yield* Effect.fail(new PriceListNotFound())
      return row as PriceList
    }))

  const findPriceLists: PriceServiceImpl['findPriceLists'] = config =>
    dbErrSql(Effect.gen(function* () {
      return (yield* db.query.priceLists.findMany(config as any)) as ReadonlyArray<PriceList>
    }))

  const findPriceListRules: PriceServiceImpl['findPriceListRules'] = priceListId =>
    dbErrSql(Effect.gen(function* () {
      return (yield* db.query.priceListRules.findMany({ where: { priceListId, deletedAt: { isNull: true } } })) as ReadonlyArray<PriceListRule>
    }))

  const updatePriceList: PriceServiceImpl['updatePriceList'] = (id, version, input) =>
    dbErrSql(db.transaction(tx => Effect.gen(function* () {
      const existing = yield* tx.query.priceLists.findFirst({ where: { id, deletedAt: { isNull: true } } })
      if (!existing)
        return yield* Effect.fail(new PriceListNotFound())
      const e = existing as PriceList
      const [row] = yield* tx.update(priceListsTable).set({
        title: input.title ?? e.title,
        description: input.description === undefined ? e.description : input.description,
        type: input.type ?? e.type,
        status: input.status ?? e.status,
        startsAt: input.startsAt === undefined ? e.startsAt : input.startsAt,
        endsAt: input.endsAt === undefined ? e.endsAt : input.endsAt,
        metadata: input.metadata === undefined ? e.metadata : input.metadata,
        version: sql`${priceListsTable.version} + 1`,
        updatedAt: sql`NOW()`,
      }).where(and(eq(priceListsTable.id, id), eq(priceListsTable.version, version), sql`${priceListsTable.deletedAt} IS NULL`)).returning()
      if (!row)
        return yield* Effect.fail(new OptimisticLockError({ entity: 'priceList', id }))
      if (input.rules !== undefined) {
        yield* tx.update(priceListRulesTable).set({ deletedAt: sql`NOW()` })
          .where(and(eq(priceListRulesTable.priceListId, id), sql`${priceListRulesTable.deletedAt} IS NULL`))
        yield* insertListRules(tx, id, input.rules)
      }
      return row as PriceList
    })))

  const softDeletePriceList: PriceServiceImpl['softDeletePriceList'] = (id, version) =>
    Effect.gen(function* () {
      const existing = yield* findPriceListById(id)
      yield* optimisticUpdate({ table: priceListsTable, id, version, set: { deletedAt: sql`NOW()` } })
      return existing
    })
```

Add all six to the returned object.

- [ ] **Step 5: Run — expect PASS** (6 passing total)

```bash
cd packages/modules/price && pnpm test src/services/price.integration.test.ts
```

- [ ] **Step 6: Lint, type-check, commit**

```bash
cd packages/modules/price && pnpm lint:fix && pnpm check-types
cd /workspace/c-zo && git add packages/modules/price/src/services
git commit -m "feat(price): price-list CRUD with list rules"
```

---

## Task 8: Pure rule evaluation (`resolve.ts`)

**Files:**
- Create: `packages/modules/price/src/services/resolve.ts`
- Create: `packages/modules/price/src/services/resolve.test.ts`

This is the heart of the engine — **pure**, no DB, fully unit-tested.

- [ ] **Step 1: Write failing unit tests** (`resolve.test.ts`, plain vitest):

```ts
import { describe, expect, it } from 'vitest'
import { ruleSatisfied } from './resolve'

const ctx = (pairs: Record<string, string | number>) => new Map<string, string | number>(Object.entries(pairs))

describe('ruleSatisfied', () => {
  it('eq normalizes string/number ("100" === 100)', () => {
    expect(ruleSatisfied({ attribute: 'item_total', operator: 'eq', value: 100 }, ctx({ item_total: '100' }))).toBe(true)
  })
  it('ne true when different, gated on presence', () => {
    expect(ruleSatisfied({ attribute: 'region_id', operator: 'ne', value: 'eu' }, ctx({ region_id: 'us' }))).toBe(true)
    expect(ruleSatisfied({ attribute: 'region_id', operator: 'ne', value: 'eu' }, ctx({}))).toBe(false)
  })
  it('numeric ops coerce; non-numeric ctx ⇒ unsatisfied', () => {
    expect(ruleSatisfied({ attribute: 'item_total', operator: 'gte', value: 100 }, ctx({ item_total: 150 }))).toBe(true)
    expect(ruleSatisfied({ attribute: 'item_total', operator: 'gte', value: 100 }, ctx({ item_total: 'x' }))).toBe(false)
  })
  it('in matches via string-normalized membership', () => {
    expect(ruleSatisfied({ attribute: 'region_id', operator: 'in', value: ['eu', 'us'] }, ctx({ region_id: 'us' }))).toBe(true)
    expect(ruleSatisfied({ attribute: 'region_id', operator: 'in', value: ['eu'] }, ctx({ region_id: 'us' }))).toBe(false)
  })
  it('missing attribute ⇒ unsatisfied (rule gates on the dimension)', () => {
    expect(ruleSatisfied({ attribute: 'region_id', operator: 'eq', value: 'eu' }, ctx({}))).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/modules/price && pnpm test src/services/resolve.test.ts
```
Expected: FAIL (no `resolve.ts`).

- [ ] **Step 3: Implement `resolve.ts`** (this step covers `ruleSatisfied` + `evaluatePrice`; ranking/shaping land in Task 9):

```ts
import type { RuleOperator } from './price'

export type JsonScalar = string | number

export interface EvalRule {
  readonly attribute: string
  readonly operator: RuleOperator
  readonly value: JsonScalar | ReadonlyArray<JsonScalar>
}

/** A rule is satisfied iff the context provides its attribute AND the per-operator comparison holds. */
export function ruleSatisfied(rule: EvalRule, ctx: ReadonlyMap<string, JsonScalar>): boolean {
  if (!ctx.has(rule.attribute))
    return false
  const c = ctx.get(rule.attribute)!
  switch (rule.operator) {
    case 'eq':
      return String(c) === String(rule.value)
    case 'ne':
      return String(c) !== String(rule.value)
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const a = Number(c)
      const b = Number(rule.value as JsonScalar)
      if (Number.isNaN(a) || Number.isNaN(b))
        return false
      return rule.operator === 'gt' ? a > b : rule.operator === 'gte' ? a >= b : rule.operator === 'lt' ? a < b : a <= b
    }
    case 'in':
      return Array.isArray(rule.value) && rule.value.map(String).includes(String(c))
    default:
      return false
  }
}

/** A price with its rules + per-rule priorities. Quantity is handled separately (a column filter). */
export interface CandidateRule extends EvalRule { readonly priority: number }
export interface Candidate {
  readonly priceId: number
  readonly amount: string
  readonly currencyCode: string
  readonly priceListId: number | null
  readonly priceListType: 'sale' | 'override' | null
  readonly rules: ReadonlyArray<CandidateRule>
}

export interface Evaluated {
  readonly candidate: Candidate
  readonly rulesMatched: number
  readonly sumPriority: number
}

/** Returns the evaluated candidate if ALL its rules are satisfied, else null. */
export function evaluatePrice(candidate: Candidate, ctx: ReadonlyMap<string, JsonScalar>): Evaluated | null {
  let sumPriority = 0
  for (const r of candidate.rules) {
    if (!ruleSatisfied(r, ctx))
      return null
    sumPriority += r.priority
  }
  return { candidate, rulesMatched: candidate.rules.length, sumPriority }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd packages/modules/price && pnpm test src/services/resolve.test.ts
```
Expected: 5 passing.

- [ ] **Step 5: Lint, type-check, commit**

```bash
cd packages/modules/price && pnpm lint:fix && pnpm check-types
cd /workspace/c-zo && git add packages/modules/price/src/services/resolve.ts packages/modules/price/src/services/resolve.test.ts
git commit -m "feat(price): pure rule evaluation (operator satisfaction)"
```

---

## Task 9: Pure ranking + calculated-price shaping

**Files:**
- Modify: `packages/modules/price/src/services/resolve.ts`
- Modify: `packages/modules/price/src/services/resolve.test.ts`

- [ ] **Step 1: Write failing tests** (append):

```ts
import { BigDecimal } from 'effect'
import { resolveCalculated } from './resolve'

const cand = (o: Partial<Candidate> & { priceId: number, amount: string }): Candidate => ({
  currencyCode: 'eur', priceListId: null, priceListType: null, rules: [], ...o,
})

describe('resolveCalculated', () => {
  it('null when no candidates', () => {
    expect(resolveCalculated([], new Map())).toBe(null)
  })
  it('Base when only base prices', () => {
    const r = resolveCalculated([cand({ priceId: 1, amount: '20' })], new Map())
    expect(r).toEqual({ _tag: 'Base', amount: '20', currencyCode: 'eur', priceId: 1 })
  })
  it('more specific (more matched rules) wins', () => {
    const ctx = new Map<string, JsonScalar>([['region_id', 'eu']])
    const base = cand({ priceId: 1, amount: '20' })
    const region = cand({ priceId: 2, amount: '18', rules: [{ attribute: 'region_id', operator: 'eq', value: 'eu', priority: 0 }] })
    const r = resolveCalculated([base, region], ctx)
    expect(r?.priceId).toBe(2)
  })
  it('tie broken by Σ priority then lower amount', () => {
    const ctx = new Map<string, JsonScalar>([['a', '1'], ['b', '1']])
    const hi = cand({ priceId: 1, amount: '30', rules: [{ attribute: 'a', operator: 'eq', value: '1', priority: 100 }] })
    const lo = cand({ priceId: 2, amount: '10', rules: [{ attribute: 'b', operator: 'eq', value: '1', priority: 1 }] })
    expect(resolveCalculated([hi, lo], ctx)?.priceId).toBe(1) // Σ priority wins over cheaper
  })
  it('active sale list overrides a more-specific base (Sale with originalAmount)', () => {
    const ctx = new Map<string, JsonScalar>([['region_id', 'eu']])
    const base = cand({ priceId: 1, amount: '20', rules: [{ attribute: 'region_id', operator: 'eq', value: 'eu', priority: 0 }] })
    const sale = cand({ priceId: 2, amount: '15', priceListId: 9, priceListType: 'sale' })
    const r = resolveCalculated([base, sale], ctx)
    expect(r).toEqual({ _tag: 'Sale', amount: '15', originalAmount: '20', currencyCode: 'eur', priceId: 2, priceListId: 9 })
  })
  it('override list → Override (no originalAmount)', () => {
    const ovr = cand({ priceId: 2, amount: '15', priceListId: 9, priceListType: 'override' })
    expect(resolveCalculated([cand({ priceId: 1, amount: '20' }), ovr], new Map())).toEqual({ _tag: 'Override', amount: '15', currencyCode: 'eur', priceId: 2, priceListId: 9 })
  })
  it('sale list with no base price degrades to Override', () => {
    const sale = cand({ priceId: 2, amount: '15', priceListId: 9, priceListType: 'sale' })
    expect(resolveCalculated([sale], new Map())).toEqual({ _tag: 'Override', amount: '15', currencyCode: 'eur', priceId: 2, priceListId: 9 })
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`resolveCalculated` undefined):

```bash
cd packages/modules/price && pnpm test src/services/resolve.test.ts
```

- [ ] **Step 3: Implement** `resolveCalculated` + helpers in `resolve.ts`. Import `BigDecimal` from `effect`. The candidates are already currency-filtered (caller's SQL); ranking + tier-override + shaping are pure:

```ts
import { BigDecimal } from 'effect'
import type { CalculatedPrice } from './price'

/** Total order: rulesMatched DESC, sumPriority DESC, amount ASC (BigDecimal), priceId ASC. Returns the better of (a, b). */
function better(a: Evaluated, b: Evaluated): Evaluated {
  if (a.rulesMatched !== b.rulesMatched)
    return a.rulesMatched > b.rulesMatched ? a : b
  if (a.sumPriority !== b.sumPriority)
    return a.sumPriority > b.sumPriority ? a : b
  const av = BigDecimal.fromStringUnsafe(a.candidate.amount)
  const bv = BigDecimal.fromStringUnsafe(b.candidate.amount)
  if (!BigDecimal.equals(av, bv))
    return BigDecimal.isLessThan(av, bv) ? a : b
  return a.candidate.priceId <= b.candidate.priceId ? a : b
}

function bestOf(evals: ReadonlyArray<Evaluated>): Evaluated | null {
  return evals.reduce<Evaluated | null>((acc, e) => (acc === null ? e : better(acc, e)), null)
}

/**
 * Resolve the calculated price for `candidates` (already currency- + temporally
 * filtered by the caller) against `ctx`. Pure: evaluate rules, partition into
 * tier-1 (price-list) / tier-0 (base), tier-override, rank, shape the union.
 */
export function resolveCalculated(
  candidates: ReadonlyArray<Candidate>,
  ctx: ReadonlyMap<string, JsonScalar>,
): CalculatedPrice | null {
  const applicable = candidates.map(c => evaluatePrice(c, ctx)).filter((e): e is Evaluated => e !== null)
  if (applicable.length === 0)
    return null

  const tier1 = applicable.filter(e => e.candidate.priceListId !== null)
  const tier0 = applicable.filter(e => e.candidate.priceListId === null)

  const winner = tier1.length > 0 ? bestOf(tier1)! : bestOf(tier0)!
  const w = winner.candidate

  // Base price won.
  if (w.priceListId === null)
    return { _tag: 'Base', amount: w.amount, currencyCode: w.currencyCode, priceId: w.priceId }

  // List price won. Sale → surface the best base amount as `originalAmount`.
  if (w.priceListType === 'sale') {
    const base = bestOf(tier0)
    if (base !== null) {
      return { _tag: 'Sale', amount: w.amount, originalAmount: base.candidate.amount, currencyCode: w.currencyCode, priceId: w.priceId, priceListId: w.priceListId }
    }
    // No base to compare against → no markdown to show; degrade to Override.
  }
  return { _tag: 'Override', amount: w.amount, currencyCode: w.currencyCode, priceId: w.priceId, priceListId: w.priceListId }
}
```

- [ ] **Step 4: Run — expect PASS** (12 passing in resolve.test.ts)

```bash
cd packages/modules/price && pnpm test src/services/resolve.test.ts
```

- [ ] **Step 5: Lint, type-check, commit**

```bash
cd packages/modules/price && pnpm lint:fix && pnpm check-types
cd /workspace/c-zo && git add packages/modules/price/src/services/resolve.ts packages/modules/price/src/services/resolve.test.ts
git commit -m "feat(price): pure ranking + calculated-price tagged union"
```

---

## Task 10: `resolvePrice` service method (SQL hydrate + pure core)

**Files:**
- Modify: `packages/modules/price/src/services/price.ts`
- Modify: `packages/modules/price/src/services/price.integration.test.ts`

- [ ] **Step 1: Write failing integration tests** (the engine end-to-end; includes `TestClock` for windows):

```ts
import { DateTime, TestClock } from 'effect'

// helper inside the layer block:
const ctxAttr = (attribute: string, value: string | number) => ({ attribute, value })

it.effect('resolvePrice picks region-specific over base; tiers by quantity', () =>
  Effect.gen(function* () {
    yield* truncatePrice
    const svc = yield* Price.PriceService
    const set = yield* svc.createPriceSet({ organizationId: 1 })
    yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '20' })
    yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '18', rules: [{ attribute: 'region_id', operator: 'eq', value: 'eu' }] })
    yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '15', minQuantity: 10 })

    const r1 = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', attributes: [ctxAttr('region_id', 'eu')] })
    expect(r1).toEqual({ _tag: 'Base', amount: '18', currencyCode: 'eur', priceId: expect.any(Number) })

    const r2 = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', quantity: 12 })
    expect(r2?.amount).toBe('15')

    const none = yield* svc.resolvePrice(1, set.id, { currencyCode: 'usd' })
    expect(none).toBe(null)
  }))

it.effect('resolvePrice returns null for a foreign org (H1 cross-tenant guard)', () =>
  Effect.gen(function* () {
    yield* truncatePrice
    const svc = yield* Price.PriceService
    const set = yield* svc.createPriceSet({ organizationId: 1 })
    yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '9' })
    const r = yield* svc.resolvePrice(2, set.id, { currencyCode: 'eur' }) // org 2 ≠ set.org 1
    expect(r).toBe(null)
  }))

it.effect('active sale list overrides base within its window (TestClock)', () =>
  Effect.gen(function* () {
    yield* truncatePrice
    const svc = yield* Price.PriceService
    const set = yield* svc.createPriceSet({ organizationId: 1 })
    yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '20' })
    const start = new Date('2026-06-01T00:00:00Z')
    const end = new Date('2026-06-30T00:00:00Z')
    const list = yield* svc.createPriceList({ organizationId: 1, title: 'June', type: 'sale', status: 'active', startsAt: start, endsAt: end })
    yield* svc.createPrice({ priceSetId: set.id, priceListId: list.id, currencyCode: 'eur', amount: '15' })

    yield* TestClock.setTime(new Date('2026-06-15T00:00:00Z').getTime())
    const inside = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', at: yield* DateTime.now.pipe(Effect.map(DateTime.toDate)) })
    expect(inside).toEqual({ _tag: 'Sale', amount: '15', originalAmount: '20', currencyCode: 'eur', priceId: expect.any(Number), priceListId: list.id })

    const before = yield* svc.resolvePrice(1, set.id, { currencyCode: 'eur', at: new Date('2026-05-01T00:00:00Z') })
    expect(before?._tag).toBe('Base')
  }))
```

> The `at` arg is supplied explicitly by the test; the service defaults `at` to `DateTime.now`/`new Date()` only when omitted. Using an explicit `at` keeps the SQL temporal gate deterministic without depending on `TestClock` reaching the DB.

- [ ] **Step 2: Run — expect FAIL** (`resolvePrice` undefined)

```bash
cd packages/modules/price && pnpm test src/services/price.integration.test.ts
```

- [ ] **Step 3: Add to the contract**:

```ts
  readonly resolvePrice: (
    organizationId: number,
    priceSetId: number,
    context: PriceContext,
  ) => Effect.Effect<CalculatedPrice | null, PriceDbFailed>
```

- [ ] **Step 4: Implement** in `make`. Import the pure core + the schema tables; build the candidate list with one query (set + currency + temporal gate), map to `Candidate`, run `resolveCalculated`. Add at top of `price.ts`:

```ts
import type { Candidate, JsonScalar as ResolveScalar } from './resolve'
import { resolveCalculated } from './resolve'
```

Method body:

```ts
  const resolvePrice: PriceServiceImpl['resolvePrice'] = (organizationId, priceSetId, context) =>
    dbErrSql(Effect.gen(function* () {
      const at = context.at ?? new Date()
      const qty = context.quantity ?? 1

      // Org guard (H1): the set must exist, be live, and belong to the caller's org.
      const set = yield* db.query.priceSets.findFirst({ where: { id: priceSetId, organizationId, deletedAt: { isNull: true } } })
      if (!set)
        return null

      // Indexed cut: this set, this currency, live; list prices only from lists
      // that pass the temporal/status gate (rules evaluated in-memory below).
      const rows = yield* db.query.prices.findMany({
        where: {
          priceSetId,
          currencyCode: context.currencyCode,
          deletedAt: { isNull: true },
          // quantity tier filter (NULL bounds open)
          AND: [
            { OR: [{ minQuantity: { isNull: true } }, { minQuantity: { lte: qty } }] },
            { OR: [{ maxQuantity: { isNull: true } }, { maxQuantity: { gte: qty } }] },
          ],
        },
        with: {
          rules: { where: { deletedAt: { isNull: true } } },
          priceList: { with: { rules: { where: { deletedAt: { isNull: true } } } } },
        },
      }) as Array<Price & {
        rules: PriceRule[]
        priceList: (PriceList & { rules: PriceListRule[] }) | null
      }>

      // Build context map (quantity is NOT a rule attribute — it filtered above).
      const ctx = new Map<string, ResolveScalar>(
        (context.attributes ?? []).map(a => [a.attribute, a.value]),
      )

      const candidates: Candidate[] = []
      for (const p of rows) {
        // Temporal/status + list-rule gate (the SQL above did not push these).
        if (p.priceListId !== null) {
          const list = p.priceList
          if (!list || list.status !== 'active')
            continue
          if (list.startsAt !== null && at < list.startsAt)
            continue
          if (list.endsAt !== null && at > list.endsAt)
            continue
          const listRulesOk = list.rules.every(r => ruleSatisfied({ attribute: r.attribute, operator: r.operator, value: r.value as RuleValue }, ctx))
          if (!listRulesOk)
            continue
        }
        candidates.push({
          priceId: p.id,
          amount: p.amount,
          currencyCode: p.currencyCode,
          priceListId: p.priceListId,
          priceListType: p.priceList?.type ?? null,
          rules: p.rules.map(r => ({ attribute: r.attribute, operator: r.operator, value: r.value as RuleValue, priority: r.priority })),
        })
      }

      return resolveCalculated(candidates, ctx)
    }))
```

Import `ruleSatisfied` too (`import { resolveCalculated, ruleSatisfied } from './resolve'`). Add `resolvePrice` to the returned object.

> **RQBv2 note:** if the nested `with: { priceList: { with: { rules } } }` filter form differs in this Drizzle version, fall back to fetching list metadata via a second `findMany` over `priceLists` for the distinct `priceListId`s in `rows` and join in memory — the candidate set is tiny. Prefer the single-query form if it type-checks. The temporal/status gate is applied in-memory here for clarity; pushing `status='active'`/window into the SQL `where` (per spec M1) is a valid optimization once the base form is green — keep behavior identical.

- [ ] **Step 5: Run — expect PASS**

```bash
cd packages/modules/price && pnpm test src/services/price.integration.test.ts
```
Expected: all passing (9 total).

- [ ] **Step 6: Lint, type-check, commit**

```bash
cd packages/modules/price && pnpm lint:fix && pnpm check-types
cd /workspace/c-zo && git add packages/modules/price/src/services
git commit -m "feat(price): resolvePrice — SQL hydrate + pure resolver, org-scoped"
```

---

## Task 11: Mutation-boundary rule validation

**Files:**
- Create: `packages/modules/price/src/services/validation.ts`
- Modify: `packages/modules/price/src/services/resolve.test.ts` (add validation unit tests) — or a dedicated `validation.test.ts`

- [ ] **Step 1: Write failing tests** (`validation.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { validateRuleInput } from './validation'

describe('validateRuleInput', () => {
  it('numeric op requires a number', () => {
    expect(validateRuleInput({ attribute: 'item_total', operator: 'gte', value: 100 }).ok).toBe(true)
    expect(validateRuleInput({ attribute: 'item_total', operator: 'gte', value: 'x' }).ok).toBe(false)
  })
  it('in requires a non-empty array', () => {
    expect(validateRuleInput({ attribute: 'r', operator: 'in', value: ['a', 'b'] }).ok).toBe(true)
    expect(validateRuleInput({ attribute: 'r', operator: 'in', value: [] }).ok).toBe(false)
    expect(validateRuleInput({ attribute: 'r', operator: 'in', value: 'a' }).ok).toBe(false)
  })
  it('eq/ne accept string or number, not array', () => {
    expect(validateRuleInput({ attribute: 'r', operator: 'eq', value: 'eu' }).ok).toBe(true)
    expect(validateRuleInput({ attribute: 'r', operator: 'eq', value: ['eu'] }).ok).toBe(false)
  })
  it('reserved attribute "quantity" is rejected (column-only)', () => {
    expect(validateRuleInput({ attribute: 'quantity', operator: 'gte', value: 1 }).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/modules/price && pnpm test src/services/validation.test.ts
```

- [ ] **Step 3: Implement `validation.ts`**:

```ts
import type { RuleInput } from './price'

export type ValidationResult = { ok: true } | { ok: false, reason: string }

const NUMERIC: ReadonlyArray<string> = ['gt', 'gte', 'lt', 'lte']

/** Enforce operator↔value coherence + the reserved `quantity` attribute (spec). */
export function validateRuleInput(rule: RuleInput): ValidationResult {
  if (rule.attribute === 'quantity')
    return { ok: false, reason: '`quantity` is reserved to min/max columns, not a rule' }
  if (rule.attribute.trim() === '')
    return { ok: false, reason: 'attribute must be non-empty' }

  if (rule.operator === 'in') {
    if (!Array.isArray(rule.value) || rule.value.length === 0)
      return { ok: false, reason: '`in` requires a non-empty array' }
    return { ok: true }
  }
  if (Array.isArray(rule.value))
    return { ok: false, reason: `operator '${rule.operator}' does not accept an array` }
  if (NUMERIC.includes(rule.operator) && typeof rule.value !== 'number')
    return { ok: false, reason: `operator '${rule.operator}' requires a number` }
  return { ok: true }
}
```

- [ ] **Step 4: Wire validation into `createPrice`/`updatePrice`/`createPriceList`/`updatePriceList`** in `price.ts` — before any DB work, validate every rule and fail `InvalidPriceRule` on the first bad one. Add this helper in `make` and call it at the top of each mutating method that takes `rules`:

```ts
  const validateRules = (rules: ReadonlyArray<RuleInput> | undefined) =>
    Effect.gen(function* () {
      for (const r of rules ?? []) {
        const res = validateRuleInput(r)
        if (!res.ok)
          return yield* Effect.fail(new InvalidPriceRule({ attribute: r.attribute, reason: res.reason }))
      }
    })
```

Insert `yield* validateRules(input.rules)` as the first statement inside `createPrice`, `updatePrice`, `createPriceList`, `updatePriceList` generators. Add `InvalidPriceRule` to those methods' error unions in the contract (createPrice/createPriceList/updatePrice/updatePriceList return types gain `| InvalidPriceRule`). Import: `import { validateRuleInput } from './validation'`.

- [ ] **Step 5: Add a service test** that a bad rule is rejected (append to `price.integration.test.ts`):

```ts
it.effect('createPrice rejects an incoherent rule (InvalidPriceRule)', () =>
  Effect.gen(function* () {
    yield* truncatePrice
    const svc = yield* Price.PriceService
    const set = yield* svc.createPriceSet({ organizationId: 1 })
    const err = yield* svc.createPrice({ priceSetId: set.id, currencyCode: 'eur', amount: '1', rules: [{ attribute: 'item_total', operator: 'gte', value: 'x' as unknown as number }] }).pipe(Effect.flip)
    expect(err._tag).toBe('InvalidPriceRule')
  }))
```

- [ ] **Step 6: Run both test files — expect PASS**

```bash
cd packages/modules/price && pnpm test src/services
```

- [ ] **Step 7: Lint, type-check, commit**

```bash
cd packages/modules/price && pnpm lint:fix && pnpm check-types
cd /workspace/c-zo && git add packages/modules/price/src/services
git commit -m "feat(price): operator↔value validation + reserved quantity attribute"
```

---

## Task 12: GraphQL builder augmentation, node-guards, schema fan-out

**Files:**
- Create: `packages/modules/price/src/graphql/index.ts`
- Create: `packages/modules/price/src/graphql/node-guards.ts`
- Create: `packages/modules/price/src/graphql/schema/index.ts`

- [ ] **Step 1: Write `graphql/index.ts`** (augment the kit builder with this module's inputs/objects; import auth's graphql augmentation for cross-module refs + the `permission` scope):

```ts
import type { Relations } from '@czo/price/relations'
import type { DateTimeFilter, IntFilter, OrderByInput, SchemaBuilder, StringFilter } from '@czo/kit/graphql'
import type { Price, PriceList, PriceSet } from '../services/price'
import '@czo/auth/graphql'

export { priceNodeGuards } from './node-guards'
export { type PriceBuilder, registerPriceSchema } from './schema'

export type PriceGraphQLSchemaBuilder = SchemaBuilder<Relations>

export interface PriceSetWhereInput {
  organizationId?: IntFilter
  createdAt?: DateTimeFilter
  AND?: PriceSetWhereInput[] | null
  OR?: PriceSetWhereInput[] | null
  NOT?: PriceSetWhereInput | null
}
export interface PriceListWhereInput {
  organizationId?: IntFilter
  title?: StringFilter
  createdAt?: DateTimeFilter
  AND?: PriceListWhereInput[] | null
  OR?: PriceListWhereInput[] | null
  NOT?: PriceListWhereInput | null
}

declare module '@czo/kit/graphql' {
  interface BuilderSchemaInputs {
    PriceSetWhereInput: PriceSetWhereInput
    PriceSetOrderByInput: OrderByInput<'createdAt'>
    PriceListWhereInput: PriceListWhereInput
    PriceListOrderByInput: OrderByInput<'title' | 'createdAt'>
  }
  interface BuilderSchemaObjects {
    PriceSet: PriceSet
    Price: Price
    PriceList: PriceList
  }
  interface SchemaBuilderRefs {}
}
```

- [ ] **Step 2: Write `node-guards.ts`** — all three nodes gate on `price:read`:

```ts
import type { NodeGuard } from '@czo/kit/graphql'

const priceReadGuard: NodeGuard = (row: { organizationId: number }) => ({
  permission: { resource: 'price', actions: ['read'], organization: row.organizationId },
})

export const priceNodeGuards: Record<string, NodeGuard> = {
  PriceSet: priceReadGuard,
  Price: priceReadGuard,
  PriceList: priceReadGuard,
}
```

- [ ] **Step 3: Write `schema/index.ts`** (fan-out; sub-registrars created in Tasks 13–16):

```ts
import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { registerPriceErrors } from './price/errors'
import { registerPriceInputs } from './price/inputs'
import { registerPriceMutations } from './price/mutations'
import { registerPriceQueries } from './price/queries'
import { registerPriceTypes } from './price/types'

export type PriceBuilder = PriceGraphQLSchemaBuilder

export function registerPriceSchema(builder: PriceBuilder): void {
  registerPriceTypes(builder)
  registerPriceErrors(builder)
  registerPriceInputs(builder)
  registerPriceQueries(builder)
  registerPriceMutations(builder)
}
```

- [ ] **Step 4: Type-check will FAIL** until Tasks 13–16 exist — that's expected; do NOT commit a broken state. Instead, create empty stub registrars now so the module compiles, then fill them:

Create `src/graphql/schema/price/{types,errors,inputs,queries,mutations/index}.ts` each exporting a no-op `export function registerPriceX(_builder: PriceBuilder): void {}` (mutations/index re-exports `registerPriceMutations`). This lets Task 12 compile and commit; Tasks 13–16 replace each body.

- [ ] **Step 5: Type-check + commit**

```bash
cd packages/modules/price && pnpm check-types && pnpm lint:fix
cd /workspace/c-zo && git add packages/modules/price/src/graphql
git commit -m "feat(price): graphql builder augmentation + node-guards + schema fan-out stubs"
```

---

## Task 13: GraphQL types — nodes, rules-as-list, CalculatedPrice union, errors

**Files:**
- Modify: `packages/modules/price/src/graphql/schema/price/types.ts`
- Modify: `packages/modules/price/src/graphql/schema/price/errors.ts`

- [ ] **Step 1: Write `types.ts`** — 3 drizzleNodes (`select: true`), `amount` as `String`, rules as **plain list fields** (M2), `prices` relay connections, and the `CalculatedPrice` union refs (used by the resolver query in Task 15):

```ts
import type { CalculatedPrice } from '../../../services/price'
import type { PriceGraphQLSchemaBuilder } from '../..'

export function registerPriceTypes(builder: PriceGraphQLSchemaBuilder): void {
  // ── PriceRule / PriceListRule object refs (plain — value-objects) ──────────
  const PriceRuleRef = builder.objectRef<{ id: number, attribute: string, operator: string, value: unknown, priority: number }>('PriceRule').implement({
    fields: t => ({
      id: t.exposeInt('id'),
      attribute: t.exposeString('attribute'),
      operator: t.exposeString('operator'),
      priority: t.exposeInt('priority'),
      value: t.field({ type: 'JSON', resolve: r => r.value }),
    }),
  })
  const PriceListRuleRef = builder.objectRef<{ id: number, attribute: string, operator: string, value: unknown }>('PriceListRule').implement({
    fields: t => ({
      id: t.exposeInt('id'),
      attribute: t.exposeString('attribute'),
      operator: t.exposeString('operator'),
      value: t.field({ type: 'JSON', resolve: r => r.value }),
    }),
  })

  // ── PriceSet node ──────────────────────────────────────────────────────────
  builder.drizzleNode('priceSets', {
    name: 'PriceSet',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      metadata: t.field({ type: 'JSONObject', nullable: true, resolve: s => s.metadata as Record<string, unknown> | null }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
      version: t.exposeInt('version'),
      organization: t.relation('organization'),
      prices: t.relatedConnection('prices', {
        authScopes: parent => ({ permission: { resource: 'price', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
    }),
  })

  // ── Price node ───────────────────────────────────────────────────────────────
  builder.drizzleNode('prices', {
    name: 'Price',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      currencyCode: t.exposeString('currencyCode'),
      amount: t.exposeString('amount'), // numeric → string (BigDecimal-safe)
      minQuantity: t.exposeInt('minQuantity', { nullable: true }),
      maxQuantity: t.exposeInt('maxQuantity', { nullable: true }),
      version: t.exposeInt('version'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
      organization: t.relation('organization'),
      priceSet: t.relation('priceSet'),
      priceList: t.relation('priceList', { nullable: true }),
      rules: t.field({
        type: [PriceRuleRef],
        resolve: (price, _args, ctx) => ctx.runEffect(loadPriceRules(price.id)),
      }),
    }),
  })

  // ── PriceList node ──────────────────────────────────────────────────────────
  builder.drizzleNode('priceLists', {
    name: 'PriceList',
    select: true,
    id: { column: c => c.id },
    fields: t => ({
      title: t.exposeString('title'),
      description: t.exposeString('description', { nullable: true }),
      type: t.exposeString('type'),
      status: t.exposeString('status'),
      startsAt: t.expose('startsAt', { type: 'DateTime', nullable: true }),
      endsAt: t.expose('endsAt', { type: 'DateTime', nullable: true }),
      version: t.exposeInt('version'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
      organization: t.relation('organization'),
      prices: t.relatedConnection('prices', {
        authScopes: parent => ({ permission: { resource: 'price', actions: ['read'], organization: parent.organizationId } }),
        query: () => ({ where: { deletedAt: { isNull: true } } }),
      }),
      rules: t.field({
        type: [PriceListRuleRef],
        resolve: (list, _args, ctx) => ctx.runEffect(loadListRules(list.id)),
      }),
    }),
  })

  // ── CalculatedPrice union (resolver output) ──────────────────────────────────
  const BasePriceRef = builder.objectRef<Extract<CalculatedPrice, { _tag: 'Base' }>>('BasePrice').implement({
    fields: t => ({
      amount: t.exposeString('amount'),
      currencyCode: t.exposeString('currencyCode'),
      priceId: t.exposeInt('priceId'),
    }),
  })
  const OverridePriceRef = builder.objectRef<Extract<CalculatedPrice, { _tag: 'Override' }>>('OverridePrice').implement({
    fields: t => ({
      amount: t.exposeString('amount'),
      currencyCode: t.exposeString('currencyCode'),
      priceId: t.exposeInt('priceId'),
      priceListId: t.exposeInt('priceListId'),
    }),
  })
  const SalePriceRef = builder.objectRef<Extract<CalculatedPrice, { _tag: 'Sale' }>>('SalePrice').implement({
    fields: t => ({
      amount: t.exposeString('amount'),
      originalAmount: t.exposeString('originalAmount'),
      currencyCode: t.exposeString('currencyCode'),
      priceId: t.exposeInt('priceId'),
      priceListId: t.exposeInt('priceListId'),
    }),
  })
  builder.unionType('CalculatedPrice', {
    types: [BasePriceRef, OverridePriceRef, SalePriceRef],
    resolveType: v => (v._tag === 'Base' ? 'BasePrice' : v._tag === 'Override' ? 'OverridePrice' : 'SalePrice'),
  })
}
```

`loadPriceRules` / `loadListRules` are thin Effect helpers — add them to `authz.ts` in Task 15, or inline here as:

```ts
import { Effect } from 'effect'
import { PriceService } from '../../../services/price'
const loadPriceRules = (priceId: number) => Effect.gen(function* () { return yield* (yield* PriceService).findPriceRules(priceId) })
const loadListRules = (listId: number) => Effect.gen(function* () { return yield* (yield* PriceService).findPriceListRules(listId) })
```

> **`JSON` vs `JSONObject` scalar:** rule `value` can be a scalar or array, so use the `JSON` scalar (any JSON), not `JSONObject`. Confirm `JSON` is registered in the kit builder (attribute module registers `JSONObject`; check `packages/kit/src/graphql` for a `JSON` scalar — if only `JSONObject` exists, register a `JSON` scalar in `inputs.ts` Task 14 via `builder.addScalarType('JSON', GraphQLJSON, {})` or expose value as `String` of `JSON.stringify`). Pick whichever the codebase already supports; do not invent a scalar that fails to resolve.

- [ ] **Step 2: Write `errors.ts`** — register every tagged error:

```ts
import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { registerError } from '@czo/kit/graphql'
import { InvalidPriceRule, PriceListNotFound, PriceNotFound, PriceSetNotFound } from '../../../services/price'

export { InvalidPriceRule, PriceListNotFound, PriceNotFound, PriceSetNotFound }

export function registerPriceErrors(builder: PriceGraphQLSchemaBuilder): void {
  registerError(builder, PriceSetNotFound, { name: 'PriceSetNotFoundError' })
  registerError(builder, PriceNotFound, { name: 'PriceNotFoundError' })
  registerError(builder, PriceListNotFound, { name: 'PriceListNotFoundError' })
  registerError(builder, InvalidPriceRule, {
    name: 'InvalidPriceRuleError',
    fields: t => ({ attribute: t.exposeString('attribute') }),
  })
}
```

- [ ] **Step 3: Type-check + commit**

```bash
cd packages/modules/price && pnpm check-types && pnpm lint:fix
cd /workspace/c-zo && git add packages/modules/price/src/graphql/schema/price/types.ts packages/modules/price/src/graphql/schema/price/errors.ts
git commit -m "feat(price): graphql nodes, rules-as-list, CalculatedPrice union, errors"
```

---

## Task 14: GraphQL inputs (operator enum, rule + context inputs, where/orderBy)

**Files:**
- Modify: `packages/modules/price/src/graphql/schema/price/inputs.ts`

- [ ] **Step 1: Write `inputs.ts`** — mirror inventory's where/orderBy pattern, plus the operator enum, `PriceRuleInput`, and `PriceContextRuleInput`:

```ts
import type { PriceGraphQLSchemaBuilder, PriceListWhereInput, PriceSetWhereInput } from '@czo/price/graphql'
import { z } from 'zod'

export function registerPriceInputs(builder: PriceGraphQLSchemaBuilder): void {
  // Operator enum (shared by rule + list-rule inputs).
  const RuleOperatorRef = builder.enumType('PriceRuleOperator', {
    values: { EQ: { value: 'eq' }, NE: { value: 'ne' }, GT: { value: 'gt' }, GTE: { value: 'gte' }, LT: { value: 'lt' }, LTE: { value: 'lte' }, IN: { value: 'in' } } as const,
  })

  // Rule input: { attribute, operator, value } — value is JSON (scalar | array).
  builder.inputType('PriceRuleInput', {
    fields: t => ({
      attribute: t.string({ required: true, validate: z.string().min(1).max(128) }),
      operator: t.field({ type: RuleOperatorRef, required: true }),
      value: t.field({ type: 'JSON', required: true }),
    }),
  })

  // Buying-context attribute: { attribute, value } — no operator (operators live on rules).
  builder.inputType('PriceContextRuleInput', {
    fields: t => ({
      attribute: t.string({ required: true }),
      value: t.field({ type: 'JSON', required: true }),
    }),
  })

  // PriceSet where/orderBy
  const PriceSetWhereRef = builder.inputRef<PriceSetWhereInput>('PriceSetWhereInput').implement({
    fields: t => ({
      organizationId: t.field({ type: 'IntFilterInput' }),
      createdAt: t.field({ type: 'DateTimeFilterInput' }),
      AND: t.field({ type: [PriceSetWhereRef] }),
      OR: t.field({ type: [PriceSetWhereRef] }),
      NOT: t.field({ type: PriceSetWhereRef }),
    }),
  })
  const PriceSetOrderFieldRef = builder.enumType('PriceSetOrderField', { values: { CREATED_AT: { value: 'createdAt' } } as const })
  const PriceSetOrderDirRef = builder.enumType('PriceSetOrderDirection', { values: { ASC: { value: 'asc' }, DESC: { value: 'desc' } } as const })
  builder.inputType('PriceSetOrderByInput', {
    fields: t => ({
      field: t.field({ type: PriceSetOrderFieldRef, required: true }),
      direction: t.field({ type: PriceSetOrderDirRef, required: true }),
    }),
  })

  // PriceList where/orderBy
  const PriceListWhereRef = builder.inputRef<PriceListWhereInput>('PriceListWhereInput').implement({
    fields: t => ({
      organizationId: t.field({ type: 'IntFilterInput' }),
      title: t.field({ type: 'StringFilterInput' }),
      createdAt: t.field({ type: 'DateTimeFilterInput' }),
      AND: t.field({ type: [PriceListWhereRef] }),
      OR: t.field({ type: [PriceListWhereRef] }),
      NOT: t.field({ type: PriceListWhereRef }),
    }),
  })
  const PriceListOrderFieldRef = builder.enumType('PriceListOrderField', { values: { TITLE: { value: 'title' }, CREATED_AT: { value: 'createdAt' } } as const })
  const PriceListOrderDirRef = builder.enumType('PriceListOrderDirection', { values: { ASC: { value: 'asc' }, DESC: { value: 'desc' } } as const })
  builder.inputType('PriceListOrderByInput', {
    fields: t => ({
      field: t.field({ type: PriceListOrderFieldRef, required: true }),
      direction: t.field({ type: PriceListOrderDirRef, required: true }),
    }),
  })
}
```

> **`JSON` scalar:** same caveat as Task 13. If the kit builder lacks a `JSON` scalar, register it here once (top of `registerPriceInputs`) so both rule `value` fields and the `PriceRule.value` output resolve. Verify with `grep -rn "addScalarType\|JSONObject\|'JSON'" packages/kit/src/graphql` before choosing.

- [ ] **Step 2: Type-check + commit**

```bash
cd packages/modules/price && pnpm check-types && pnpm lint:fix
cd /workspace/c-zo && git add packages/modules/price/src/graphql/schema/price/inputs.ts
git commit -m "feat(price): graphql inputs — operator enum, rule + context inputs, where/orderBy"
```

---

## Task 15: GraphQL queries + authz loaders

**Files:**
- Create/Modify: `packages/modules/price/src/graphql/schema/price/authz.ts`
- Modify: `packages/modules/price/src/graphql/schema/price/queries.ts`

- [ ] **Step 1: Write `authz.ts`** — per-entity org loaders (mirror inventory):

```ts
import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { PriceService } from '../../../services/price'

export function loadPriceSetOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(Effect.gen(function* () {
    const svc = yield* PriceService
    const row = yield* svc.findPriceSetById(id).pipe(Effect.catchTag('PriceSetNotFound', () => Effect.succeed(null)))
    return row?.organizationId ?? null
  }))
}
export function loadPriceListOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(Effect.gen(function* () {
    const svc = yield* PriceService
    const row = yield* svc.findPriceListById(id).pipe(Effect.catchTag('PriceListNotFound', () => Effect.succeed(null)))
    return row?.organizationId ?? null
  }))
}
export function loadPriceOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(Effect.gen(function* () {
    const svc = yield* PriceService
    const row = yield* svc.findPriceById(id).pipe(Effect.catchTag('PriceNotFound', () => Effect.succeed(null)))
    return row?.organizationId ?? null
  }))
}
```

- [ ] **Step 2: Write `queries.ts`** — `priceSet`/`priceSets`/`priceList`/`priceLists` (admin, `price:read`, org-scoped) + **`resolvePrice` (public, org-scoped — no `authScopes`)**:

```ts
import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { Effect } from 'effect'
import { PriceService } from '../../../services/price'
import { loadPriceListOrganizationId, loadPriceSetOrganizationId } from './authz'

export function registerPriceQueries(builder: PriceGraphQLSchemaBuilder): void {
  builder.queryField('priceSet', t =>
    t.drizzleField({
      type: 'priceSets',
      nullable: true,
      args: { id: t.arg.globalID({ for: 'PriceSet', required: true }) },
      authScopes: async (_p, args, ctx) => {
        const organization = await loadPriceSetOrganizationId(ctx, Number(args.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['read'], organization } }
      },
      resolve: async (query, _r, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* PriceService
          return yield* svc.findPriceSet(query({ where: { id: Number(args.id.id) } }))
        }).pipe(Effect.catchTag('PriceSetNotFound', () => Effect.succeed(null)))),
    }))

  builder.queryField('priceSets', t =>
    t.drizzleConnection({
      type: 'priceSets',
      authScopes: (_p, args) => ({ permission: { resource: 'price', actions: ['read'], organization: Number(args.organizationId.id) } }),
      args: { organizationId: t.arg.globalID({ for: 'Organization', required: true }) },
      resolve: async (query, _r, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* PriceService
          return yield* svc.findPriceSets(query({ where: { organizationId: Number(args.organizationId.id), deletedAt: { isNull: true } } }))
        })) as Promise<any>,
    }))

  builder.queryField('priceList', t =>
    t.drizzleField({
      type: 'priceLists',
      nullable: true,
      args: { id: t.arg.globalID({ for: 'PriceList', required: true }) },
      authScopes: async (_p, args, ctx) => {
        const organization = await loadPriceListOrganizationId(ctx, Number(args.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['read'], organization } }
      },
      resolve: async (query, _r, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* PriceService
          return yield* svc.findPriceList(query({ where: { id: Number(args.id.id) } }))
        }).pipe(Effect.catchTag('PriceListNotFound', () => Effect.succeed(null)))),
    }))

  builder.queryField('priceLists', t =>
    t.drizzleConnection({
      type: 'priceLists',
      authScopes: (_p, args) => ({ permission: { resource: 'price', actions: ['read'], organization: Number(args.organizationId.id) } }),
      args: { organizationId: t.arg.globalID({ for: 'Organization', required: true }) },
      resolve: async (query, _r, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* PriceService
          return yield* svc.findPriceLists(query({ where: { organizationId: Number(args.organizationId.id), deletedAt: { isNull: true } } }))
        })) as Promise<any>,
    }))

  // ── resolvePrice — PUBLIC + org-scoped (no authScopes → scope-auth leaves it open) ──
  builder.queryField('resolvePrice', t =>
    t.field({
      type: 'CalculatedPrice',
      nullable: true,
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true }),
        priceSetId: t.arg.globalID({ for: 'PriceSet', required: true }),
        currencyCode: t.arg.string({ required: true }),
        quantity: t.arg.int(),
        at: t.arg({ type: 'DateTime' }),
        attributes: t.arg({ type: ['PriceContextRuleInput'] }),
      },
      resolve: async (_r, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* PriceService
          return yield* svc.resolvePrice(Number(args.organizationId.id), Number(args.priceSetId.id), {
            currencyCode: args.currencyCode,
            quantity: args.quantity ?? undefined,
            at: args.at ?? undefined,
            attributes: (args.attributes ?? []).map(a => ({ attribute: a.attribute, value: a.value as string | number })),
          })
        })),
    }))
}
```

> **Public field check:** the kit builder's `scopeAuth` only enforces scopes a field *declares*; a field with no `authScopes` is unrestricted. `resolvePrice` deliberately omits `authScopes` and enforces the tenant boundary inside the service (returns `null` on org mismatch — H1). Verify in the E2E (Task 17) that an **unauthenticated** `resolvePrice` succeeds and a **wrong-org** one returns `null`.

- [ ] **Step 3: Type-check + commit**

```bash
cd packages/modules/price && pnpm check-types && pnpm lint:fix
cd /workspace/c-zo && git add packages/modules/price/src/graphql/schema/price/authz.ts packages/modules/price/src/graphql/schema/price/queries.ts
git commit -m "feat(price): graphql queries + public org-scoped resolvePrice"
```

---

## Task 16: GraphQL mutations

**Files:**
- Create: `packages/modules/price/src/graphql/schema/price/mutations/priceSet.ts`
- Create: `packages/modules/price/src/graphql/schema/price/mutations/price.ts`
- Create: `packages/modules/price/src/graphql/schema/price/mutations/priceList.ts`
- Modify: `packages/modules/price/src/graphql/schema/price/mutations/index.ts`

Mirror inventory's `relayMutationField` shape exactly. Rule lists are passed through `PriceRuleInput`. Each mutating field resolves the org for `permission` (create: from `organizationId` arg; update/delete: via the `load*OrganizationId` loader → `{ auth: true }` when unknown).

- [ ] **Step 1: Write `mutations/index.ts`**:

```ts
import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { registerPriceListMutations } from './priceList'
import { registerPriceMutationsInner } from './price'
import { registerPriceSetMutations } from './priceSet'

export function registerPriceMutations(builder: PriceGraphQLSchemaBuilder): void {
  registerPriceSetMutations(builder)
  registerPriceMutationsInner(builder)
  registerPriceListMutations(builder)
}
```

- [ ] **Step 2: Write `priceSet.ts`** (create/delete):

```ts
import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import { PriceService } from '../../../../services/price'
import { loadPriceSetOrganizationId } from '../authz'
import { PriceSetNotFound } from '../errors'

export function registerPriceSetMutations(builder: PriceGraphQLSchemaBuilder): void {
  builder.relayMutationField('createPriceSet',
    { inputFields: t => ({ organizationId: t.globalID({ for: 'Organization', required: true }), metadata: t.field({ type: 'JSONObject' }) }) },
    {
      authScopes: (_p, args) => ({ permission: { resource: 'price', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_r, args, ctx) => {
        const set = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* PriceService
          return yield* svc.createPriceSet({ organizationId: Number(args.input.organizationId.id), metadata: args.input.metadata })
        }))
        return { set }
      },
    },
    { outputFields: t => ({ priceSet: t.field({ type: 'PriceSet', resolve: p => p.set }) }) },
  )

  builder.relayMutationField('deletePriceSet',
    { inputFields: t => ({ id: t.globalID({ for: 'PriceSet', required: true }), version: t.int({ required: true }) }) },
    {
      errors: { types: [PriceSetNotFound, OptimisticLockError] },
      authScopes: async (_p, args, ctx) => {
        const organization = await loadPriceSetOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['delete'], organization } }
      },
      resolve: async (_r, args, ctx) => {
        const set = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* PriceService
          return yield* svc.softDeletePriceSet(Number(args.input.id.id), args.input.version)
        }))
        return { set }
      },
    },
    { outputFields: t => ({ priceSet: t.field({ type: 'PriceSet', resolve: p => p.set }) }) },
  )
}
```

- [ ] **Step 3: Write `price.ts`** (create/update/delete) — `rules` passed as `[PriceRuleInput!]`; map the input rules to the service `RuleInput[]`:

```ts
import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import z from 'zod'
import { PriceService } from '../../../../services/price'
import { loadPriceOrganizationId } from '../authz'
import { InvalidPriceRule, PriceListNotFound, PriceNotFound, PriceSetNotFound } from '../errors'

const mapRules = (rules: ReadonlyArray<{ attribute: string, operator: string, value: unknown }> | null | undefined) =>
  (rules ?? []).map(r => ({ attribute: r.attribute, operator: r.operator as any, value: r.value as any }))

export function registerPriceMutationsInner(builder: PriceGraphQLSchemaBuilder): void {
  builder.relayMutationField('createPrice',
    {
      inputFields: t => ({
        priceSetId: t.globalID({ for: 'PriceSet', required: true }),
        priceListId: t.globalID({ for: 'PriceList' }),
        currencyCode: t.string({ required: true, validate: z.string().length(3).transform(v => v.toLowerCase()) }),
        amount: t.string({ required: true, validate: z.string().regex(/^\d+(\.\d+)?$/) }),
        minQuantity: t.int(),
        maxQuantity: t.int(),
        rules: t.field({ type: ['PriceRuleInput'] }),
      }),
    },
    {
      errors: { types: [PriceSetNotFound, PriceListNotFound, InvalidPriceRule] },
      // Authorize against the SET's org. Resolve it from the set id.
      authScopes: async (_p, args, ctx) => {
        const svc = await ctx.runEffect(Effect.gen(function* () {
          const s = yield* PriceService
          return yield* s.findPriceSetById(Number(args.input.priceSetId.id)).pipe(Effect.catchTag('PriceSetNotFound', () => Effect.succeed(null)))
        }))
        if (svc == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['create'], organization: svc.organizationId } }
      },
      resolve: async (_r, args, ctx) => {
        const input = args.input
        const price = await ctx.runEffect(Effect.gen(function* () {
          const s = yield* PriceService
          return yield* s.createPrice({
            priceSetId: Number(input.priceSetId.id),
            priceListId: input.priceListId ? Number(input.priceListId.id) : null,
            currencyCode: input.currencyCode,
            amount: input.amount,
            minQuantity: input.minQuantity ?? null,
            maxQuantity: input.maxQuantity ?? null,
            rules: mapRules(input.rules),
          })
        }))
        return { price }
      },
    },
    { outputFields: t => ({ price: t.field({ type: 'Price', resolve: p => p.price }) }) },
  )

  builder.relayMutationField('updatePrice',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Price', required: true }),
        version: t.int({ required: true }),
        currencyCode: t.string({ validate: z.string().length(3).transform(v => v.toLowerCase()).optional() }),
        amount: t.string({ validate: z.string().regex(/^\d+(\.\d+)?$/).optional() }),
        minQuantity: t.int(),
        maxQuantity: t.int(),
        rules: t.field({ type: ['PriceRuleInput'] }),
      }),
    },
    {
      errors: { types: [PriceNotFound, InvalidPriceRule, OptimisticLockError] },
      authScopes: async (_p, args, ctx) => {
        const organization = await loadPriceOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['update'], organization } }
      },
      resolve: async (_r, args, ctx) => {
        const input = args.input
        const price = await ctx.runEffect(Effect.gen(function* () {
          const s = yield* PriceService
          return yield* s.updatePrice(Number(input.id.id), input.version, {
            currencyCode: input.currencyCode ?? undefined,
            amount: input.amount ?? undefined,
            minQuantity: input.minQuantity === undefined ? undefined : input.minQuantity,
            maxQuantity: input.maxQuantity === undefined ? undefined : input.maxQuantity,
            rules: input.rules ? mapRules(input.rules) : undefined,
          })
        }))
        return { price }
      },
    },
    { outputFields: t => ({ price: t.field({ type: 'Price', resolve: p => p.price }) }) },
  )

  builder.relayMutationField('deletePrice',
    { inputFields: t => ({ id: t.globalID({ for: 'Price', required: true }), version: t.int({ required: true }) }) },
    {
      errors: { types: [PriceNotFound, OptimisticLockError] },
      authScopes: async (_p, args, ctx) => {
        const organization = await loadPriceOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['delete'], organization } }
      },
      resolve: async (_r, args, ctx) => {
        const price = await ctx.runEffect(Effect.gen(function* () {
          const s = yield* PriceService
          return yield* s.softDeletePrice(Number(args.input.id.id), args.input.version)
        }))
        return { price }
      },
    },
    { outputFields: t => ({ price: t.field({ type: 'Price', resolve: p => p.price }) }) },
  )
}
```

- [ ] **Step 4: Write `priceList.ts`** (create/update/delete) — follows the same shape; `type`/`status` use string args validated by `z.enum`, `startsAt`/`endsAt` are `DateTime` args, `rules` is `[PriceRuleInput!]`:

```ts
import type { PriceGraphQLSchemaBuilder } from '@czo/price/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import z from 'zod'
import { PriceService } from '../../../../services/price'
import { loadPriceListOrganizationId } from '../authz'
import { InvalidPriceRule, PriceListNotFound } from '../errors'

const mapRules = (rules: ReadonlyArray<{ attribute: string, operator: string, value: unknown }> | null | undefined) =>
  (rules ?? []).map(r => ({ attribute: r.attribute, operator: r.operator as any, value: r.value as any }))

export function registerPriceListMutations(builder: PriceGraphQLSchemaBuilder): void {
  builder.relayMutationField('createPriceList',
    {
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true }),
        title: t.string({ required: true, validate: z.string().min(1).max(255) }),
        description: t.string(),
        type: t.string({ required: true, validate: z.enum(['sale', 'override']) }),
        status: t.string({ validate: z.enum(['draft', 'active']).optional() }),
        startsAt: t.field({ type: 'DateTime' }),
        endsAt: t.field({ type: 'DateTime' }),
        rules: t.field({ type: ['PriceRuleInput'] }),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
      errors: { types: [InvalidPriceRule] },
      authScopes: (_p, args) => ({ permission: { resource: 'price', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_r, args, ctx) => {
        const input = args.input
        const list = await ctx.runEffect(Effect.gen(function* () {
          const s = yield* PriceService
          return yield* s.createPriceList({
            organizationId: Number(input.organizationId.id),
            title: input.title,
            description: input.description ?? null,
            type: input.type as 'sale' | 'override',
            status: (input.status ?? undefined) as 'draft' | 'active' | undefined,
            startsAt: input.startsAt ?? null,
            endsAt: input.endsAt ?? null,
            rules: mapRules(input.rules),
            metadata: input.metadata,
          })
        }))
        return { list }
      },
    },
    { outputFields: t => ({ priceList: t.field({ type: 'PriceList', resolve: p => p.list }) }) },
  )

  builder.relayMutationField('updatePriceList',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'PriceList', required: true }),
        version: t.int({ required: true }),
        title: t.string({ validate: z.string().min(1).max(255).optional() }),
        description: t.string(),
        type: t.string({ validate: z.enum(['sale', 'override']).optional() }),
        status: t.string({ validate: z.enum(['draft', 'active']).optional() }),
        startsAt: t.field({ type: 'DateTime' }),
        endsAt: t.field({ type: 'DateTime' }),
        rules: t.field({ type: ['PriceRuleInput'] }),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
      errors: { types: [PriceListNotFound, InvalidPriceRule, OptimisticLockError] },
      authScopes: async (_p, args, ctx) => {
        const organization = await loadPriceListOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['update'], organization } }
      },
      resolve: async (_r, args, ctx) => {
        const input = args.input
        const list = await ctx.runEffect(Effect.gen(function* () {
          const s = yield* PriceService
          return yield* s.updatePriceList(Number(input.id.id), input.version, {
            title: input.title ?? undefined,
            description: input.description === undefined ? undefined : input.description,
            type: (input.type ?? undefined) as 'sale' | 'override' | undefined,
            status: (input.status ?? undefined) as 'draft' | 'active' | undefined,
            startsAt: input.startsAt === undefined ? undefined : input.startsAt,
            endsAt: input.endsAt === undefined ? undefined : input.endsAt,
            rules: input.rules ? mapRules(input.rules) : undefined,
            metadata: input.metadata === undefined ? undefined : input.metadata,
          })
        }))
        return { list }
      },
    },
    { outputFields: t => ({ priceList: t.field({ type: 'PriceList', resolve: p => p.list }) }) },
  )

  builder.relayMutationField('deletePriceList',
    { inputFields: t => ({ id: t.globalID({ for: 'PriceList', required: true }), version: t.int({ required: true }) }) },
    {
      errors: { types: [PriceListNotFound, OptimisticLockError] },
      authScopes: async (_p, args, ctx) => {
        const organization = await loadPriceListOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'price', actions: ['delete'], organization } }
      },
      resolve: async (_r, args, ctx) => {
        const list = await ctx.runEffect(Effect.gen(function* () {
          const s = yield* PriceService
          return yield* s.softDeletePriceList(Number(args.input.id.id), args.input.version)
        }))
        return { list }
      },
    },
    { outputFields: t => ({ priceList: t.field({ type: 'PriceList', resolve: p => p.list }) }) },
  )
}
```

- [ ] **Step 5: Type-check + lint + commit**

```bash
cd packages/modules/price && pnpm check-types && pnpm lint:fix
cd /workspace/c-zo && git add packages/modules/price/src/graphql/schema/price/mutations
git commit -m "feat(price): graphql mutations — set, price, list"
```

---

## Task 17: Module definition, manifest wiring, E2E

**Files:**
- Create: `packages/modules/price/src/index.ts`
- Modify: `apps/life/src/modules.ts`
- Create: `packages/modules/price/src/e2e/harness.ts`
- Create: `packages/modules/price/src/e2e/price.e2e.test.ts`

- [ ] **Step 1: Write `src/index.ts`** — `defineModule` + the `price` access domain (mirror inventory):

```ts
import type { Layer } from 'effect'
import { Access } from '@czo/auth/services'
import { defineModule } from '@czo/kit/module'
import { priceNodeGuards, registerPriceSchema } from '@czo/price/graphql'
import { priceRelations } from '@czo/price/relations'
import * as priceSchema from '@czo/price/schema'
import { PriceModuleLive } from '@czo/price/services'
import { Effect } from 'effect'

const PRICE_STATEMENTS = { price: ['create', 'read', 'update', 'delete'] } as const

const PRICE_HIERARCHY: Access.HierarchyLevel<typeof PRICE_STATEMENTS>[] = [
  { name: 'price:viewer', permissions: { price: ['read'] } },
  { name: 'price:manager', permissions: { price: ['create', 'update'] } },
  { name: 'price:admin', permissions: { price: ['delete'] } },
]

export default defineModule(() => ({
  name: 'price',
  version: '0.0.1',
  layer: PriceModuleLive as unknown as Layer.Layer<never, never, never>,
  db: {
    schema: priceSchema as unknown as Record<string, unknown>,
    relations: priceRelations,
  },
  graphql: {
    contribution: builder => registerPriceSchema(builder as never),
    nodeGuards: priceNodeGuards,
  },
  onStart: Effect.gen(function* () {
    const access = yield* Access.AccessService
    yield* access.register({ name: 'price', statements: PRICE_STATEMENTS, hierarchy: PRICE_HIERARCHY })
  }) as unknown as Effect.Effect<void, never, never>,
}))
```

- [ ] **Step 2: Wire into the manifest** — `apps/life/src/modules.ts`, import + insert **before `inventoryModule`**:

```ts
import priceModule from '@czo/price'
// ...
export const modules: ReadonlyArray<CzoModule> = [
  authModule,
  attributeModule,
  stockLocationModule,
  channelModule,
  priceModule,
  inventoryModule,
]
```
Update the ordering comment to note price depends only on auth and precedes inventory (forward-ready for `price_set_id` wiring). Add `@czo/price` to `apps/life/package.json` deps, then `pnpm install`.

- [ ] **Step 3: Write the E2E harness** (`e2e/harness.ts`) — adapt inventory's, dropping stock-location; boots `[auth, price]`:

```ts
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import authModule from '@czo/auth'
import { Organization } from '@czo/auth/services'
import { decodeGlobalID } from '@czo/kit/graphql'
import { bootTestApp } from '@czo/kit/testing'
import { Effect, Exit, Scope } from 'effect'
import priceModule from '../index'

const here = dirname(fileURLToPath(import.meta.url))
const AUTH_MIGRATIONS = resolve(here, '../../../auth/migrations')
const PRICE_MIGRATIONS = resolve(here, '../../migrations')
const GRAPHQL_URL = 'http://localhost/graphql'
const AUTH_URL = 'http://localhost/api/auth'

export interface BootedApp { fetch: (req: Request) => Promise<Response>, runEffect: <A, E>(e: Effect.Effect<A, E, any>) => Promise<A>, close: () => Promise<void> }
export interface GqlResult { data?: any, errors?: { message: string }[] }

export interface PriceHarness {
  readonly app: BootedApp
  readonly close: () => Promise<void>
  readonly gql: (query: string, variables?: Record<string, unknown>, token?: string, ip?: string) => Promise<GqlResult>
  readonly signUp: (email: string, name: string, password: string) => Promise<{ token: string, userId: number }>
  readonly createOrganization: (token: string, name: string, slug: string) => Promise<{ orgGlobalId: string, orgNumericId: number }>
  readonly setMemberRole: (orgNumericId: number, userId: number, role: string) => Promise<void>
}

export async function bootPriceApp(): Promise<PriceHarness> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only secret
  process.env.AUTH_SECRET = 'x'.repeat(40)
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only app id
  process.env.AUTH_APP = 'test'
  const scope = await Effect.runPromise(Scope.make())
  const app = (await Effect.runPromise(
    bootTestApp({ modules: [authModule, priceModule], migrations: [AUTH_MIGRATIONS, PRICE_MIGRATIONS] }).pipe(Effect.provideService(Scope.Scope, scope)),
  )) as BootedApp

  let count = 0
  const gql: PriceHarness['gql'] = async (query, variables = {}, token, ip) => {
    const res = await app.fetch(new Request(GRAPHQL_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { 'x-forwarded-for': ip } : {}) }, body: JSON.stringify({ query, variables }) }))
    return res.json() as Promise<GqlResult>
  }
  const signUp: PriceHarness['signUp'] = async (email, name, password) => {
    const ip = `10.0.0.${count + 1}`
    const res = await app.fetch(new Request(`${AUTH_URL}/sign-up`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ email, name, password }) }))
    const body = (await res.json()) as { token?: string }
    if (!res.ok || !body.token)
      throw new Error(`sign-up failed (${res.status})`)
    count += 1
    return { token: body.token, userId: count }
  }
  const createOrganization: PriceHarness['createOrganization'] = async (token, name, slug) => {
    const created = await gql(`mutation ($input: CreateOrganizationInput!){ createOrganization(input:$input){ ... on CreateOrganizationSuccess { data { organization { id } } } } }`, { input: { name, slug } }, token)
    const orgGlobalId: string | undefined = created.data?.createOrganization?.data?.organization?.id
    if (!orgGlobalId)
      throw new Error(`createOrganization failed: ${JSON.stringify(created.errors ?? created.data)}`)
    return { orgGlobalId, orgNumericId: Number(decodeGlobalID(orgGlobalId).id) }
  }
  const setMemberRole: PriceHarness['setMemberRole'] = (orgNumericId, userId, role) =>
    app.runEffect(Effect.gen(function* () {
      const org = yield* Organization.OrganizationService
      const member = yield* org.findFirstMember(orgNumericId, { where: { userId } })
      yield* org.updateMemberRole({ id: member.id, organizationId: orgNumericId, role })
    })).then(() => undefined)
  const close = async () => { await app.close(); await Effect.runPromise(Scope.close(scope, Exit.void)) }
  return { app, close, gql, signUp, createOrganization, setMemberRole }
}
```

- [ ] **Step 4: Write E2E tests** (`e2e/price.e2e.test.ts`) — CRUD through GraphQL, `resolvePrice` end-to-end + the H1 cross-org/public assertions:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootPriceApp, type PriceHarness } from './harness'

describe('price e2e', () => {
  let h: PriceHarness
  let token: string
  let orgGlobalId: string
  let orgNumericId: number

  beforeAll(async () => {
    h = await bootPriceApp()
    const u = await h.signUp('owner@x.io', 'Owner', 'password1234')
    token = u.token
    const org = await h.createOrganization(token, 'Acme', 'acme')
    orgGlobalId = org.orgGlobalId
    orgNumericId = org.orgNumericId
    await h.setMemberRole(orgNumericId, u.userId, 'price:admin')
  }, 180_000)
  afterAll(async () => { await h.close() })

  it('creates a set + base price, then resolves it (public, org-scoped)', async () => {
    const setRes = await h.gql(`mutation($input:CreatePriceSetInput!){ createPriceSet(input:$input){ priceSet { id } } }`, { input: { organizationId: orgGlobalId } }, token)
    const setId: string = setRes.data.createPriceSet.priceSet.id
    expect(setId).toBeTruthy()

    await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ price { id amount } } }`, { input: { priceSetId: setId, currencyCode: 'eur', amount: '20' } }, token)

    // PUBLIC resolve — no token. Returns a Base calculated price.
    const r = await h.gql(`query($org:ID!,$set:ID!){ resolvePrice(organizationId:$org, priceSetId:$set, currencyCode:"eur"){ __typename ... on BasePrice { amount } } }`, { org: orgGlobalId, set: setId })
    expect(r.errors).toBeUndefined()
    expect(r.data.resolvePrice).toEqual({ __typename: 'BasePrice', amount: '20' })
  })

  it('resolvePrice returns null for a foreign org (H1)', async () => {
    // Build a second org + its own set; resolving it under org #1 must be null.
    const u2 = await h.signUp('owner2@x.io', 'Owner2', 'password1234')
    const org2 = await h.createOrganization(u2.token, 'Beta', 'beta')
    await h.setMemberRole(org2.orgNumericId, u2.userId, 'price:admin')
    const setRes = await h.gql(`mutation($input:CreatePriceSetInput!){ createPriceSet(input:$input){ priceSet { id } } }`, { input: { organizationId: org2.orgGlobalId } }, u2.token)
    const set2: string = setRes.data.createPriceSet.priceSet.id
    await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ price { id } } }`, { input: { priceSetId: set2, currencyCode: 'eur', amount: '5' } }, u2.token)

    const mismatched = await h.gql(`query($org:ID!,$set:ID!){ resolvePrice(organizationId:$org, priceSetId:$set, currencyCode:"eur"){ __typename } }`, { org: orgGlobalId, set: set2 })
    expect(mismatched.data.resolvePrice).toBe(null)
  })

  it('an active sale list overrides base (Sale with originalAmount)', async () => {
    const setRes = await h.gql(`mutation($input:CreatePriceSetInput!){ createPriceSet(input:$input){ priceSet { id } } }`, { input: { organizationId: orgGlobalId } }, token)
    const setId: string = setRes.data.createPriceSet.priceSet.id
    await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ price { id } } }`, { input: { priceSetId: setId, currencyCode: 'eur', amount: '20' } }, token)
    const listRes = await h.gql(`mutation($input:CreatePriceListInput!){ createPriceList(input:$input){ priceList { id } } }`, { input: { organizationId: orgGlobalId, title: 'S', type: 'sale', status: 'active' } }, token)
    const listId: string = listRes.data.createPriceList.priceList.id
    await h.gql(`mutation($input:CreatePriceInput!){ createPrice(input:$input){ price { id } } }`, { input: { priceSetId: setId, priceListId: listId, currencyCode: 'eur', amount: '15' } }, token)

    const r = await h.gql(`query($org:ID!,$set:ID!){ resolvePrice(organizationId:$org, priceSetId:$set, currencyCode:"eur"){ __typename ... on SalePrice { amount originalAmount } } }`, { org: orgGlobalId, set: setId })
    expect(r.data.resolvePrice).toEqual({ __typename: 'SalePrice', amount: '15', originalAmount: '20' })
  })
})
```

- [ ] **Step 5: Run E2E — expect PASS**

```bash
cd packages/modules/price && pnpm test src/e2e/price.e2e.test.ts
```
Expected: 3 passing (boots auth+price on Testcontainers).

- [ ] **Step 6: Commit**

```bash
cd packages/modules/price && pnpm lint:fix && pnpm check-types
cd /workspace/c-zo && git add packages/modules/price/src/index.ts packages/modules/price/src/e2e apps/life/src/modules.ts apps/life/package.json pnpm-lock.yaml
git commit -m "feat(price): defineModule + access domain + manifest wiring + E2E"
```

---

## Task 18: Full-module validation

**Files:** none (verification only)

- [ ] **Step 1: Full module test suite**

```bash
cd packages/modules/price && pnpm test
```
Expected: all unit (resolve, validation) + integration (price) + e2e green.

- [ ] **Step 2: Type-check the module + downstream consumers**

```bash
cd packages/modules/price && pnpm check-types
pnpm --filter @czo/auth check-types
pnpm --filter life check-types
```
Expected: all clean (no regressions from the manifest/schema augmentation).

- [ ] **Step 3: Lint**

```bash
cd packages/modules/price && pnpm lint
```
Expected: 0 warnings.

- [ ] **Step 4: Spec coverage self-check** — confirm each spec section maps to a task: 5 tables (T2), relations (T3), operators + satisfaction (T8), rank + Σ priority + tagged union (T9), tier-override + window + org guard (T10), validation + reserved `quantity` (T11), nodes + rules-as-list + union (T13), inputs (T14), public org-scoped resolvePrice (T15), mutations (T16), access domain + boot order (T17). Out-of-scope items (tax, FX, inventory wiring, promotions, dimension registry) intentionally absent.

- [ ] **Step 5: Report** which validations ran and their results. Do **not** commit/push or open a PR unless the user asks (project convention: one review-gated commit cycle; the per-task commits above stay local until the user reviews).

---

## Notes for the executor

- **`optimisticUpdate` / `OptimisticLockError` shapes** — inventory's `price.ts` sibling is the source of truth; match its exact call/constructor signatures (this plan assumes `optimisticUpdate({ table, id, version, set })` and `new OptimisticLockError({ entity, id })`).
- **RQBv2 nested `with` filters** (Task 10) — if the nested `priceList.rules` filtered include doesn't type-check in this Drizzle rc, fetch list metadata via a second tiny `findMany` and join in memory. Behavior must stay identical.
- **`JSON` scalar** (Tasks 13/14) — verify what the kit builder registers (`JSONObject` exists; a generic `JSON` may not). If absent, register a `JSON` scalar once in `inputs.ts`, or serialize rule `value` as a `String`. Do not reference an unregistered scalar.
- **Public `resolvePrice`** — confirmed safe because the kit `scopeAuth` only enforces a field's *declared* scopes; omitting `authScopes` leaves the field open. The tenant boundary is enforced in the service (org mismatch → `null`). The E2E asserts both the public path and the cross-org `null`.
- **`CalculatedPrice` union cross-file reference** — Task 13 builds the union in `types.ts`; Task 15's `resolvePrice` references it as `type: 'CalculatedPrice'` (string). If the kit `SchemaBuilder` typing rejects the string name (it is not in `BuilderSchemaObjects`), **export the union ref** from `types.ts` (`export const CalculatedPriceRef = builder.unionType(...)` — but `unionType` runs inside `registerPriceTypes`, so instead create the union via a module-level `builder` isn't available). Simplest fix: register `CalculatedPrice`/`BasePrice`/`OverridePrice`/`SalePrice` names in the `@czo/kit/graphql` `BuilderSchemaObjects` augmentation in `graphql/index.ts` so the string ref resolves — mirror how `PriceSet`/`Price`/`PriceList` are declared there. Verify the string ref type-checks; if not, add those four names to the augmentation.
- **No events** — unlike inventory/channel, this module ships no event bus (the spec defines none). Do not add one.
