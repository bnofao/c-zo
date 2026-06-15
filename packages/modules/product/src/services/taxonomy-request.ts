import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type {
  CategoryParentNotGlobal,
  CategorySlugTaken,
} from './category'
import { DrizzleDb } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { taxonomyRequests as taxonomyRequestsTable } from '../database/schema'
import {
  CategoryAlreadyGlobal,
  CategoryNotFound,
  CategoryService,
} from './category'

// ─── Re-export for callers that only import from this file ────────────────────

export { CategoryAlreadyGlobal, CategoryNotFound, CategoryParentNotGlobal, CategorySlugTaken } from './category'

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

// ─── Service contract ─────────────────────────────────────────────────────────

export class TaxonomyRequestService extends Context.Service<TaxonomyRequestService, {
  readonly submitCategoryCreation: (input: CategoryCreationInput) => Effect.Effect<TaxonomyRequest, TaxonomyRequestDbFailed>
  readonly submitCategoryPromotion: (input: CategoryPromotionInput) => Effect.Effect<TaxonomyRequest, CategoryNotFound | CategoryAlreadyGlobal | TaxonomyRequestDbFailed>
  readonly approve: (requestId: number) => Effect.Effect<TaxonomyRequest, TaxonomyRequestNotFound | TaxonomyRequestNotPending | CategoryNotFound | CategoryAlreadyGlobal | CategoryParentNotGlobal | CategorySlugTaken | TaxonomyRequestDbFailed>
  readonly reject: (requestId: number, reason: string) => Effect.Effect<TaxonomyRequest, TaxonomyRequestNotFound | TaxonomyRequestNotPending | TaxonomyRequestDbFailed>
  readonly listForAdmin: (state?: 'pending' | 'approved' | 'rejected') => Effect.Effect<ReadonlyArray<TaxonomyRequest>, TaxonomyRequestDbFailed>
  readonly listForOrg: (organizationId: number) => Effect.Effect<ReadonlyArray<TaxonomyRequest>, TaxonomyRequestDbFailed>
}>()('@czo/product/TaxonomyRequestService') {}

type Impl = Context.Service.Shape<typeof TaxonomyRequestService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const categories = yield* CategoryService

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

  const approve: Impl['approve'] = requestId =>
    Effect.gen(function* () {
      const req = yield* loadPending(requestId)
      let resultId: number
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
