# `@czo/product` Sub-Graph Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag the entire `@czo/product` GraphQL surface into audience sub-graphs — `public` storefront catalog read, `org` management, `admin` platform/global management — including the public storefront now.

**Architecture:** `@pothos/plugin-sub-graph` opt-in tagging via a module-local `sg()` helper. Object types are tagged at the type level (fields inherit; the C1 graft field authScopes remain the security boundary). Two field narrowings handle public fields that reference auth's `Organization`. Queries/mutations/errors/inputs are tagged by authz tier. A mechanics spike in Task 2 locks the `relatedConnection` connection/edge tagging shape before the rest fans out.

**Tech Stack:** Pothos (`@pothos/plugin-sub-graph`, `-relay`, `-drizzle`, `-errors`, `-scope-auth`), Effect-TS, Vitest + Testcontainers (`bootTestApp`).

**Spec:** `docs/superpowers/specs/2026-06-14-product-subgraphs-design.md`

**Conventions (every task):** STAGE ONLY (`git add`) — never commit/branch/push/stash. Pure additive tagging — do not touch resolvers, authScopes, descriptions, or service logic except to insert `subGraphs` keys. No `console.log`, no new `as any`. The controller branches + single-commits after review.

---

## File Structure

- Create: `packages/modules/product/src/graphql/schema/product/subgraphs.ts` — `sg()` helper.
- Modify: `packages/modules/product/src/e2e/harness.ts` — `subGraphs?` boot option.
- Modify: `types/product.ts`, `types/variant.ts`, `types/product-type.ts`, `types/media.ts`, `types/grafts.ts`, `types/category.ts`, `types/collection.ts` — type-level tags + 2 field narrowings + relatedConnection tags.
- Modify: `queries.ts` — `productByHandle` public; 9 admin reads org+admin.
- Modify: `mutations/{assignment,category,media,product,productType,translation,variant}.ts` — tier-conditional mutations → `['org','admin']`.
- Modify: `mutations/{adoption,channelListing,collection,inventoryBinding,priceBinding}.ts` + the 2 collection-translation mutations in `translation.ts` — org-only mutations → `['org']`.
- Modify: `errors.ts` — 22 errors → `['org','admin']`.
- Modify: `inputs.ts` — 2 enums + 4 inputs → `['org','admin']`.
- Create: `packages/modules/product/src/e2e/subgraph-exposure.e2e.test.ts` — exposure E2E.

---

### Task 1: `sg()` helper + harness `subGraphs` option

**Files:**
- Create: `packages/modules/product/src/graphql/schema/product/subgraphs.ts`
- Modify: `packages/modules/product/src/e2e/harness.ts`

- [ ] **Step 1: Create the helper**

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

- [ ] **Step 2: Add `SubGraphName` import to `harness.ts`**

Add with the other type-only imports (alphabetized by module path — place it so eslint `perfectionist/sort-imports` is satisfied; it imports from `@czo/kit/graphql`, same module as the existing `decodeGlobalID` value import — add a separate `import type` line):

```ts
import type { SubGraphName } from '@czo/kit/graphql'
```

- [ ] **Step 3: Add options interface + forward to `bootTestApp`**

Change `export async function bootProductApp(): Promise<ProductHarness> {` to:

```ts
export interface BootProductOptions {
  readonly subGraphs?: ReadonlyArray<SubGraphName>
}

export async function bootProductApp(options: BootProductOptions = {}): Promise<ProductHarness> {
```

In the `bootTestApp({ modules: [...], migrations: [...] })` call, add as the last key inside the options object (after the `migrations: [...]` array closes):

```ts
      ...(options.subGraphs ? { buildOptions: { subGraphs: options.subGraphs } } : {}),
```

- [ ] **Step 4: Type-check + stage**

Run: `pnpm --filter @czo/product check-types`
Expected: PASS.

```bash
git add packages/modules/product/src/graphql/schema/product/subgraphs.ts packages/modules/product/src/e2e/harness.ts
```

---

### Task 2: Tag the object types + field narrowings + relatedConnection mechanics (PUBLIC end-to-end)

This task makes `/graphql/public` build and serve `productByHandle` and its object graph. It owns the `relatedConnection` connection/edge tagging discovery.

**Files:**
- Modify: `types/product.ts`, `types/variant.ts`, `types/product-type.ts`, `types/media.ts`, `types/grafts.ts`, `types/category.ts`, `types/collection.ts`
- Modify: `queries.ts` (only `productByHandle` in this task)

**Type → audience:**

| Type | File | `subGraphs` |
|------|------|-------------|
| `Product` | product.ts | `['public','org','admin']` |
| `ProductVariant` | variant.ts | `['public','org','admin']` |
| `VariantPriceSet` (objectRef) | variant.ts | `['public','org','admin']` |
| `ProductType` | product-type.ts | `['public','org','admin']` |
| `ProductTypeAttribute` | product-type.ts | `['public','org','admin']` |
| `ProductMedia` | media.ts | `['public','org','admin']` |
| `ProductAttributeValue` | grafts.ts | `['public','org','admin']` |
| `VariantAttributeValue` | grafts.ts | `['public','org','admin']` |
| `ProductChannelListing` | grafts.ts | `['public','org','admin']` |
| `ProductCategory` | grafts.ts | `['public','org','admin']` |
| `CollectionProduct` | grafts.ts | `['public','org','admin']` |
| `VariantInventoryItem` | grafts.ts | `['public','org','admin']` |
| `VariantMedia` | grafts.ts | `['public','org','admin']` |
| `Category` | category.ts | `['org','admin']` |
| `Collection` | collection.ts | `['org','admin']` |

- [ ] **Step 1: Tag each `drizzleNode` / `objectRef`**

For every `builder.drizzleNode('table', { name: 'X', … })`, add `subGraphs: <audience>,` as a key in the options object (place it right after the `name:` line). Example (`types/product.ts`):

```ts
  builder.drizzleNode('products', {
    name: 'Product',
    subGraphs: ['public', 'org', 'admin'],
    description:
      'A sellable product. …',
    select: true,
    id: { column: c => c.id },
    fields: t => ({ … }),
  })
```

For the `VariantPriceSet` objectRef in `types/variant.ts`, add `subGraphs` to the `.implement({ … })` options:

```ts
  const VariantPriceSetRef = builder
    .objectRef<{ id: number, priceSetId: number, organizationId: number }>('VariantPriceSet')
    .implement({
      subGraphs: ['public', 'org', 'admin'],
      description: 'The binding between a variant and a price set …',
      fields: t => ({ … }),
    })
```

- [ ] **Step 2: Narrow the two `Organization`-returning fields**

`Product.organization` (`types/product.ts`) and `ProductType.organization` (`types/product-type.ts`) return auth's `Organization` (not in `public`). Add `subGraphs: ['org', 'admin']` to each:

```ts
      organization: t.relation('organization', {
        subGraphs: ['org', 'admin'],
        nullable: true,
        description: 'Owning organization; null for global products.',
      }),
```

(and the equivalent on `ProductType`). Do NOT narrow `Category.organization` / `Collection.organization` — those live on `['org','admin']`-only types already.

- [ ] **Step 3: Tag the 13 relatedConnections — try field-level inheritance first**

For each `t.relatedConnection('rel', { … })`, add `subGraphs: <parent type audience>,` as a key in the options object. The 10 on public types (`Product.{variants,attributeValues,media,categories,collections,channelListings}`, `ProductVariant.{attributeValues,inventoryItems,media}`, `ProductType.attributes`) → `['public','org','admin']`; the 3 on org/admin types (`Category.{children,products}`, `Collection.products`) → `['org','admin']`. Also tag the `ProductVariant.priceSet` `t.field` (returns `VariantPriceSet`) → `['public','org','admin']`.

Example:

```ts
      variants: t.relatedConnection('variants', {
        subGraphs: ['public', 'org', 'admin'],
        description: 'Purchasable variants of this product. …',
        args: { … },
        authScopes: (_parent, args) => graftAuthScopes(args),
        query: args => ({ … }),
      }),
```

- [ ] **Step 4: Tag `productByHandle` in `queries.ts`**

Add `subGraphs: ['public'],` to the `productByHandle` `t.field` options (after `nullable: true,`). Leave the other 9 queries untouched in this task.

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @czo/product check-types`
Expected: PASS.

- [ ] **Step 6: Mechanics probe — does relatedConnection inherit, or need explicit connection/edge args?**

Add a TEMPORARY probe test `packages/modules/product/src/e2e/_spike.e2e.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootProductApp } from './harness'
import type { ProductHarness } from './harness'

describe('product public spike', () => {
  let h: ProductHarness
  beforeAll(async () => { h = await bootProductApp({ subGraphs: ['public', 'org', 'admin'] }) }, 180_000)
  afterAll(async () => { await h.close() })

  it('builds /graphql/public and exposes productByHandle + connections + node graph', async () => {
    const res = await h.app.fetch(new Request('http://localhost/graphql/public', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `{ __type(name: "Product") { fields { name } } __cat: __type(name: "Category") { name } }` }),
    }))
    const body = (await res.json()) as { data?: any, errors?: { message: string }[] }
    expect(body.errors).toBeUndefined()
    const fields = (body.data.__type.fields ?? []).map((f: any) => f.name)
    expect(fields).toContain('variants') // relatedConnection field present on public Product
    expect(fields).not.toContain('organization') // narrowed out of public
    expect(body.data.__cat).toBeNull() // Category absent from public
  })
})
```

Run: `pnpm --filter @czo/product test src/e2e/_spike.e2e.test.ts`

- If it PASSES: relatedConnection inherits the parent type's `subGraphs` through the field option; no per-position args needed. Record this verdict in the task notes.
- If it FAILS with an error naming a missing `*Connection` or `*Edge` type in sub-graph `public`: the connection/edge types need explicit tagging. Update each `t.relatedConnection('rel', { …, subGraphs }, { subGraphs: <audience> }, { subGraphs: <audience> })` — adding the 2nd (connection-type) and 3rd (edge-type) positional args with the SAME audience as the field — mirroring translation's `drizzleConnection`. Re-run until green. Record which form was needed.

- [ ] **Step 7: Delete the probe, type-check, stage**

```bash
rm packages/modules/product/src/e2e/_spike.e2e.test.ts
```

Run: `pnpm --filter @czo/product check-types`
Expected: PASS.

```bash
git add packages/modules/product/src/graphql/schema/product/types/ packages/modules/product/src/graphql/schema/product/queries.ts
```

---

### Task 3: Tag the 9 admin read queries `['org','admin']`

**Files:** Modify `packages/modules/product/src/graphql/schema/product/queries.ts`

- [ ] **Step 1: Add `subGraphs: ['org', 'admin'],` to each of the 9 admin reads**

For each `t.field` / `t.drizzleField` query options object, add `subGraphs: ['org', 'admin'],` (place after `type:` / `nullable:`). The 9: `productType`, `productTypes`, `product`, `products`, `adoptedProducts`, `category`, `categories`, `collection`, `collections`. Leave `productByHandle` (already `['public']`) unchanged.

Example:

```ts
  builder.queryField('product', t =>
    t.field({
      type: 'Product',
      subGraphs: ['org', 'admin'],
      nullable: true,
      description: 'Fetch a single product by id (admin). …',
      args: { … },
      authScopes: async (_parent, args, ctx) => { … },
      resolve: … ,
    }))
```

- [ ] **Step 2: Type-check + stage**

Run: `pnpm --filter @czo/product check-types`
Expected: PASS.

```bash
git add packages/modules/product/src/graphql/schema/product/queries.ts
```

---

### Task 4: Tag the 32 tier-conditional mutations `['org','admin']`

Uniform 5-point tagging (every mutation already has an `errors: { types: [...] }` block — including empty `types: []`). For EACH mutation below, add to its `relayMutationField` call:
- `...sg('org', 'admin').input,` as the FIRST key of the 2nd arg (the `{ inputFields }` object)
- `...sg('org', 'admin').field,` as the FIRST key of the 3rd arg (the field-options object)
- merge `...sg('org', 'admin').errorOpts` into the existing `errors: { types: [...] }` → `errors: { types: [...], ...sg('org', 'admin').errorOpts }`
- `...sg('org', 'admin').payload,` as the FIRST key of the 4th arg (the `{ outputFields }` object)

Add `import { sg } from '../subgraphs'` to each file (respect eslint import ordering).

**Files + mutations:**
- `mutations/assignment.ts`: `assignProductValue`, `assignVariantValue`, `unassignProductValue`, `unassignVariantValue`
- `mutations/category.ts`: `createCategory`, `updateCategory`, `deleteCategory`, `setCategoryParent`, `placeProduct`, `removePlacement`
- `mutations/media.ts`: `addMedia`, `updateMedia`, `removeMedia`, `linkVariantMedia`, `unlinkVariantMedia`
- `mutations/product.ts`: `createProduct`, `updateProduct`, `deleteProduct`
- `mutations/productType.ts`: `createProductType`, `updateProductType`, `deleteProductType`, `declareAttribute`, `undeclareAttribute`
- `mutations/variant.ts`: `createVariant`, `updateVariant`, `deleteVariant`
- `mutations/translation.ts`: `upsertProductTranslation`, `removeProductTranslation`, `upsertCategoryTranslation`, `removeCategoryTranslation`, `upsertVariantTranslation`, `removeVariantTranslation` — **the 6 product/category/variant translations only; NOT the 2 collection translations (Task 5).**

Example (createProduct, `mutations/product.ts`):

```ts
  builder.relayMutationField(
    'createProduct',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({ … }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Creates a product. …',
      errors: { types: [ProductNotFound, HandleTaken, GlobalProductRequiresGlobalType, ProductTypeNotFound], ...sg('org', 'admin').errorOpts },
      authScopes: (_parent, args) => …,
      resolve: … ,
    },
    {
      ...sg('org', 'admin').payload,
      outputFields: t => ({ … }),
    },
  )
```

- [ ] **Step 1: Tag assignment.ts (4)**
- [ ] **Step 2: Tag category.ts (6)**
- [ ] **Step 3: Tag media.ts (5)**
- [ ] **Step 4: Tag product.ts (3)**
- [ ] **Step 5: Tag productType.ts (5)**
- [ ] **Step 6: Tag variant.ts (3)**
- [ ] **Step 7: Tag the 6 product/category/variant translations in translation.ts**
- [ ] **Step 8: Type-check + lint + stage**

Run: `pnpm --filter @czo/product check-types && pnpm --filter @czo/product lint --max-warnings 0`
Expected: PASS. (If lint reorders `sg` import — fine; do NOT let it strip a `subGraphs`/spread.)

```bash
git add packages/modules/product/src/graphql/schema/product/mutations/assignment.ts packages/modules/product/src/graphql/schema/product/mutations/category.ts packages/modules/product/src/graphql/schema/product/mutations/media.ts packages/modules/product/src/graphql/schema/product/mutations/product.ts packages/modules/product/src/graphql/schema/product/mutations/productType.ts packages/modules/product/src/graphql/schema/product/mutations/variant.ts packages/modules/product/src/graphql/schema/product/mutations/translation.ts
```

---

### Task 5: Tag the 15 org-only mutations `['org']`

Same uniform 5-point pattern, but with `sg('org')`. Add `import { sg } from '../subgraphs'` per file.

**Files + mutations:**
- `mutations/adoption.ts`: `adoptProduct`, `unadoptProduct`
- `mutations/channelListing.ts`: `publishProduct`, `unpublishProduct`
- `mutations/collection.ts`: `createCollection`, `updateCollection`, `deleteCollection`, `addProductToCollection`, `removeProductFromCollection`
- `mutations/inventoryBinding.ts`: `linkInventoryItem`, `unlinkInventoryItem`
- `mutations/priceBinding.ts`: `bindPriceSet`, `unbindPriceSet`
- `mutations/translation.ts`: `upsertCollectionTranslation`, `removeCollectionTranslation` — **the 2 collection translations only** (the file's import of `sg` was already added in Task 4).

For each: `...sg('org').input` (2nd arg), `...sg('org').field` (3rd arg), `errors: { types: [...], ...sg('org').errorOpts }`, `...sg('org').payload` (4th arg).

- [ ] **Step 1: Tag adoption.ts (2)**
- [ ] **Step 2: Tag channelListing.ts (2)**
- [ ] **Step 3: Tag collection.ts (5)**
- [ ] **Step 4: Tag inventoryBinding.ts (2)**
- [ ] **Step 5: Tag priceBinding.ts (2)**
- [ ] **Step 6: Tag the 2 collection translations in translation.ts**
- [ ] **Step 7: Type-check + lint + stage**

Run: `pnpm --filter @czo/product check-types && pnpm --filter @czo/product lint --max-warnings 0`
Expected: PASS.

```bash
git add packages/modules/product/src/graphql/schema/product/mutations/adoption.ts packages/modules/product/src/graphql/schema/product/mutations/channelListing.ts packages/modules/product/src/graphql/schema/product/mutations/collection.ts packages/modules/product/src/graphql/schema/product/mutations/inventoryBinding.ts packages/modules/product/src/graphql/schema/product/mutations/priceBinding.ts packages/modules/product/src/graphql/schema/product/mutations/translation.ts
```

---

### Task 6: Tag errors + inputs/enums `['org','admin']`

**Files:**
- Modify: `packages/modules/product/src/graphql/schema/product/errors.ts`
- Modify: `packages/modules/product/src/graphql/schema/product/inputs.ts`

- [ ] **Step 1: Tag all 22 errors**

Add `subGraphs: ['org', 'admin']` to every `registerError(builder, X, { name: '…' })` options object (alongside `name`, and alongside any `fields` where present). All 22: `ProductNotFound`, `ProductTypeNotFound`, `HandleTaken`, `SkuTaken`, `DuplicateVariantMatrix`, `AttributeNotAssignedToType`, `ValueKindMismatch`, `CategoryCycle`, `CategorySlugTaken`, `CollectionSlugTaken`, `GlobalProductRequiresGlobalType`, `CrossOrgGraftDenied`, `ProductNotAdopted`, `CannotAdoptOwnedProduct`, `MediaNotFound`, `InvalidRequiredQuantity`, `InvalidAttributeDeclaration`, `AssignmentNotFound`, `AdoptionNotFound`, `VariantNotFound`, `CategoryNotFound`, `CollectionNotFound`.

Example:

```ts
  registerError(builder, ProductNotFound, { name: 'ProductNotFoundError', subGraphs: ['org', 'admin'] })
```

- [ ] **Step 2: Tag the 2 enums + 4 inputs**

In `inputs.ts`, add `subGraphs: ['org', 'admin'],` to each `builder.enumType(...)` and `builder.inputType(...)` options object:
- enums: `ProductAttributeAssignment`, `ProductMediaType`
- inputs: `VariantSelectionPairInput`, `AssignmentTextValueInput`, `AssignmentFileValueInput`, `AssignmentValueInput`

Example:

```ts
    MediaType: builder.enumType('ProductMediaType', {
      subGraphs: ['org', 'admin'],
      description: 'The kind of a product/variant media asset: IMAGE or VIDEO.',
      values: { IMAGE: { value: 'IMAGE' }, VIDEO: { value: 'VIDEO' } } as const,
    }),
```

- [ ] **Step 3: Type-check + stage**

Run: `pnpm --filter @czo/product check-types`
Expected: PASS.

```bash
git add packages/modules/product/src/graphql/schema/product/errors.ts packages/modules/product/src/graphql/schema/product/inputs.ts
```

---

### Task 7: Exposure E2E

**Files:**
- Create: `packages/modules/product/src/e2e/subgraph-exposure.e2e.test.ts`

- [ ] **Step 1: Write the exposure test**

```ts
import type { ProductHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootProductApp } from './harness'

// Endpoint-level exposure isolation. The kit mounts the full schema at
// `/graphql` and one filtered Yoga per served sub-graph at `/graphql/<name>`.
// An under-tagged field/type VANISHES with no build error, so these
// presence/absence assertions are the guard for the tagging in this sprint.

const QUERY_FIELDS = `{ __type(name: "Query") { fields { name } } }`
const MUTATION_FIELDS = `{ __type(name: "Mutation") { fields { name } } }`
interface IntrospectResult { data?: { __type?: { fields?: { name: string }[] } | null }, errors?: { message: string }[] }

const ADMIN_READS = ['productType', 'productTypes', 'product', 'products', 'adoptedProducts', 'category', 'categories', 'collection', 'collections'] as const
const TIER_MUTATIONS = [
  'assignProductValue', 'assignVariantValue', 'unassignProductValue', 'unassignVariantValue',
  'createCategory', 'updateCategory', 'deleteCategory', 'setCategoryParent', 'placeProduct', 'removePlacement',
  'addMedia', 'updateMedia', 'removeMedia', 'linkVariantMedia', 'unlinkVariantMedia',
  'createProduct', 'updateProduct', 'deleteProduct',
  'createProductType', 'updateProductType', 'deleteProductType', 'declareAttribute', 'undeclareAttribute',
  'createVariant', 'updateVariant', 'deleteVariant',
  'upsertProductTranslation', 'removeProductTranslation', 'upsertCategoryTranslation', 'removeCategoryTranslation', 'upsertVariantTranslation', 'removeVariantTranslation',
] as const
const ORG_MUTATIONS = [
  'adoptProduct', 'unadoptProduct', 'publishProduct', 'unpublishProduct',
  'createCollection', 'updateCollection', 'deleteCollection', 'addProductToCollection', 'removeProductFromCollection',
  'linkInventoryItem', 'unlinkInventoryItem', 'bindPriceSet', 'unbindPriceSet',
  'upsertCollectionTranslation', 'removeCollectionTranslation',
] as const
const ALL_MUTATIONS = [...TIER_MUTATIONS, ...ORG_MUTATIONS]

describe('product sub-graph exposure', () => {
  let h: ProductHarness

  beforeAll(async () => {
    h = await bootProductApp({ subGraphs: ['public', 'org', 'admin'] })
  }, 180_000)
  afterAll(async () => {
    await h.close()
  })

  const fieldNames = async (path: string, query: string): Promise<string[]> => {
    const res = await h.app.fetch(new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    }))
    const body = (await res.json()) as IntrospectResult
    expect(body.errors).toBeUndefined()
    return (body.data?.__type?.fields ?? []).map(f => f.name)
  }

  const typeExists = async (path: string, name: string): Promise<boolean> => {
    const res = await h.app.fetch(new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `{ __type(name: "${name}") { name } }` }),
    }))
    const body = (await res.json()) as { data?: { __type?: { name: string } | null } }
    return body.data?.__type != null
  }

  it('/graphql/public: storefront read present, management absent', async () => {
    const q = await fieldNames('/graphql/public', QUERY_FIELDS)
    const m = await fieldNames('/graphql/public', MUTATION_FIELDS)
    expect(q).toContain('productByHandle')
    for (const f of ADMIN_READS) expect(q).not.toContain(f)
    for (const f of ALL_MUTATIONS) expect(m).not.toContain(f)
    expect(await typeExists('/graphql/public', 'Product')).toBe(true)
    expect(await typeExists('/graphql/public', 'Category')).toBe(false)
    expect(await typeExists('/graphql/public', 'Collection')).toBe(false)
  })

  it('/graphql/public: anonymous productByHandle traverses the catalog graph', async () => {
    const res = await h.app.fetch(new Request('http://localhost/graphql/public', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: `{ productByHandle(handle: "nope") { id handle variants { edges { node { sku } } } media { edges { node { url } } } } }` }),
    }))
    const body = (await res.json()) as { data?: any, errors?: { message: string }[] }
    expect(body.errors).toBeUndefined() // schema resolves; no such handle → null
    expect(body.data.productByHandle).toBeNull()
  })

  it('/graphql/org: admin reads + all mutations present, no storefront read', async () => {
    const q = await fieldNames('/graphql/org', QUERY_FIELDS)
    const m = await fieldNames('/graphql/org', MUTATION_FIELDS)
    for (const f of ADMIN_READS) expect(q).toContain(f)
    expect(q).not.toContain('productByHandle')
    for (const f of ALL_MUTATIONS) expect(m).toContain(f)
  })

  it('/graphql/admin: tier mutations present, org-only mutations absent', async () => {
    const q = await fieldNames('/graphql/admin', QUERY_FIELDS)
    const m = await fieldNames('/graphql/admin', MUTATION_FIELDS)
    for (const f of ADMIN_READS) expect(q).toContain(f)
    for (const f of TIER_MUTATIONS) expect(m).toContain(f)
    for (const f of ORG_MUTATIONS) expect(m).not.toContain(f)
  })
})
```

- [ ] **Step 2: Run the exposure E2E**

Run: `pnpm --filter @czo/product test src/e2e/subgraph-exposure.e2e.test.ts`
Expected: PASS (4/4). If a mutation appears in the wrong audience set, the Task 4/5 tagging for it is wrong — fix the source, not the test. If a `*Connection` type is missing on public (the first test's `productByHandle` traversal errors), revisit Task 2 Step 6's relatedConnection verdict.

- [ ] **Step 3: Stage**

```bash
git add packages/modules/product/src/e2e/subgraph-exposure.e2e.test.ts
```

---

### Task 8: Full validation

**Files:** none.

- [ ] **Step 1: Full module suite**

Run: `pnpm --filter @czo/product test`
Expected: PASS — 209 existing tests (hit default `/graphql`, unaffected) + new exposure suite (4).

- [ ] **Step 2: Type-check product + downstream**

Run: `pnpm --filter @czo/product check-types && pnpm --filter life check-types`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `pnpm --filter @czo/product lint --max-warnings 0`
Expected: PASS.

- [ ] **Step 4: Confirm staged set**

Run: `git status --short`
Expected (ONLY these; do NOT stage the `docs/superpowers/...` spec/plan or the B19-B docs):

```
A  packages/modules/product/src/graphql/schema/product/subgraphs.ts
M  packages/modules/product/src/e2e/harness.ts
M  packages/modules/product/src/graphql/schema/product/types/product.ts
M  packages/modules/product/src/graphql/schema/product/types/variant.ts
M  packages/modules/product/src/graphql/schema/product/types/product-type.ts
M  packages/modules/product/src/graphql/schema/product/types/media.ts
M  packages/modules/product/src/graphql/schema/product/types/grafts.ts
M  packages/modules/product/src/graphql/schema/product/types/category.ts
M  packages/modules/product/src/graphql/schema/product/types/collection.ts
M  packages/modules/product/src/graphql/schema/product/queries.ts
M  packages/modules/product/src/graphql/schema/product/mutations/assignment.ts
M  packages/modules/product/src/graphql/schema/product/mutations/category.ts
M  packages/modules/product/src/graphql/schema/product/mutations/media.ts
M  packages/modules/product/src/graphql/schema/product/mutations/product.ts
M  packages/modules/product/src/graphql/schema/product/mutations/productType.ts
M  packages/modules/product/src/graphql/schema/product/mutations/variant.ts
M  packages/modules/product/src/graphql/schema/product/mutations/translation.ts
M  packages/modules/product/src/graphql/schema/product/mutations/adoption.ts
M  packages/modules/product/src/graphql/schema/product/mutations/channelListing.ts
M  packages/modules/product/src/graphql/schema/product/mutations/collection.ts
M  packages/modules/product/src/graphql/schema/product/mutations/inventoryBinding.ts
M  packages/modules/product/src/graphql/schema/product/mutations/priceBinding.ts
M  packages/modules/product/src/graphql/schema/product/errors.ts
M  packages/modules/product/src/graphql/schema/product/inputs.ts
A  packages/modules/product/src/e2e/subgraph-exposure.e2e.test.ts
```

- [ ] **Step 5: Report** validation results to the user. Do NOT commit — single commit after explicit review.

---

## Notes for the executor

- **No commits/branches/stash.** Stage only.
- **Do not tag kit-shared types** (`OptimisticLockError`, `ValidationError`, `DateTime`) — tagged centrally in kit.
- **Later-wins ordering:** `...sg(...).field/.input/.payload` go FIRST in their option objects so explicit `authScopes`/`resolve`/`inputFields`/`outputFields`/`description` override.
- **All 47 mutations already have an `errors` block** (some `types: []`) → uniform 5-point, merge `...errorOpts` into the existing block. Never add a fresh `errors` block (that is the attribute reorder regression — not applicable here since blocks already exist).
- **Field narrowing is exactly two fields** (`Product.organization`, `ProductType.organization`); everything else inherits its type's audience.
- **Task 2 Step 6 is the load-bearing mechanics check** — the whole fan-out assumes relatedConnection tagging works the way the spike establishes. Record the verdict.
