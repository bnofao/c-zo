# Taxonomy Requests — Product Types + Attribute Co-Promotion (Sprint 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An org can request a global **product type** (create a bare one, or promote an existing org type); approving a promotion **co-promotes** the type's org-private declared attributes — and those attributes' value catalogs — to global, so the global type is fully usable on the marketplace.

**Architecture:** New `AttributeService.promoteToGlobal` (`@czo/attribute`, flips attribute + its 8 value tables → null, collision-free). New `ProductTypeService.promoteToGlobal` (`@czo/product`, flips type + its org declarations, slug-checked). `TaxonomyRequestService` (S1) extends `submit*` + `approve` dispatch to `product_type` and orchestrates the cascade. 2 new org mutations; `approveTaxonomyRequest` gains a dynamic (entityType-aware) authScope.

**Tech Stack:** Drizzle RQBv2, Effect-TS, Pothos relay + scope-auth + sub-graph, Vitest + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-06-15-taxonomy-requests-product-types-design.md`

**Branch:** `feat/taxonomy-requests-product-types` off `main` (after #141 merges; otherwise off `feat/taxonomy-requests-categories` and note the stacking). Stage only — no commits until user review.

---

## Task 1: `AttributeService.promoteToGlobal` (`@czo/attribute`)

**Files:** Modify `packages/modules/attribute/src/services/attribute.ts`; test `packages/modules/attribute/src/services/attribute.integration.test.ts` (or the existing service test).

- [ ] **Step 1: Import the 8 value tables.** The service currently imports only `attributes` from `../database/schema`. Add the value tables:
```ts
import {
  attributes,
  attributeBooleanValues,
  attributeDateValues,
  attributeFileValues,
  attributeNumericValues,
  attributeReferenceValues,
  attributeSwatchValues,
  attributeTextValues,
  attributeValues,
} from '../database/schema'
```
Also ensure `and`, `eq`, `isNotNull` are imported from `drizzle-orm` (the file already imports `eq`).

- [ ] **Step 2: Contract.** Add to the `AttributeService` `Context.Service` shape (after `delete`):
```ts
    readonly promoteToGlobal: (
      attributeId: number,
    ) => Effect.Effect<Attribute, AttributeNotFound | AttributeDbFailed>
```

- [ ] **Step 3: Implement** — inside `make`, before the `satisfies AttributeServiceImpl` return. Use the file's existing DB-error-wrapping helper (find how other methods map to `AttributeDbFailed` — e.g. a `dbErr` closure or inline `Effect.tryPromise`/`Effect.mapError`; match it; below assumes a `dbErr` wrapper exists — if not, wrap each `db.update(...)` the same way the existing methods wrap writes):
```ts
  const VALUE_TABLES = [
    attributeValues,
    attributeSwatchValues,
    attributeReferenceValues,
    attributeTextValues,
    attributeNumericValues,
    attributeBooleanValues,
    attributeDateValues,
    attributeFileValues,
  ] as const

  const promoteToGlobal: AttributeServiceImpl['promoteToGlobal'] = attributeId =>
    Effect.gen(function* () {
      const attr = yield* findById(attributeId)
      if (attr.organizationId === null)
        return attr

      yield* dbErr(db.update(attributes).set({ organizationId: null }).where(eq(attributes.id, attributeId)))

      for (const tbl of VALUE_TABLES) {
        yield* dbErr(db.update(tbl).set({ organizationId: null }).where(and(eq(tbl.attributeId, attributeId), isNotNull(tbl.organizationId))))
      }

      return yield* findById(attributeId)
    })
```
Notes: `findById` already exists on the service and returns `Attribute | AttributeNotFound`. If the `attributes` table has a `version` column with optimistic locking, also bump it: `.set({ organizationId: null, version: sql\`${attributes.version} + 1\` })` (import `sql` if needed; check the column exists first). The cascade is collision-free (attribute slug is globally unique; value slugs are unique per `(attributeId, slug)`), so no slug pre-check.

- [ ] **Step 4: Export** `promoteToGlobal` in the `make` return object.

- [ ] **Step 5: Test** — add to the attribute service integration test:
  - Seed an org attribute (org 1) of a SELECT type with ≥2 org values (e.g. via the service's `create` + the value-creation path the tests already use; if value seeding is heavy, insert value rows directly via the test DB handle). Call `promoteToGlobal(attr.id)`. Assert the attribute `organizationId === null` AND each seeded value row's `organizationId === null`.
  - `promoteToGlobal` on an already-global attribute returns it unchanged (idempotent), values untouched.

Run: `pnpm --filter @czo/attribute test <that file>` → PASS. `pnpm --filter @czo/attribute check-types` → PASS.

---

## Task 2: `ProductTypeService.promoteToGlobal` + 2 errors (`@czo/product`)

**Files:** Modify `packages/modules/product/src/services/product-type.ts`; test `product-type.integration.test.ts`.

- [ ] **Step 1: Two tagged errors** (after `ProductTypeNotFound`):
```ts
export class ProductTypeAlreadyGlobal extends Data.TaggedError('ProductTypeAlreadyGlobal')<{ readonly id: number }> {
  readonly code = 'PRODUCT_TYPE_ALREADY_GLOBAL'
  get message() { return 'Product type is already global' }
}
export class ProductTypeSlugTaken extends Data.TaggedError('ProductTypeSlugTaken')<{ readonly slug: string }> {
  readonly code = 'PRODUCT_TYPE_SLUG_TAKEN'
  get message() { return 'A global product type with this slug already exists' }
}
```

- [ ] **Step 2: Contract** — add to the `ProductTypeService` shape:
```ts
  readonly promoteToGlobal: (typeId: number) => Effect.Effect<ProductType, ProductTypeNotFound | ProductTypeAlreadyGlobal | ProductTypeSlugTaken | ProductTypeDbFailed>
```

- [ ] **Step 3: Implement** (before the `make` return). Confirm the table import name (`productTypesTable` or `productTypes`) and the declarations table (`productTypeAttributesTable`) from the file's imports; use whatever it aliases:
```ts
  const promoteToGlobal: ProductTypeServiceImpl['promoteToGlobal'] = typeId =>
    Effect.gen(function* () {
      const type = yield* dbErr(db.query.productTypes.findFirst({ where: { id: typeId, deletedAt: { isNull: true as const } } }))
      if (!type)
        return yield* Effect.fail(new ProductTypeNotFound({ id: typeId }))
      if (type.organizationId === null)
        return yield* Effect.fail(new ProductTypeAlreadyGlobal({ id: typeId }))

      const clash = yield* dbErr(db.query.productTypes.findFirst({
        where: { organizationId: { isNull: true as const }, slug: type.slug, deletedAt: { isNull: true as const } },
      }))
      if (clash)
        return yield* Effect.fail(new ProductTypeSlugTaken({ slug: type.slug }))

      // The type's own org-scoped attribute declarations become base (null);
      // base declarations (already null) ride along via productTypeId.
      yield* dbErr(db.update(productTypeAttributesTable)
        .set({ organizationId: null })
        .where(sql`${productTypeAttributesTable.productTypeId} = ${typeId} AND ${productTypeAttributesTable.organizationId} = ${type.organizationId}`))

      const [row] = yield* dbErr(db.update(productTypesTable)
        .set({ organizationId: null, version: type.version + 1, updatedAt: sql`NOW()` as any })
        .where(sql`${productTypesTable.id} = ${typeId} AND ${productTypesTable.deletedAt} IS NULL`)
        .returning())
      return row! as ProductType
    })
```

- [ ] **Step 4: Export** `promoteToGlobal` in the `make` return.

- [ ] **Step 5: Tests** — append to `product-type.integration.test.ts`: flip an org type → global (assert `organizationId === null`); already-global → `ProductTypeAlreadyGlobal`; a global slug clash → `ProductTypeSlugTaken`; an org type with an org-scoped declaration → after promote the declaration's `organizationId === null` (assert via `listTypeAttributes` or a direct read). Match the file's existing `layer`/`truncate*` helpers.

Run: `pnpm --filter @czo/product test src/services/product-type.integration.test.ts` → PASS; `check-types` → PASS.

---

## Task 3: `TaxonomyRequestService` — product-type submit + approve cascade

**Files:** Modify `packages/modules/product/src/services/taxonomy-request.ts`; test `taxonomy-request.integration.test.ts`.

- [ ] **Step 1: New deps + imports.** In `make`, add `const productTypes = yield* ProductTypeService` and `const attributes = yield* Attribute.AttributeService`. Imports: `import { Attribute } from '@czo/attribute/services'` and, from `./product-type`, `ProductTypeService`, `ProductTypeAlreadyGlobal`, `ProductTypeNotFound`, `ProductTypeSlugTaken`; re-export the product-type errors from this file (mirroring the category re-exports). Add `AttributeNotFound` to the imports from `@czo/attribute/services` (it's exported via `Attribute.AttributeNotFound` — confirm path) for the approve error channel.

- [ ] **Step 2: Input types + contract.** Add:
```ts
export interface ProductTypeCreationInput {
  organizationId: number
  name: string
  slug: string
  isShippingRequired?: boolean
}
export interface ProductTypePromotionInput {
  organizationId: number
  productTypeId: number
}
```
Add to the service shape:
```ts
  readonly submitProductTypeCreation: (input: ProductTypeCreationInput) => Effect.Effect<TaxonomyRequest, TaxonomyRequestDbFailed>
  readonly submitProductTypePromotion: (input: ProductTypePromotionInput) => Effect.Effect<TaxonomyRequest, ProductTypeNotFound | ProductTypeAlreadyGlobal | TaxonomyRequestDbFailed>
  readonly findById: (requestId: number) => Effect.Effect<TaxonomyRequest | undefined, TaxonomyRequestDbFailed>
```
And widen `approve`'s error channel to add `ProductTypeNotFound | ProductTypeAlreadyGlobal | ProductTypeSlugTaken | AttributeNotFound`.

- [ ] **Step 2b: `findById`** (used by the dynamic authScope in Task 4):
```ts
  const findById: Impl['findById'] = requestId =>
    dbErr(db.query.taxonomyRequests.findFirst({ where: { id: requestId } })) as Effect.Effect<TaxonomyRequest | undefined, TaxonomyRequestDbFailed>
```

- [ ] **Step 3: Submit methods.**
```ts
  const submitProductTypeCreation: Impl['submitProductTypeCreation'] = input =>
    insert({
      kind: 'create',
      entityType: 'product_type',
      organizationId: input.organizationId,
      payload: {
        name: input.name,
        slug: input.slug,
        ...(input.isShippingRequired !== undefined ? { isShippingRequired: input.isShippingRequired } : {}),
      },
    })

  const submitProductTypePromotion: Impl['submitProductTypePromotion'] = input =>
    Effect.gen(function* () {
      const type = yield* productTypes.findTypeById(input.productTypeId).pipe(
        Effect.mapError(e => e._tag === 'ProductTypeNotFound' ? e : new TaxonomyRequestDbFailed({ cause: e })),
      )
      if (type.organizationId === null)
        return yield* Effect.fail(new ProductTypeAlreadyGlobal({ id: input.productTypeId }))
      if (type.organizationId !== input.organizationId)
        return yield* Effect.fail(new ProductTypeNotFound({ id: input.productTypeId }))
      return yield* insert({ kind: 'promote', entityType: 'product_type', organizationId: input.organizationId, targetId: input.productTypeId })
    })
```

- [ ] **Step 4: Rewrite `approve`** to dispatch by `entityType` then `kind`:
```ts
  const approve: Impl['approve'] = requestId =>
    Effect.gen(function* () {
      const req = yield* loadPending(requestId)
      let resultId: number

      if (req.entityType === 'category') {
        if (req.kind === 'create') {
          const p = req.payload as { name: string, slug: string, description?: string, parentId?: number }
          const created = yield* categories.createCategory({ organizationId: null, name: p.name, slug: p.slug, ...(p.description !== undefined ? { description: p.description } : {}), ...(p.parentId !== undefined ? { parentId: p.parentId } : {}) })
          resultId = created.id
        }
        else {
          const promoted = yield* categories.promoteToGlobal(req.targetId!)
          resultId = promoted.id
        }
      }
      else { // product_type
        if (req.kind === 'create') {
          const p = req.payload as { name: string, slug: string, isShippingRequired?: boolean }
          const created = yield* productTypes.createType({ organizationId: null, name: p.name, slug: p.slug, isShippingRequired: p.isShippingRequired ?? true })
          resultId = created.id
        }
        else {
          // Co-promote the type's org-private declared attributes (+ their values), then the type.
          const decls = yield* productTypes.listTypeAttributes({ productTypeId: req.targetId! })
          const attributeIds = [...new Set(decls.map(d => d.attributeId))]
          for (const attributeId of attributeIds) {
            const attr = yield* attributes.findById(attributeId)
            if (attr.organizationId !== null)
              yield* attributes.promoteToGlobal(attributeId)
          }
          const promoted = yield* productTypes.promoteToGlobal(req.targetId!)
          resultId = promoted.id
        }
      }

      return yield* finalize(requestId, { state: 'approved', reviewedAt: sql`NOW()` as any, resultId })
    })
```
Confirm `createType`'s `CreateProductTypeInput` field names (`isShippingRequired`, `name`, `slug`, `organizationId`) and `listTypeAttributes`'s input shape (`{ productTypeId }` — it may also take an org filter; pass what returns ALL declarations for the type). Map any `*DbFailed` from cross-service calls into `TaxonomyRequestDbFailed` where the contract requires it (as done for `CategoryDbFailed` in S1 — apply the same inline `Effect.mapError` to the product-type/attribute `DbFailed` channels so they don't leak into `approve`'s declared errors).

- [ ] **Step 5: Export** the two submit methods + `findById` in the `make` return.

- [ ] **Step 6: Tests** — append product-type cases to `taxonomy-request.integration.test.ts`:
  - product-type creation → approve → a bare global type exists (`findTypeById(resultId)`, `organizationId === null`).
  - org type + an org attribute declared on it → promotion request → approve → the type, its declaration, the attribute, and the attribute's values are all `organizationId === null` (assert across `ProductTypeService` + `Attribute.AttributeService`). Seed the org attribute + its values + the declaration via the relevant services.
  - promotion of a type whose declared attributes are already global → approve flips only the type (attributes untouched).
  - `submitProductTypePromotion` for a global / another-org type → `ProductTypeAlreadyGlobal` / `ProductTypeNotFound`.
  - approve with a global type-slug clash → `ProductTypeSlugTaken`; request stays `pending`.

Resolve `TaxonomyRequestService`, `ProductTypeService`, and `Attribute.AttributeService` from the test layer. Run: `pnpm --filter @czo/product test src/services/taxonomy-request.integration.test.ts` → PASS.

---

## Task 4: GraphQL — 2 org mutations, dynamic approve authScope, errors

**Files:** Modify `mutations/taxonomyRequest.ts`, `queries.ts` (none) — actually only `mutations/taxonomyRequest.ts` + `errors.ts`.

- [ ] **Step 1: Two org mutations** in `mutations/taxonomyRequest.ts` (mirror `requestCategoryCreation`/`requestCategoryPromotion`, `sg('org')`, gate `product:create` in org):
```ts
  // ── requestProductTypeCreation (org) ────────────────────────────────────────
  builder.relayMutationField(
    'requestProductTypeCreation',
    {
      ...sg('org').input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The organization submitting the request; gated on `product:create` there.' }),
        name: t.string({ required: true, description: 'Proposed product type name.' }),
        slug: t.string({ required: true, description: 'Proposed slug, unique among global product types once approved.' }),
        isShippingRequired: t.boolean({ description: 'Whether products of this type require shipping. Defaults to true.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Submits a request for the platform to create a new GLOBAL product type (a bare type; attributes are added by the platform). Requires `product:create` in the organization.',
      errors: { types: [], ...sg('org').errorOpts },
      authScopes: (_p, args) => ({ permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_root, args, ctx) => {
        const request = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.submitProductTypeCreation({
            organizationId: Number(args.input.organizationId.id),
            name: args.input.name,
            slug: args.input.slug,
            isShippingRequired: args.input.isShippingRequired ?? undefined,
          })
        }))
        return { request }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ request: t.field({ type: 'TaxonomyRequest', resolve: p => p.request, description: 'The created pending request.' }) }) },
  )

  // ── requestProductTypePromotion (org) ───────────────────────────────────────
  builder.relayMutationField(
    'requestProductTypePromotion',
    {
      ...sg('org').input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The organization that owns the product type and is gated against.' }),
        productTypeId: t.int({ required: true, description: 'Id of the org-owned product type to promote to global.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Submits a request to promote an existing org-owned product type to GLOBAL. On approval the type — and the org-private attributes it declares, with their values — are made global. Requires `product:create` in the organization.',
      errors: { types: [ProductTypeNotFound, ProductTypeAlreadyGlobal], ...sg('org').errorOpts },
      authScopes: (_p, args) => ({ permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_root, args, ctx) => {
        const request = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.submitProductTypePromotion({ organizationId: Number(args.input.organizationId.id), productTypeId: args.input.productTypeId })
        }))
        return { request }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ request: t.field({ type: 'TaxonomyRequest', resolve: p => p.request, description: 'The created pending request.' }) }) },
  )
```
Import `ProductTypeNotFound`, `ProductTypeAlreadyGlobal` from `../../../../services`.

- [ ] **Step 2: Widen `approveTaxonomyRequest`'s error types** to add `ProductTypeNotFound`, `ProductTypeAlreadyGlobal`, `ProductTypeSlugTaken`, `AttributeNotFound` (import them; `AttributeNotFound` via the services barrel — re-export it from `@czo/product`'s services index, sourced from `@czo/attribute/services`, so the GraphQL layer imports it locally and `errors.ts` can register it).

- [ ] **Step 3: Dynamic authScope on `approveTaxonomyRequest`.** Replace its static `authScopes: adminScope` with:
```ts
      authScopes: async (_p, args, ctx) => {
        const product = { permission: { resource: 'product', actions: ['create'] } }
        const req = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.findById(Number(args.input.requestId.id))
        }))
        if (req?.entityType === 'product_type')
          return { $all: [product, { permission: { resource: 'attribute', actions: ['create'] } }] }
        return product
      },
```
**VERIFY `$all`:** confirm the built schema accepts the `{ $all: [...] }` combinator (it is a native `@pothos/plugin-scope-auth` feature). Test by booting the schema (the exposure e2e). If the build rejects `$all`, fall back to a single async scope that resolves both permissions via the access layer and returns a boolean — record the fallback used.

- [ ] **Step 4: Register the new errors** in `errors.ts`:
```ts
  registerError(builder, ProductTypeAlreadyGlobal, { name: 'ProductTypeAlreadyGlobalError', subGraphs: ['org', 'admin'] })
  registerError(builder, ProductTypeSlugTaken, { name: 'ProductTypeSlugTakenError', subGraphs: ['admin'] })
```
`ProductTypeNotFound` and `AttributeNotFound` may already be registered (product registers `ProductTypeNotFound` in S1/earlier; `AttributeNotFound` is registered by `@czo/attribute`). Confirm — register here ONLY if not already registered by either module, to avoid a duplicate-name collision. If `AttributeNotFound` is already a registered GraphQL error from the attribute module's schema, do NOT re-register; just reference the class in `approveTaxonomyRequest.errors.types`.

- [ ] **Step 5: check-types + lint + schema build.** `pnpm --filter @czo/product check-types`; `pnpm --filter @czo/product test src/e2e/subgraph-exposure.e2e.test.ts` (schema builds + $all accepted); `lint --max-warnings 0` (verify check-types separately after any lint --fix).

---

## Task 5: E2E exposure + full validation

**Files:** Modify `src/e2e/taxonomy-request-exposure.e2e.test.ts`.

- [ ] **Step 1:** Extend the exposure test (or add a block) asserting `requestProductTypeCreation` + `requestProductTypePromotion` present on `/graphql/org`, absent from `/graphql/admin` and `/graphql/public`. (The admin approve/reject + queries are unchanged from S1.) Run that file → PASS.

- [ ] **Step 2: Full validation.**
  - `pnpm --filter @czo/attribute test && pnpm --filter @czo/attribute check-types && pnpm --filter @czo/attribute lint --max-warnings 0`
  - `pnpm --filter @czo/product test && pnpm --filter @czo/product check-types && pnpm --filter @czo/product lint --max-warnings 0`
  - `pnpm --filter life check-types`
  - `git add -A` excluding `docs/superpowers/**`; report staged files + results; stop for user review. Do **not** commit.

---

## Self-review notes

- **Spec coverage:** AttributeService.promoteToGlobal + value cascade (T1), ProductTypeService.promoteToGlobal + errors (T2), TaxonomyRequestService product-type submit + approve cascade + findById (T3), 2 org mutations + dynamic authz + error registration (T4), exposure + validation (T5).
- **Cross-module:** `@czo/attribute` change is additive (one service method, no schema/migration). `@czo/product` reaches it via the existing `Attribute.AttributeService` app-provided dependency (same as `ChannelListingService` → `Channel`). No product layer-wiring change (`ProductTypeService` already in `ProductCoreLive`, `CategoryService` already provideMerged in S1).
- **Type consistency:** new methods (`promoteToGlobal` on both services, `submitProductType*`, `findById`) named identically across contract/impl/callers. Enum value `product_type` matches the DB enum.
- **Known risk (documented in spec, not solved):** the cascade is non-atomic across modules; re-approve is idempotent and convergent.
- **Verification points flagged for the implementer:** `$all` scope-auth combinator support; `AttributeNotFound` not double-registered; `attributes.version` existence before bumping.
