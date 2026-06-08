# `@czo/translation` Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@czo/translation` — a global `locales` registry (CRUD, global-role-gated writes, public reads) + a reusable `translatedField` Pothos helper that overlays translation-or-base from a consumer's pivot relation + a documented pivot pattern, proven by a demo fixture.

**Architecture:** The module owns ONLY the global `locales` table; translations live in consumer-owned typed pivot tables (deferred). The `translatedField` helper loads a consumer's `translations` relation via the Pothos-drizzle plugin (batched, no DataLoader) and resolves `pivot[locale]?.field ?? base`. The default locale is an Effect `Config` value (`TRANSLATION_DEFAULT_LOCALE`), not a DB column. Locale writes gate on a GLOBAL `permission` scope (no `organization` → user's global role); reads are public.

**Tech Stack:** Effect-TS 4 (`Context.Service`, `Data.TaggedError`, `Config`, `Layer.unwrap`), Drizzle RQBv2 + `@effect/sql-pg`, Pothos (`drizzleNode`, `@pothos/plugin-drizzle` 0.17.1, scope-auth, errors), Testcontainers, `@effect/vitest`.

**Reference templates (read before starting):** `packages/modules/channel/src/**` (smallest sibling — single entity CRUD) and `packages/modules/price/src/**` (Config-less; for the `Context.Service` + error-mapper patterns). Auth's `src/index.ts` lines ~104-121 show the `Config` + `Layer.unwrap` pattern. `packages/modules/auth/src/graphql/scopes.ts` shows the `permission` scope (org vs no-org/global). Spec: `docs/superpowers/specs/2026-06-07-translation-module-design.md`.

**Conventions:** No `async/await/try/catch` in Effect service code. Soft-delete via `deletedAt` + `version` optimistic lock. No `console.log`. No `as any` where inference works (targeted casts mirroring siblings are OK). Many small files. **No events module** (none in spec). **No kit changes.**

---

## File Structure

```
packages/modules/translation/
  package.json, tsconfig.json, drizzle.config.ts, vitest.config.ts, eslint.config.js, build.config.ts   T1
  migrations/                         T4 (locales DDL + seed 'en')
  src/
    database/schema.ts                T2  — locales table (global)
    database/relations.ts             T3  — minimal (locales has no relations)
    services/locale.ts                T5  — LocaleService: CRUD + config defaultLocale
    services/index.ts                 T5
    services/locale.integration.test.ts T5
    graphql/
      index.ts                        T7  — builder augmentation
      translated-field.ts             T6  — pickTranslation (pure) + translatedField helper
      translated-field.test.ts        T6  — pure overlay unit tests
      schema/
        index.ts                      T7
        locale/{types,errors,queries,mutations}.ts  T7
    index.ts                          T8  — defineModule + Config block + access domain
    e2e/
      fixtures/widget/{schema,relations,types}.ts   T9 — demo consumer (widgets + widget_translations pivot)
      fixtures/widget/migrations/...                T9
      fixtures/widget/index.ts                      T9 — fixture CzoModule
      harness.ts                      T9
      translation.e2e.test.ts         T9
  (apps/life/src/modules.ts)          T8  — translationModule after auth
```

---

## Task 1: Scaffold the package

**Files:** `packages/modules/translation/{package.json,tsconfig.json,drizzle.config.ts,vitest.config.ts,eslint.config.js,build.config.ts}`

- [ ] **Step 1: Copy module-agnostic configs from channel** (channel is the smallest sibling; its configs have no channel-specific aliases except in `vitest.config.ts`/`tsconfig.json`):

```bash
cd /workspace/c-zo/packages/modules
mkdir -p translation/src
cp channel/tsconfig.json translation/tsconfig.json
cp channel/drizzle.config.ts translation/drizzle.config.ts
cp channel/vitest.config.ts translation/vitest.config.ts
cp channel/eslint.config.js translation/eslint.config.js
cp channel/build.config.ts translation/build.config.ts
```
Then open `tsconfig.json` + `vitest.config.ts` and replace every `@czo/channel` path alias with `@czo/translation`, and **remove** any `@czo/stock-location` aliases (translation depends only on auth). Confirm no `channel`/`stock-location` strings remain.

- [ ] **Step 2: Write `package.json`** (peer dep: `@czo/auth` only):

```json
{
  "name": "@czo/translation",
  "type": "module",
  "version": "0.0.1",
  "description": "Translation module for c-zo — global locales registry + translatedField helper + pivot pattern",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/bnofao/czo.git", "directory": "packages/modules/translation" },
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

- [ ] **Step 3: Install** — `cd /workspace/c-zo && pnpm install`. Expected: `@czo/translation` linked.
- [ ] **Step 4: Stage** (project rule — STAGE, do NOT commit; one human-reviewed commit at the end): `git add packages/modules/translation pnpm-lock.yaml`

---

## Task 2: `locales` schema

**Files:** Create `packages/modules/translation/src/database/schema.ts`

- [ ] **Step 1: Write the schema** — one global table, two partial unique constraints, `SchemaRegistryShape` augmentation:

```ts
import type {} from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const locales = pgTable('locales', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  uniqueIndex('locales_code_uniq').on(t.code).where(sql`${t.deletedAt} IS NULL`),
  index('locales_active_idx').on(t.isActive),
])

declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    locales: typeof locales
  }
}
```
Note: the `import type {} from '@czo/kit/db'` anchor is required so the `declare module` augmentation resolves in isolated compilation (same as price's schema.ts).

- [ ] **Step 2: Type-check** — `cd packages/modules/translation && pnpm check-types` → PASS.
- [ ] **Step 3: Stage** — `git add packages/modules/translation/src/database/schema.ts`

---

## Task 3: Relations (minimal)

**Files:** Create `packages/modules/translation/src/database/relations.ts`

`locales` has no relations (it references nothing; pivots reference IT but live in consumer modules). `defineModule`'s `db.relations` still needs a relations function. Provide a minimal one.

- [ ] **Step 1: Write relations:**

```ts
import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'

type TranslationSchema = Pick<SchemaRegistryShape, 'locales'>

export function translationRelations(schema: TranslationSchema) {
  const { locales } = schema
  // locales has no outgoing relations; declare the table with an empty relation set.
  return defineRelationsPart({ locales }, () => ({ locales: {} }))
}

export type Relations = ReturnType<typeof translationRelations>
```
> If `defineRelationsPart` rejects an empty relation object for a table, fall back to `() => ({})` (no per-table entry). Verify by type-check; match what `defineRelationsPart` accepts in this drizzle version (read `packages/modules/channel/src/database/relations.ts` for the call shape).

- [ ] **Step 2: Type-check** → PASS. **Step 3: Stage** `git add .../database/relations.ts`

---

## Task 4: Migration (DDL + seed `en`)

**Files:** Create `packages/modules/translation/migrations/<ts>_<name>/{migration.sql,snapshot.json}`

- [ ] **Step 1: Generate** — `cd packages/modules/translation && pnpm migrate:generate`. Confirm folder-per-migration format (`ls -R packages/modules/translation/migrations` matches `packages/modules/channel/migrations`).
- [ ] **Step 2: Append the seed** — `drizzle-kit` emits DDL only. Manually append the default-locale seed to the generated `migration.sql` (after the `CREATE TABLE`/index statements), using a statement-breakpoint separator consistent with the file:

```sql
--> statement-breakpoint
INSERT INTO "locales" ("code", "name", "is_active") VALUES ('en', 'English', true);
```
(The `snapshot.json` tracks schema only, not data — leave it as generated.)

- [ ] **Step 3: Verify** — `cat packages/modules/translation/migrations/*/migration.sql` shows: `CREATE TABLE "locales"`, the partial unique `locales_code_uniq ... WHERE "deleted_at" IS NULL`, and the seed INSERT.
- [ ] **Step 4: Stage** `git add packages/modules/translation/migrations`

---

## Task 5: LocaleService (CRUD + config default)

**Files:** Create `src/services/locale.ts`, `src/services/index.ts`, `src/services/locale.integration.test.ts`

- [ ] **Step 1: Write the failing integration test** (`locale.integration.test.ts`):

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makePostgresTestLayer, truncateTables } from '@czo/kit/testing'
import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { translationRelations } from '../database/relations'
import { locales } from '../database/schema'
import * as Locale from './locale'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')
const LocalePostgresLayer = makePostgresTestLayer({
  migrationsFolder: MIGRATIONS,
  relations: translationRelations({ locales }),
})
const truncateLocales = truncateTables(locales)

// Provide the service with a fixed default-locale code (normally from Config).
const TestLayer = Locale.layer('en').pipe(Layer.provideMerge(LocalePostgresLayer))

layer(TestLayer, { timeout: 120_000 })('LocaleService', (it) => {
  it.effect('seed inserts en; createLocale + findByCode round-trips; duplicate code fails', () =>
    Effect.gen(function* () {
      const svc = yield* Locale.LocaleService
      // 'en' is seeded by the migration — do NOT truncate before this assertion
      const en = yield* svc.findLocaleByCode('en')
      expect(en?.code).toBe('en')

      const fr = yield* svc.createLocale({ code: 'fr', name: 'Français' })
      expect(fr.code).toBe('fr')
      const dup = yield* svc.createLocale({ code: 'fr', name: 'Frenchy' }).pipe(Effect.flip)
      expect(dup._tag).toBe('LocaleCodeTaken')
    }))

  it.effect('listLocales activeOnly filters inactive; updateLocale optimistic lock', () =>
    Effect.gen(function* () {
      yield* truncateLocales
      const svc = yield* Locale.LocaleService
      const en = yield* svc.createLocale({ code: 'en', name: 'English' })
      const de = yield* svc.createLocale({ code: 'de', name: 'German', isActive: false })
      const active = yield* svc.listLocales({ activeOnly: true })
      expect(active.map(l => l.code).sort()).toEqual(['en'])
      const all = yield* svc.listLocales({})
      expect(all.length).toBe(2)
      const err = yield* svc.updateLocale(de.id, de.version + 5, { name: 'Deutsch' }).pipe(Effect.flip)
      expect(err.name).toBe('OptimisticLockError')
    }))

  it.effect('getDefaultLocale resolves the configured code (en) or null', () =>
    Effect.gen(function* () {
      yield* truncateLocales
      const svc = yield* Locale.LocaleService
      const none = yield* svc.getDefaultLocale()
      expect(none).toBe(null) // truncated → configured 'en' not present
      yield* svc.createLocale({ code: 'en', name: 'English' })
      const def = yield* svc.getDefaultLocale()
      expect(def?.code).toBe('en')
    }))
})
```

- [ ] **Step 2: Run — expect FAIL** — `cd packages/modules/translation && pnpm test src/services/locale.integration.test.ts` (module missing).

- [ ] **Step 3: Write `locale.ts`** — Tag, errors, types, `make(defaultLocaleCode)`, and a `layer(code)` factory. Mirror price's `Context.Service` + `dbErr`/`dbErrOptimistic` + `optimisticUpdate` patterns:

```ts
import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { locales as localesTable } from '../database/schema'

export class LocaleNotFound extends Data.TaggedError('LocaleNotFound') {
  readonly code = 'LOCALE_NOT_FOUND'
  get message() { return 'Locale not found' }
}
export class LocaleCodeTaken extends Data.TaggedError('LocaleCodeTaken')<{ readonly code: string }> {
  readonly code = 'LOCALE_CODE_TAKEN'
  get message() { return `Locale '${this.code}' already exists` }
}
export class LocaleDbFailed extends Data.TaggedError('LocaleDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'LOCALE_DB_FAILED'
  get message() { return 'Database operation failed' }
}

export type Locale = InferSelectModel<typeof localesTable>

export interface CreateLocaleInput { code: string, name: string, isActive?: boolean }
export interface UpdateLocaleInput { name?: string, isActive?: boolean }

export class LocaleService extends Context.Service<LocaleService, {
  readonly createLocale: (input: CreateLocaleInput) => Effect.Effect<Locale, LocaleCodeTaken | LocaleDbFailed>
  readonly updateLocale: (id: number, expectedVersion: number, input: UpdateLocaleInput) => Effect.Effect<Locale, LocaleNotFound | OptimisticLockError | LocaleDbFailed>
  readonly softDeleteLocale: (id: number, expectedVersion: number) => Effect.Effect<Locale, LocaleNotFound | OptimisticLockError | LocaleDbFailed>
  readonly findLocaleById: (id: number) => Effect.Effect<Locale, LocaleNotFound | LocaleDbFailed>
  readonly findLocaleByCode: (code: string) => Effect.Effect<Locale | null, LocaleDbFailed>
  readonly listLocales: (opts: { activeOnly?: boolean }) => Effect.Effect<ReadonlyArray<Locale>, LocaleDbFailed>
  readonly getDefaultLocale: () => Effect.Effect<Locale | null, LocaleDbFailed>
  readonly defaultLocaleCode: string
}>()('@czo/translation/LocaleService') {}

type LocaleServiceImpl = Context.Service.Shape<typeof LocaleService>

export const make = (defaultLocaleCode: string) => Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>

  const dbErr = <A, E>(eff: Effect.Effect<A, E>) => eff.pipe(Effect.mapError(cause => new LocaleDbFailed({ cause })))
  const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(e => e instanceof OptimisticLockError ? e : new LocaleDbFailed({ cause: e })))

  const findLocaleByCode: LocaleServiceImpl['findLocaleByCode'] = code =>
    dbErr(Effect.gen(function* () {
      const row = yield* db.query.locales.findFirst({ where: { code, deletedAt: { isNull: true } } } as any)
      return (row ?? null) as Locale | null
    }))

  const findLocaleById: LocaleServiceImpl['findLocaleById'] = id =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.locales.findFirst({ where: { id, deletedAt: { isNull: true } } } as any))
      if (!row)
        return yield* Effect.fail(new LocaleNotFound())
      return row as Locale
    })

  const createLocale: LocaleServiceImpl['createLocale'] = input =>
    Effect.gen(function* () {
      const existing = yield* findLocaleByCode(input.code)
      if (existing)
        return yield* Effect.fail(new LocaleCodeTaken({ code: input.code }))
      return yield* dbErr(Effect.gen(function* () {
        const [row] = yield* db.insert(localesTable).values({ code: input.code, name: input.name, isActive: input.isActive ?? true }).returning()
        return row! as Locale
      }))
    })

  const updateLocale: LocaleServiceImpl['updateLocale'] = (id, expectedVersion, input) =>
    Effect.gen(function* () {
      const existing = yield* findLocaleById(id)
      return yield* dbErrOptimistic(optimisticUpdate({
        db,
        table: localesTable,
        id,
        expectedVersion,
        values: {
          name: input.name ?? existing.name,
          isActive: input.isActive === undefined ? existing.isActive : input.isActive,
        },
      }))
    })

  const softDeleteLocale: LocaleServiceImpl['softDeleteLocale'] = (id, expectedVersion) =>
    Effect.gen(function* () {
      const existing = yield* findLocaleById(id)
      yield* dbErrOptimistic(optimisticUpdate({ db, table: localesTable, id, expectedVersion, values: { deletedAt: sql`NOW()` as any } }))
      return existing
    })

  const listLocales: LocaleServiceImpl['listLocales'] = opts =>
    dbErr(Effect.gen(function* () {
      const where = opts.activeOnly ? { deletedAt: { isNull: true }, isActive: true } : { deletedAt: { isNull: true } }
      return (yield* db.query.locales.findMany({ where } as any)) as ReadonlyArray<Locale>
    }))

  const getDefaultLocale: LocaleServiceImpl['getDefaultLocale'] = () => findLocaleByCode(defaultLocaleCode)

  return {
    createLocale, updateLocale, softDeleteLocale, findLocaleById, findLocaleByCode, listLocales, getDefaultLocale,
    defaultLocaleCode,
  } satisfies LocaleServiceImpl
})

/** Live layer parameterized by the configured default-locale code. */
export const layer = (defaultLocaleCode: string) => Layer.effect(LocaleService, make(defaultLocaleCode))
```
> Verify `optimisticUpdate`/`OptimisticLockError` against price's `services/price.ts` (the real kit API: `{ db, table, id, expectedVersion, values }`; `OptimisticLockError` positional, `.name` in tests). Match it.

- [ ] **Step 4: Write `services/index.ts`:**

```ts
import * as Locale from './locale'

export { Locale }

/** The module layer is built in `src/index.ts` from Config (Layer.unwrap). */
```
(The composed layer is assembled in `index.ts` Task 8, because it depends on the Config-derived default-locale code.)

- [ ] **Step 5: Run — expect PASS** (3 tests). **Step 6:** `pnpm lint:fix && pnpm check-types`. **Step 7: Stage** `git add packages/modules/translation/src/services`

---

## Task 6: `translatedField` helper (pure overlay + Pothos wrapper)

**Files:** Create `src/graphql/translated-field.ts`, `src/graphql/translated-field.test.ts`

- [ ] **Step 1: Write failing unit tests** for the PURE overlay (`translated-field.test.ts`, plain vitest):

```ts
import { describe, expect, it } from 'vitest'
import { pickTranslation } from './translated-field'

const rows = [
  { localeCode: 'fr', name: 'Boutique', description: null },
  { localeCode: 'de', name: 'Laden', description: 'Hallo' },
]

describe('pickTranslation', () => {
  it('returns the translation for the requested locale', () => {
    expect(pickTranslation(rows, 'fr', 'name', 'Shop')).toBe('Boutique')
  })
  it('falls back to base when the locale is missing', () => {
    expect(pickTranslation(rows, 'es', 'name', 'Shop')).toBe('Shop')
  })
  it('falls back to base when locale is undefined', () => {
    expect(pickTranslation(rows, undefined, 'name', 'Shop')).toBe('Shop')
  })
  it('falls back to base when the translated column is null/empty', () => {
    expect(pickTranslation(rows, 'fr', 'description', 'base desc')).toBe('base desc')
    expect(pickTranslation(rows, 'de', 'description', 'base desc')).toBe('Hallo')
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `translated-field.ts`** — a pure `pickTranslation` + the Pothos field factory. The factory uses the Pothos-drizzle field `select` to load the parent's pivot relation (batched), then `pickTranslation`:

```ts
/** Pure overlay: the requested locale's column value if present+non-null, else the base. */
export function pickTranslation<T extends { localeCode: string }>(
  translations: ReadonlyArray<T>,
  locale: string | null | undefined,
  field: keyof T & string,
  base: string | null,
): string | null {
  if (locale == null)
    return base
  const row = translations.find(t => t.localeCode === locale)
  const value = row?.[field]
  return (value == null || value === '') ? base : (value as unknown as string)
}

/**
 * Build a `<field>(locale: String): String` field that overlays translation-or-base.
 *
 * `relation` is the consumer's pivot relation name (e.g. 'translations'); the parent
 * row's `relation` array (loaded via the drizzle plugin `select` below, batched across
 * the list) holds `{ localeCode, <field> }` rows. `base` reads the parent's base column.
 *
 * Usage in a consumer drizzleNode:
 *   name: translatedField(t, { relation: 'translations', field: 'name', base: r => r.name })
 */
export function translatedField(
  t: any,
  opts: { relation: string, field: string, base: (parent: any) => string | null, nullable?: boolean },
) {
  return t.field({
    type: 'String',
    nullable: opts.nullable ?? false,
    args: { locale: t.arg.string({ required: false }) },
    // Force the drizzle plugin to load the pivot relation into the batched parent query.
    select: () => ({ with: { [opts.relation]: true } }),
    resolve: (parent: any, args: { locale?: string | null }) =>
      pickTranslation(parent[opts.relation] ?? [], args.locale ?? undefined, opts.field, opts.base(parent)),
  })
}
```

> **Technical risk (verify FIRST, per the spec):** the Pothos-drizzle 0.17.1 field option that forces a relation to be loaded. The code above uses `select: () => ({ with: { [relation]: true } })`. Confirm the exact option name/shape against `@pothos/plugin-drizzle` 0.17.1 (check its field-builder types, or how `t.drizzleField`/`t.relation` express `with`). **Fallbacks, in order:** (a) `select: { with: { [relation]: true } }` (static object, not a function); (b) if field `select` is unsupported, have the consumer expose the relation via `t.relation(relation)` AND read it — but that returns the relation as a separate field, not usable for overlay; in that case (c) make `translatedField` resolve via `ctx.runEffect` calling a `TranslationsForParent` loader is OUT (we rejected DataLoader) — instead the consumer's drizzleNode adds the relation to its node `select`/`with`, and the helper reads `parent[relation]`. The Task 9 fixture is where you PROVE whichever form works end-to-end with batching; pick the simplest that loads `parent[relation]` batched. Report which form you used.

- [ ] **Step 4: Run pure tests — expect PASS** (4). **Step 5:** lint + check-types. **Step 6: Stage** `git add src/graphql/translated-field.ts src/graphql/translated-field.test.ts`

---

## Task 7: GraphQL — Locale node, public queries, global-gated mutations

**Files:** Create `src/graphql/index.ts`, `src/graphql/schema/index.ts`, `src/graphql/schema/locale/{types,errors,queries,mutations}.ts`

- [ ] **Step 1: `graphql/index.ts`** (builder augmentation; mirror channel's `graphql/index.ts`):

```ts
import type { Relations } from '@czo/translation/relations'
import type { SchemaBuilder } from '@czo/kit/graphql'
import type { Locale } from '../services/locale'
import '@czo/auth/graphql'

export { registerTranslationSchema, type TranslationBuilder } from './schema'
export { pickTranslation, translatedField } from './translated-field'

export type TranslationGraphQLSchemaBuilder = SchemaBuilder<Relations>

declare module '@czo/kit/graphql' {
  interface BuilderSchemaObjects {
    Locale: Locale
  }
}
```
(No node-guards — locales are global + public-read. `translatedField`/`pickTranslation` are re-exported so consumers import from `@czo/translation/graphql`.)

- [ ] **Step 2: `schema/index.ts`** — fan-out:

```ts
import type { TranslationGraphQLSchemaBuilder } from '@czo/translation/graphql'
import { registerLocaleErrors } from './locale/errors'
import { registerLocaleMutations } from './locale/mutations'
import { registerLocaleQueries } from './locale/queries'
import { registerLocaleTypes } from './locale/types'

export type TranslationBuilder = TranslationGraphQLSchemaBuilder

export function registerTranslationSchema(builder: TranslationBuilder): void {
  registerLocaleTypes(builder)
  registerLocaleErrors(builder)
  registerLocaleQueries(builder)
  registerLocaleMutations(builder)
}
```

- [ ] **Step 3: `schema/locale/types.ts`** — the `Locale` drizzleNode (`select: true` not required — no node-guard — but harmless; omit it):

```ts
import type { TranslationGraphQLSchemaBuilder } from '@czo/translation/graphql'

export function registerLocaleTypes(builder: TranslationGraphQLSchemaBuilder): void {
  builder.drizzleNode('locales', {
    name: 'Locale',
    id: { column: c => c.id },
    fields: t => ({
      code: t.exposeString('code'),
      name: t.exposeString('name'),
      isActive: t.exposeBoolean('isActive'),
      version: t.exposeInt('version'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
  })
}
```

- [ ] **Step 4: `schema/locale/errors.ts`** — register the tagged errors (mirror price's errors.ts + `registerError`):

```ts
import type { TranslationGraphQLSchemaBuilder } from '@czo/translation/graphql'
import { registerError } from '@czo/kit/graphql'
import { LocaleCodeTaken, LocaleNotFound } from '../../../services/locale'

export { LocaleCodeTaken, LocaleNotFound }

export function registerLocaleErrors(builder: TranslationGraphQLSchemaBuilder): void {
  registerError(builder, LocaleNotFound, { name: 'LocaleNotFoundError' })
  registerError(builder, LocaleCodeTaken, { name: 'LocaleCodeTakenError', fields: t => ({ code: t.exposeString('code') }) })
}
```

- [ ] **Step 5: `schema/locale/queries.ts`** — `locales`, `locale(id)`, `defaultLocale` — ALL public (no authScopes):

```ts
import type { TranslationGraphQLSchemaBuilder } from '@czo/translation/graphql'
import { Effect } from 'effect'
import { LocaleService } from '../../../services/locale'

export function registerLocaleQueries(builder: TranslationGraphQLSchemaBuilder): void {
  builder.queryField('locales', t =>
    t.drizzleField({
      type: ['locales'],
      args: { activeOnly: t.arg.boolean() },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          // honor the drizzle `query` selection while filtering live + (optionally) active
          return yield* svc.listLocales({ activeOnly: args.activeOnly ?? false })
        })) as Promise<any>,
    }))

  builder.queryField('locale', t =>
    t.drizzleField({
      type: 'locales',
      nullable: true,
      args: { id: t.arg.globalID({ for: 'Locale', required: true }) },
      resolve: async (_query, _root, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.findLocaleById(Number(args.id.id))
        }).pipe(Effect.catchTag('LocaleNotFound', () => Effect.succeed(null)))),
    }))

  builder.queryField('defaultLocale', t =>
    t.drizzleField({
      type: 'locales',
      nullable: true,
      resolve: async (_query, _root, _args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.getDefaultLocale()
        })) as Promise<any>,
    }))
}
```
> The `t.drizzleField` `type: ['locales']` (list) + the `query`-honoring resolve: mirror how price/inventory return service rows from a `drizzleField`/`drizzleConnection`. If `t.drizzleField` with a list type needs a different shape here, fall back to a plain `t.field({ type: ['Locale'] })` returning the service rows (the `Locale` object type is registered). Pick whichever type-checks; the data is the same.

- [ ] **Step 6: `schema/locale/mutations.ts`** — `createLocale`/`updateLocale`/`deleteLocale`, **GLOBAL-gated** (`permission` with NO `organization`). Mirror price's `relayMutationField` shape:

```ts
import type { TranslationGraphQLSchemaBuilder } from '@czo/translation/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import z from 'zod'
import { LocaleService } from '../../../services/locale'
import { LocaleCodeTaken, LocaleNotFound } from './errors'

// GLOBAL gate: no `organization` → routed to the user's global role.
const localeManageScope = { permission: { resource: 'locale', actions: ['create'] } }

export function registerLocaleMutations(builder: TranslationGraphQLSchemaBuilder): void {
  builder.relayMutationField('createLocale',
    { inputFields: t => ({
        code: t.string({ required: true, validate: z.string().min(2).max(16).transform(v => v.trim().toLowerCase()) }),
        name: t.string({ required: true, validate: z.string().min(1).max(128) }),
        isActive: t.boolean(),
      }) },
    {
      errors: { types: [ValidationError, LocaleCodeTaken] },
      authScopes: () => ({ permission: { resource: 'locale', actions: ['create'] } }),
      resolve: async (_root, args, ctx) => {
        const locale = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.createLocale({ code: args.input.code, name: args.input.name, isActive: args.input.isActive ?? undefined })
        }))
        return { locale }
      },
    },
    { outputFields: t => ({ locale: t.field({ type: 'Locale', resolve: p => p.locale }) }) },
  )

  builder.relayMutationField('updateLocale',
    { inputFields: t => ({
        id: t.globalID({ for: 'Locale', required: true }),
        version: t.int({ required: true }),
        name: t.string({ validate: z.string().min(1).max(128).optional() }),
        isActive: t.boolean(),
      }) },
    {
      errors: { types: [ValidationError, LocaleNotFound, OptimisticLockError] },
      authScopes: () => ({ permission: { resource: 'locale', actions: ['update'] } }),
      resolve: async (_root, args, ctx) => {
        const locale = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.updateLocale(Number(args.input.id.id), args.input.version, {
            name: args.input.name ?? undefined,
            isActive: args.input.isActive ?? undefined,
          })
        }))
        return { locale }
      },
    },
    { outputFields: t => ({ locale: t.field({ type: 'Locale', resolve: p => p.locale }) }) },
  )

  builder.relayMutationField('deleteLocale',
    { inputFields: t => ({ id: t.globalID({ for: 'Locale', required: true }), version: t.int({ required: true }) }) },
    {
      errors: { types: [LocaleNotFound, OptimisticLockError] },
      authScopes: () => ({ permission: { resource: 'locale', actions: ['delete'] } }),
      resolve: async (_root, args, ctx) => {
        const locale = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.softDeleteLocale(Number(args.input.id.id), args.input.version)
        }))
        return { locale }
      },
    },
    { outputFields: t => ({ locale: t.field({ type: 'Locale', resolve: p => p.locale }) }) },
  )
}
```
Remove the unused `localeManageScope` const (it's illustrative — each field inlines its own actions). Verify `relayMutationField` shape against price's `mutations/priceSet.ts`.

- [ ] **Step 7:** `pnpm check-types && pnpm lint:fix` → PASS. **Step 8: Stage** `git add packages/modules/translation/src/graphql`

---

## Task 8: Module definition (Config + access domain) + manifest

**Files:** Create `src/index.ts`; Modify `apps/life/src/modules.ts`, `apps/life/package.json`

- [ ] **Step 1: `src/index.ts`** — `defineModule` with the `Config` block (`Layer.unwrap`) threading the default-locale code into `Locale.layer`, plus the `locale` access domain:

```ts
import type { Layer as LayerT } from 'effect'
import { Access } from '@czo/auth/services'
import { defineModule } from '@czo/kit/module'
import { registerTranslationSchema } from '@czo/translation/graphql'
import { translationRelations } from '@czo/translation/relations'
import * as translationSchema from '@czo/translation/schema'
import { Locale } from '@czo/translation/services'
import { Config, Effect, Layer } from 'effect'

const LOCALE_STATEMENTS = { locale: ['create', 'read', 'update', 'delete'] } as const

const LOCALE_HIERARCHY: Access.HierarchyLevel<typeof LOCALE_STATEMENTS>[] = [
  { name: 'locale:viewer', permissions: { locale: ['read'] } },
  { name: 'locale:manager', permissions: { locale: ['create', 'update'] } },
  { name: 'locale:admin', permissions: { locale: ['delete'] } },
]

// Read the default-locale code from Config and build the service layer from it.
const translationConfig = Effect.gen(function* () {
  const defaultLocaleCode = yield* Config.string('TRANSLATION_DEFAULT_LOCALE').pipe(Config.withDefault('en'))
  return { defaultLocaleCode }
})

const TranslationModuleLive = Layer.unwrap(
  translationConfig.pipe(Effect.map(cfg => Locale.layer(cfg.defaultLocaleCode))),
)

export default defineModule(() => ({
  name: 'translation',
  version: '0.0.1',
  layer: TranslationModuleLive as unknown as LayerT.Layer<never, never, never>,
  db: {
    schema: translationSchema as unknown as Record<string, unknown>,
    relations: translationRelations,
  },
  graphql: {
    contribution: builder => registerTranslationSchema(builder as never),
  },
  onStart: Effect.gen(function* () {
    const access = yield* Access.AccessService
    yield* access.register({ name: 'locale', statements: LOCALE_STATEMENTS, hierarchy: LOCALE_HIERARCHY })
  }) as unknown as Effect.Effect<void, never, never>,
}))
```
> Verify `Access.HierarchyLevel`/`AccessService.register`/`defineModule` shapes against price's `src/index.ts` and adapt. Confirm `Layer.unwrap` is the right combinator for "build a layer from a Config-reading Effect" (auth's `src/index.ts` ~line 121 is the reference).

- [ ] **Step 2: Manifest** — `apps/life/src/modules.ts`: `import translationModule from '@czo/translation'` and insert `translationModule` **right after `authModule`** (before `attributeModule`). Update the ordering comment (translation depends only on auth; precedes consumers). Add `"@czo/translation": "workspace:*"` to `apps/life/package.json` deps; `pnpm install`.

- [ ] **Step 3:** `pnpm --filter @czo/translation check-types && pnpm --filter life check-types && pnpm --filter @czo/translation lint` → all clean. **Step 4: Stage** `git add packages/modules/translation/src/index.ts apps/life/src/modules.ts apps/life/package.json pnpm-lock.yaml`

---

## Task 9: E2E — demo widget fixture proving `translatedField`

**Files:** Create `src/e2e/fixtures/widget/{schema.ts,relations.ts,types.ts,index.ts}`, `src/e2e/fixtures/widget/migrations/...`, `src/e2e/harness.ts`, `src/e2e/translation.e2e.test.ts`

The fixture is a **test-only consumer module** proving the pivot pattern + helper end-to-end.

- [ ] **Step 1: Fixture schema** (`fixtures/widget/schema.ts`) — a `widgets` entity + `widget_translations` pivot:

```ts
import type {} from '@czo/kit/db'
import { integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const widgets = pgTable('widgets', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const widgetTranslations = pgTable('widget_translations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  widgetId: integer('widget_id').notNull().references(() => widgets.id, { onDelete: 'cascade' }),
  localeCode: text('locale_code').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [uniqueIndex('widget_translations_uniq').on(t.widgetId, t.localeCode)])

declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    widgets: typeof widgets
    widgetTranslations: typeof widgetTranslations
  }
}
```

- [ ] **Step 2: Fixture relations** (`fixtures/widget/relations.ts`) — `widget.translations`:

```ts
import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'

type WidgetSchema = Pick<SchemaRegistryShape, 'widgets' | 'widgetTranslations'>

export function widgetRelations(schema: WidgetSchema) {
  const { widgets, widgetTranslations } = schema
  return defineRelationsPart({ widgets, widgetTranslations }, r => ({
    widgets: { translations: r.many.widgetTranslations({ from: r.widgets.id, to: r.widgetTranslations.widgetId }) },
    widgetTranslations: { widget: r.one.widgets({ from: r.widgetTranslations.widgetId, to: r.widgets.id }) },
  }))
}
export type WidgetRelations = ReturnType<typeof widgetRelations>
```

- [ ] **Step 3: Fixture GraphQL** (`fixtures/widget/types.ts`) — a `Widget` drizzleNode whose `name` uses `translatedField`:

```ts
import { DrizzleDb } from '@czo/kit/db'
import { translatedField } from '@czo/translation/graphql'
import { Effect } from 'effect'

export function registerWidgetTypes(builder: any): void {
  builder.drizzleNode('widgets', {
    name: 'Widget',
    id: { column: (c: any) => c.id },
    fields: (t: any) => ({
      name: translatedField(t, { relation: 'translations', field: 'name', base: (r: any) => r.name }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
    }),
  })
  // a tiny connection to fetch widgets for the test — resolves directly off DrizzleDb
  builder.queryField('widgets', (t: any) => t.drizzleConnection({
    type: 'widgets',
    resolve: (query: any, _root: any, _args: any, ctx: any) =>
      ctx.runEffect(Effect.gen(function* () {
        const db = yield* DrizzleDb
        return yield* db.query.widgets.findMany(query({}))
      })),
  }))
}
```
> The fixture's only job is to expose `Widget.name(locale:)` and list widgets. The `widgets` connection resolves directly off `DrizzleDb` (no fixture service). If `t.drizzleConnection` needs args/pagination defaults that the test query must supply, mirror price's `priceSets` connection (it takes `first`). Insert widget + translation rows in the test via `app.runEffect` against `DrizzleDb` (the harness `seedWidgets` helper).

- [ ] **Step 4: Fixture migration** — generate or hand-write `fixtures/widget/migrations/0000_widget/migration.sql` creating `widgets` + `widget_translations` (+ the unique index). (Hand-writing is fine — it's a 2-table fixture; the Testcontainers loader applies it alongside auth + translation migrations.)

- [ ] **Step 5: Fixture module** (`fixtures/widget/index.ts`) — a `defineModule` exposing the schema/relations/graphql (no access domain, no service needed):

```ts
import { defineModule } from '@czo/kit/module'
import { widgetRelations } from './relations'
import * as widgetSchema from './schema'
import { registerWidgetTypes } from './types'
import { Effect } from 'effect'

export default defineModule(() => ({
  name: 'widget-fixture',
  version: '0.0.1',
  layer: undefined as any, // no service layer; provide an empty Layer if defineModule requires one
  db: { schema: widgetSchema as any, relations: widgetRelations },
  graphql: { contribution: (builder: any) => registerWidgetTypes(builder) },
  onStart: Effect.void as any,
}))
```
> If `defineModule` requires a non-undefined `layer`, pass `Layer.empty` (`import { Layer } from 'effect'`). Verify the minimal `CzoModule` shape against a sibling.

- [ ] **Step 6: Harness** (`src/e2e/harness.ts`) — adapt auth's/price's harness, booting `[authModule, translationModule, widgetFixtureModule]` with migrations `[AUTH_MIGRATIONS, TRANSLATION_MIGRATIONS, WIDGET_FIXTURE_MIGRATIONS]`. Expose `gql`, `signUp`, `grantGlobalRole` (auth's harness has it — reuse the same approach: `app.runEffect` calling the user service to set `users.role`), `runEffect`, `close`. Read auth's `src/e2e/harness.ts` for `grantGlobalRole`.

- [ ] **Step 7: E2E tests** (`translation.e2e.test.ts`):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootTranslationApp, type TranslationHarness } from './harness'

describe('translation e2e', () => {
  let h: TranslationHarness
  beforeAll(async () => { h = await bootTranslationApp() }, 180_000)
  afterAll(async () => { await h.close() })

  it('locales list + defaultLocale are public (no auth)', async () => {
    const r = await h.gql(`query { locales { edges { node { code } } } defaultLocale { code } }`)
    expect(r.errors).toBeUndefined()
    expect(r.data.locales.edges.some((e: any) => e.node.code === 'en')).toBe(true)
    expect(r.data.defaultLocale.code).toBe('en') // seeded + configured default
  })

  it('createLocale is denied without the global locale role, allowed with it', async () => {
    const plain = await h.signUp('plain@x.io', 'Plain', 'password1234')
    const denied = await h.gql(`mutation($i:CreateLocaleInput!){ createLocale(input:$i){ __typename } }`, { i: { code: 'fr', name: 'Français' } }, plain.token)
    expect(denied.errors?.length ? true : denied.data?.createLocale == null).toBe(true)

    const admin = await h.signUp('admin@x.io', 'Admin', 'password1234')
    await h.grantGlobalRole(admin.userId, 'locale:admin') // global role carrying locale perms
    const ok = await h.gql(`mutation($i:CreateLocaleInput!){ createLocale(input:$i){ ... on CreateLocaleSuccess { data { locale { code } } } } }`, { i: { code: 'fr', name: 'Français' } }, admin.token)
    expect(ok.data.createLocale.data.locale.code).toBe('fr')
  })

  it('translatedField overlays translation-or-base and batches', async () => {
    // seed: 2 widgets, one with an fr translation, via app.runEffect against DrizzleDb
    await h.seedWidgets() // helper inserts widget A('Shop A') with fr 'Boutique A', widget B('Shop B') with no fr
    const fr = await h.gql(`query { widgets { edges { node { name(locale: "fr") } } } }`)
    const names = fr.data.widgets.edges.map((e: any) => e.node.name).sort()
    expect(names).toEqual(['Boutique A', 'Shop B']) // A translated, B falls back to base
    const en = await h.gql(`query { widgets { edges { node { name(locale: "en") } } } }`)
    expect(en.data.widgets.edges.map((e: any) => e.node.name).sort()).toEqual(['Shop A', 'Shop B']) // no en → base
  })
})
```
> `grantGlobalRole(userId, 'locale:admin')`: the global role string must be one the access registry resolves to the `locale` perms. `locale:admin` only carries `delete` per the hierarchy — for `create` you need `locale:manager`. **Adjust the granted role to one that includes the action under test** (grant `locale:manager` for create, or grant a composite). Determine the real global-role→perm resolution by reading how auth's `UserService.hasPermission` + `AccessService` compose roles, and grant the role that passes `locale:create`. If a single tier doesn't cover all actions, the test may grant the highest tier or the test asserts per-action. Make the assertion match the real authz.
> `h.seedWidgets()`: a harness helper that `app.runEffect`s inserts into `widgets`/`widget_translations` via `DrizzleDb`. Keep it in the harness.

- [ ] **Step 8: Run E2E** — `cd packages/modules/translation && pnpm test src/e2e/translation.e2e.test.ts` → PASS (boots auth+translation+fixture on Testcontainers). If the `translatedField` `select` form from Task 6 doesn't load `parent.translations`, THIS is where you discover it — iterate on the helper's load mechanism until `name(locale:)` resolves and batches (one widget-translations query for N widgets; verify by inspection/log if needed).
- [ ] **Step 9:** lint + check-types. **Step 10: Stage** `git add packages/modules/translation/src`

---

## Task 10: Full validation

- [ ] **Step 1:** `cd packages/modules/translation && pnpm test` → all green (locale integration + translated-field unit + e2e).
- [ ] **Step 2:** `pnpm --filter @czo/translation check-types && pnpm --filter @czo/auth check-types && pnpm --filter life check-types` → clean.
- [ ] **Step 3:** `pnpm --filter @czo/translation lint` → 0 warnings.
- [ ] **Step 4: Spec coverage** — confirm each spec section maps to a task: locales table (T2), seed+config default (T4/T5/T8), LocaleService CRUD (T5), `translatedField` + pure overlay (T6), public reads + global-gated writes + `defaultLocale` query (T7), access domain + Config (T8), pivot pattern + helper proven by fixture (T9). Out-of-scope (real consumer wiring, UI strings, auto-translate) absent.
- [ ] **Step 5: Report** validations run; do NOT commit/push/PR unless the user asks.

---

## Notes for the executor

- **`translatedField` load mechanism (Task 6/9)** is the one real unknown — the Pothos-drizzle 0.17.1 field option to force-load a relation into the batched parent query. Resolve it empirically in Task 9's fixture; the pure `pickTranslation` is locked and unit-tested regardless. Report the working form.
- **Global authz (Task 9)** — the `permission` scope with NO `organization` routes to the user's global role (`users.role`) via `UserService.hasPermission` (see `auth/src/graphql/scopes.ts`). Grant the test user a global role that resolves to the `locale` action under test; confirm the role→perm resolution against the access registry.
- **`optimisticUpdate`/`OptimisticLockError`** — real kit API: `optimisticUpdate({ db, table, id, expectedVersion, values })`; `OptimisticLockError` is a plain Error (assert `.name`). Match price's usage.
- **No events, no node-guards, no kit changes.** STAGE every task (`git add`), never `git commit` — one review-gated commit at the end.
