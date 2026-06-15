# Taxonomy Requests — Categories (Sprint 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An org can submit a **creation** or **promotion** request for a global category; a platform admin approves (inserting a new global category, or flipping an org category to `organizationId = null`) or rejects with a reason — built on a generic `taxonomy_requests` entity ready for product types (Sprint 2).

**Architecture:** New `taxonomy_requests` table + `TaxonomyRequestService` (submit/approve/reject/list) orchestrating a new `CategoryService.promoteToGlobal`. 4 relay mutations (2 org `['org']`, 2 admin `['admin']`), 2 list queries, a `TaxonomyRequest` node. Reuses `createCategory({organizationId:null})` for the create path (it already enforces global-slug + parent-global).

**Tech Stack:** Drizzle RQBv2 (`@effect/sql-pg`), Effect-TS services, Pothos relay + `@pothos/plugin-sub-graph`, Vitest + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-06-15-taxonomy-requests-categories-design.md`

**Branch:** create `feat/taxonomy-requests-categories` off `main` before Task 1. Stage only — no commits until explicit user review.

---

## Task 1: Schema — enums + `taxonomy_requests` table + relations

**Files:** Modify `src/database/schema.ts`, `src/database/relations.ts`; generate a migration.

- [ ] **Step 1: Add three enums** in `schema.ts` after `mediaTypeEnum`:

```ts
export const taxonomyRequestKindEnum = pgEnum('taxonomy_request_kind', ['create', 'promote'])
export const taxonomyEntityTypeEnum = pgEnum('taxonomy_entity_type', ['category', 'product_type'])
export const taxonomyRequestStateEnum = pgEnum('taxonomy_request_state', ['pending', 'approved', 'rejected'])
```

- [ ] **Step 2: Add the table** (place it after `productChannelListings`):

```ts
export const taxonomyRequests = pgTable('taxonomy_requests', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  kind: taxonomyRequestKindEnum('kind').notNull(),
  entityType: taxonomyEntityTypeEnum('entity_type').notNull(),
  organizationId: integer('organization_id').notNull(),
  payload: jsonb('payload'),
  targetId: integer('target_id'),
  state: taxonomyRequestStateEnum('state').notNull().default('pending'),
  reviewReason: text('review_reason'),
  reviewedAt: timestamp('reviewed_at'),
  resultId: integer('result_id'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('taxonomy_requests_state_idx').on(t.state),
  index('taxonomy_requests_org_idx').on(t.organizationId),
])
```

- [ ] **Step 3: Register the table in `relations.ts`** — add `'taxonomyRequests'` to the `Pick<SchemaRegistryShape, …>` union, to the destructure inside `productRelations`, and to the first object passed to `defineRelationsPart({ …, taxonomyRequests }, { … })`. It has **no** relations, so add no entry in the second (relations) argument.

- [ ] **Step 4: Generate + check.** Run `pnpm --filter @czo/product migrate:generate`; confirm the migration only creates the 3 enums + the table. Then `pnpm --filter @czo/product check-types` → PASS. If the generated `snapshot.json` lacks a trailing newline, run `pnpm --filter @czo/product lint --fix migrations/<new>/` (known: drizzle omits the final newline).

---

## Task 2: `CategoryService.promoteToGlobal` + two errors

**Files:** Modify `src/services/category.ts`; test `src/services/category.integration.test.ts`.

- [ ] **Step 1: Add two tagged errors** after the existing `CategorySlugTaken` class:

```ts
export class CategoryAlreadyGlobal extends Data.TaggedError('CategoryAlreadyGlobal')<{ readonly id: number }> {
  readonly code = 'CATEGORY_ALREADY_GLOBAL'
  get message() { return 'Category is already global' }
}

export class CategoryParentNotGlobal extends Data.TaggedError('CategoryParentNotGlobal')<{ readonly parentId: number }> {
  readonly code = 'CATEGORY_PARENT_NOT_GLOBAL'
  get message() { return 'A global category requires a global parent' }
}
```

- [ ] **Step 2: Extend the contract** — add to the `CategoryService` `Context.Service` shape:

```ts
  readonly promoteToGlobal: (categoryId: number) => Effect.Effect<Category, CategoryNotFound | CategoryAlreadyGlobal | CategoryParentNotGlobal | CategorySlugTaken | CategoryDbFailed>
```

- [ ] **Step 3: Implement `promoteToGlobal`** — add before the `return { … }` of `make`:

```ts
  const promoteToGlobal: CategoryServiceImpl['promoteToGlobal'] = categoryId =>
    Effect.gen(function* () {
      const category = yield* dbErr(db.query.categories.findFirst({
        where: { id: categoryId, deletedAt: { isNull: true as const } },
      }))
      if (!category)
        return yield* Effect.fail(new CategoryNotFound({ id: categoryId }))
      if (category.organizationId === null)
        return yield* Effect.fail(new CategoryAlreadyGlobal({ id: categoryId }))

      // A global category requires a global parent.
      if (category.parentId !== null) {
        const parent = yield* dbErr(db.query.categories.findFirst({
          where: { id: category.parentId, deletedAt: { isNull: true as const } },
          columns: { organizationId: true },
        }))
        if (!parent || parent.organizationId !== null)
          return yield* Effect.fail(new CategoryParentNotGlobal({ parentId: category.parentId }))
      }

      // Global slug must be free.
      const clash = yield* dbErr(db.query.categories.findFirst({
        where: { organizationId: { isNull: true as const }, slug: category.slug, deletedAt: { isNull: true as const } },
      }))
      if (clash)
        return yield* Effect.fail(new CategorySlugTaken({ slug: category.slug }))

      const [row] = yield* dbErr(db
        .update(categoriesTable)
        .set({ organizationId: null, version: category.version + 1, updatedAt: sql`NOW()` as any })
        .where(sql`${categoriesTable.id} = ${categoryId} AND ${categoriesTable.deletedAt} IS NULL`)
        .returning())
      return row! as Category
    })
```

(Confirm `categoriesTable`, `sql`, and `dbErr` are the names already used in this file; adjust to match.)

- [ ] **Step 4: Export it** — add `promoteToGlobal` to the `return { … } satisfies CategoryServiceImpl`.

- [ ] **Step 5: Tests** — add to `category.integration.test.ts`:

```ts
  it.effect('promoteToGlobal flips an org category to global', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* CategoryService
      const cat = yield* svc.createCategory({ organizationId: 1, name: 'Bags', slug: 'bags-promote' })
      const promoted = yield* svc.promoteToGlobal(cat.id)
      expect(promoted.organizationId).toBeNull()
    }))

  it.effect('promoteToGlobal on an already-global category → CategoryAlreadyGlobal', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* CategoryService
      const cat = yield* svc.createCategory({ organizationId: null, name: 'Shoes', slug: 'shoes-glob' })
      const err = yield* svc.promoteToGlobal(cat.id).pipe(Effect.flip)
      expect(err._tag).toBe('CategoryAlreadyGlobal')
    }))

  it.effect('promoteToGlobal when a global slug already exists → CategorySlugTaken', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* CategoryService
      yield* svc.createCategory({ organizationId: null, name: 'Hats', slug: 'hats-x' })
      const orgCat = yield* svc.createCategory({ organizationId: 1, name: 'Hats', slug: 'hats-x' })
      const err = yield* svc.promoteToGlobal(orgCat.id).pipe(Effect.flip)
      expect(err._tag).toBe('CategorySlugTaken')
    }))

  it.effect('promoteToGlobal with an org parent → CategoryParentNotGlobal', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const svc = yield* CategoryService
      const parent = yield* svc.createCategory({ organizationId: 1, name: 'Apparel', slug: 'apparel-p' })
      const child = yield* svc.createCategory({ organizationId: 1, name: 'Tops', slug: 'tops-c', parentId: parent.id })
      const err = yield* svc.promoteToGlobal(child.id).pipe(Effect.flip)
      expect(err._tag).toBe('CategoryParentNotGlobal')
    }))
```

Run: `pnpm --filter @czo/product test src/services/category.integration.test.ts` → PASS.

---

## Task 3: `TaxonomyRequestService`

**Files:** Create `src/services/taxonomy-request.ts`; test `src/services/taxonomy-request.integration.test.ts`.

- [ ] **Step 1: Create the service** with this content:

```ts
import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import { DrizzleDb } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { taxonomyRequests as taxonomyRequestsTable } from '../database/schema'
import {
  CategoryAlreadyGlobal,
  CategoryNotFound,
  CategoryParentNotGlobal,
  CategoryService,
  CategorySlugTaken,
} from './category'

export { CategoryAlreadyGlobal, CategoryNotFound, CategoryParentNotGlobal, CategorySlugTaken } from './category'

export class TaxonomyRequestDbFailed extends Data.TaggedError('TaxonomyRequestDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'TAXONOMY_REQUEST_DB_FAILED'
  get message() { return 'Database operation failed' }
}

export class TaxonomyRequestNotFound extends Data.TaggedError('TaxonomyRequestNotFound')<{ readonly id: number }> {
  readonly code = 'TAXONOMY_REQUEST_NOT_FOUND'
  get message() { return 'Taxonomy request not found' }
}

export class TaxonomyRequestNotPending extends Data.TaggedError('TaxonomyRequestNotPending')<{ readonly id: number }> {
  readonly code = 'TAXONOMY_REQUEST_NOT_PENDING'
  get message() { return 'Taxonomy request is not pending' }
}

export type TaxonomyRequest = InferSelectModel<typeof taxonomyRequestsTable>

export interface CategoryCreationInput {
  organizationId: number
  name: string
  slug: string
  description?: string
  parentId?: number
}
export interface CategoryPromotionInput {
  organizationId: number
  categoryId: number
}

export class TaxonomyRequestService extends Context.Service<TaxonomyRequestService, {
  readonly submitCategoryCreation: (input: CategoryCreationInput) => Effect.Effect<TaxonomyRequest, TaxonomyRequestDbFailed>
  readonly submitCategoryPromotion: (input: CategoryPromotionInput) => Effect.Effect<TaxonomyRequest, CategoryNotFound | CategoryAlreadyGlobal | TaxonomyRequestDbFailed>
  readonly approve: (requestId: number) => Effect.Effect<TaxonomyRequest, TaxonomyRequestNotFound | TaxonomyRequestNotPending | CategoryNotFound | CategoryAlreadyGlobal | CategoryParentNotGlobal | CategorySlugTaken | TaxonomyRequestDbFailed>
  readonly reject: (requestId: number, reason: string) => Effect.Effect<TaxonomyRequest, TaxonomyRequestNotFound | TaxonomyRequestNotPending | TaxonomyRequestDbFailed>
  readonly listForAdmin: (state?: 'pending' | 'approved' | 'rejected') => Effect.Effect<ReadonlyArray<TaxonomyRequest>, TaxonomyRequestDbFailed>
  readonly listForOrg: (organizationId: number) => Effect.Effect<ReadonlyArray<TaxonomyRequest>, TaxonomyRequestDbFailed>
}>()('@czo/product/TaxonomyRequestService') {}

type Impl = Context.Service.Shape<typeof TaxonomyRequestService>

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const categories = yield* CategoryService

  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new TaxonomyRequestDbFailed({ cause })))

  const insert = (values: typeof taxonomyRequestsTable.$inferInsert) =>
    Effect.gen(function* () {
      const [row] = yield* dbErr(db.insert(taxonomyRequestsTable).values(values).returning())
      return row! as TaxonomyRequest
    })

  const loadPending = (requestId: number) =>
    Effect.gen(function* () {
      const req = yield* dbErr(db.query.taxonomyRequests.findFirst({ where: { id: requestId } }))
      if (!req)
        return yield* Effect.fail(new TaxonomyRequestNotFound({ id: requestId }))
      if (req.state !== 'pending')
        return yield* Effect.fail(new TaxonomyRequestNotPending({ id: requestId }))
      return req as TaxonomyRequest
    })

  const finalize = (requestId: number, patch: Partial<typeof taxonomyRequestsTable.$inferInsert>) =>
    Effect.gen(function* () {
      const [row] = yield* dbErr(db
        .update(taxonomyRequestsTable)
        .set({ ...patch, updatedAt: sql`NOW()` as any })
        .where(sql`${taxonomyRequestsTable.id} = ${requestId}`)
        .returning())
      return row! as TaxonomyRequest
    })

  const submitCategoryCreation: Impl['submitCategoryCreation'] = input =>
    insert({
      kind: 'create',
      entityType: 'category',
      organizationId: input.organizationId,
      payload: {
        name: input.name,
        slug: input.slug,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      },
    })

  const submitCategoryPromotion: Impl['submitCategoryPromotion'] = input =>
    Effect.gen(function* () {
      // Fail fast: the target must be an org-tier category owned by the requester.
      const category = yield* categories.findCategoryById(input.categoryId).pipe(
        Effect.mapError(e => e._tag === 'CategoryNotFound' ? e : new TaxonomyRequestDbFailed({ cause: e })),
      )
      if (category.organizationId === null)
        return yield* Effect.fail(new CategoryAlreadyGlobal({ id: input.categoryId }))
      if (category.organizationId !== input.organizationId)
        return yield* Effect.fail(new CategoryNotFound({ id: input.categoryId }))

      return yield* insert({
        kind: 'promote',
        entityType: 'category',
        organizationId: input.organizationId,
        targetId: input.categoryId,
      })
    })

  const approve: Impl['approve'] = requestId =>
    Effect.gen(function* () {
      const req = yield* loadPending(requestId)

      let resultId: number
      if (req.kind === 'create') {
        const p = req.payload as { name: string, slug: string, description?: string, parentId?: number }
        const created = yield* categories.createCategory({
          organizationId: null,
          name: p.name,
          slug: p.slug,
          ...(p.description !== undefined ? { description: p.description } : {}),
          ...(p.parentId !== undefined ? { parentId: p.parentId } : {}),
        })
        resultId = created.id
      }
      else {
        const promoted = yield* categories.promoteToGlobal(req.targetId!)
        resultId = promoted.id
      }

      return yield* finalize(requestId, { state: 'approved', reviewedAt: sql`NOW()` as any, resultId })
    })

  const reject: Impl['reject'] = (requestId, reason) =>
    Effect.gen(function* () {
      yield* loadPending(requestId)
      return yield* finalize(requestId, { state: 'rejected', reviewReason: reason, reviewedAt: sql`NOW()` as any })
    })

  const listForAdmin: Impl['listForAdmin'] = state =>
    dbErr(db.query.taxonomyRequests.findMany({
      ...(state ? { where: { state } } : {}),
      orderBy: { createdAt: 'desc' },
    })) as Effect.Effect<ReadonlyArray<TaxonomyRequest>, TaxonomyRequestDbFailed>

  const listForOrg: Impl['listForOrg'] = organizationId =>
    dbErr(db.query.taxonomyRequests.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    })) as Effect.Effect<ReadonlyArray<TaxonomyRequest>, TaxonomyRequestDbFailed>

  return { submitCategoryCreation, submitCategoryPromotion, approve, reject, listForAdmin, listForOrg } satisfies Impl
})

export const TaxonomyRequestServiceLive = Layer.effect(TaxonomyRequestService, make)
```

(Confirm against the codebase: `db.query.taxonomyRequests.findMany` supports the `orderBy` object form; if not, drop `orderBy`. `findCategoryById` exists on `CategoryService`.)

- [ ] **Step 2: Tests** — create `taxonomy-request.integration.test.ts` covering: creation→approve inserts a global category (`resultId` set, `state='approved'`); promotion→approve flips org→null; slug-collision create→approve → `CategorySlugTaken` (request still `pending`); promote of another org's / a global category at submit → `CategoryNotFound` / `CategoryAlreadyGlobal`; approve/reject missing → `TaxonomyRequestNotFound`; non-pending → `TaxonomyRequestNotPending`; reject sets reason; `listForAdmin(state)` + `listForOrg` scope. Use the shared `ProductAttributeLayer` + `truncateProductAttribute` and resolve `TaxonomyRequestService` from the layer (Task 4 wires it).

Run after Task 4: `pnpm --filter @czo/product test src/services/taxonomy-request.integration.test.ts` → PASS.

---

## Task 4: Layer wiring + service barrel exports

**Files:** Modify `src/services/index.ts`.

- [ ] **Step 1: Export** the new service + types + errors from `src/services/index.ts` (mirror the `CategoryService` export block): `TaxonomyRequestService`, `TaxonomyRequestServiceLive`, `TaxonomyRequestNotFound`, `TaxonomyRequestNotPending`, `TaxonomyRequestDbFailed`, and `type TaxonomyRequest`, `CategoryCreationInput`, `CategoryPromotionInput`. Also export the two new category errors `CategoryAlreadyGlobal`, `CategoryParentNotGlobal` from the existing category export block.

- [ ] **Step 2: Wire the layer.** `TaxonomyRequestService` depends on `CategoryService`, which today is a sibling in the top `mergeAll` (not in the provide chain). Move `CategoryServiceLive` into the provide chain so it is both exposed and available to the new service. Edit the `ProductModuleLive` composition:

```ts
import { TaxonomyRequestServiceLive } from './taxonomy-request'
// …
export const ProductModuleLive = Layer.mergeAll(
  AttributeAssignmentServiceLive,
  PriceBindingServiceLive,
  InventoryBindingServiceLive,
  CollectionServiceLive,        // CategoryServiceLive removed from here
  ChannelListingServiceLive,
  MediaServiceLive,
  TranslationServiceLive,
  TaxonomyRequestServiceLive,   // depends on CategoryService
).pipe(
  Layer.provideMerge(CategoryServiceLive),  // exposes AND provides CategoryService
  Layer.provideMerge(ProductCoreLive),
)
```

(`provideMerge(CategoryServiceLive)` keeps `CategoryService` in the module output — existing consumers are unaffected — while making it available to `TaxonomyRequestServiceLive` above it. `CategoryServiceLive`'s own `DrizzleDb` dep stays unmet and is provided by `buildApp`, as before.)

- [ ] **Step 3: Type-check.** `pnpm --filter @czo/product check-types` → PASS. Then run Task 2 + Task 3 tests; both PASS.

---

## Task 5: GraphQL enums + `TaxonomyRequest` node

**Files:** Modify `src/graphql/schema/product/inputs.ts`, `src/graphql/index.ts`; create `src/graphql/schema/product/types/taxonomy-request.ts`; wire it in `types/index.ts`.

- [ ] **Step 1: Three GraphQL enums** in `inputs.ts` — add to `ProductEnumRefs` and the `refs` stash, mirroring `ListingReviewState`:

```ts
    TaxonomyRequestKind: builder.enumType('TaxonomyRequestKind', {
      subGraphs: ['org', 'admin'],
      description: 'Whether the request asks to CREATE a new global taxonomy or PROMOTE an existing org one.',
      values: { CREATE: { value: 'create' }, PROMOTE: { value: 'promote' } } as const,
    }),
    TaxonomyEntityType: builder.enumType('TaxonomyEntityType', {
      subGraphs: ['org', 'admin'],
      description: 'The taxonomy entity a request concerns.',
      values: { CATEGORY: { value: 'category' }, PRODUCT_TYPE: { value: 'product_type' } } as const,
    }),
    TaxonomyRequestState: builder.enumType('TaxonomyRequestState', {
      subGraphs: ['org', 'admin'],
      description: 'Moderation state of a taxonomy request.',
      values: { PENDING: { value: 'pending' }, APPROVED: { value: 'approved' }, REJECTED: { value: 'rejected' } } as const,
    }),
```

Add the three matching members to the `ProductEnumRefs` interface (`& { __type?: … }` literal unions of the DB values).

- [ ] **Step 2: `BuilderSchemaObjects`** in `graphql/index.ts` — add `TaxonomyRequest: TaxonomyRequest` to the `Objects` map and the type import (mirror `ProductChannelListing`).

- [ ] **Step 3: The node** — create `types/taxonomy-request.ts`:

```ts
import type { ProductGraphQLSchemaBuilder } from '../../..'
import { productEnumRefs } from '../inputs'

export function registerTaxonomyRequestNode(builder: ProductGraphQLSchemaBuilder): void {
  builder.drizzleNode('taxonomyRequests', {
    name: 'TaxonomyRequest',
    subGraphs: ['org', 'admin'],
    description: 'An org\'s request to create or promote a global taxonomy entity, awaiting platform review.',
    select: true,
    id: { column: c => c.id },
    fields: (t) => {
      const enums = productEnumRefs()
      return {
        kind: t.expose('kind', { type: enums.TaxonomyRequestKind, description: 'Create a new global entity, or promote an existing org one.' }),
        entityType: t.expose('entityType', { type: enums.TaxonomyEntityType, description: 'The taxonomy entity concerned.' }),
        organizationId: t.exposeInt('organizationId', { description: 'The organization that submitted the request.' }),
        state: t.expose('state', { type: enums.TaxonomyRequestState, description: 'Pending, approved, or rejected.' }),
        reviewReason: t.exposeString('reviewReason', { nullable: true, description: 'Why the request was rejected; null otherwise.' }),
        reviewedAt: t.expose('reviewedAt', { type: 'DateTime', nullable: true, description: 'When an admin reviewed it, or null while pending.' }),
        targetId: t.exposeInt('targetId', { nullable: true, description: 'For a promotion: the org-tier entity id to promote.' }),
        resultId: t.exposeInt('resultId', { nullable: true, description: 'The resulting global entity id once approved.' }),
        proposedName: t.string({ nullable: true, resolve: r => (r.payload as { name?: string } | null)?.name ?? null, description: 'For a creation: the proposed name.' }),
        proposedSlug: t.string({ nullable: true, resolve: r => (r.payload as { slug?: string } | null)?.slug ?? null, description: 'For a creation: the proposed slug.' }),
      }
    },
  })
}
```

(If `t.expose` with a string DateTime ref or `t.string({ resolve })` differs from this module's drizzleNode API, match the working pattern in `types/grafts.ts`. If `t.expose`/`t.string` reject `subGraphs`-less field options, they inherit the node's `['org','admin']` — no per-field tag needed since none narrow below the node.)

- [ ] **Step 4: Wire** `registerTaxonomyRequestNode(builder)` into `types/index.ts` (import + call inside `registerProductTypes`).

- [ ] **Step 5: Type-check.** `pnpm --filter @czo/product check-types` → PASS.

---

## Task 6: Mutations

**Files:** Create `src/graphql/schema/product/mutations/taxonomyRequest.ts`; wire in `mutations/index.ts`.

- [ ] **Step 1: Create the file** with four relay mutations. Org submit mutations tag `sg('org')`, gate `product:create` in `organizationId`; admin review tag `sg('admin')`, gate GLOBAL `product:create`. All return the `TaxonomyRequest` node as payload. Errors merged with `…sg(X).errorOpts`.

```ts
import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { Effect } from 'effect'
import {
  CategoryAlreadyGlobal,
  CategoryNotFound,
  CategoryParentNotGlobal,
  CategorySlugTaken,
  TaxonomyRequestNotFound,
  TaxonomyRequestNotPending,
  TaxonomyRequestService,
} from '../../../../services'
import { sg } from '../subgraphs'

export function registerTaxonomyRequestMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── requestCategoryCreation (org) ───────────────────────────────────────────
  builder.relayMutationField(
    'requestCategoryCreation',
    {
      ...sg('org').input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The organization submitting the request; gated on `product:create` there.' }),
        name: t.string({ required: true, description: 'Proposed category name.' }),
        slug: t.string({ required: true, description: 'Proposed URL-friendly slug, unique among global categories once approved.' }),
        description: t.string({ description: 'Optional proposed description.' }),
        parentId: t.int({ description: 'Optional global parent category id; must already be global at approval.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Submits a request for the platform to create a new GLOBAL category. Requires `product:create` in the organization. The category does not exist until an admin approves.',
      errors: { types: [], ...sg('org').errorOpts },
      authScopes: (_p, args) => ({ permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_root, args, ctx) => {
        const request = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.submitCategoryCreation({
            organizationId: Number(args.input.organizationId.id),
            name: args.input.name,
            slug: args.input.slug,
            description: args.input.description ?? undefined,
            parentId: args.input.parentId ?? undefined,
          })
        }))
        return { request }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ request: t.field({ type: 'TaxonomyRequest', resolve: p => p.request, description: 'The created pending request.' }) }) },
  )

  // ── requestCategoryPromotion (org) ──────────────────────────────────────────
  builder.relayMutationField(
    'requestCategoryPromotion',
    {
      ...sg('org').input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The organization that owns the category and is gated against.' }),
        categoryId: t.int({ required: true, description: 'Id of the org-owned category to promote to global.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Submits a request to promote an existing org-owned category to GLOBAL. Requires `product:create` in the organization. On approval the category\'s organization is cleared.',
      errors: { types: [CategoryNotFound, CategoryAlreadyGlobal], ...sg('org').errorOpts },
      authScopes: (_p, args) => ({ permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_root, args, ctx) => {
        const request = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.submitCategoryPromotion({ organizationId: Number(args.input.organizationId.id), categoryId: args.input.categoryId })
        }))
        return { request }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ request: t.field({ type: 'TaxonomyRequest', resolve: p => p.request, description: 'The created pending request.' }) }) },
  )

  const adminScope = () => ({ permission: { resource: 'product', actions: ['create'] } })

  // ── approveTaxonomyRequest (admin) ──────────────────────────────────────────
  builder.relayMutationField(
    'approveTaxonomyRequest',
    {
      ...sg('admin').input,
      inputFields: t => ({ requestId: t.globalID({ for: 'TaxonomyRequest', required: true, description: 'Global ID of the request to approve.' }) }),
    },
    {
      ...sg('admin').field,
      description: 'Approves a taxonomy request: creates the global entity (create) or flips the org entity to global (promote). Requires the global `product:create` role.',
      errors: { types: [TaxonomyRequestNotFound, TaxonomyRequestNotPending, CategoryNotFound, CategoryAlreadyGlobal, CategoryParentNotGlobal, CategorySlugTaken], ...sg('admin').errorOpts },
      authScopes: adminScope,
      resolve: async (_root, args, ctx) => {
        const request = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.approve(Number(args.input.requestId.id))
        }))
        return { request }
      },
    },
    { ...sg('admin').payload, outputFields: t => ({ request: t.field({ type: 'TaxonomyRequest', resolve: p => p.request, description: 'The approved request.' }) }) },
  )

  // ── rejectTaxonomyRequest (admin) ───────────────────────────────────────────
  builder.relayMutationField(
    'rejectTaxonomyRequest',
    {
      ...sg('admin').input,
      inputFields: t => ({
        requestId: t.globalID({ for: 'TaxonomyRequest', required: true, description: 'Global ID of the request to reject.' }),
        reason: t.string({ required: true, description: 'Why the request is rejected; surfaced to the org.' }),
      }),
    },
    {
      ...sg('admin').field,
      description: 'Rejects a taxonomy request with a reason. Requires the global `product:create` role.',
      errors: { types: [TaxonomyRequestNotFound, TaxonomyRequestNotPending], ...sg('admin').errorOpts },
      authScopes: adminScope,
      resolve: async (_root, args, ctx) => {
        const request = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.reject(Number(args.input.requestId.id), args.input.reason)
        }))
        return { request }
      },
    },
    { ...sg('admin').payload, outputFields: t => ({ request: t.field({ type: 'TaxonomyRequest', resolve: p => p.request, description: 'The rejected request.' }) }) },
  )
}
```

- [ ] **Step 2: Wire** `registerTaxonomyRequestMutations(builder)` into `mutations/index.ts`.

- [ ] **Step 3: check-types + lint.** `pnpm --filter @czo/product check-types && pnpm --filter @czo/product lint --max-warnings 0` (verify lint and check-types separately).

---

## Task 7: Queries

**Files:** Modify `src/graphql/schema/product/queries.ts`.

- [ ] **Step 1: Add two query fields** (the admin queue + the org's own requests):

```ts
  // ── taxonomyRequests — admin moderation queue ───────────────────────────────
  builder.queryField('taxonomyRequests', t =>
    t.field({
      type: ['TaxonomyRequest'],
      subGraphs: ['admin'],
      description: 'Lists taxonomy requests for platform review, optionally filtered by state. Requires the global `product:read` role.',
      args: { state: t.arg({ type: productEnumRefs().TaxonomyRequestState, required: false, description: 'Optional state filter.' }) },
      authScopes: { permission: { resource: 'product', actions: ['read'] } },
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.listForAdmin((args.state ?? undefined) as 'pending' | 'approved' | 'rejected' | undefined)
        })) as Promise<any>,
    }))

  // ── organizationTaxonomyRequests — an org's own requests ─────────────────────
  builder.queryField('organizationTaxonomyRequests', t =>
    t.field({
      type: ['TaxonomyRequest'],
      subGraphs: ['org'],
      description: 'Lists the taxonomy requests submitted by an organization, with their state and any rejection reason. Requires `product:read` in that organization.',
      args: { organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose requests to list.' }) },
      authScopes: (_p, args) => ({ permission: { resource: 'product', actions: ['read'], organization: Number(args.organizationId.id) } }),
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.listForOrg(Number(args.organizationId.id))
        })) as Promise<any>,
    }))
```

Add `TaxonomyRequestService` to the `from '../../../services'` import and `productEnumRefs` to the imports (it is used for the enum arg). Match the existing `as Promise<any>` resolve cast used by the other list queries in this file.

- [ ] **Step 2: check-types.** PASS.

---

## Task 8: Register errors

**Files:** Modify `src/graphql/schema/product/errors.ts`.

- [ ] **Step 1: Import + register** the new errors (reused category errors `CategoryAlreadyGlobal`/`CategoryParentNotGlobal` and the request errors). Tags per the spec:

```ts
  registerError(builder, CategoryAlreadyGlobal, { name: 'CategoryAlreadyGlobalError', subGraphs: ['org', 'admin'] })
  registerError(builder, CategoryParentNotGlobal, { name: 'CategoryParentNotGlobalError', subGraphs: ['admin'] })
  registerError(builder, TaxonomyRequestNotFound, { name: 'TaxonomyRequestNotFoundError', subGraphs: ['admin'] })
  registerError(builder, TaxonomyRequestNotPending, { name: 'TaxonomyRequestNotPendingError', subGraphs: ['admin'] })
```

Import the four from `../../../services`.

- [ ] **Step 2: check-types + lint.** PASS.

---

## Task 9: E2E sub-graph exposure

**Files:** Create `src/e2e/taxonomy-request-exposure.e2e.test.ts` (or extend the existing `subgraph-exposure.e2e.test.ts`).

- [ ] **Step 1:** Boot `bootProductApp({ subGraphs: ['public','org','admin'] })` and assert via `__type(name:"Query"/"Mutation"){ fields { name } }`:
  - `/graphql/org`: `requestCategoryCreation`, `requestCategoryPromotion`, `organizationTaxonomyRequests` present; `approveTaxonomyRequest`, `rejectTaxonomyRequest`, `taxonomyRequests` absent.
  - `/graphql/admin`: `approveTaxonomyRequest`, `rejectTaxonomyRequest`, `taxonomyRequests` present; the three org names absent.
  - `/graphql/public`: all six absent; `__type(name:"TaxonomyRequest")` is null.

Run: `pnpm --filter @czo/product test src/e2e/taxonomy-request-exposure.e2e.test.ts` → PASS.

---

## Task 10: Full validation

- [ ] `pnpm --filter @czo/product test` → all pass (220 prior + new service + exposure tests).
- [ ] `pnpm --filter @czo/product check-types && pnpm --filter life check-types` → PASS.
- [ ] `pnpm --filter @czo/product lint --max-warnings 0` → PASS.
- [ ] `git add -A` excluding `docs/superpowers/**`; report the staged file list + results; stop for user review. Do **not** commit.

---

## Self-review notes

- **Spec coverage:** table+enums (T1), promoteToGlobal+errors (T2), request service (T3), wiring/exports (T4), enums+node (T5), 4 mutations (T6), 2 queries (T7), error registration (T8), exposure (T9). All spec sections map to a task.
- **Type consistency:** service method names (`submitCategoryCreation/submitCategoryPromotion/approve/reject/listForAdmin/listForOrg`, `promoteToGlobal`) are identical across contract, impl, mutations, and queries. Enum DB values (`create/promote`, `category/product_type`, `pending/approved/rejected`) match the GraphQL enum `value`s.
- **Layer wiring is the one non-mechanical step** (T4 Step 2): moving `CategoryServiceLive` into `provideMerge` so the new service can depend on it without a second instance. Flagged explicitly.
- **Reused-vs-new errors:** create path reuses `createCategory`'s `CategorySlugTaken`/`CategoryNotFound`; only `CategoryAlreadyGlobal`, `CategoryParentNotGlobal`, `TaxonomyRequestNotFound`, `TaxonomyRequestNotPending` are new.
