import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import {
  productChannelListings as productChannelListingsTable,
  productMedia as productMediaTable,
  productOrgAdoptions as productOrgAdoptionsTable,
  products as productsTable,
} from '../database/schema'
import { ProductEvents } from './events/product'
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

export class CannotAdoptOwnedProduct extends Data.TaggedError('CannotAdoptOwnedProduct')<Record<never, never>> {
  readonly code = 'CANNOT_ADOPT_OWNED_PRODUCT'
  get message() { return 'Only global products (organizationId null) can be adopted' }
}

export class AdoptionNotFound extends Data.TaggedError('AdoptionNotFound')<Record<never, never>> {
  readonly code = 'ADOPTION_NOT_FOUND'
  get message() { return 'No live adoption found for the given product and organization' }
}

export class ProductNotAdopted extends Data.TaggedError('ProductNotAdopted')<Record<never, never>> {
  readonly code = 'PRODUCT_NOT_ADOPTED'
  get message() { return 'Product has not been adopted by this organization' }
}

export class AdoptionDbFailed extends Data.TaggedError('AdoptionDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'ADOPTION_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type Product = InferSelectModel<typeof productsTable>
export type ProductOrgAdoption = InferSelectModel<typeof productOrgAdoptionsTable>

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

export interface AdoptProductInput {
  productId: number
  orgId: number
}

export interface UnadoptProductInput {
  productId: number
  orgId: number
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
  // ─── Adoption (overlay catalog: adopt/unadopt a global product) ───────────────
  readonly adoptProduct: (input: AdoptProductInput) => Effect.Effect<ProductOrgAdoption, ProductNotFound | CannotAdoptOwnedProduct | AdoptionDbFailed>
  readonly unadoptProduct: (input: UnadoptProductInput) => Effect.Effect<ProductOrgAdoption, AdoptionNotFound | AdoptionDbFailed>
  readonly isAdopted: (input: { productId: number, orgId: number }) => Effect.Effect<boolean, AdoptionDbFailed>
  readonly requireAdopted: (input: { productId: number, orgId: number }) => Effect.Effect<void, ProductNotAdopted>
  readonly listAdoptedProducts: (orgId: number) => Effect.Effect<ReadonlyArray<Product>, AdoptionDbFailed>
  readonly listAdopters: (productId: number) => Effect.Effect<ReadonlyArray<number>, AdoptionDbFailed>
}>()('@czo/product/ProductService') {}

type ProductServiceImpl = Context.Service.Shape<typeof ProductService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const typeService = yield* ProductTypeService
  // Factored out so the publisher (here) and `unadoptCleanupSubscribersLayer`
  // (consumer) share the same PubSub instance.
  const productEvents = yield* ProductEvents

  /** Map any DB-layer error to ProductDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new ProductDbFailed({ cause })))

  /** Map any DB-layer error to AdoptionDbFailed (adoption methods). */
  const adoptionDbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new AdoptionDbFailed({ cause })))

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

  // ─── Adoption ─────────────────────────────────────────────────────────────

  /** Find the adoption row for (productId, orgId), or undefined. */
  const findAdoption = (productId: number, orgId: number) =>
    adoptionDbErr(db.query.productOrgAdoptions.findFirst({
      where: { productId, organizationId: orgId },
    }))

  const adoptProduct: ProductServiceImpl['adoptProduct'] = ({ productId, orgId }) =>
    Effect.gen(function* () {
      // 1. Load product — propagate ProductNotFound
      const product = yield* findProductById(productId).pipe(
        Effect.mapError(e => e._tag === 'ProductNotFound' ? e : new AdoptionDbFailed({ cause: e })),
      )

      // 2. Only global products can be adopted
      if (product.organizationId !== null)
        return yield* Effect.fail(new CannotAdoptOwnedProduct())

      // 3. Idempotent: if an adoption already exists, return it
      const existing = yield* findAdoption(productId, orgId)
      if (existing)
        return existing as ProductOrgAdoption

      // 4. Insert fresh adoption row (the unique index guards against duplicates)
      return yield* adoptionDbErr(
        db.insert(productOrgAdoptionsTable).values({ productId, organizationId: orgId }).returning(),
      ).pipe(Effect.map(([row]) => row! as ProductOrgAdoption))
    })

  const unadoptProduct: ProductServiceImpl['unadoptProduct'] = ({ productId, orgId }) =>
    Effect.gen(function* () {
      // 1. Find the adoption
      const adoption = yield* findAdoption(productId, orgId)
      if (!adoption)
        return yield* Effect.fail(new AdoptionNotFound())

      // 2. Hard-delete it — adoption is a membership link, not soft-deletable content.
      const deleted = yield* adoptionDbErr(
        db.delete(productOrgAdoptionsTable).where(sql`${productOrgAdoptionsTable.id} = ${adoption.id}`).returning(),
      ).pipe(Effect.map(([row]) => row! as ProductOrgAdoption))

      // 3a. Synchronous: storefront-visible grafts (channel listings + media) now.
      yield* adoptionDbErr(purgeOrgMediaChannelGrafts(db, productId, orgId))
      // 3b. Deferred: publish; a subscriber enqueues the heavy/invisible cleanup.
      yield* productEvents.publish({ _tag: 'ProductUnadopted', productId, orgId, adoptionId: deleted.id })
      return deleted
    })

  const isAdopted: ProductServiceImpl['isAdopted'] = ({ productId, orgId }) =>
    findAdoption(productId, orgId).pipe(
      Effect.map(row => row !== undefined),
    )

  const requireAdopted: ProductServiceImpl['requireAdopted'] = ({ productId, orgId }) =>
    isAdopted({ productId, orgId }).pipe(
      Effect.mapError(() => new ProductNotAdopted()),
      Effect.filterOrFail(adopted => adopted, () => new ProductNotAdopted()),
      Effect.asVoid,
    )

  const listAdoptedProducts: ProductServiceImpl['listAdoptedProducts'] = orgId =>
    Effect.gen(function* () {
      const rows = yield* adoptionDbErr(db.query.productOrgAdoptions.findMany({
        where: { organizationId: orgId },
        with: { product: true },
      }))
      return rows
        .map(r => (r as typeof r & { product: Product }).product)
        .filter((p): p is Product => p !== undefined && p.deletedAt === null)
    })

  const listAdopters: ProductServiceImpl['listAdopters'] = productId =>
    Effect.gen(function* () {
      const rows = yield* adoptionDbErr(db.query.productOrgAdoptions.findMany({
        where: { productId },
      }))
      return rows.map(r => r.organizationId)
    })

  return {
    createProduct,
    updateProduct,
    softDeleteProduct,
    findProductById,
    findProductByHandle,
    listProducts,
    findProducts,
    adoptProduct,
    unadoptProduct,
    isAdopted,
    requireAdopted,
    listAdopters,
    listAdoptedProducts,
  } satisfies ProductServiceImpl
})

export const ProductServiceLive = Layer.effect(ProductService, make)

/**
 * Delete this org's media + channel-listing grafts for a product. Org-grafted
 * media key off `organizationId` directly; channel listings key off the
 * org-owned channel they target, so we scope by a subquery on the channels
 * table (cross-module table referenced by name to avoid a circular dep). Base
 * media (organizationId null) and other orgs' listings are left intact.
 *
 * This is the synchronous, storefront-visible half of unadopt cleanup; the
 * heavy/invisible half (attribute + price/inventory grafts) runs deferred via
 * the unadopt-cleanup queue subscriber.
 */
function purgeOrgMediaChannelGrafts(db: Database<Relations>, productId: number, orgId: number) {
  return Effect.gen(function* () {
    yield* db.delete(productMediaTable).where(
      sql`${productMediaTable.productId} = ${productId} AND ${productMediaTable.organizationId} = ${orgId}`,
    )
    // Channel listings carry no org column, so scope by the org-owned channels
    // they target. The subquery touches the cross-module `channels` table; gate
    // it behind a pre-check so this never runs when the product has no listings
    // (e.g. single-module test layers without the channels table).
    const listings = yield* db.query.productChannelListings.findMany({
      columns: { id: true },
      where: { productId, deletedAt: { isNull: true } },
    })
    if (listings.length === 0)
      return
    yield* db.delete(productChannelListingsTable).where(
      sql`${productChannelListingsTable.productId} = ${productId} AND ${productChannelListingsTable.channelId} IN (SELECT id FROM channels WHERE organization_id = ${orgId})`,
    )
  })
}
