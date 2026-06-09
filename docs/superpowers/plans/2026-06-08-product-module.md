# @czo/product Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@czo/product` — the Effect-native product-catalog module (global + org-owned products, variants/matrix, attribute assignment, classification, channel publication, media, translations) per `docs/superpowers/specs/2026-06-08-product-module-design.md`.

**Architecture:** Mirrors `@czo/price` / `@czo/inventory` exactly: Drizzle schema + `defineRelationsPart` relations, colocated `Context.Service` + `Data.TaggedError` services on `@effect/sql-pg`, Pothos `drizzleNode`/relay GraphQL with `@pothos/plugin-scope-auth`, wired as a `CzoModule` via `defineModule`. Two layers: **definition** (`organizationId` nullable → global vs org-owned) and **graft** (`org_id`-carrying satellite rows merged on read via `org_id IS NULL OR org_id = :orgId`).

**Tech Stack:** Effect-TS 4, Drizzle ORM 1.0 RQBv2, `@effect/sql-pg`/effect-postgres, Pothos, `@czo/kit`, Testcontainers Postgres, `@effect/vitest`.

> **EXHAUSTIVE TESTS — REQUIRED:** the test snippets shown inside each task are
> illustrative *starters*, not the full set. The complete, mandatory list of cases
> lives in the companion **`2026-06-08-product-module-test-catalog.md`**. For each
> task, implement **every** catalog case for the file(s) that task touches (the
> catalog's §4 maps cases → phases). A task's tests are done only when its catalog
> sections are all green, including every error path, edge case, soft-delete /
> optimistic-lock / merge-predicate / cross-org / adoption-guard variant listed
> there. Do not stop at the happy path shown in the task.

---

## Reference Modules (read these patterns; do not invent)

- **Package skeleton / scripts / exports:** `packages/modules/price/package.json`, `tsconfig.json`, `drizzle.config.ts`, `vitest.config.ts`, `eslint.config.js`, `build.config.ts`. Copy these verbatim, renaming `price`→`product`.
- **Schema conventions:** `packages/modules/inventory/src/database/schema.ts` (nullable vs not-null org, `check`, partial unique indexes, `SchemaRegistryShape` augmentation), `packages/modules/channel/src/database/schema.ts` (cross-module FK-less refs).
- **Relations:** `packages/modules/price/src/database/relations.ts` (`Pick<SchemaRegistryShape>`, `defineRelationsPart`, side-effect `import '@czo/auth/schema'`).
- **Service shape:** `packages/modules/price/src/services/price.ts` (`Context.Service<T,{...}>()(id)`, `Data.TaggedError`, `Layer.effect`, `optimisticUpdate`, `dbErr`/`dbErrSql`), `packages/modules/price/src/services/index.ts` (`PriceModuleLive = Layer.mergeAll(...)`).
- **Module wiring:** `packages/modules/price/src/index.ts` (access domain, `db`, `graphql.contribution`, `nodeGuards`, `onStart`).
- **GraphQL:** `packages/modules/price/src/graphql/index.ts` (augmentations), `.../schema/price/{authz,errors,inputs,types,queries,mutations/*}.ts`, `.../node-guards.ts`.
- **Translation helper:** `packages/modules/translation/src/graphql/translated-field.ts` (`translatedField`, `pickTranslation`) and its fixture `packages/modules/translation/src/e2e/fixtures/widget/` for the consumer pivot pattern.
- **E2E harness:** `packages/modules/price/src/e2e/harness.ts` + `price.e2e.test.ts` (`bootTestApp`, `signUp`, `gql`, `grantGlobalRole`, org-with-access helpers).
- **Attribute typed-value service (dependency for Phase 2):** `packages/modules/attribute/src/services/typed-value.ts` — read its exported API before writing `AttributeAssignmentService`.

**Conventions (non-negotiable):** strict TS; immutability (spread, never mutate); files 200–400 lines; no `console.log`; no `async`/`await`/`try`/`catch` in service code (`Effect.gen`/`Effect.fnUntraced`/`Effect.sync`/`Effect.tryPromise`); soft-delete via `deletedAt`; optimistic lock via `version`; cross-module refs are FK-less `integer`; intra-module refs are real FKs.

> **COMMIT POLICY (overrides every per-task "Commit" step below):** This repo
> commits **once at the end of the sprint, after explicit user review**
> (CLAUDE.md "No-commit-until-review"; same as how `@czo/price`/`@czo/translation`
> were built). During execution, the per-task "Commit" blocks mean **stage only**:
> run the `git add` shown, but **do NOT run `git commit`**, never `git push`, never
> open a PR, never `git stash`. The single commit + push + PR happen only when the
> user explicitly asks after reviewing the staged sprint.

**Module identity / org rules used everywhere:**
- `organizationId` nullable on definition tables; `null` = global.
- Merge predicate on reads: a row is visible to viewer-org `X` iff `org_id IS NULL OR org_id = X`.
- Global writes require the **global** `product` permission (auth `permission` scope with NO `organization`); org writes/grafts require the **org** scope and the row's `org_id` must equal the acting org.

---

## Phase 1 — Foundations & globality

Creates the package, the definition-layer schema (product_types, product_type_attributes, products, product_variants), relations, the four core services with global/org gating + matrix validation, migration, and unit+integration tests.

### Task 1: Scaffold the package

**Files:**
- Create: `packages/modules/product/package.json`, `tsconfig.json`, `drizzle.config.ts`, `vitest.config.ts`, `eslint.config.js`, `build.config.ts`, `src/index.ts` (temporary stub).

- [ ] **Step 1: Copy the price package skeleton.**

```bash
cd /workspace/c-zo
mkdir -p packages/modules/product/src
cp packages/modules/price/tsconfig.json packages/modules/product/tsconfig.json
cp packages/modules/price/vitest.config.ts packages/modules/product/vitest.config.ts
cp packages/modules/price/eslint.config.js packages/modules/product/eslint.config.js
cp packages/modules/price/build.config.ts packages/modules/product/build.config.ts
cp packages/modules/price/drizzle.config.ts packages/modules/product/drizzle.config.ts
```

- [ ] **Step 2: Write `packages/modules/product/package.json`.** Copy price's verbatim, replacing every `price` with `product` and the description. Keep `exports` for `.`, `./schema`, `./relations`, `./services`, `./graphql`. Keep `peerDependencies: { "@czo/auth": "workspace:*" }` and add `"@czo/attribute": "workspace:*"` to both `peerDependencies` and `devDependencies` (needed in Phase 2). Add `"@czo/channel": "workspace:*"`, `"@czo/inventory": "workspace:*"`, `"@czo/price": "workspace:*"`, `"@czo/translation": "workspace:*"` to `devDependencies` (cross-module refs validated in services + used in E2E). `dependencies` keep `@czo/kit`, `drizzle-orm`, `effect`, `zod`.

- [ ] **Step 3: Check `drizzle.config.ts` points at the right paths.** It should reference `./src/database/schema.ts` and `out: './migrations'` — identical to price. Confirm.

- [ ] **Step 4: Write a temporary `src/index.ts` stub** so the package type-checks before the module is wired:

```ts
export const PRODUCT_MODULE_PLACEHOLDER = true
```

- [ ] **Step 5: Install + verify the workspace resolves.**

Run: `cd /workspace/c-zo && pnpm install`
Expected: lockfile updates, `@czo/product` linked, no errors.

- [ ] **Step 6: Commit.**

```bash
git add packages/modules/product
git commit -m "chore(product): scaffold @czo/product package"
```

### Task 2: Definition-layer schema

**Files:**
- Create: `packages/modules/product/src/database/schema.ts`

- [ ] **Step 1: Write the definition tables + enums.** Cross-module refs are FK-less `integer`. `organizationId` is nullable (no `.notNull()`).

```ts
import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core'

export const attributeAssignmentEnum = pgEnum('product_attribute_assignment', ['PRODUCT', 'VARIANT'])
export const valueKindEnum = pgEnum('product_value_kind', ['VALUE', 'SWATCH', 'REFERENCE', 'TEXT', 'NUMERIC', 'BOOLEAN', 'DATE', 'FILE'])
export const mediaTypeEnum = pgEnum('product_media_type', ['IMAGE', 'VIDEO'])

export const productTypes = pgTable('product_types', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id'), // nullable: null = global
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  isShippingRequired: boolean('is_shipping_required').notNull().default(true),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('product_types_org_idx').on(t.organizationId),
  uniqueIndex('product_types_org_slug_uniq').on(t.organizationId, t.slug).where(sql`${t.deletedAt} IS NULL`),
])

export const productTypeAttributes = pgTable('product_type_attributes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  productTypeId: integer('product_type_id').notNull().references(() => productTypes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'), // nullable: null = base declaration, set = org extension
  attributeId: integer('attribute_id').notNull(), // cross-module ref to @czo/attribute, no FK
  assignment: attributeAssignmentEnum('assignment').notNull(),
  variantSelection: boolean('variant_selection').notNull().default(false),
  position: integer('position').notNull().default(0),
}, t => [
  unique('product_type_attributes_uniq').on(t.productTypeId, t.organizationId, t.attributeId),
  index('product_type_attributes_type_idx').on(t.productTypeId),
  // variant_selection only on VARIANT assignment
  check('chk_pta_variant_selection', sql`${t.variantSelection} = false OR ${t.assignment} = 'VARIANT'`),
])

export const products = pgTable('products', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id'), // nullable: null = global
  productTypeId: integer('product_type_id').notNull().references(() => productTypes.id, { onDelete: 'restrict' }),
  handle: text('handle').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('products_org_idx').on(t.organizationId),
  index('products_type_idx').on(t.productTypeId),
  uniqueIndex('products_org_handle_uniq').on(t.organizationId, t.handle).where(sql`${t.deletedAt} IS NULL`),
])

export const productVariants = pgTable('product_variants', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id'), // nullable, mirrors parent product
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  sku: text('sku'),
  position: integer('position').notNull().default(0),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('product_variants_product_idx').on(t.productId),
  uniqueIndex('product_variants_org_sku_uniq').on(t.organizationId, t.sku).where(sql`${t.sku} IS NOT NULL AND ${t.deletedAt} IS NULL`),
])

declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    productTypes: typeof productTypes
    productTypeAttributes: typeof productTypeAttributes
    products: typeof products
    productVariants: typeof productVariants
  }
}
```

- [ ] **Step 2: Type-check the schema.**

Run: `cd packages/modules/product && pnpm check-types`
Expected: PASS (the `declare module` augmentation resolves against `@czo/kit/db`).

- [ ] **Step 3: Commit.**

```bash
git add packages/modules/product/src/database/schema.ts
git commit -m "feat(product): definition-layer schema (types, type-attributes, products, variants)"
```

### Task 3: Relations + first migration

**Files:**
- Create: `packages/modules/product/src/database/relations.ts`
- Create: `packages/modules/product/migrations/<generated>/` (via drizzle-kit)

- [ ] **Step 1: Write `relations.ts`.** Mirror price; include `organizations` for the org relation and `import '@czo/auth/schema'` side-effect.

```ts
import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'
import '@czo/auth/schema'

type ProductSchema = Pick<
  SchemaRegistryShape,
  'productTypes' | 'productTypeAttributes' | 'products' | 'productVariants' | 'organizations'
>

export function productRelations(schema: ProductSchema) {
  const { productTypes, productTypeAttributes, products, productVariants, organizations } = schema

  return defineRelationsPart(
    { productTypes, productTypeAttributes, products, productVariants, organizations },
    r => ({
      productTypes: {
        organization: r.one.organizations({ from: r.productTypes.organizationId, to: r.organizations.id }),
        attributes: r.many.productTypeAttributes({ from: r.productTypes.id, to: r.productTypeAttributes.productTypeId }),
        products: r.many.products({ from: r.productTypes.id, to: r.products.productTypeId }),
      },
      productTypeAttributes: {
        productType: r.one.productTypes({ from: r.productTypeAttributes.productTypeId, to: r.productTypes.id }),
      },
      products: {
        organization: r.one.organizations({ from: r.products.organizationId, to: r.organizations.id }),
        productType: r.one.productTypes({ from: r.products.productTypeId, to: r.productTypes.id }),
        variants: r.many.productVariants({ from: r.products.id, to: r.productVariants.productId }),
      },
      productVariants: {
        product: r.one.products({ from: r.productVariants.productId, to: r.products.id }),
      },
    }),
  )
}

export type Relations = ReturnType<typeof productRelations>
```

> Later phases extend this `ProductSchema` Pick and the relation map as new tables land. Each phase's relations task says exactly what to add.

- [ ] **Step 2: Generate the migration.**

Run: `cd packages/modules/product && pnpm migrate:generate`
Expected: a new folder `migrations/<timestamp>_<name>/migration.sql` containing the 3 enums + 4 tables.

- [ ] **Step 3: Type-check.**

Run: `pnpm check-types`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add packages/modules/product/src/database/relations.ts packages/modules/product/migrations
git commit -m "feat(product): relations + initial migration"
```

### Task 4: `ProductTypeService` (global/org gating + org type-extensions)

**Files:**
- Create: `packages/modules/product/src/services/product-type.ts`
- Create: `packages/modules/product/src/services/product-type.integration.test.ts`
- Create: `packages/modules/product/src/testing/postgres.ts` (shared test layer; copy + adapt from `packages/modules/price/src/services/price.integration.test.ts`'s layer or `@czo/kit/testing`).

- [ ] **Step 1: Write the shared Postgres test layer.** Copy the pattern from price's integration test (it uses `makePostgresTestLayer` from `@czo/kit/testing` with the product schema + relations + migrations dir). Export `ProductPostgresLayer` and `truncateProduct(db)` that `TRUNCATE`s all product tables `RESTART IDENTITY CASCADE`. Read `packages/modules/kit/src/testing/*` and price's usage to match the exact signature.

- [ ] **Step 2: Write the failing integration test** (`product-type.integration.test.ts`):

```ts
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { ProductTypeService } from './product-type'
import { ProductPostgresLayer, truncateProduct } from '../testing/postgres'

describe('ProductTypeService', () => {
  it.layer(ProductPostgresLayer)('createType', (it) => {
    it.effect('creates a global type (org null) and an org type', () =>
      Effect.gen(function* () {
        const svc = yield* ProductTypeService
        const global = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
        expect(global.organizationId).toBeNull()
        const org = yield* svc.createType({ organizationId: 1, name: 'Shirt', slug: 'shirt', isShippingRequired: true })
        expect(org.organizationId).toBe(1)
      }))

    it.effect('declares a base attribute and an org extension', () =>
      Effect.gen(function* () {
        const svc = yield* ProductTypeService
        const t = yield* svc.createType({ organizationId: null, name: 'Shirt', slug: 'shirt2', isShippingRequired: true })
        const base = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: null, attributeId: 10, assignment: 'VARIANT', variantSelection: true, position: 0 })
        expect(base.variantSelection).toBe(true)
        const ext = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: 1, attributeId: 11, assignment: 'PRODUCT', variantSelection: false, position: 1 })
        expect(ext.organizationId).toBe(1)
        const effective = yield* svc.listTypeAttributes({ productTypeId: t.id, orgId: 1 })
        expect(effective.map(a => a.attributeId).sort()).toEqual([10, 11])
        const baseOnly = yield* svc.listTypeAttributes({ productTypeId: t.id, orgId: 2 })
        expect(baseOnly.map(a => a.attributeId)).toEqual([10]) // org 2 sees only base
      }))

    it.effect('rejects variant_selection on a PRODUCT assignment', () =>
      Effect.gen(function* () {
        const svc = yield* ProductTypeService
        const t = yield* svc.createType({ organizationId: null, name: 'X', slug: 'x', isShippingRequired: true })
        const err = yield* svc.declareAttribute({ productTypeId: t.id, organizationId: null, attributeId: 1, assignment: 'PRODUCT', variantSelection: true, position: 0 }).pipe(Effect.flip)
        expect(err._tag).toBe('InvalidAttributeDeclaration')
      }))
  })
})
```

- [ ] **Step 3: Run the test, verify it fails** (service does not exist).

Run: `pnpm test src/services/product-type.integration.test.ts`
Expected: FAIL — `ProductTypeService` not found.

- [ ] **Step 4: Implement `product-type.ts`.** Follow `price.ts` shape exactly. Key points: `createType`/`updateType`(optimistic)/`softDeleteType`/`findTypeById`/`listTypes(orgId)` (merge predicate), `declareAttribute`/`undeclareAttribute`/`listTypeAttributes({productTypeId, orgId})` (returns base ∪ org rows). Errors: `ProductTypeNotFound`, `InvalidAttributeDeclaration`, `ProductTypeDbFailed`. Use the merge predicate in list reads: `where: (and(isNull(organizationId), ...) OR eq(organizationId, orgId))` — in RQBv2 object form use `OR`/`isNull`/`eq` from `drizzle-orm`. Service does NOT enforce auth (the GraphQL scope does); it trusts the `organizationId` arg.

```ts
import { Context, Data, Effect, Layer } from 'effect'
import { and, eq, isNull, or } from 'drizzle-orm'
import { DrizzleDb } from '@czo/kit/db'
import { optimisticUpdate } from '@czo/kit/db' // confirm exact import path from price.ts
import { productTypes, productTypeAttributes } from '../database/schema'

export class ProductTypeNotFound extends Data.TaggedError('ProductTypeNotFound')<{ id: number }> {}
export class InvalidAttributeDeclaration extends Data.TaggedError('InvalidAttributeDeclaration')<{ reason: string }> {}
export class ProductTypeDbFailed extends Data.TaggedError('ProductTypeDbFailed')<{ cause: unknown }> {}

// ... types CreateTypeInput, DeclareAttributeInput, etc.

export class ProductTypeService extends Context.Service<ProductTypeService, {
  readonly createType: (i: CreateTypeInput) => Effect.Effect<ProductType, ProductTypeDbFailed>
  readonly updateType: (i: UpdateTypeInput) => Effect.Effect<ProductType, ProductTypeNotFound | ProductTypeDbFailed>
  readonly softDeleteType: (id: number, version: number) => Effect.Effect<void, ProductTypeNotFound | ProductTypeDbFailed>
  readonly findTypeById: (id: number) => Effect.Effect<ProductType, ProductTypeNotFound | ProductTypeDbFailed>
  readonly listTypes: (orgId: number) => Effect.Effect<ReadonlyArray<ProductType>, ProductTypeDbFailed>
  readonly declareAttribute: (i: DeclareAttributeInput) => Effect.Effect<ProductTypeAttribute, InvalidAttributeDeclaration | ProductTypeDbFailed>
  readonly undeclareAttribute: (id: number) => Effect.Effect<void, ProductTypeDbFailed>
  readonly listTypeAttributes: (i: { productTypeId: number, orgId: number }) => Effect.Effect<ReadonlyArray<ProductTypeAttribute>, ProductTypeDbFailed>
}>()('@czo/product/ProductTypeService') {}

// make = Effect.gen(function*() { const db = yield* DrizzleDb; ... return { ... } satisfies Context.Service.Shape<typeof ProductTypeService> })
// export const ProductTypeServiceLive = Layer.effect(ProductTypeService, make)
```

Implementation notes the engineer must honor:
- `declareAttribute` rejects with `InvalidAttributeDeclaration` when `variantSelection && assignment !== 'VARIANT'` (the DB check also guards this, but fail early in-service for a clean tagged error).
- `listTypeAttributes` merge predicate: `where: or(isNull(productTypeAttributes.organizationId), eq(productTypeAttributes.organizationId, orgId))` AND `eq(productTypeId)`.
- Reads exclude soft-deleted (`isNull(deletedAt)`) for the soft-deletable tables.

- [ ] **Step 5: Run the test, verify it passes.**

Run: `pnpm test src/services/product-type.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Lint + commit.**

```bash
pnpm lint:fix
git add packages/modules/product/src/services/product-type.ts packages/modules/product/src/services/product-type.integration.test.ts packages/modules/product/src/testing/postgres.ts
git commit -m "feat(product): ProductTypeService with global/org gating + type extensions"
```

### Task 5: `ProductService` (global-type invariant)

**Files:**
- Create: `packages/modules/product/src/services/product.ts`
- Create: `packages/modules/product/src/services/product.integration.test.ts`

- [ ] **Step 1: Write the failing test.** Cover: create org-owned product; create global product referencing a global type; **reject** a global product (org null) referencing an org-owned type (`GlobalProductRequiresGlobalType`); handle uniqueness per scope (`HandleTaken`); merge-predicate list (global ∪ org).

```ts
it.effect('rejects a global product on an org-owned type', () =>
  Effect.gen(function* () {
    const types = yield* ProductTypeService
    const products = yield* ProductService
    const orgType = yield* types.createType({ organizationId: 1, name: 'T', slug: 't', isShippingRequired: true })
    const err = yield* products.createProduct({ organizationId: null, productTypeId: orgType.id, handle: 'h', name: 'P' }).pipe(Effect.flip)
    expect(err._tag).toBe('GlobalProductRequiresGlobalType')
  }))
```

- [ ] **Step 2: Run, verify fail.** `pnpm test src/services/product.integration.test.ts` → FAIL.

- [ ] **Step 3: Implement `product.ts`.** Methods: `createProduct`/`updateProduct`/`softDeleteProduct`/`findProductById`/`findProductByHandle({orgId, handle})`/`listProducts(orgId)` (merge predicate). Errors: `ProductNotFound`, `HandleTaken`, `GlobalProductRequiresGlobalType`, `ProductDbFailed`. `createProduct` loads the referenced type via `ProductTypeService.findTypeById` (inject it) and enforces: if `input.organizationId === null` then `type.organizationId` MUST be `null`. Handle uniqueness: catch the unique-index violation → `HandleTaken` (mirror price's `dbErrSql`/unique handling).

- [ ] **Step 4: Run, verify pass.** Expected: all green.

- [ ] **Step 5: Lint + commit.**

```bash
pnpm lint:fix
git add packages/modules/product/src/services/product.ts packages/modules/product/src/services/product.integration.test.ts
git commit -m "feat(product): ProductService with global-type invariant + handle uniqueness"
```

### Task 6: `VariantService` (matrix validation)

**Files:**
- Create: `packages/modules/product/src/services/variant.ts`
- Create: `packages/modules/product/src/services/matrix.ts` (pure helper)
- Create: `packages/modules/product/src/services/matrix.test.ts` (pure unit, plain `vitest`)
- Create: `packages/modules/product/src/services/variant.integration.test.ts`

- [ ] **Step 1: Write the pure matrix unit test** (`matrix.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { variantSelectionKey, isDuplicateMatrix } from './matrix'

describe('variantSelectionKey', () => {
  it('builds an order-independent key from (attributeId,valueId) pairs', () => {
    const a = variantSelectionKey([{ attributeId: 1, valueId: 5 }, { attributeId: 2, valueId: 9 }])
    const b = variantSelectionKey([{ attributeId: 2, valueId: 9 }, { attributeId: 1, valueId: 5 }])
    expect(a).toBe(b)
  })
})

describe('isDuplicateMatrix', () => {
  it('flags a combo already present among siblings', () => {
    const existing = [[{ attributeId: 1, valueId: 5 }]]
    expect(isDuplicateMatrix(existing, [{ attributeId: 1, valueId: 5 }])).toBe(true)
    expect(isDuplicateMatrix(existing, [{ attributeId: 1, valueId: 6 }])).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verify fail.** `pnpm test src/services/matrix.test.ts` → FAIL.

- [ ] **Step 3: Implement `matrix.ts`** (pure, no Effect):

```ts
export interface SelectionPair { readonly attributeId: number, readonly valueId: number }

export function variantSelectionKey(pairs: ReadonlyArray<SelectionPair>): string {
  return [...pairs]
    .map(p => `${p.attributeId}:${p.valueId}`)
    .sort()
    .join('|')
}

export function isDuplicateMatrix(existing: ReadonlyArray<ReadonlyArray<SelectionPair>>, candidate: ReadonlyArray<SelectionPair>): boolean {
  const key = variantSelectionKey(candidate)
  return existing.some(combo => variantSelectionKey(combo) === key)
}
```

- [ ] **Step 4: Run, verify pass.** Expected: 2 tests green.

- [ ] **Step 5: Write the failing variant integration test.** Cover: create variant under a product; reject a second variant with the same variant-selection combo (`DuplicateVariantMatrix`); `sku` uniqueness per org (`SkuTaken`). The variant-selection values come from `variant_attribute_values` (Phase 2) — for THIS task, `VariantService.createVariant` accepts an explicit `selection: SelectionPair[]` arg and validates uniqueness against siblings using `matrix.ts` (the GraphQL layer will populate it later). Persisting the selection rows happens in Phase 2; here we validate + persist the variant row only, and store the selection check against an in-memory/derived sibling list loaded from `variant_attribute_values` (empty until Phase 2 — so test passes a stub list via a service method `siblingSelections(productId)` you implement to read whatever exists).

> To keep Task 6 self-contained before Phase 2 exists, implement `createVariant` to (a) validate sku uniqueness, (b) accept `selection` and call `isDuplicateMatrix(siblingSelections, selection)` where `siblingSelections` is read via a private helper that returns `[]` until `variant_attribute_values` exists. Add a focused test that calls `createVariant` twice with the SAME `selection` and asserts the 2nd fails once the helper is wired in Phase 2. For Task 6, assert sku uniqueness + single-variant creation; mark the duplicate-matrix assertion `it.effect.skip` with a `// unskip in Phase 2` comment.

- [ ] **Step 6: Implement `variant.ts`.** Methods: `createVariant`/`updateVariant`/`softDeleteVariant`/`findVariantById`/`listVariants(productId)`. Errors: `VariantNotFound`, `SkuTaken`, `DuplicateVariantMatrix`, `VariantDbFailed`. `createVariant` inherits `organizationId` from the parent product (load it). sku uniqueness → catch unique violation → `SkuTaken`.

- [ ] **Step 7: Run tests, verify pass** (matrix unit + variant integration, duplicate-matrix skipped).

- [ ] **Step 8: Lint + commit.**

```bash
pnpm lint:fix
git add packages/modules/product/src/services/variant.ts packages/modules/product/src/services/matrix.ts packages/modules/product/src/services/matrix.test.ts packages/modules/product/src/services/variant.integration.test.ts
git commit -m "feat(product): VariantService + pure matrix-uniqueness helper"
```

### Task 6B: Adoption — schema + `AdoptionService`

Adoption is the single source of truth for "org X uses global product P". It is a
**prerequisite for grafting** on a global product (Phases 2/3/5 call
`AdoptionService.isAdopted` as a guard), so it lands here in Phase 1.

**Files:**
- Modify: `packages/modules/product/src/database/schema.ts`, `relations.ts`; migration.
- Create: `packages/modules/product/src/services/adoption.ts`, `adoption.integration.test.ts`.

- [ ] **Step 1: Add the table to `schema.ts`** (extend `SchemaRegistryShape` too):

```ts
export const productOrgAdoptions = pgTable('product_org_adoptions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id').notNull(),
  adoptedAt: timestamp('adopted_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  uniqueIndex('product_org_adoptions_uniq').on(t.productId, t.organizationId).where(sql`${t.deletedAt} IS NULL`),
  index('product_org_adoptions_org_idx').on(t.organizationId),
])
```

- [ ] **Step 2: Extend `relations.ts`** — add `productOrgAdoptions` to the `Pick`, destructure, table map, and a `products.adoptions` (`r.many`) + `productOrgAdoptions.product` (`r.one`) relation.

- [ ] **Step 3: Generate migration.** `pnpm migrate:generate`. Type-check.

- [ ] **Step 4: Write the failing integration test** (`adoption.integration.test.ts`):

```ts
it.effect('adopts a global product, reports adoption, and unadopts', () =>
  Effect.gen(function* () {
    const types = yield* ProductTypeService
    const products = yield* ProductService
    const adoption = yield* AdoptionService
    const gType = yield* types.createType({ organizationId: null, name: 'T', slug: 't', isShippingRequired: true })
    const gProduct = yield* products.createProduct({ organizationId: null, productTypeId: gType.id, handle: 'h', name: 'P' })

    expect(yield* adoption.isAdopted({ productId: gProduct.id, orgId: 1 })).toBe(false)
    yield* adoption.adoptProduct({ productId: gProduct.id, orgId: 1 })
    expect(yield* adoption.isAdopted({ productId: gProduct.id, orgId: 1 })).toBe(true)
    expect((yield* adoption.listAdoptedProducts(1)).map(p => p.id)).toEqual([gProduct.id])
    expect(yield* adoption.isAdopted({ productId: gProduct.id, orgId: 2 })).toBe(false)

    yield* adoption.unadoptProduct({ productId: gProduct.id, orgId: 1 })
    expect(yield* adoption.isAdopted({ productId: gProduct.id, orgId: 1 })).toBe(false)
    // re-adopt after unadopt works (partial-unique excludes the soft-deleted row)
    yield* adoption.adoptProduct({ productId: gProduct.id, orgId: 1 })
    expect(yield* adoption.isAdopted({ productId: gProduct.id, orgId: 1 })).toBe(true)
  }))

it.effect('rejects adopting an org-owned product', () =>
  Effect.gen(function* () {
    const types = yield* ProductTypeService
    const products = yield* ProductService
    const adoption = yield* AdoptionService
    const oType = yield* types.createType({ organizationId: 1, name: 'T', slug: 't2', isShippingRequired: true })
    const oProduct = yield* products.createProduct({ organizationId: 1, productTypeId: oType.id, handle: 'h2', name: 'P' })
    const err = yield* adoption.adoptProduct({ productId: oProduct.id, orgId: 2 }).pipe(Effect.flip)
    expect(err._tag).toBe('CannotAdoptOwnedProduct')
  }))
```

- [ ] **Step 5: Run, verify fail.** `pnpm test src/services/adoption.integration.test.ts` → FAIL.

- [ ] **Step 6: Implement `adoption.ts`.** Inject `DrizzleDb` + `ProductService`. Methods:
  - `adoptProduct({ productId, orgId })`: load the product; if `product.organizationId !== null` → `CannotAdoptOwnedProduct`; upsert a live adoption (insert; on conflict with a soft-deleted row, restore it). Idempotent if already adopted.
  - `unadoptProduct({ productId, orgId })`: soft-delete the adoption row, then delete this org's grafts on the product. **NOTE:** the graft tables (`*_attribute_values`, `variant_price_sets`, `variant_inventory_items`, `product_media`, `product_channel_listings`) are created in later phases — implement unadopt to delete from whichever graft tables exist *now*, and each later graft phase adds its table to `unadoptProduct`'s cleanup. For Phase 1 there are no graft tables yet, so unadopt only soft-deletes the adoption; add a `// EXTENDED IN PHASE 2/3/5: remove <table> grafts` comment listing the tables to wire later.
  - `isAdopted({ productId, orgId })`: boolean — a live row exists.
  - `requireAdopted({ productId, orgId })`: `Effect.Effect<void, ProductNotAdopted>` — fails if not adopted; the graft services call this.
  - `listAdoptedProducts(orgId)`: the products joined to this org's live adoptions.
  - `listAdopters(productId)`: org ids with a live adoption.
  Errors: `CannotAdoptOwnedProduct`, `AdoptionNotFound`, `ProductNotAdopted`, `AdoptionDbFailed`.

- [ ] **Step 7: Run, verify pass. Lint + commit.**

```bash
pnpm lint:fix
git add packages/modules/product/src/database packages/modules/product/migrations packages/modules/product/src/services/adoption.ts packages/modules/product/src/services/adoption.integration.test.ts
git commit -m "feat(product): product_org_adoptions + AdoptionService (membership + graft guard)"
```

### Task 7: Service barrel + module Layer (Phase 1 slice)

**Files:**
- Create: `packages/modules/product/src/services/index.ts`

- [ ] **Step 1: Write the barrel + `ProductModuleLive`.** Mirror `price/src/services/index.ts`.

```ts
import { Layer } from 'effect'
import { ProductTypeService } from './product-type'
import { ProductService } from './product'
import { VariantService } from './variant'
import { AdoptionService } from './adoption'

export * from './product-type'
export * from './product'
export * from './variant'
export * from './matrix'
export * from './adoption'

export const ProductModuleLive = Layer.mergeAll(
  ProductTypeService.Default ?? ProductTypeServiceLive, // use whichever the service files export (match price's convention exactly)
  ProductServiceLive,
  VariantServiceLive,
  AdoptionServiceLive,
)
```

> Match price's exact merge/provide convention (`Layer.mergeAll(...).pipe(Layer.provideMerge(SharedDepsLive))` if price does that). `ProductService` depends on `ProductTypeService` — provide it within the layer (`Layer.provide`) so the dependency resolves.

- [ ] **Step 2: Type-check the whole package.**

Run: `pnpm check-types`
Expected: PASS.

- [ ] **Step 3: Run the full module test suite.**

Run: `pnpm test`
Expected: all Phase-1 tests green (1 duplicate-matrix skipped).

- [ ] **Step 4: Commit.**

```bash
pnpm lint:fix
git add packages/modules/product/src/services/index.ts
git commit -m "feat(product): service barrel + ProductModuleLive (phase 1)"
```

---

## Phase 2 — Attribute assignment ("everything references" + scalar lifecycle)

Adds the two assignment pivots, the `value_kind` derivation, and `AttributeAssignmentService` which validates against the type (base ∪ org extension), references the shared catalog for select-types, and mints/deletes scalar value rows via `@czo/attribute`'s `TypedValueService`.

### Task 8: Assignment-pivot schema + relations

**Files:**
- Modify: `packages/modules/product/src/database/schema.ts`
- Modify: `packages/modules/product/src/database/relations.ts`
- Create: migration via `pnpm migrate:generate`

- [ ] **Step 1: Add the two pivots to `schema.ts`** (append before the `declare module` block, then extend the block):

```ts
export const productAttributeValues = pgTable('product_attribute_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'), // null = base of a global product, set = org graft
  attributeId: integer('attribute_id').notNull(), // cross-module
  valueKind: valueKindEnum('value_kind').notNull(),
  valueId: integer('value_id').notNull(), // cross-module ref into the @czo/attribute typed value table named by valueKind
  position: integer('position').notNull().default(0),
}, t => [
  index('product_attribute_values_product_idx').on(t.productId),
  index('product_attribute_values_lookup_idx').on(t.productId, t.organizationId, t.attributeId),
])

export const variantAttributeValues = pgTable('variant_attribute_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  attributeId: integer('attribute_id').notNull(),
  valueKind: valueKindEnum('value_kind').notNull(),
  valueId: integer('value_id').notNull(),
  position: integer('position').notNull().default(0),
}, t => [
  index('variant_attribute_values_variant_idx').on(t.variantId),
  index('variant_attribute_values_lookup_idx').on(t.variantId, t.organizationId, t.attributeId),
])
```

Extend `SchemaRegistryShape` with `productAttributeValues` and `variantAttributeValues`.

- [ ] **Step 2: Extend `relations.ts`** — add both tables to the `Pick`, the destructure, the table map, and relations (`product`→`many.productAttributeValues`, `variant`→`many.variantAttributeValues`, and the inverse `one`).

- [ ] **Step 3: Generate migration.** `pnpm migrate:generate` → new folder.

- [ ] **Step 4: Type-check.** `pnpm check-types` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/modules/product/src/database packages/modules/product/migrations
git commit -m "feat(product): attribute-value pivots + relations + migration"
```

### Task 9: `value_kind` derivation (pure)

**Files:**
- Create: `packages/modules/product/src/services/value-kind.ts`
- Create: `packages/modules/product/src/services/value-kind.test.ts`

- [ ] **Step 1: Failing unit test.**

```ts
import { describe, expect, it } from 'vitest'
import { valueKindForType, isSelectType } from './value-kind'

describe('valueKindForType', () => {
  it('maps attribute types to value kinds', () => {
    expect(valueKindForType('DROPDOWN')).toBe('VALUE')
    expect(valueKindForType('MULTISELECT')).toBe('VALUE')
    expect(valueKindForType('SWATCH')).toBe('SWATCH')
    expect(valueKindForType('REFERENCE')).toBe('REFERENCE')
    expect(valueKindForType('PLAIN_TEXT')).toBe('TEXT')
    expect(valueKindForType('RICH_TEXT')).toBe('TEXT')
    expect(valueKindForType('NUMERIC')).toBe('NUMERIC')
    expect(valueKindForType('BOOLEAN')).toBe('BOOLEAN')
    expect(valueKindForType('DATE')).toBe('DATE')
    expect(valueKindForType('DATE_TIME')).toBe('DATE')
    expect(valueKindForType('FILE')).toBe('FILE')
  })
})

describe('isSelectType', () => {
  it('classifies select vs scalar', () => {
    expect(isSelectType('DROPDOWN')).toBe(true)
    expect(isSelectType('SWATCH')).toBe(true)
    expect(isSelectType('REFERENCE')).toBe(true)
    expect(isSelectType('NUMERIC')).toBe(false)
    expect(isSelectType('PLAIN_TEXT')).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `value-kind.ts`.** Import the attribute-type union from `@czo/attribute` if exported; else define a local `AttributeType` union matching the `attributeTypeEnum` values. `MULTISELECT` and `REFERENCE` are select; the select set is `{DROPDOWN, MULTISELECT, SWATCH, REFERENCE}`.

```ts
export type AttributeType = 'DROPDOWN' | 'MULTISELECT' | 'PLAIN_TEXT' | 'RICH_TEXT' | 'NUMERIC' | 'BOOLEAN' | 'FILE' | 'REFERENCE' | 'SWATCH' | 'DATE' | 'DATE_TIME'
export type ValueKind = 'VALUE' | 'SWATCH' | 'REFERENCE' | 'TEXT' | 'NUMERIC' | 'BOOLEAN' | 'DATE' | 'FILE'

const KIND: Record<AttributeType, ValueKind> = {
  DROPDOWN: 'VALUE', MULTISELECT: 'VALUE', SWATCH: 'SWATCH', REFERENCE: 'REFERENCE',
  PLAIN_TEXT: 'TEXT', RICH_TEXT: 'TEXT', NUMERIC: 'NUMERIC', BOOLEAN: 'BOOLEAN',
  DATE: 'DATE', DATE_TIME: 'DATE', FILE: 'FILE',
}
const SELECT = new Set<AttributeType>(['DROPDOWN', 'MULTISELECT', 'SWATCH', 'REFERENCE'])

export function valueKindForType(t: AttributeType): ValueKind { return KIND[t] }
export function isSelectType(t: AttributeType): boolean { return SELECT.has(t) }
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.**

```bash
git add packages/modules/product/src/services/value-kind.ts packages/modules/product/src/services/value-kind.test.ts
git commit -m "feat(product): pure value_kind derivation + select/scalar classification"
```

### Task 10: `AttributeAssignmentService`

**Files:**
- Create: `packages/modules/product/src/services/attribute-assignment.ts`
- Create: `packages/modules/product/src/services/attribute-assignment.integration.test.ts`
- Modify: `packages/modules/product/src/services/index.ts` (add to barrel + `ProductModuleLive`)

**Prereq:** Read `packages/modules/attribute/src/services/typed-value.ts` and `attribute.ts` to learn the exact API for (a) loading an attribute's `type` by id, and (b) creating/deleting a typed scalar value row. The assignment service injects `@czo/attribute`'s services (add them to the layer's requirements; the E2E/app provides them, and the integration test boots both modules' layers).

- [ ] **Step 1: Failing integration test.** Boot the product layer AND the attribute layer together (read price's integration layer; merge `AttributeModuleLive`). Cover:
  - **select-type graft:** declare a DROPDOWN attribute on a type; create an attribute value (catalog) via attribute service; assign it to a product → a `product_attribute_values` row referencing the catalog `valueId`, `valueKind='VALUE'`; unassign → pivot row gone, **catalog row still present**.
  - **scalar-type graft:** declare a NUMERIC attribute; assign value `42` to a product → service mints an `attribute_numeric_values` row + pivot row `valueKind='NUMERIC'`; unassign → **both** rows gone.
  - **type-gating:** assigning an attribute NOT declared on the product's type (for that org) → `AttributeNotAssignedToType`.
  - **graft org-scope:** a base assignment (`organizationId: null`) and an org graft (`organizationId: 1`) coexist; reading for org 1 returns both, for org 2 returns only base.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `attribute-assignment.ts`.** Inject `DrizzleDb`, `ProductTypeService`, `ProductService`, `VariantService`, `AdoptionService`, and `@czo/attribute`'s attribute + typed-value services. Methods:
  - `assignProductValue({ productId, organizationId, attributeId, value })` and `assignVariantValue({ variantId, organizationId, attributeId, value })`.
  - `unassignProductValue(pivotId)` / `unassignVariantValue(pivotId)`.
  - `listProductValues({ productId, orgId })` / `listVariantValues({ variantId, orgId })` (merge predicate).

  Algorithm for assign:
  0. **Adoption guard:** load the product; if it is global (`organizationId === null`)
     and this is an org graft (`organizationId` arg non-null), call
     `AdoptionService.requireAdopted({ productId, orgId: organizationId })` → fail
     `ProductNotAdopted` if absent. (Org-owned products and base writes skip this.)
  1. Load the product (or variant→product) to get `productTypeId`.
  2. Load the attribute by `attributeId` → its `type`. Compute `valueKind = valueKindForType(type)`.
  3. Validate the attribute is declared on the type for this org at the correct assignment level (PRODUCT vs VARIANT) via `ProductTypeService.listTypeAttributes({ productTypeId, orgId: organizationId ?? <global-only> })`. For a base assignment (`organizationId === null`) only base declarations count; for an org graft, base ∪ org-X extensions count. Reject → `AttributeNotAssignedToType`.
  4. If `isSelectType(type)`: `value` is a `valueId` referencing the shared catalog → validate it exists for that attribute (via attribute service) → insert pivot row with that `valueId`. (MULTISELECT: accept `value: number[]` → one pivot row per id.)
  5. Else (scalar): `value` is the raw typed value → call the attribute typed-value service to **create** the row in the matching typed table → insert pivot row referencing the new `valueId`.

  Algorithm for unassign:
  1. Load the pivot row → `valueKind`, `valueId`.
  2. Delete the pivot row.
  3. If the kind is scalar (`!isSelectKind(valueKind)`): delete the orphan typed value row via the attribute typed-value service. If select: leave the catalog row.

  Errors: `AttributeNotAssignedToType`, `ValueKindMismatch`, `AssignmentNotFound`, `ProductAssignmentDbFailed`.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 4b: Extend `AdoptionService.unadoptProduct` cleanup.** Add deletion of
  this org's `product_attribute_values` and `variant_attribute_values` (rows where
  `organizationId = orgId` for the product / its variants) to `unadoptProduct`, and
  remove the matching `// EXTENDED IN PHASE 2` comment. Add a test asserting unadopt
  removes the org's attribute grafts. For **scalar** grafts, also delete the orphan
  typed value rows (reuse the unassign path) so unadopt doesn't leak attribute rows.

- [ ] **Step 5: Add to barrel + `ProductModuleLive`** (provide the attribute services as a dependency — match how a module consumes another module's Layer; in the app they're already provided, so use `Layer.provide` only in tests, not in `ProductModuleLive` which expects the host to provide `@czo/attribute`). Confirm the requirement surfaces in the Layer's `R` and is satisfied by the app manifest ordering (attribute before product).

- [ ] **Step 6: Type-check + full suite + lint + commit.**

```bash
pnpm check-types && pnpm test && pnpm lint:fix
git add packages/modules/product/src/services
git commit -m "feat(product): AttributeAssignmentService — everything-references + scalar lifecycle"
```

- [ ] **Step 7: Unskip the Phase-1 duplicate-matrix test.** Now that `variant_attribute_values` exists, wire `VariantService.siblingSelections(productId)` to read variant-selection pairs from `variant_attribute_values` and unskip the `DuplicateVariantMatrix` assertion in `variant.integration.test.ts`. Run it green. Commit:

```bash
git add packages/modules/product/src/services/variant.ts packages/modules/product/src/services/variant.integration.test.ts
git commit -m "feat(product): wire variant matrix uniqueness against variant_attribute_values"
```

---

## Phase 3 — Cross-module graft links (price + inventory)

### Task 11: `variant_price_sets` + `variant_inventory_items` schema + relations

**Files:**
- Modify: `packages/modules/product/src/database/schema.ts`, `relations.ts`; migration.

- [ ] **Step 1: Add both tables** (org_id `not null` on both — price/stock are always org-supplied):

```ts
export const variantPriceSets = pgTable('variant_price_sets', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id').notNull(),
  priceSetId: integer('price_set_id').notNull(), // cross-module ref to @czo/price
}, t => [
  unique('variant_price_sets_uniq').on(t.variantId, t.organizationId),
  index('variant_price_sets_price_set_idx').on(t.priceSetId),
])

export const variantInventoryItems = pgTable('variant_inventory_items', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id').notNull(),
  inventoryItemId: integer('inventory_item_id').notNull(), // cross-module ref to @czo/inventory
  requiredQuantity: integer('required_quantity').notNull().default(1),
}, t => [
  unique('variant_inventory_items_uniq').on(t.variantId, t.organizationId, t.inventoryItemId),
  index('variant_inventory_items_variant_idx').on(t.variantId, t.organizationId),
  check('chk_vii_required_qty_pos', sql`${t.requiredQuantity} > 0`),
])
```

Extend `SchemaRegistryShape` + `relations.ts` (variant→many of each). Generate migration. Type-check. Commit `feat(product): price/inventory graft links schema`.

### Task 12: `PriceBindingService` + `InventoryBindingService`

**Files:**
- Create: `packages/modules/product/src/services/price-binding.ts`, `inventory-binding.ts`, integration tests; add to barrel + `ProductModuleLive`.

- [ ] **Step 1: Failing tests.** `bindPriceSet({ variantId, organizationId, priceSetId })` upserts on `(variant, org)`; second bind for the same `(variant, org)` updates (or rejects per uniqueness — choose **upsert/replace**). `listVariantPriceSets({ variantId, orgId })` (org_id not-null, so just `eq(orgId)`). Same shape for inventory (`linkInventoryItem`, `unlinkInventoryItem`, `listVariantInventoryItems`). Two validations both services enforce (inject `AdoptionService`, `@czo/price` `PriceService.findPriceSetById`, `@czo/inventory` `InventoryService.findItemById`):
  - **Adoption guard:** load the variant→product; if the product is global and `organizationId` is a grafting org, `AdoptionService.requireAdopted` → `ProductNotAdopted`.
  - **Cross-org:** the referenced `priceSetId`/`inventoryItemId` must belong to `organizationId`; mismatch → `CrossOrgGraftDenied`.
  Add a test: binding a price set on a global variant **without** adopting first → `ProductNotAdopted`; after adopting → succeeds.

- [ ] **Step 1b: Extend `AdoptionService.unadoptProduct` cleanup** to delete this org's `variant_price_sets` and `variant_inventory_items` for the product's variants; remove the matching `// EXTENDED IN PHASE 3` comment; test that unadopt clears them.

- [ ] **Step 2: Implement, run green, lint, commit** `feat(product): price + inventory binding services with adoption + cross-org guards`.

---

## Phase 4 — Classification

### Task 13: Categories + collections schema + relations + migration

**Files:** Modify `schema.ts`, `relations.ts`; migration.

- [ ] **Step 1: Add tables.** `categories` (org_id nullable, self-FK `parent_id` cascade), `product_categories` (org_id nullable), `collections` (org_id **not null**), `collection_products`. (Use the exact column shapes in the spec's Classification section.) Extend `SchemaRegistryShape` + relations (category self-relation: `parent`/`children`; product↔category and collection↔product many-to-many via the pivots). Generate migration, type-check, commit `feat(product): classification schema (categories tree + collections)`.

### Task 14: `CategoryService` (tree + cycle prevention) + `CollectionService`

**Files:** Create `category.ts`, `collection.ts`, integration tests; barrel + `ProductModuleLive`.

- [ ] **Step 1: Failing tests.**
  - Category: create global + org categories (merge predicate on list); set `parent_id`; **reject a cycle** (`setParent(child, descendant)` → `CategoryCycle`); place a product in a category (base `org_id null` + org graft); list a product's categories for an org (merge).
  - Collection: org-scoped CRUD; add/remove product; list products in a collection.
- [ ] **Step 2: Implement.** Cycle check in `CategoryService.setParent`/`updateCategory`: walk the ancestor chain from the proposed parent; if the node itself appears → `CategoryCycle`. Errors: `CategoryNotFound`, `CategoryCycle`, `CategoryDbFailed`; `CollectionNotFound`, `CollectionDbFailed`.
- [ ] **Step 3: Run green, lint, commit** `feat(product): CategoryService (tree+cycle) + CollectionService`.

---

## Phase 5 — Publication & media

### Task 15: `product_channel_listings` + media schema + relations + migration

**Files:** Modify `schema.ts`, `relations.ts`; migration.

- [ ] **Step 1: Add tables** per spec: `product_channel_listings` (partial-unique `(product_id, channel_id) WHERE deleted_at IS NULL`), `product_media` (org_id nullable, `mediaTypeEnum`), `variant_media` (M:N). Extend `SchemaRegistryShape` + relations. Generate migration, type-check, commit `feat(product): channel-listing + media schema`.

### Task 16: `ChannelListingService` + `MediaService`

**Files:** Create `channel-listing.ts`, `media.ts`, integration tests; barrel + `ProductModuleLive`.

- [ ] **Step 1: Failing tests.** Both services inject `AdoptionService` and, before writing an org graft on a **global** product, call `AdoptionService.requireAdopted` → `ProductNotAdopted` (base/admin writes and org-owned products skip it).
  - ChannelListing: `publish({ productId, channelId, ... })` creates/updates the listing; `unpublish`; `listListings(productId)`; validate the channel belongs to the acting org (inject `@czo/channel` `ChannelService.findChannelById`, compare org) → `CrossOrgGraftDenied`; duplicate active listing → `ChannelListingExists`; publishing a global product without adoption → `ProductNotAdopted`.
  - Media: `addMedia({ productId, organizationId, url, alt, type, position })` (base `null` or org graft, org graft requires adoption); `removeMedia`; `linkVariantMedia(variantId, mediaId)` / `unlinkVariantMedia`; `listProductMedia({ productId, orgId })` (merge).
- [ ] **Step 1b: Extend `AdoptionService.unadoptProduct` cleanup** to delete this org's `product_channel_listings` and org-grafted `product_media` (org_id = orgId) for the product; remove the matching `// EXTENDED IN PHASE 5` comment; test that unadopt clears them. This is the **final** unadopt extension — after it, `unadoptProduct` removes grafts across all five graft families (attributes, price, inventory, media, channel listings).
- [ ] **Step 2: Implement, run green, lint, commit** `feat(product): ChannelListingService + MediaService with adoption guard`.

---

## Phase 6 — Translations

### Task 17: Translation pivots schema + relations + migration

**Files:** Modify `schema.ts`, `relations.ts`; migration.

- [ ] **Step 1: Add the four pivots** (`product_translations`, `category_translations`, `collection_translations`, `variant_translations`) per spec — each: `id`, `<entity>_id` FK cascade, `locale_code text` (cross-module, no FK), `name`, `description?` (no description on variant), `unique(<entity>_id, locale_code)`. Extend `SchemaRegistryShape` + relations (each entity → `many.<entity>Translations`). Generate migration, type-check, commit `feat(product): translation pivots schema`.

> No service is needed for translations — they're written via the entity mutations (Phase 7) and read via the `translatedField` GraphQL helper. If a dedicated upsert is cleaner, add a tiny `TranslationService` mirroring how the translation module's fixture writes pivot rows; otherwise fold upserts into Product/Category/Collection/Variant services. Decide by reading the translation fixture; default to folding into existing services to avoid a thin service.

---

## Phase 7 — GraphQL surface

Wires nodes, connections (merge predicate), mutations (global + org authz), node-guards, the module `index.ts`, app-manifest registration, and both E2E flows. Follow `packages/modules/price/src/graphql/**` exactly for file layout.

### Task 18: GraphQL scaffolding — builder augmentations, errors, authz scopes

**Files:**
- Create: `src/graphql/index.ts`, `src/graphql/schema/index.ts`, `src/graphql/schema/product/{errors,authz,inputs,types}.ts`.

- [ ] **Step 1: `graphql/index.ts`** — mirror price: export `registerProductSchema`, `productNodeGuards`; `import '@czo/auth/graphql'`; declare `BuilderSchemaObjects` for `Product`, `ProductVariant`, `ProductType`, `Category`, `Collection`, `ProductMedia` and any `BuilderSchemaInputs`.
- [ ] **Step 2: `errors.ts`** — `registerError(builder, Cls, { name })` for every tagged error declared on mutations (`ProductNotFound`, `ProductTypeNotFound`, `HandleTaken`, `SkuTaken`, `DuplicateVariantMatrix`, `AttributeNotAssignedToType`, `CategoryCycle`, `ChannelListingExists`, `GlobalProductRequiresGlobalType`, `CrossOrgGraftDenied`).
- [ ] **Step 3: `authz.ts`** — org-id loaders for `node(id:)` gating (mirror price's `loadPriceSetOrganizationId`): `loadProductOrganizationId`, `loadVariantOrganizationId`, `loadProductTypeOrganizationId`, `loadCategoryOrganizationId`, `loadCollectionOrganizationId`, `loadMediaOrganizationId`. For **global** rows (`organizationId === null`) the loader returns `null`; the node-guard maps `null` → "globally readable" (grant `{ auth: true }`) so any org can read globals (matching the merge predicate), while non-null gates to the owner org.
- [ ] **Step 4: Type-check + commit** `feat(product): graphql scaffolding (augmentations, errors, authz loaders)`.

### Task 19: Nodes + connections (merge predicate on graft fields)

**Files:** Create `src/graphql/schema/product/types.ts` (or split per node if >400 lines).

- [ ] **Step 1: Define `drizzleNode`s** for Product, ProductVariant, ProductType, Category, Collection, ProductMedia (`select: true`), mirroring price. Expose scalar fields + relations as connections.
- [ ] **Step 2: Graft fields use the merge predicate.** `Product.attributeValues`, `Product.media`, `Product.categories`, `ProductVariant.attributeValues`, `ProductVariant.priceSet`, `ProductVariant.inventoryItems` must filter `org_id IS NULL OR org_id = <viewerOrg>`. The viewer org comes from `ctx` (read how auth exposes the active org in price/channel resolvers). Use the `relatedConnection` parent-aware authz pattern (`reference_pothos_relatedconnection_parent_authz`): `query()` WHERE applies the merge predicate; parent-scope guard in `authScopes`.
- [ ] **Step 2b: `Product.isAdopted`** — a boolean field resolved against the viewer org via `AdoptionService.isAdopted({ productId: parent.id, orgId: viewerOrg })` (false for org-owned products / no viewer org). Useful for "is this global product in my catalog" UX.
- [ ] **Step 3: Localized fields** via `translatedField` (import from `@czo/translation/graphql` — confirm export path): `Product.name`/`description`, `Category.name`/`description`, `Collection.name`/`description`, `ProductVariant.name`. Pass the relation (e.g. `translations`), the base column, and field name.
- [ ] **Step 4: Type-check + commit** `feat(product): graphql nodes + connections with overlay merge + translatedField`.

### Task 20: Queries + mutations (global vs org authz)

**Files:** Create `src/graphql/schema/product/queries.ts`, `mutations/` (split: `productType.ts`, `product.ts`, `variant.ts`, `assignment.ts`, `category.ts`, `collection.ts`, `channelListing.ts`, `media.ts`, `index.ts`).

- [ ] **Step 1: Queries** — `product(handle, channelId)`, `products(channelId, ...)`, `category(slug)`, `categories`, `collection(slug)`, `collections`, `productType(id)`, `productTypes`, **`adoptedProducts`** (org-scoped: the acting org's adopted global products; gated `{ permission: { resource:'product', actions:['read'], organization } }`). Storefront reads are **public** (no authScopes) but apply the merge predicate + channel-publication filter (only products with an `is_published && visible_in_listings` listing for `channelId`, availability date satisfied).
- [ ] **Step 2: Mutations with the dual gate.**
  - Global entity mutations (`createGlobalProductType`, `createGlobalProduct`, `createGlobalCategory`, and their update/delete, plus variant + base attribute/media writes on globals) gate `authScopes: () => ({ permission: { resource: 'product', actions: [...] } })` (NO `organization`).
  - Org entity + graft mutations gate `authScopes: (_p, args) => ({ permission: { resource: 'product', actions: [...], organization: args.input.organizationId } })`, and the resolver asserts the graft `org_id` equals the acting org.
  - **Adoption mutations** (`mutations/adoption.ts`): `adoptProduct({ productId, organizationId })` gated `actions:['create']`; `unadoptProduct` gated `actions:['delete']` (both org-scoped to `organizationId`). Declare `CannotAdoptOwnedProduct`, `ProductNotFound` on `errors.types`.
  - Each mutation calls the relevant service via `ctx.runEffect(...)`, returns the relay payload (`... on CreateXSuccess { data }`), declares `errors.types`.
  Keep each `mutations/*.ts` file under 400 lines; the `index.ts` aggregates them onto the builder.
- [ ] **Step 3: `schema/index.ts`** aggregates types+queries+mutations; `registerProductSchema(builder)` calls each registrar. Mirror price's `schema/index.ts`.
- [ ] **Step 4: Run `pnpm generate` if the module uses schema-first codegen** (price uses Pothos code-first → likely NOT needed; confirm there are no `.graphql` files). Type-check + commit `feat(product): graphql queries + mutations (global/org dual authz)`.

### Task 21: Node-guards + module `index.ts` + app manifest

**Files:** Create `src/graphql/node-guards.ts`; rewrite `src/index.ts`; modify `apps/life/src/modules.ts` + `apps/life/package.json`.

- [ ] **Step 1: `node-guards.ts`** — register guards for each node type (mirror price's `priceNodeGuards`) using the Task-18 loaders: global row (`orgId null`) → grant `{ auth: true }`; org row → `{ permission: { resource:'product', actions:['read'], organization: orgId } }`; denial → null.
- [ ] **Step 2: Rewrite `src/index.ts`** (replace the Task-1 stub) — mirror price's `defineModule`: access domain `PRODUCT_STATEMENTS = { product: ['create','read','update','delete'] }`, `PRODUCT_HIERARCHY` (`product:viewer`={read}, `product:manager`={create,update}, `product:admin`={delete}); `db: { schema: productSchema, relations: productRelations }`; `graphql: { contribution: b => registerProductSchema(b as never), nodeGuards: productNodeGuards }`; `onStart` registers the access domain.
- [ ] **Step 3: Register in the app manifest.** In `apps/life/src/modules.ts` import `productModule from '@czo/product'` and append it **after** attribute, channel, inventory, price, translation (it depends on all of them). Add `"@czo/product": "workspace:*"` to `apps/life/package.json`. The final order: `[authModule, translationModule, attributeModule, stockLocationModule, channelModule, priceModule, inventoryModule, productModule]`.
- [ ] **Step 4: Verify the app type-checks + boots.**

Run: `cd /workspace/c-zo && pnpm install && pnpm --filter life check-types`
Expected: PASS.

- [ ] **Step 5: Commit** `feat(product): node-guards + CzoModule wiring + app manifest registration`.

### Task 22: E2E — org-owned flow

**Files:** Create `src/e2e/harness.ts` (copy + adapt price's), `src/e2e/product-org.e2e.test.ts`.

- [ ] **Step 1: Harness.** Copy `packages/modules/price/src/e2e/harness.ts`; boot `bootTestApp` with the modules product needs (auth, attribute, channel, inventory, price, translation, product) + their migrations. Expose `signUp`, `gql`, `grantGlobalRole`, and an org-with-product-access helper (mirror price's org helper, granting the `product` domain).
- [ ] **Step 2: Failing E2E.** Org admin: create org type → declare a variant-selection DROPDOWN attribute (via attribute mutations) → create product → create 2 variants with distinct selections (assert a 3rd duplicate combo fails `DuplicateVariantMatrix`) → assign a product attribute → bind a price set (create one via price mutations) → link an inventory item (create via inventory mutations) → create a channel + publish listing → storefront `product(handle, channelId)` returns the product with localized name (add a `product_translations` row, query with a locale) and the merged graft fields; unpublished channel → product not returned.
- [ ] **Step 3: Implement any missing resolver wiring surfaced by the E2E; run green.**
- [ ] **Step 4: Commit** `test(product): org-owned E2E flow (create→variants→assign→price→inventory→publish→storefront)`.

### Task 23: E2E — global product + two-org graft

**Files:** Create `src/e2e/product-global.e2e.test.ts`.

- [ ] **Step 1: Failing E2E.** Platform admin (global `product` role via `grantGlobalRole`): create global type + declare base attributes (incl. a variant-selection attr) + create global product + variants. Org A: **`adoptProduct`** the global product, then extend the type with an org attribute, graft a product attribute value, bind a price set, link inventory, publish on A's channel. Assertions:
  - **adoption gate:** org A grafting (e.g. `bindPriceSet`) **before** `adoptProduct` → `ProductNotAdopted`; after adopting → succeeds. `Product.isAdopted` is `true` for org A, `false` for org B. `adoptedProducts` for A lists the global product.
  - storefront read **for org A's channel** shows base ∪ A grafts (A's price, A's extra attribute, base attributes).
  - storefront read **for org B's channel** (B never adopted/published) → product not visible on B; reading the product node as org B shows only base attributes (no A grafts).
  - **`unadoptProduct` by A** removes A's grafts: after unadopt, A's price binding / attribute graft / listing are gone, base data intact.
  - **DENIAL:** org A (no global role) attempting `createGlobalProduct`/editing the global base → permission error; node-guard: org C with no access reading an org-A graft → deny-as-null.
- [ ] **Step 2: Implement any wiring gaps; run green.**
- [ ] **Step 3: Full module suite + types + lint.**

Run: `cd packages/modules/product && pnpm test && pnpm check-types && pnpm lint --max-warnings 0`
Expected: all green.

- [ ] **Step 4: Commit** `test(product): global-product + two-org graft E2E (overlay isolation + authz)`.

### Task 24: Final whole-app verification

- [ ] **Step 1: Type-check the app + auth downstream.**

Run: `cd /workspace/c-zo && pnpm --filter @czo/auth check-types && pnpm --filter life check-types`
Expected: PASS (no regression from the manifest addition).

- [ ] **Step 2: Run the product suite once more + a smoke of the app boot test** (mirror how price/inventory are exercised in `apps/life` tests if any). Report which validations ran and any that could not.
- [ ] **Step 3: No commit needed if nothing changed.** Otherwise commit `chore(product): final verification fixes`.

---

## Self-Review Notes (coverage map: spec → task)

- Global/org overlay + merge predicate → Tasks 2,4,5,6,10,12,14,16,19 (every read applies `org_id IS NULL OR org_id = X`).
- Adoption (explicit membership + graft guard + lifecycle) → Task 6B (table+service), guard enforced in Tasks 10,12,16, cleanup extended across 10/12/16, GraphQL in 19 (`isAdopted`),20 (`adoptProduct`/`unadoptProduct`/`adoptedProducts`), E2E in 23.
- "Everything references" + scalar lifecycle → Tasks 8,9,10.
- Org type-extension → Tasks 2 (schema), 4 (`listTypeAttributes` base ∪ org), 10 (gating).
- Variant matrix uniqueness → Tasks 6 (pure), 10 step 7 (wired).
- Price/inventory grafts (org-scoped, cross-org validated) → Tasks 11,12.
- Classification (cat tree M:N + collection M:N org-only) → Tasks 13,14.
- Channel publication (visibility only) → Tasks 15,16.
- Media (product + variant link) → Tasks 15,16.
- Translations (4 pivots + translatedField) → Tasks 17,19.
- Authz (global vs org `product` permission; node-guards) → Tasks 18,20,21.
- Tests (unit/integration/E2E incl. two-org isolation) → Tasks 4–17 (integration), 6/9 (unit), 22/23 (E2E).

**Deferred / not in any task (per spec "out of scope"):** promotions, tax, bundle stock-resolution math, import/export, search indexing, primary-category flag, tags, copy-on-adopt.
