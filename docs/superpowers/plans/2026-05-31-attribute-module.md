# Attribute Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@czo/attribute` — a flexible, entity-agnostic typed attribute system (Saleor-style: 11 types, typed value tables, consumer junction tables) with hybrid platform/org scoping, on the current Effect-native module stack.

**Architecture:** A `defineModule` module (like `@czo/stock-location`): Effect-native services (`Context.Service` + `Layer.effect`) over `@effect/sql-pg`/Drizzle RQBv2; Pothos code-first GraphQL with relay mutations + errors plugin; integer identity PKs; hard-delete with FK cascade; `organizationId int NULL` two-tier scoping (null = platform/admin, set = org-owned/extension); a new `attribute` access domain for org-tier authz + a platform-admin check for the platform tier.

**Tech Stack:** TypeScript (strict), Effect-TS, `@effect/sql-pg` + `effect-postgres`, Drizzle ORM (RQBv2), Pothos (`@pothos/*`), `@effect/vitest` + Testcontainers, zod.

**Reference modules (read these first):** `packages/modules/stock-location` (full template: defineModule, service, org-scoped authz, Pothos relay mutations, drizzle queries) and `packages/modules/auth` (`AccessService`, `permission` scope, `database/schema.ts` `SchemaRegistryShape` augmentation).

**Spec:** `docs/superpowers/specs/2026-05-31-attribute-module-design.md` (+ `docs/planning/attribute-module/{prd,trd}.md` for unchanged domain detail).

**Conventions (hard rules):**
- No `async`/`await`/`try`/`catch` in service code — `Effect.gen`/`Effect.fnUntraced`/`Effect.tryPromise`.
- Integer PKs: `integer().primaryKey().generatedAlwaysAsIdentity()`.
- Tagged errors via `Data.TaggedError`, registered as GraphQL errors via `registerError`.
- Tests use Testcontainers via `@czo/kit/testing` (`makePostgresTestLayer`), NOT `TEST_DATABASE_URL`.
- Commit after each green task. Never commit autonomously beyond task commits; stage with `git add`.
- Validate per task: `pnpm --filter @czo/attribute check-types`, `pnpm --filter @czo/attribute lint:fix`, targeted `pnpm --filter @czo/attribute test <file>`.

---

## File Structure

```
packages/modules/attribute/
  package.json
  build.config.ts
  drizzle.config.ts
  tsconfig.json
  eslint.config.mjs
  vitest.config.ts
  migrations/                          # drizzle-kit generated
  src/
    index.ts                           # defineModule(() => CzoModule)
    database/
      schema.ts                        # pgEnum + 9 tables + SchemaRegistryShape augmentation
      relations.ts                     # attributeRelations factory
    services/
      index.ts                         # AttributeModuleLive = mergeAll(...)
      attribute.ts                     # AttributeService (CRUD attributes)
      attribute-value.ts               # AttributeValueService (choice values + reorder)
      typed-value.ts                   # TypedValueService (text/numeric/boolean/date/file)
      validation.ts                    # pure per-type validators + FileInfo/hex/slug
      utils/slug.ts                    # generateSlug
    graphql/
      index.ts                         # registerAttributeSchema + Builder* augmentations
      authz.ts                         # loadAttributeOrg + isPlatformAdmin helpers
      schema/
        scalars.ts                     # FileInfo object + input
        enums.ts                       # AttributeType, AttributeUnit, order/choice enums
        errors.ts                      # registerAttributeErrors
        types.ts                       # Attribute object + AttributeChoice union + value objects
        inputs.ts                      # where/orderBy inputs (reuse kit filters)
        queries.ts                     # attribute, attributes
        mutations/
          attribute.ts                 # create/update/delete attribute
          choice-value.ts              # value/swatch/reference CRUD + reorder
          typed-value.ts               # text/numeric/boolean/date/file CRUD
        index.ts                       # registerAttributeSchema aggregator
```

Consumer junction tables (e.g. `product_attributes`) are NOT built here — out of scope (spec §9). `@czo/attribute` exposes `./schema`, `./relations`, `./services`, `./graphql`, `.` (module).

---

## Phase 0 — Scaffold

### Task 0: Create the package skeleton

**Files:**
- Create: `packages/modules/attribute/package.json`
- Create: `packages/modules/attribute/tsconfig.json`
- Create: `packages/modules/attribute/eslint.config.mjs`
- Create: `packages/modules/attribute/build.config.ts`
- Create: `packages/modules/attribute/vitest.config.ts`
- Create: `packages/modules/attribute/drizzle.config.ts`

- [ ] **Step 1: Copy config files from stock-location, adapting names**

Run:
```bash
cp packages/modules/stock-location/tsconfig.json packages/modules/attribute/tsconfig.json
cp packages/modules/stock-location/eslint.config.mjs packages/modules/attribute/eslint.config.mjs
cp packages/modules/stock-location/vitest.config.ts packages/modules/attribute/vitest.config.ts
```
Then read `packages/modules/stock-location/drizzle.config.ts` and create `packages/modules/attribute/drizzle.config.ts` identically but with `schema: './src/database/schema.ts'` and migrations dir `./migrations` (mirror stock-location exactly — same `DATABASE_URL` env read).

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "@czo/attribute",
  "type": "module",
  "version": "0.0.1",
  "description": "Attribute module for c-zo — flexible typed attributes",
  "license": "MIT",
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
    "migrate:generate": "drizzle-kit generate",
    "migrate:latest": "drizzle-kit migrate",
    "migrate:status": "drizzle-kit check",
    "check-types": "pnpm tsc --noEmit"
  },
  "peerDependencies": { "@czo/auth": "workspace:*" },
  "dependencies": {
    "@czo/kit": "workspace:*",
    "drizzle-orm": "catalog:common",
    "effect": "catalog:",
    "zod": "catalog:common"
  },
  "devDependencies": {
    "@czo/auth": "workspace:*",
    "@czo/kit": "workspace:*",
    "@effect/vitest": "catalog:",
    "@testcontainers/postgresql": "catalog:dev",
    "@vitest/coverage-v8": "catalog:testing",
    "@workspace/eslint-config": "workspace:*",
    "@workspace/typescript-config": "workspace:*",
    "drizzle-kit": "catalog:dev",
    "vitest": "catalog:testing"
  }
}
```

- [ ] **Step 3: Write `build.config.ts`** (mirror stock-location's, with attribute entries)

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
    '@czo/auth', '@czo/auth/services',
    'drizzle-orm', 'drizzle-orm/pg-core', 'graphql',
  ],
})
```

- [ ] **Step 4: Install + verify workspace resolves**

Run: `pnpm install`
Expected: completes; `@czo/attribute` appears in the workspace. (No `src/` files yet → build/check-types not run until Phase 1.)

- [ ] **Step 5: Commit**

```bash
git add packages/modules/attribute
git commit -m "chore(attribute): scaffold @czo/attribute package"
```

---

## Phase 1 — Database schema

### Task 1: Enums + tables + relations + registry augmentation

**Files:**
- Create: `packages/modules/attribute/src/database/schema.ts`
- Create: `packages/modules/attribute/src/database/relations.ts`

Column conventions (every table): `id` int PK identity; `organizationId: integer('organization_id')` **nullable** (no `.references()` — cross-module id only); `externalSource: varchar('external_source', { length: 100 })`, `externalId: varchar('external_id', { length: 255 })`, both nullable; `createdAt`/`updatedAt` `timestamp(..).notNull().defaultNow()`. Value tables: `attributeId` int `.notNull().references(() => attributes.id, { onDelete: 'cascade' })`.

- [ ] **Step 1: Write `database/schema.ts`** — enums + 9 tables + augmentation

```ts
import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core'

export const attributeTypeEnum = pgEnum('attribute_type', [
  'DROPDOWN', 'MULTISELECT', 'PLAIN_TEXT', 'RICH_TEXT', 'NUMERIC',
  'BOOLEAN', 'FILE', 'REFERENCE', 'SWATCH', 'DATE', 'DATE_TIME',
])

export const attributeUnitEnum = pgEnum('attribute_unit', [
  'KILOGRAM', 'GRAM', 'POUND', 'OUNCE',
  'METER', 'CENTIMETER', 'MILLIMETER', 'INCH', 'FOOT',
  'LITER', 'MILLILITER', 'GALLON',
  'SQUARE_METER', 'SQUARE_CENTIMETER',
  'PIECE', 'PERCENT',
])

export const attributes = pgTable('attributes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  organizationId: integer('organization_id'),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  type: attributeTypeEnum('type').notNull(),
  referenceEntity: varchar('reference_entity', { length: 100 }),
  unit: attributeUnitEnum('unit'),
  isRequired: boolean('is_required').notNull().default(false),
  isFilterable: boolean('is_filterable').notNull().default(false),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  metadata: jsonb('metadata'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  unique('uq_attributes_slug').on(t.slug),
  unique('uq_attributes_external').on(t.externalSource, t.externalId),
])

// Choice value tables share: attributeId, organizationId, slug, value, position, external*
export const attributeValues = pgTable('attribute_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  slug: varchar('slug', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  position: integer('position').notNull().default(0),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  unique('uq_attribute_value_slug').on(t.attributeId, t.slug),
  unique('uq_attribute_values_external').on(t.externalSource, t.externalId),
])

export const attributeSwatchValues = pgTable('attribute_swatch_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  slug: varchar('slug', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  color: varchar('color', { length: 7 }),
  fileUrl: varchar('file_url', { length: 2048 }),
  mimetype: varchar('mimetype', { length: 100 }),
  position: integer('position').notNull().default(0),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  unique('uq_swatch_slug').on(t.attributeId, t.slug),
  unique('uq_swatch_values_external').on(t.externalSource, t.externalId),
])

export const attributeReferenceValues = pgTable('attribute_reference_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  slug: varchar('slug', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  referenceId: integer('reference_id').notNull(),
  position: integer('position').notNull().default(0),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  unique('uq_reference_slug').on(t.attributeId, t.slug),
  unique('uq_reference_id').on(t.attributeId, t.referenceId),
  unique('uq_reference_values_external').on(t.externalSource, t.externalId),
])

export const attributeTextValues = pgTable('attribute_text_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  plain: text('plain').notNull(),
  rich: jsonb('rich'),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [unique('uq_text_values_external').on(t.externalSource, t.externalId)])

export const attributeNumericValues = pgTable('attribute_numeric_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  value: numeric('value', { precision: 20, scale: 6, mode: 'number' }).notNull(),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [unique('uq_numeric_values_external').on(t.externalSource, t.externalId)])

export const attributeBooleanValues = pgTable('attribute_boolean_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  value: boolean('value').notNull(),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [unique('uq_boolean_values_external').on(t.externalSource, t.externalId)])

export const attributeDateValues = pgTable('attribute_date_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  value: timestamp('value', { withTimezone: true }).notNull(),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [unique('uq_date_values_external').on(t.externalSource, t.externalId)])

export const attributeFileValues = pgTable('attribute_file_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  attributeId: integer('attribute_id').notNull().references(() => attributes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  fileUrl: varchar('file_url', { length: 2048 }).notNull(),
  mimetype: varchar('mimetype', { length: 100 }).notNull(),
  externalSource: varchar('external_source', { length: 100 }),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [unique('uq_file_values_external').on(t.externalSource, t.externalId)])

// Register these tables in the kit's global SchemaRegistryShape (travels with the
// schema import → applies in apps/life). Mirror auth/stock-location pattern.
declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    attributes: typeof attributes
    attributeValues: typeof attributeValues
    attributeSwatchValues: typeof attributeSwatchValues
    attributeReferenceValues: typeof attributeReferenceValues
    attributeTextValues: typeof attributeTextValues
    attributeNumericValues: typeof attributeNumericValues
    attributeBooleanValues: typeof attributeBooleanValues
    attributeDateValues: typeof attributeDateValues
    attributeFileValues: typeof attributeFileValues
  }
}
```

> NOTE: CHECK constraints (referenceEntity-iff-REFERENCE; unit-only-NUMERIC; swatch color-or-file; swatch mimetype-if-file) are NOT expressible in drizzle table builders here — add them in Task 2 as raw SQL appended to the generated migration. The service (Phase 3-4) enforces them too.

- [ ] **Step 2: Write `database/relations.ts`**

```ts
import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'

export function attributeRelations(schema: SchemaRegistryShape) {
  const {
    attributes, attributeValues, attributeSwatchValues, attributeReferenceValues,
    attributeTextValues, attributeNumericValues, attributeBooleanValues,
    attributeDateValues, attributeFileValues,
  } = schema

  return defineRelationsPart(
    {
      attributes, attributeValues, attributeSwatchValues, attributeReferenceValues,
      attributeTextValues, attributeNumericValues, attributeBooleanValues,
      attributeDateValues, attributeFileValues,
    },
    r => ({
      attributes: {
        values: r.many.attributeValues({ from: r.attributes.id, to: r.attributeValues.attributeId }),
        swatchValues: r.many.attributeSwatchValues({ from: r.attributes.id, to: r.attributeSwatchValues.attributeId }),
        referenceValues: r.many.attributeReferenceValues({ from: r.attributes.id, to: r.attributeReferenceValues.attributeId }),
      },
      attributeValues: { attribute: r.one.attributes({ from: r.attributeValues.attributeId, to: r.attributes.id }) },
      attributeSwatchValues: { attribute: r.one.attributes({ from: r.attributeSwatchValues.attributeId, to: r.attributes.id }) },
      attributeReferenceValues: { attribute: r.one.attributes({ from: r.attributeReferenceValues.attributeId, to: r.attributes.id }) },
    }),
  )
}

export type Relations = ReturnType<typeof attributeRelations>
```

> **IMPORTANT — do NOT add an `organization` relation here.** `organizationId` is a plain
> cross-module int column (no FK, no Drizzle relation). A `r.one.organizations(...)` relation
> would reference a table that is NOT in this module's isolated schema, breaking the
> Testcontainers test layer (`attributeRelations(attributeSchema)` — `organizations` is auth's
> table, absent here). It only "works" in `apps/life` where all module schemas are merged.
> (stock-location defines such a relation but gets away with it solely because it has no isolated
> integration tests.) If GraphQL ever needs `attribute.organization`, resolve it with a **field
> resolver** calling auth's `OrganizationService` (cross-module service), not a Drizzle `with`.

- [ ] **Step 3: check-types**

Run: `pnpm --filter @czo/attribute check-types`
Expected: PASS (0 errors).

- [ ] **Step 4: Generate migration**

Run: `cd packages/modules/attribute && DATABASE_URL=postgresql://x pnpm migrate:generate`
Expected: a migration file appears under `migrations/` creating the enums + 9 tables. Open it.

- [ ] **Step 5: Append CHECK constraints + pg_trgm + trigram indexes to the migration**

Edit the generated `.sql` migration, appending (after the `CREATE TABLE`s):
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "attributes" ADD CONSTRAINT "chk_reference_entity" CHECK (
  (type = 'REFERENCE' AND reference_entity IS NOT NULL) OR (type <> 'REFERENCE' AND reference_entity IS NULL));
ALTER TABLE "attributes" ADD CONSTRAINT "chk_unit_for_numeric" CHECK (type = 'NUMERIC' OR unit IS NULL);
ALTER TABLE "attribute_swatch_values" ADD CONSTRAINT "chk_swatch_has_visual" CHECK (color IS NOT NULL OR file_url IS NOT NULL);
ALTER TABLE "attribute_swatch_values" ADD CONSTRAINT "chk_swatch_mimetype" CHECK (file_url IS NULL OR mimetype IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_attributes_name_trgm" ON "attributes" USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_attributes_slug_trgm" ON "attributes" USING gin (slug gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_attributes_type" ON "attributes" (type);
CREATE INDEX IF NOT EXISTS "idx_attributes_filterable" ON "attributes" (is_filterable) WHERE is_filterable = TRUE;
CREATE INDEX IF NOT EXISTS "idx_attributes_org" ON "attributes" (organization_id);
CREATE INDEX IF NOT EXISTS "idx_attribute_values_attr" ON "attribute_values" (attribute_id, position);
CREATE INDEX IF NOT EXISTS "idx_swatch_values_attr" ON "attribute_swatch_values" (attribute_id, position);
CREATE INDEX IF NOT EXISTS "idx_reference_values_attr" ON "attribute_reference_values" (attribute_id, position);
```
(Add the equivalent `idx_*_org` / `_attr` indexes for the typed-value tables if desired; see TRD §4 for the full list.)

- [ ] **Step 6: Commit**

```bash
git add packages/modules/attribute/src/database packages/modules/attribute/migrations
git commit -m "feat(attribute): db schema (enums, 9 tables, relations, checks, trgm indexes)"
```

---

## Phase 2 — Pure helpers (slug + validation)

### Task 2: `utils/slug.ts` (TDD)

**Files:**
- Create: `packages/modules/attribute/src/services/utils/slug.ts`
- Test: `packages/modules/attribute/src/services/utils/slug.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest'
import { generateSlug } from './slug'

describe('generateSlug', () => {
  it('lowercases, trims, replaces non-alphanumerics with hyphens', () => {
    expect(generateSlug('Crimson Red!')).toBe('crimson-red')
    expect(generateSlug('  Hello  World  ')).toBe('hello-world')
  })
  it('collapses repeats and strips leading/trailing hyphens', () => {
    expect(generateSlug('--A__B--')).toBe('a-b')
  })
})
```

- [ ] **Step 2: Run — FAIL** (`Cannot find module './slug'`). Run: `pnpm --filter @czo/attribute test src/services/utils/slug.test.ts`

- [ ] **Step 3: Implement**

```ts
/** URL-safe slug: lowercase, alphanumerics, single hyphens, no leading/trailing hyphen. */
export function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Matches a valid slug (used by validation + DB callers). */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
```

- [ ] **Step 4: Run — PASS.** Run same command.

- [ ] **Step 5: Commit** `git add … && git commit -m "feat(attribute): slug helper"`

### Task 3: `validation.ts` (TDD)

**Files:**
- Create: `packages/modules/attribute/src/services/validation.ts`
- Test: `packages/modules/attribute/src/services/validation.test.ts`

Pure functions returning `{ ok: true } | { ok: false, code: string, message: string }`. Used by services before writes. Codes match `errors.ts` (Phase 6).

- [ ] **Step 1: Failing test** (cover each validator)

```ts
import { describe, expect, it } from 'vitest'
import { validateHexColor, validateSwatchVisual, validateReferenceAttribute } from './validation'

describe('validateHexColor', () => {
  it('accepts #RRGGBB, rejects others', () => {
    expect(validateHexColor('#a1b2c3').ok).toBe(true)
    expect(validateHexColor('red').ok).toBe(false)
  })
})
describe('validateSwatchVisual', () => {
  it('requires color or file', () => {
    expect(validateSwatchVisual({ color: '#fff' }).ok).toBe(true)
    expect(validateSwatchVisual({ file: { url: 'https://x/y.png', mimetype: 'image/png' } }).ok).toBe(true)
    expect(validateSwatchVisual({}).ok).toBe(false)
  })
  it('requires mimetype when file present', () => {
    expect(validateSwatchVisual({ file: { url: 'https://x', mimetype: '' } }).ok).toBe(false)
  })
})
describe('validateReferenceAttribute', () => {
  it('REFERENCE requires referenceEntity', () => {
    expect(validateReferenceAttribute('REFERENCE', undefined).ok).toBe(false)
    expect(validateReferenceAttribute('REFERENCE', 'product').ok).toBe(true)
    expect(validateReferenceAttribute('DROPDOWN', undefined).ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** `validation.ts`

```ts
export type Valid = { ok: true } | { ok: false, code: string, message: string }
const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function validateHexColor(color: string): Valid {
  return HEX_RE.test(color)
    ? { ok: true }
    : { ok: false, code: 'VALIDATION_ERROR', message: 'Color must be hex #RRGGBB' }
}

export interface FileInput { url: string, mimetype: string }
export function validateSwatchVisual(input: { color?: string | null, file?: FileInput | null }): Valid {
  if (input.color == null && input.file == null)
    return { ok: false, code: 'SWATCH_REQUIRES_COLOR_OR_FILE', message: 'Swatch needs a color or a file' }
  if (input.color != null) {
    const c = validateHexColor(input.color)
    if (!c.ok)
      return c
  }
  if (input.file != null && !input.file.mimetype)
    return { ok: false, code: 'VALIDATION_ERROR', message: 'file.mimetype is required' }
  return { ok: true }
}

export function validateReferenceAttribute(type: string, referenceEntity: string | null | undefined): Valid {
  if (type === 'REFERENCE' && !referenceEntity)
    return { ok: false, code: 'REFERENCE_ENTITY_REQUIRED', message: 'REFERENCE requires referenceEntity' }
  if (type !== 'REFERENCE' && referenceEntity)
    return { ok: false, code: 'VALIDATION_ERROR', message: 'referenceEntity only valid for REFERENCE' }
  return { ok: true }
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(attribute): per-type validation helpers"`

---

## Phase 3 — AttributeService

### Task 4: `services/attribute.ts` — errors, types, CRUD with scoping + optimistic lock

**Files:**
- Create: `packages/modules/attribute/src/services/attribute.ts`
- Test: `packages/modules/attribute/src/services/attribute.integration.test.ts`
- Create: `packages/modules/attribute/src/testing/postgres.ts` (Testcontainers layer, mirror stock-location)

> Read `packages/modules/stock-location/src/services/stock-location.ts` and `packages/modules/stock-location/src/testing/postgres.ts` first — copy their structure (tagged errors, `Context.Service`, `make = Effect.gen`, `dbErr`/`dbErrOptimistic`, `optimisticUpdate`, `findFirst` closure, `AttributePostgresLayer` via `makePostgresTestLayer`).

**Service contract (this task):**
- `findFirst(config?, scope: ReadScope): Effect<Attribute, AttributeNotFound | AttributeDbFailed>` — applies the org visibility filter (`organizationId IS NULL OR organizationId = scope.organizationId`).
- `findMany(config?, scope: ReadScope): Effect<readonly Attribute[], AttributeDbFailed>`
- `create(input): Effect<Attribute, AttributeSlugTaken | AttributeDbFailed>` — auto-slug if absent; `organizationId` from input (null = platform); enforces `validateReferenceAttribute`.
- `update(id, expectedVersion, input): Effect<Attribute, AttributeNotFound | OptimisticLockError | AttributeDbFailed>` — existence check then `optimisticUpdate`.
- `delete(id): Effect<Attribute, AttributeNotFound | AttributeDbFailed>` — existence check then hard delete (CASCADE handles values).

`ReadScope = { organizationId: number | null }` (null caller = platform admin view = sees everything; here pass the caller's org, or null for admin to see all — admin passes `null` AND the resolver omits the visibility filter; see Phase 6).

- [ ] **Step 1: Write `testing/postgres.ts`** (copy stock-location's, swap relations/migrations)

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makePostgresTestLayer, truncateTables } from '@czo/kit/testing'
import { attributeRelations } from '../database/relations'
import * as attributeSchema from '../database/schema'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')

export const AttributePostgresLayer = makePostgresTestLayer({
  migrationsFolder: MIGRATIONS,
  relations: attributeRelations(attributeSchema),
})

export const truncateAttribute = truncateTables(
  attributeSchema.attributes,
  attributeSchema.attributeValues,
  attributeSchema.attributeSwatchValues,
  attributeSchema.attributeReferenceValues,
  attributeSchema.attributeTextValues,
  attributeSchema.attributeNumericValues,
  attributeSchema.attributeBooleanValues,
  attributeSchema.attributeDateValues,
  attributeSchema.attributeFileValues,
)
```

- [ ] **Step 2: Failing integration test** `attribute.integration.test.ts`

```ts
import type { Relations } from '@czo/attribute/relations'
import type { Database } from '@czo/kit/db'
import { DrizzleDb } from '@czo/kit/db'
import { expect, layer } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import * as schema from '../database/schema'
import { AttributeService } from './attribute'
import { AttributePostgresLayer, truncateAttribute } from '../testing/postgres'

const ServiceLayer = AttributeService.Default.pipe(/* provided with DrizzleDb by the test layer */)

layer(AttributePostgresLayer, { timeout: 120_000 })('AttributeService', (it) => {
  it.effect('create assigns slug + version=1, findFirst returns it', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService
      const created = yield* svc.create({ name: 'Color', type: 'DROPDOWN', organizationId: null })
      expect(created.slug).toBe('color')
      expect(created.version).toBe(1)
      const found = yield* svc.findFirst({ where: { id: created.id } }, { organizationId: null })
      expect(found.id).toBe(created.id)
    }).pipe(Effect.provide(ServiceLayer)))

  it.effect('duplicate slug fails with AttributeSlugTaken', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService
      yield* svc.create({ name: 'Size', type: 'DROPDOWN', organizationId: null })
      const err = yield* svc.create({ name: 'Size', type: 'DROPDOWN', organizationId: null }).pipe(Effect.flip)
      expect(err._tag).toBe('AttributeSlugTaken')
    }).pipe(Effect.provide(ServiceLayer)))

  it.effect('org visibility: org sees platform + own, not other org', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService
      yield* svc.create({ name: 'Platform', slug: 'platform', type: 'BOOLEAN', organizationId: null })
      yield* svc.create({ name: 'Acme', slug: 'acme', type: 'BOOLEAN', organizationId: 1 })
      yield* svc.create({ name: 'Globex', slug: 'globex', type: 'BOOLEAN', organizationId: 2 })
      const acmeView = yield* svc.findMany(undefined, { organizationId: 1 })
      const slugs = acmeView.map(a => a.slug).sort()
      expect(slugs).toEqual(['acme', 'platform'])
    }).pipe(Effect.provide(ServiceLayer)))

  it.effect('update bumps version (optimistic); stale version → OptimisticLockError', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService
      const a = yield* svc.create({ name: 'X', type: 'BOOLEAN', organizationId: null })
      const u = yield* svc.update(a.id, 1, { name: 'Y' })
      expect(u.version).toBe(2)
      const stale = yield* svc.update(a.id, 1, { name: 'Z' }).pipe(Effect.flip)
      expect(stale._tag).toBe('OptimisticLockError')
    }).pipe(Effect.provide(ServiceLayer)))

  it.effect('delete cascades to values', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const db = (yield* DrizzleDb) as Database<Relations>
      const svc = yield* AttributeService
      const a = yield* svc.create({ name: 'C', type: 'DROPDOWN', organizationId: null })
      yield* db.insert(schema.attributeValues).values({ attributeId: a.id, slug: 'red', value: 'Red' })
      yield* svc.delete(a.id)
      const rows = yield* db.select().from(schema.attributeValues).where(eq(schema.attributeValues.attributeId, a.id))
      expect(rows).toHaveLength(0)
    }).pipe(Effect.provide(ServiceLayer)))
})
```

> NOTE on `ServiceLayer`: follow exactly how `stock-location.integration.test.ts` provides its service over `AttributePostgresLayer` (the test layer provides `DrizzleDb`; the service `Layer.effect` requires it). Adjust the `.pipe(...)` provision to match that file's working pattern.

- [ ] **Step 3: Run — FAIL** (`Cannot find module './attribute'`). Run: `pnpm --filter @czo/attribute test src/services/attribute.integration.test.ts`

- [ ] **Step 4: Implement `services/attribute.ts`**

Structure (mirror stock-location.ts):
- Imports: `Database, DrizzleDb, OptimisticLockError, optimisticUpdate` from `@czo/kit/db`; `and, eq, isNull, or` from `drizzle-orm`; `Context, Data, Effect, Layer` from `effect`; `attributes` from `../database/schema`; `generateSlug` from `./utils/slug`; `validateReferenceAttribute` from `./validation`; `Relations` type from `@czo/attribute/relations`.
- Tagged errors: `AttributeNotFound` (code `ATTRIBUTE_NOT_FOUND`), `AttributeSlugTaken` (`ATTRIBUTE_SLUG_EXISTS`, fields `{ slug }`), `AttributeDbFailed` (`{ cause }`), plus re-export `OptimisticLockError`.
- `Attribute = InferSelectModel<typeof attributes>`.
- Input types: `CreateAttributeInput = { name; slug?; type; referenceEntity?; unit?; isRequired?; isFilterable?; externalSource?; externalId?; metadata?; organizationId: number | null }`; `UpdateAttributeInput = Partial<{ name; isRequired; isFilterable; unit; externalSource; externalId; metadata }>`; `ReadScope = { organizationId: number | null }`.
- `make`:
  ```ts
  const db = (yield* DrizzleDb) as Database<Relations>
  const dbErr = <A,E>(e) => e.pipe(Effect.mapError(cause => new AttributeDbFailed({ cause })))
  const dbErrOptimistic = <A,E>(e) => e.pipe(Effect.mapError(x => x instanceof OptimisticLockError ? x : new AttributeDbFailed({ cause: x })))
  // visibility predicate for RQBv2 where: platform OR caller-org
  const visible = (scope) => scope.organizationId == null
    ? undefined  // admin/null scope → no org filter (sees all)
    : { OR: [{ organizationId: { isNull: true } }, { organizationId: scope.organizationId }] }
  const findFirst = (config, scope) => Effect.gen(function*(){
    const row = yield* dbErr(db.query.attributes.findFirst({ ...config, where: { ...config?.where, ...(visible(scope) ?? {}) } }))
    if (!row) return yield* Effect.fail(new AttributeNotFound())
    return row
  })
  ```
  `create`: validate referenceEntity (fail `Effect.fail(new AttributeDbFailed({ cause }))`? — NO: surface a typed error. For MVP, referenceEntity validation belongs to the GraphQL `ValidationError`; the service can trust it OR re-check and fail `AttributeDbFailed`. Keep it simple: service trusts caller for referenceEntity, enforces slug uniqueness only). Compute `slug = input.slug ?? generateSlug(input.name)`; pre-check `db.query.attributes.findFirst({ where: { slug } })` → if exists, `Effect.fail(new AttributeSlugTaken({ slug }))`; else insert `.returning()`.
  `update(id, expectedVersion, input)`: `yield* findFirst({ where: { id } }, { organizationId: null })` (existence, admin-scope so it finds platform+any — but org callers shouldn't update others' → the org check is enforced in the authScope at GraphQL; service-level existence uses admin scope) → `optimisticUpdate({ db, table: attributes, id, expectedVersion, values: input })` via `dbErrOptimistic`.
  `delete(id)`: existence check → `db.delete(attributes).where(eq(attributes.id, id)).returning()` → return row (cascade deletes values).
- `export const layer = Layer.effect(AttributeService, make)`.

> Define `AttributeService` as `class AttributeService extends Context.Service<AttributeService, {...}>()('@czo/attribute/AttributeService') {}` with the method signatures above. Use `Context.Service.Shape` for `findFirst` typing like stock-location.

- [ ] **Step 5: Run — PASS** (all 5 tests). Run the test command.
- [ ] **Step 6: check-types + lint:fix.** Run: `pnpm --filter @czo/attribute check-types && pnpm --filter @czo/attribute lint:fix`
- [ ] **Step 7: Commit** `git commit -m "feat(attribute): AttributeService CRUD + org-scoped reads + optimistic lock"`

---

## Phase 4 — Choice value service

### Task 5: `services/attribute-value.ts` — value / swatch / reference CRUD + reorder (TDD)

**Files:**
- Create: `packages/modules/attribute/src/services/attribute-value.ts`
- Test: `packages/modules/attribute/src/services/attribute-value.integration.test.ts`

`AttributeValueService` methods (3 families share a generic core keyed by table):
- `createValue(input)`, `updateValue(id, input)`, `deleteValue(id)`, `reorderValues(attributeId, orderedIds[])` — table `attributeValues`.
- `createSwatch(input)`, `updateSwatch(id, input)`, `deleteSwatch(id)`, `reorderSwatches(...)` — table `attributeSwatchValues` (+ color/file, via `validateSwatchVisual`).
- `createReference(input)`, `updateReference(id, input)`, `deleteReference(id)`, `reorderReferences(...)` — table `attributeReferenceValues` (+ referenceId).

Shared behaviour: slug auto-gen from `value` (`generateSlug`); slug unique per attribute (pre-check → `AttributeValueSlugTaken`); `position` auto = `max(position)+1` for the attribute when absent; `organizationId` set from input (the resolver passes caller's org or null); hard-delete; reorder = set `position = index` for each id in one transaction.

Errors: `AttributeValueNotFound` (`ATTRIBUTE_VALUE_NOT_FOUND`), `AttributeValueSlugTaken` (`{ slug }`), reuse `AttributeDbFailed`, plus `SwatchRequiresColorOrFile`.

- [ ] **Step 1: Failing integration test** (cover: create value auto-slug+position; duplicate slug; swatch requires color/file; reference uniqueness; reorder reindexes). Write ~6 `it.effect` cases over `AttributePostgresLayer`, truncating first, creating a parent attribute via direct insert, then exercising the service. Use the assertion style from Task 4.

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.** Build a private generic `makeChoiceOps(table)` returning `{ create, update, remove, reorder }`, then expose the 3 families by binding it to `attributeValues` / `attributeSwatchValues` / `attributeReferenceValues`. Swatch create/update calls `validateSwatchVisual` and maps `file` → `fileUrl`/`mimetype`; on `{ ok:false, code:'SWATCH_REQUIRES_COLOR_OR_FILE' }` → `Effect.fail(new SwatchRequiresColorOrFile())`. Reference create/update sets `referenceId` and relies on the DB `uq_reference_id` unique → map violation to `AttributeDbFailed` (or a dedicated error). `reorder` runs `db.transaction(tx => Effect.gen(... for each id: tx.update(table).set({ position: index }).where(eq(table.id, id)) ...))`.

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: check-types + lint:fix.**
- [ ] **Step 6: Commit** `git commit -m "feat(attribute): choice value service (value/swatch/reference + reorder)"`

---

## Phase 5 — Typed value service

### Task 6: `services/typed-value.ts` — text/numeric/boolean/date/file CRUD (TDD)

**Files:**
- Create: `packages/modules/attribute/src/services/typed-value.ts`
- Test: `packages/modules/attribute/src/services/typed-value.integration.test.ts`

`TypedValueService`: for each of the 5 tables, `create*`/`update*`/`delete*` (no slug, no position, no version). A private generic `makeTypedOps(table, columns)` parametrised by the value column shape. Text: `{ plain, rich? }` (rich required when the attribute is RICH_TEXT — but the service trusts the caller; GraphQL validates). File: `{ fileUrl, mimetype }` (both required by DB NOT NULL). Errors: `TypedValueNotFound`, reuse `AttributeDbFailed`.

- [ ] **Step 1: Failing integration test** — one create+read+update+delete cycle per type (5 cases) over `AttributePostgresLayer`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** the generic + 5 bindings.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: check-types + lint:fix.**
- [ ] **Step 6: Commit** `git commit -m "feat(attribute): typed value service (text/numeric/boolean/date/file)"`

### Task 7: `services/index.ts` — compose the module layer

**Files:** Create `packages/modules/attribute/src/services/index.ts`

- [ ] **Step 1: Implement**

```ts
import { Layer } from 'effect'
import * as Attribute from './attribute'
import * as AttributeValue from './attribute-value'
import * as TypedValue from './typed-value'

export { Attribute, AttributeValue, TypedValue }

export const AttributeModuleLive = Layer.mergeAll(
  Attribute.layer,
  AttributeValue.layer,
  TypedValue.layer,
)
```
- [ ] **Step 2: check-types.** Run: `pnpm --filter @czo/attribute check-types`
- [ ] **Step 3: Commit** `git commit -m "feat(attribute): compose AttributeModuleLive"`

---

## Phase 6 — GraphQL

> Read `packages/modules/stock-location/src/graphql/**` end-to-end first. Mirror its builder usage (`StockLocationGraphQLSchemaBuilder`, `t.drizzleField`/`relayMutationField`, `registerError`, `decodeGlobalID`, `ctx.runEffect`, the `BuilderSchema*`/`BuilderAuthScopes` augmentations, and `import '@czo/auth/graphql'`).

### Task 8: GraphQL scalars, enums, errors, types (object + union)

**Files:**
- Create: `graphql/index.ts` (builder type alias + `Builder*` augmentations + `registerAttributeSchema` re-export)
- Create: `graphql/schema/scalars.ts` (FileInfo object + `FileInfoInput`)
- Create: `graphql/schema/enums.ts` (`AttributeType`, `AttributeUnit`, `AttributeOrderField`, `AttributeChoiceOrderField`, local `OrderDirection`-style ref — reuse stock-location's local direction enum pattern)
- Create: `graphql/schema/errors.ts` (`registerAttributeErrors` — register every tagged error: AttributeNotFound, AttributeSlugTaken, AttributeValueNotFound, AttributeValueSlugTaken, SwatchRequiresColorOrFile, ReferenceEntityRequired, ValidationError(reuse kit), OptimisticLockError(reuse kit))
- Create: `graphql/schema/types.ts` (`Attribute` object exposing columns + `values` union connection; `AttributeValue`/`AttributeSwatchValue`/`AttributeReferenceValue`/typed value objects; `AttributeChoice` union)

- [ ] **Step 1:** Implement `graphql/index.ts` with `AttributeGraphQLSchemaBuilder = SchemaBuilder<Relations>`, `declare module '@czo/kit/graphql'` augmenting `BuilderSchemaObjects` (Attribute, AttributeValue, …), `BuilderSchemaInputs` (the where/orderBy inputs), and **no** `BuilderAuthScopes` (reuse auth's `permission` + add `attributePlatform` boolean scope — see Task 11). Mirror stock-location/graphql/index.ts exactly. `import '@czo/auth/graphql'`.
- [ ] **Step 2:** Implement scalars/enums/errors/types. The `Attribute.values` field is a relay connection of the `AttributeChoice` union; resolve it org-aware (platform ∪ caller org) by querying the right table based on `attribute.type` via `ctx.runEffect`. For non-choice types return an empty connection.
- [ ] **Step 3: check-types.**
- [ ] **Step 4: Commit** `git commit -m "feat(attribute): graphql scalars, enums, errors, types + AttributeChoice union"`

### Task 9: GraphQL inputs + queries

**Files:** Create `graphql/schema/inputs.ts`, `graphql/schema/queries.ts`

- [ ] **Step 1:** `inputs.ts` — `AttributeWhereInput` reusing kit `StringFilterInput`/`BooleanFilterInput`, local `AttributeTypeFilterInput`/`AttributeUnitFilterInput` enums, `AND/OR/NOT`, `metadata`; `AttributeOrderByInput`; `AttributeChoiceWhereInput`. (Mirror stock-location `inputs.ts`; reuse the local-enum pattern.)
- [ ] **Step 2:** `queries.ts` — `attribute(id|slug)` (`t.drizzleField`, nullable, authScope `{ auth: true }`, resolver injects caller-org visibility) and `attributes(...)` (`t.drizzleConnection`, authScope `{ auth: true }`, resolver composes where + caller-org visibility, like stock-location's `stockLocations` but visibility = platform ∪ org instead of strict org).
- [ ] **Step 3: check-types.**
- [ ] **Step 4: Commit** `git commit -m "feat(attribute): graphql inputs + queries (org-aware visibility)"`

### Task 10: GraphQL mutations

**Files:** Create `graphql/schema/mutations/{attribute,choice-value,typed-value}.ts` + `graphql/schema/index.ts`

- [ ] **Step 1:** `mutations/attribute.ts` — `createAttribute`, `updateAttribute`, `deleteAttribute` via `relayMutationField` (errors.types + tagged errors). authScopes: see Task 11.
- [ ] **Step 2:** `mutations/choice-value.ts` — value/swatch/reference create/update/delete/reorder (12 mutations). authScopes derive org from the parent attribute (Task 11).
- [ ] **Step 3:** `mutations/typed-value.ts` — text/numeric/boolean/date/file create/update/delete (15 mutations).
- [ ] **Step 4:** `graphql/schema/index.ts` `registerAttributeSchema(builder)` = call types → errors → inputs → enums → scalars → queries → all mutations (order matters: types/inputs before fields). Re-export from `graphql/index.ts`.
- [ ] **Step 5: check-types + lint:fix.**
- [ ] **Step 6: Commit** `git commit -m "feat(attribute): graphql mutations (attribute, choice, typed values)"`

### Task 11: authz — org tier + platform-admin gate

**Files:** Create `graphql/schema/stock-location`… → `graphql/authz.ts`; reference in mutation files.

Decision (spec §10.1): **org tier** uses auth's `permission` scope with `resource:'attribute'` + the caller-derived org; **platform tier** (organizationId null) uses a module-local `attributePlatform` boolean authScope = "caller's global role is admin".

- [ ] **Step 1:** `graphql/authz.ts`:
  - `loadAttributeOrg(ctx, attributeGlobalId): Promise<number | null | undefined>` — `ctx.runEffect` → `AttributeService.findFirst({ where:{ id } }, { organizationId: null })` catching NotFound → `undefined` (unknown); returns `row.organizationId` (`null` = platform, number = org).
  - `isPlatformAdmin(ctx): boolean` — `(ctx.auth?.user?.role ?? '').split(',').includes('admin')`.
- [ ] **Step 2:** Add `attributePlatform: boolean` to the module's `BuilderAuthScopes` augmentation (in `graphql/index.ts`) and register its resolver in the module's `graphql.authScope` contributor (`{ attributePlatform: isPlatformAdmin(ctx) }`). (Add `authScope` to `defineModule` in Phase 7.)
- [ ] **Step 3:** Wire mutation authScopes:
  - **create** (input carries `organizationId?`): if `organizationId == null` → `{ attributePlatform: true }`; else `{ permission: { resource:'attribute', actions:['create'], organization } }`.
  - **update/delete/value/typed by-id**: async authScope → `const org = await loadAttributeOrg(ctx, args.input.id-or-attributeId)`; `org === undefined` → `{ auth: true }` (defer to service NotFound); `org === null` → `{ attributePlatform: true }`; else `{ permission: { resource:'attribute', actions:[verb], organization: org } }`. (`verb` = create for value-add/extend, update for edits/reorder, delete for deletes.)
- [ ] **Step 4: check-types + lint:fix.**
- [ ] **Step 5: Commit** `git commit -m "feat(attribute): authz — org permission + platform-admin gate"`

---

## Phase 7 — Module wiring

### Task 12: `src/index.ts` — defineModule + access domain registration

**Files:** Create `packages/modules/attribute/src/index.ts`

> Mirror `packages/modules/stock-location/src/index.ts` exactly.

- [ ] **Step 1: Implement**

```ts
import type { Layer } from 'effect'
import { Access } from '@czo/auth/services'
import { registerAttributeSchema } from '@czo/attribute/graphql'
import { attributeRelations } from '@czo/attribute/relations'
import * as attributeSchema from '@czo/attribute/schema'
import { AttributeModuleLive } from '@czo/attribute/services'
import { defineModule } from '@czo/kit/module'
import { Effect } from 'effect'
import { attributeScopes } from './graphql/authz' // exports (ctx) => ({ attributePlatform: isPlatformAdmin(ctx) })

const ATTRIBUTE_STATEMENTS = { attribute: ['create', 'read', 'update', 'delete'] } as const
const ATTRIBUTE_HIERARCHY: Access.HierarchyLevel<typeof ATTRIBUTE_STATEMENTS>[] = [
  { name: 'attribute:viewer', permissions: { attribute: ['read'] } },
  { name: 'attribute:manager', permissions: { attribute: ['create', 'update'] } },
  { name: 'attribute:admin', permissions: { attribute: ['delete'] } },
]

export default defineModule(() => ({
  name: 'attribute',
  version: '0.0.1',
  layer: AttributeModuleLive as unknown as Layer.Layer<never, never, never>,
  db: {
    schema: attributeSchema as unknown as Record<string, unknown>,
    relations: attributeRelations,
  },
  graphql: {
    contribution: builder => registerAttributeSchema(builder as never),
    authScope: attributeScopes,
  },
  onStart: Effect.gen(function* () {
    const access = yield* Access.AccessService
    yield* access.register({ name: 'attribute', statements: ATTRIBUTE_STATEMENTS, hierarchy: ATTRIBUTE_HIERARCHY })
  }) as unknown as Effect.Effect<void, never, never>,
}))
```

- [ ] **Step 2: check-types + lint:fix.**
- [ ] **Step 3: build** to verify dist + exports resolve. Run: `pnpm --filter @czo/attribute build`. Expected: emits `dist/{index,database/schema,database/relations,services/index,graphql/index}.mjs`.
- [ ] **Step 4: Commit** `git commit -m "feat(attribute): defineModule entry + register access domain"`

---

## Phase 8 — App integration

### Task 13: Wire into apps/life + migrate + boot

**Files:**
- Modify: `apps/life/package.json` (add `"@czo/attribute": "workspace:*"`)
- Modify: `apps/life/src/modules.ts`
- Modify: `apps/life/drizzle.config.ts` (if it aggregates module schemas for migration — check how stock-location is included)

- [ ] **Step 1:** Add dep + `pnpm install`.
- [ ] **Step 2:** `apps/life/src/modules.ts` — import `attributeModule from '@czo/attribute'`, add to `modules` array **after** `authModule` (and after/around stockLocation — order vs stock-location is independent; attribute only depends on auth):

```ts
import attributeModule from '@czo/attribute'
// ...
export const modules: ReadonlyArray<CzoModule> = [authModule, stockLocationModule, attributeModule]
```
- [ ] **Step 3:** Ensure attribute migrations run for apps/life (mirror how stock-location's migrations are applied — check `apps/life` migration aggregation/`drizzle.config.ts`; if per-module, run `pnpm --filter @czo/attribute migrate:latest` against the dev DB).
- [ ] **Step 4: build deps + boot**

Run: `pnpm --filter @czo/attribute build && pnpm --filter @czo/auth build && pnpm --filter @czo/kit build` then start apps/life (`pnpm dev:life` or the project's run command) against a dev Postgres.
Expected: server boots; GraphQL schema builds (no `query.then`/missing-type errors); `attribute`/`attributes` queries + `createAttribute` mutation appear in the schema. Smoke a `createAttribute` mutation.

- [ ] **Step 5: Commit** `git commit -m "feat(life): register @czo/attribute module"`

---

## Phase 9 — Scoping integration tests

### Task 14: end-to-end scoping behaviour (TDD, service-level)

**Files:** Create `packages/modules/attribute/src/services/scoping.integration.test.ts`

- [ ] **Step 1: Failing tests** covering the spec §2 matrix:
  - admin creates platform attribute + platform values; org sees them (read).
  - org creates own attribute + values; only that org sees them; other org does not.
  - org "extends" a platform attribute by adding an org-value; reading the attribute's values as that org returns platform ∪ org values; another org sees only platform.
  - org-value on a platform attribute carries `organizationId = org`; never mutates platform values.
  These assert at the **service** layer (the authz gate is GraphQL-level; here verify the data-visibility filters in `AttributeService.findMany` and the choice-value reads used by `Attribute.values`).
- [ ] **Step 2: Run — FAIL** for any gaps; **Step 3:** fix the service visibility helpers if needed; **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `git commit -m "test(attribute): hybrid platform/org scoping integration"`

---

## Self-Review (run before execution)

- **Spec coverage:** §1 decisions → Tasks 1 (PK/cascade/scoping cols), 4 (optimistic), 11 (authz), 0 (stack). §2 scoping → 4, 11, 14. §3 schema → 1. §4 services → 4-7. §5 GraphQL → 8-11. §6 authz → 11. §7 structure → 0,12. §8 tests → 4-6,14. ✔ All covered.
- **Open points:** §10.1 platform authz → Task 11 (platform-admin check, documented limitation). §10.2 org on typed values → schema has the column (Task 1); resolver passes it (Task 10). §10.3 slug global → Task 1 `uq_attributes_slug`. ✔
- **Type consistency:** `AttributeService` (Task 4) `findFirst(config, scope)` signature reused by Task 11 `loadAttributeOrg`; `ReadScope = { organizationId }` consistent; error tags (`AttributeNotFound`, `AttributeSlugTaken`, `SwatchRequiresColorOrFile`) used in Tasks 4/5/8/11 match. ✔
- **Known soft spots to resolve during execution (not placeholders — concrete):** (a) the exact `ServiceLayer` provision in tests must copy stock-location's working pattern; (b) the `Attribute.values` union connection resolver and Pothos union/relay wiring (Task 8) — follow Pothos docs + stock-location connection pattern; (c) Pothos `errors.types` listing for each mutation must include only thrown errors.

---

## Notes / Deviations

- **Hard-delete** deviates from `coding-style.md` soft-delete convention — intentional per spec (Saleor-style definitions catalog + cascade). No `deletedAt`.
- **Platform-tier authz** uses a global-admin-role check (`attributePlatform` scope) rather than the access registry, because a resource can live in only one access domain (org vs admin). Future improvement: allow a resource to be granted by multiple domains, or merge provider roles by name.
- **Consumer junction tables** (e.g. product↔attribute) are out of scope — built by the consuming module.
