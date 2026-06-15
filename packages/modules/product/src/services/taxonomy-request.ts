import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type {
  CategoryParentNotGlobal,
  CategorySlugTaken,
} from './category'
import type {
  ProductTypeSlugTaken,
} from './product-type'
import { Attribute } from '@czo/attribute/services'
import { DrizzleDb } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { taxonomyRequests as taxonomyRequestsTable } from '../database/schema'
import {
  CategoryAlreadyGlobal,
  CategoryNotFound,
  CategoryService,
} from './category'
import {
  ProductTypeAlreadyGlobal,
  ProductTypeNotFound,
  ProductTypeService,
} from './product-type'

// ─── Re-export for callers that only import from this file ────────────────────

export { CategoryAlreadyGlobal, CategoryNotFound, CategoryParentNotGlobal, CategorySlugTaken } from './category'
export { ProductTypeAlreadyGlobal, ProductTypeNotFound, ProductTypeSlugTaken } from './product-type'

// ─── Tagged errors ────────────────────────────────────────────────────────────

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

// ─── Domain model ─────────────────────────────────────────────────────────────

export type TaxonomyRequest = InferSelectModel<typeof taxonomyRequestsTable>

// ─── Input types ──────────────────────────────────────────────────────────────

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

// ─── Service contract ─────────────────────────────────────────────────────────

export class TaxonomyRequestService extends Context.Service<TaxonomyRequestService, {
  readonly submitCategoryCreation: (input: CategoryCreationInput) => Effect.Effect<TaxonomyRequest, TaxonomyRequestDbFailed>
  readonly submitCategoryPromotion: (input: CategoryPromotionInput) => Effect.Effect<TaxonomyRequest, CategoryNotFound | CategoryAlreadyGlobal | TaxonomyRequestDbFailed>
  readonly submitProductTypeCreation: (input: ProductTypeCreationInput) => Effect.Effect<TaxonomyRequest, TaxonomyRequestDbFailed>
  readonly submitProductTypePromotion: (input: ProductTypePromotionInput) => Effect.Effect<TaxonomyRequest, ProductTypeNotFound | ProductTypeAlreadyGlobal | TaxonomyRequestDbFailed>
  readonly findById: (requestId: number) => Effect.Effect<TaxonomyRequest | undefined, TaxonomyRequestDbFailed>
  readonly approve: (requestId: number) => Effect.Effect<TaxonomyRequest, TaxonomyRequestNotFound | TaxonomyRequestNotPending | CategoryNotFound | CategoryAlreadyGlobal | CategoryParentNotGlobal | CategorySlugTaken | ProductTypeNotFound | ProductTypeAlreadyGlobal | ProductTypeSlugTaken | Attribute.AttributeNotFound | TaxonomyRequestDbFailed>
  readonly reject: (requestId: number, reason: string) => Effect.Effect<TaxonomyRequest, TaxonomyRequestNotFound | TaxonomyRequestNotPending | TaxonomyRequestDbFailed>
  readonly listForAdmin: (state?: 'pending' | 'approved' | 'rejected') => Effect.Effect<ReadonlyArray<TaxonomyRequest>, TaxonomyRequestDbFailed>
  readonly listForOrg: (organizationId: number) => Effect.Effect<ReadonlyArray<TaxonomyRequest>, TaxonomyRequestDbFailed>
  readonly findRequests: (config: FindRequestsConfig) => Effect.Effect<ReadonlyArray<TaxonomyRequest>, TaxonomyRequestDbFailed>
}>()('@czo/product/TaxonomyRequestService') {}

/** The relational query config accepted by `findRequests` (relay connection-driven). */
type FindRequestsConfig = Parameters<Database<Relations>['query']['taxonomyRequests']['findMany']>[0]

type Impl = Context.Service.Shape<typeof TaxonomyRequestService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const categories = yield* CategoryService
  const productTypes = yield* ProductTypeService
  const attributes = yield* Attribute.AttributeService

  /** Map any DB-layer error to TaxonomyRequestDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new TaxonomyRequestDbFailed({ cause })))

  const insert = (values: typeof taxonomyRequestsTable.$inferInsert) =>
    Effect.gen(function* () {
      const [row] = yield* dbErr(db.insert(taxonomyRequestsTable).values(values).returning())
      return row! as TaxonomyRequest
    })

  /** Load a request and assert it is still pending. */
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
      const category = yield* categories.findCategoryById(input.categoryId).pipe(
        Effect.mapError(e => e._tag === 'CategoryNotFound' ? e : new TaxonomyRequestDbFailed({ cause: e })),
      )
      if (category.organizationId === null)
        return yield* Effect.fail(new CategoryAlreadyGlobal({ id: input.categoryId }))
      if (category.organizationId !== input.organizationId)
        return yield* Effect.fail(new CategoryNotFound({ id: input.categoryId }))
      return yield* insert({ kind: 'promote', entityType: 'category', organizationId: input.organizationId, targetId: input.categoryId })
    })

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

  const findById: Impl['findById'] = requestId =>
    dbErr(db.query.taxonomyRequests.findFirst({ where: { id: requestId } })) as Effect.Effect<TaxonomyRequest | undefined, TaxonomyRequestDbFailed>

  const approve: Impl['approve'] = requestId =>
    Effect.gen(function* () {
      const req = yield* loadPending(requestId)
      let resultId: number

      if (req.entityType === 'category') {
        if (req.kind === 'create') {
          const p = req.payload as { name: string, slug: string, description?: string, parentId?: number }
          // Remap CategoryDbFailed (a leaf DB failure) onto this service's own
          // DB-failure error; domain errors (NotFound/SlugTaken/…) pass through.
          const created = yield* categories.createCategory({
            organizationId: null,
            name: p.name,
            slug: p.slug,
            ...(p.description !== undefined ? { description: p.description } : {}),
            ...(p.parentId !== undefined ? { parentId: p.parentId } : {}),
          }).pipe(Effect.mapError(e => e._tag === 'CategoryDbFailed' ? new TaxonomyRequestDbFailed({ cause: e }) : e))
          resultId = created.id
        }
        else {
          const promoted = yield* categories.promoteToGlobal(req.targetId!).pipe(
            Effect.mapError(e => e._tag === 'CategoryDbFailed' ? new TaxonomyRequestDbFailed({ cause: e }) : e),
          )
          resultId = promoted.id
        }
      }
      else { // product_type
        if (req.kind === 'create') {
          const p = req.payload as { name: string, slug: string, isShippingRequired?: boolean }
          // createType's sole failure is ProductTypeDbFailed → remap onto ours.
          const created = yield* productTypes.createType({
            organizationId: null,
            name: p.name,
            slug: p.slug,
            isShippingRequired: p.isShippingRequired ?? true,
          }).pipe(Effect.mapError(e => new TaxonomyRequestDbFailed({ cause: e })))
          resultId = created.id
        }
        else {
          // Co-promote the type's org-private declared attributes (+ their value
          // rows, via AttributeService.promoteToGlobal) before flipping the type.
          const decls = yield* productTypes.listTypeAttributes({ productTypeId: req.targetId!, orgId: req.organizationId! }).pipe(
            Effect.mapError(e => new TaxonomyRequestDbFailed({ cause: e })),
          )
          const attributeIds = [...new Set(decls.map(d => d.attributeId))]
          for (const attributeId of attributeIds) {
            const attr = yield* attributes.findById(attributeId).pipe(
              Effect.mapError(e => e._tag === 'AttributeNotFound' ? e : new TaxonomyRequestDbFailed({ cause: e })),
            )
            if (attr.organizationId !== null) {
              yield* attributes.promoteToGlobal(attributeId).pipe(
                Effect.mapError(e => e._tag === 'AttributeNotFound' ? e : new TaxonomyRequestDbFailed({ cause: e })),
              )
            }
          }
          const promoted = yield* productTypes.promoteToGlobal(req.targetId!).pipe(
            Effect.mapError(e => e._tag === 'ProductTypeDbFailed' ? new TaxonomyRequestDbFailed({ cause: e }) : e),
          )
          resultId = promoted.id
        }
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

  const findRequests: Impl['findRequests'] = config =>
    dbErr(db.query.taxonomyRequests.findMany(config)) as Effect.Effect<ReadonlyArray<TaxonomyRequest>, TaxonomyRequestDbFailed>

  return { submitCategoryCreation, submitCategoryPromotion, submitProductTypeCreation, submitProductTypePromotion, findById, approve, reject, listForAdmin, listForOrg, findRequests } satisfies Impl
})

export const TaxonomyRequestServiceLive = Layer.effect(TaxonomyRequestService, make)
