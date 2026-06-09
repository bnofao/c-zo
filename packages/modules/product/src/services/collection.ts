import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { collectionProducts as collectionProductsTable, collections as collectionsTable } from '../database/schema'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class CollectionNotFound extends Data.TaggedError('CollectionNotFound')<{ readonly id: number }> {
  readonly code = 'COLLECTION_NOT_FOUND'
  get message() { return `Collection ${this.id} not found` }
}

export class CollectionSlugTaken extends Data.TaggedError('CollectionSlugTaken')<{ readonly slug: string }> {
  readonly code = 'COLLECTION_SLUG_TAKEN'
  get message() { return `Collection slug '${this.slug}' is already taken in this organization` }
}

export class CollectionDbFailed extends Data.TaggedError('CollectionDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'COLLECTION_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type Collection = InferSelectModel<typeof collectionsTable>
export type CollectionProduct = InferSelectModel<typeof collectionProductsTable>

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateCollectionInput {
  organizationId: number
  name: string
  slug: string
  description?: string
}

export interface UpdateCollectionInput {
  id: number
  version: number
  name?: string
  description?: string
  slug?: string
}

// ─── Service contract ─────────────────────────────────────────────────────────

export class CollectionService extends Context.Service<CollectionService, {
  readonly createCollection: (input: CreateCollectionInput) => Effect.Effect<Collection, CollectionSlugTaken | CollectionDbFailed>
  readonly updateCollection: (input: UpdateCollectionInput) => Effect.Effect<Collection, CollectionNotFound | CollectionSlugTaken | OptimisticLockError | CollectionDbFailed>
  readonly softDeleteCollection: (id: number, version: number) => Effect.Effect<Collection, CollectionNotFound | OptimisticLockError | CollectionDbFailed>
  readonly findCollectionById: (id: number) => Effect.Effect<Collection, CollectionNotFound | CollectionDbFailed>
  readonly listCollections: (orgId: number) => Effect.Effect<ReadonlyArray<Collection>, CollectionDbFailed>
  readonly addProduct: (input: { collectionId: number, productId: number }) => Effect.Effect<CollectionProduct, CollectionNotFound | CollectionDbFailed>
  readonly removeProduct: (input: { collectionId: number, productId: number }) => Effect.Effect<void, CollectionDbFailed>
  readonly listCollectionProducts: (collectionId: number) => Effect.Effect<ReadonlyArray<import('./product').Product>, CollectionDbFailed>
  readonly listProductCollections: (input: { productId: number, orgId: number }) => Effect.Effect<ReadonlyArray<Collection>, CollectionDbFailed>
}>()('@czo/product/CollectionService') {}

type CollectionServiceImpl = Context.Service.Shape<typeof CollectionService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>

  /** Map any DB-layer error to CollectionDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new CollectionDbFailed({ cause })))

  /** Map DB errors but preserve OptimisticLockError. */
  const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(
      Effect.mapError(e => e instanceof OptimisticLockError ? e : new CollectionDbFailed({ cause: e })),
    )

  const findCollectionById: CollectionServiceImpl['findCollectionById'] = id =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.collections.findFirst({
        where: { id, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new CollectionNotFound({ id }))
      return row as Collection
    })

  const createCollection: CollectionServiceImpl['createCollection'] = input =>
    Effect.gen(function* () {
      // Slug uniqueness within org
      const existing = yield* dbErr(db.query.collections.findFirst({
        where: { organizationId: input.organizationId, slug: input.slug, deletedAt: { isNull: true } },
      }))
      if (existing)
        return yield* Effect.fail(new CollectionSlugTaken({ slug: input.slug }))

      return yield* dbErr(Effect.gen(function* () {
        const [row] = yield* db.insert(collectionsTable).values({
          organizationId: input.organizationId,
          name: input.name,
          slug: input.slug,
          ...(input.description !== undefined ? { description: input.description } : {}),
        }).returning()
        return row! as Collection
      }))
    })

  const updateCollection: CollectionServiceImpl['updateCollection'] = input =>
    Effect.gen(function* () {
      yield* findCollectionById(input.id)

      // Slug uniqueness pre-check if slug is being changed
      if (input.slug !== undefined) {
        const row = yield* dbErr(db.query.collections.findFirst({
          where: { id: input.id, deletedAt: { isNull: true } },
        }))
        const orgId = row?.organizationId
        if (orgId !== undefined) {
          const existingSlug = yield* dbErr(db.query.collections.findFirst({
            where: { organizationId: orgId, slug: input.slug, deletedAt: { isNull: true } },
          }))
          if (existingSlug && existingSlug.id !== input.id)
            return yield* Effect.fail(new CollectionSlugTaken({ slug: input.slug }))
        }
      }

      return yield* dbErrOptimistic(
        optimisticUpdate({
          db,
          table: collectionsTable,
          id: input.id,
          expectedVersion: input.version,
          values: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
          },
        }),
      )
    })

  const softDeleteCollection: CollectionServiceImpl['softDeleteCollection'] = (id, version) =>
    Effect.gen(function* () {
      yield* findCollectionById(id)
      return yield* dbErrOptimistic(
        optimisticUpdate({ db, table: collectionsTable, id, expectedVersion: version, values: { deletedAt: sql`NOW()` as any } }),
      )
    })

  const listCollections: CollectionServiceImpl['listCollections'] = orgId =>
    dbErr(db.query.collections.findMany({
      where: { organizationId: orgId, deletedAt: { isNull: true } },
    })) as Effect.Effect<ReadonlyArray<Collection>, CollectionDbFailed>

  const addProduct: CollectionServiceImpl['addProduct'] = ({ collectionId, productId }) =>
    Effect.gen(function* () {
      yield* findCollectionById(collectionId)

      // Idempotent: check for existing link
      const existing = yield* dbErr(db.query.collectionProducts.findFirst({
        where: { collectionId, productId },
      }))
      if (existing)
        return existing as CollectionProduct

      return yield* dbErr(Effect.gen(function* () {
        const [row] = yield* db.insert(collectionProductsTable).values({ collectionId, productId }).returning()
        return row! as CollectionProduct
      }))
    })

  const removeProduct: CollectionServiceImpl['removeProduct'] = ({ collectionId, productId }) =>
    dbErr(
      db.delete(collectionProductsTable).where(
        sql`${collectionProductsTable.collectionId} = ${collectionId} AND ${collectionProductsTable.productId} = ${productId}`,
      ),
    ).pipe(Effect.asVoid)

  const listCollectionProducts: CollectionServiceImpl['listCollectionProducts'] = collectionId =>
    Effect.gen(function* () {
      const rows = yield* dbErr(db.query.collectionProducts.findMany({
        where: { collectionId },
        with: { product: true },
      }))
      return rows
        .map(r => (r as typeof r & { product: import('./product').Product }).product)
        .filter((p): p is import('./product').Product => p !== undefined && p.deletedAt === null)
    })

  const listProductCollections: CollectionServiceImpl['listProductCollections'] = ({ productId, orgId }) =>
    Effect.gen(function* () {
      const rows = yield* dbErr(db.query.collectionProducts.findMany({
        where: { productId },
        with: { collection: true },
      }))
      return rows
        .map(r => (r as typeof r & { collection: Collection }).collection)
        .filter((c): c is Collection => c !== undefined && c.deletedAt === null && c.organizationId === orgId)
    })

  return {
    createCollection,
    updateCollection,
    softDeleteCollection,
    findCollectionById,
    listCollections,
    addProduct,
    removeProduct,
    listCollectionProducts,
    listProductCollections,
  } satisfies CollectionServiceImpl
})

export const CollectionServiceLive = Layer.effect(CollectionService, make)
