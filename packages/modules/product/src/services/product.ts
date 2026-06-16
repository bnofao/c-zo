import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { products as productsTable } from '../database/schema'
import { ProductTypeNotFound, ProductTypeService } from './product-type'

// ─── Re-export for callers that only import from this file ────────────────────

export { ProductTypeNotFound } from './product-type'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class ProductNotFound extends Data.TaggedError('ProductNotFound')<{ readonly id: number }> {
  readonly code = 'PRODUCT_NOT_FOUND'
  get message() { return `Product ${this.id} not found` }
}

export class HandleTaken extends Data.TaggedError('HandleTaken')<{ readonly handle: string }> {
  readonly code = 'PRODUCT_HANDLE_TAKEN'
  get message() { return `Handle '${this.handle}' is already taken in this scope` }
}

export class GlobalProductRequiresGlobalType extends Data.TaggedError('GlobalProductRequiresGlobalType')<Record<never, never>> {
  readonly code = 'GLOBAL_PRODUCT_REQUIRES_GLOBAL_TYPE'
  get message() { return 'A global product (organizationId null) must reference a global product type' }
}

export class ProductDbFailed extends Data.TaggedError('ProductDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'PRODUCT_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type Product = InferSelectModel<typeof productsTable>

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateProductInput {
  organizationId: number | null
  productTypeId: number
  handle: string
  name: string
  description?: string
  thumbnailUrl?: string
}

export interface UpdateProductInput {
  id: number
  version: number
  name?: string
  description?: string
  thumbnailUrl?: string
}

// ─── Service contract ─────────────────────────────────────────────────────────

type FindProductsConfig = Parameters<Database<Relations>['query']['products']['findMany']>[0]

export class ProductService extends Context.Service<ProductService, {
  readonly createProduct: (input: CreateProductInput) => Effect.Effect<Product, ProductNotFound | HandleTaken | GlobalProductRequiresGlobalType | ProductTypeNotFound | ProductDbFailed>
  readonly updateProduct: (input: UpdateProductInput) => Effect.Effect<Product, ProductNotFound | OptimisticLockError | ProductDbFailed>
  readonly softDeleteProduct: (id: number, version: number) => Effect.Effect<Product, ProductNotFound | OptimisticLockError | ProductDbFailed>
  readonly findProductById: (id: number) => Effect.Effect<Product, ProductNotFound | ProductDbFailed>
  readonly findProductByHandle: (input: { orgId: number | null, handle: string }) => Effect.Effect<Product, ProductNotFound | ProductDbFailed>
  readonly listProducts: (orgId: number) => Effect.Effect<ReadonlyArray<Product>, ProductDbFailed>
  /**
   * Multi-row read via Drizzle RQBv2 — accepts any `findMany` config so the
   * relay `products` connection can thread its selection/where/orderBy through.
   * Returns an empty array on no match (never NotFound).
   */
  readonly findProducts: (config: FindProductsConfig) => Effect.Effect<ReadonlyArray<Product>, ProductDbFailed>
}>()('@czo/product/ProductService') {}

type ProductServiceImpl = Context.Service.Shape<typeof ProductService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const typeService = yield* ProductTypeService

  /** Map any DB-layer error to ProductDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new ProductDbFailed({ cause })))

  /**
   * Map a DB-layer error, but preserve OptimisticLockError as-is so the
   * GraphQL layer can route it correctly.
   */
  const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(
      Effect.mapError(e => e instanceof OptimisticLockError ? e : new ProductDbFailed({ cause: e })),
    )

  const findProductById: ProductServiceImpl['findProductById'] = id =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.products.findFirst({
        where: { id, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new ProductNotFound({ id }))
      return row as Product
    })

  const findProductByHandle: ProductServiceImpl['findProductByHandle'] = ({ orgId, handle }) =>
    Effect.gen(function* () {
      const orgWhere = orgId === null
        ? { organizationId: { isNull: true as const } }
        : { organizationId: orgId }
      const row = yield* dbErr(db.query.products.findFirst({
        where: {
          ...orgWhere,
          handle,
          deletedAt: { isNull: true },
          channelListings: { // publication: ≥1 live listing
            isPublished: true,
            reviewState: 'approved',
            deletedAt: { isNull: true },
          },
        },
      }))
      if (!row)
        return yield* Effect.fail(new ProductNotFound({ id: -1 }))
      return row as Product
    })

  const createProduct: ProductServiceImpl['createProduct'] = input =>
    Effect.gen(function* () {
      // 1. Load the type (may fail with ProductTypeNotFound or ProductTypeDbFailed — map the latter to ProductDbFailed)
      const type = yield* typeService.findTypeById(input.productTypeId).pipe(
        Effect.mapError(e => e._tag === 'ProductTypeNotFound' ? e : new ProductDbFailed({ cause: e })),
      )

      // 2. Global-product invariant: global product must reference a global type
      if (input.organizationId === null && type.organizationId !== null)
        return yield* Effect.fail(new GlobalProductRequiresGlobalType())

      // 3. Type visibility: org product may only see global types or own org's types
      if (input.organizationId !== null) {
        if (type.organizationId !== null && type.organizationId !== input.organizationId)
          return yield* Effect.fail(new ProductTypeNotFound({ id: input.productTypeId }))
      }

      // 4. Pre-check for handle uniqueness in this scope (TOCTOU-safe backstop is the partial unique index)
      const existing = yield* dbErr(db.query.products.findFirst({
        where: input.organizationId === null
          ? { organizationId: { isNull: true as const }, handle: input.handle, deletedAt: { isNull: true } }
          : { organizationId: input.organizationId, handle: input.handle, deletedAt: { isNull: true } },
      }))
      if (existing)
        return yield* Effect.fail(new HandleTaken({ handle: input.handle }))

      return yield* dbErr(Effect.gen(function* () {
        const [row] = yield* db.insert(productsTable).values({
          organizationId: input.organizationId,
          productTypeId: input.productTypeId,
          handle: input.handle,
          name: input.name,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
        }).returning()
        return row! as Product
      }))
    })

  const updateProduct: ProductServiceImpl['updateProduct'] = input =>
    Effect.gen(function* () {
      yield* findProductById(input.id)
      return yield* dbErrOptimistic(
        optimisticUpdate({
          db,
          table: productsTable,
          id: input.id,
          expectedVersion: input.version,
          values: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
          },
        }),
      )
    })

  const softDeleteProduct: ProductServiceImpl['softDeleteProduct'] = (id, version) =>
    Effect.gen(function* () {
      yield* findProductById(id)
      return yield* dbErrOptimistic(
        optimisticUpdate({ db, table: productsTable, id, expectedVersion: version, values: { deletedAt: sql`NOW()` as any } }),
      )
    })

  const listProducts: ProductServiceImpl['listProducts'] = orgId =>
    dbErr(db.query.products.findMany({
      where: {
        deletedAt: { isNull: true },
        OR: [{ organizationId: { isNull: true } }, { organizationId: orgId }],
      },
    })) as Effect.Effect<ReadonlyArray<Product>, ProductDbFailed>

  const findProducts: ProductServiceImpl['findProducts'] = config =>
    dbErr(db.query.products.findMany({
      ...config,
      where: { ...config?.where, deletedAt: { isNull: true } },
    })) as Effect.Effect<ReadonlyArray<Product>, ProductDbFailed>

  return {
    createProduct,
    updateProduct,
    softDeleteProduct,
    findProductById,
    findProductByHandle,
    listProducts,
    findProducts,
  } satisfies ProductServiceImpl
})

export const ProductServiceLive = Layer.effect(ProductService, make)
