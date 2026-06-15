import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { eq, sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { productTypeAttributes as productTypeAttributesTable, productTypes as productTypesTable } from '../database/schema'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class ProductTypeNotFound extends Data.TaggedError('ProductTypeNotFound')<{ readonly id: number }> {
  readonly code = 'PRODUCT_TYPE_NOT_FOUND'
  get message() { return `Product type ${this.id} not found` }
}

export class ProductTypeAlreadyGlobal extends Data.TaggedError('ProductTypeAlreadyGlobal')<{ readonly id: number }> {
  readonly code = 'PRODUCT_TYPE_ALREADY_GLOBAL'
  get message() { return 'Product type is already global' }
}

export class ProductTypeSlugTaken extends Data.TaggedError('ProductTypeSlugTaken')<{ readonly slug: string }> {
  readonly code = 'PRODUCT_TYPE_SLUG_TAKEN'
  get message() { return 'A global product type with this slug already exists' }
}

export class InvalidAttributeDeclaration extends Data.TaggedError('InvalidAttributeDeclaration')<{ readonly reason: string }> {
  readonly code = 'PRODUCT_INVALID_ATTRIBUTE_DECLARATION'
  get message() { return `Invalid attribute declaration: ${this.reason}` }
}

export class ProductTypeDbFailed extends Data.TaggedError('ProductTypeDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'PRODUCT_TYPE_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type ProductType = InferSelectModel<typeof productTypesTable>
export type ProductTypeAttribute = InferSelectModel<typeof productTypeAttributesTable>

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateProductTypeInput {
  organizationId: number | null
  name: string
  slug: string
  isShippingRequired: boolean
}

export interface UpdateProductTypeInput {
  id: number
  version: number
  name?: string
  slug?: string
  isShippingRequired?: boolean
}

export type AttributeAssignment = 'PRODUCT' | 'VARIANT'

export interface DeclareAttributeInput {
  productTypeId: number
  organizationId: number | null
  attributeId: number
  assignment: AttributeAssignment
  variantSelection: boolean
  position: number
}

export interface ListTypeAttributesInput {
  productTypeId: number
  orgId: number
}

// ─── Service contract ─────────────────────────────────────────────────────────

type FindTypesConfig = Parameters<Database<Relations>['query']['productTypes']['findMany']>[0]

export class ProductTypeService extends Context.Service<ProductTypeService, {
  readonly createType: (input: CreateProductTypeInput) => Effect.Effect<ProductType, ProductTypeDbFailed>
  readonly updateType: (input: UpdateProductTypeInput) => Effect.Effect<ProductType, ProductTypeNotFound | OptimisticLockError | ProductTypeDbFailed>
  readonly softDeleteType: (id: number, expectedVersion: number) => Effect.Effect<ProductType, ProductTypeNotFound | OptimisticLockError | ProductTypeDbFailed>
  readonly findTypeById: (id: number) => Effect.Effect<ProductType, ProductTypeNotFound | ProductTypeDbFailed>
  readonly listTypes: (orgId: number) => Effect.Effect<ReadonlyArray<ProductType>, ProductTypeDbFailed>
  /**
   * Multi-row read via Drizzle RQBv2 — accepts any `findMany` config so the
   * relay `productTypes` connection can thread its selection/where/orderBy
   * through. Returns an empty array on no match (never NotFound).
   */
  readonly findTypes: (config: FindTypesConfig) => Effect.Effect<ReadonlyArray<ProductType>, ProductTypeDbFailed>
  readonly declareAttribute: (input: DeclareAttributeInput) => Effect.Effect<ProductTypeAttribute, InvalidAttributeDeclaration | ProductTypeDbFailed>
  readonly undeclareAttribute: (id: number) => Effect.Effect<void, ProductTypeDbFailed>
  readonly listTypeAttributes: (input: ListTypeAttributesInput) => Effect.Effect<ReadonlyArray<ProductTypeAttribute>, ProductTypeDbFailed>
  readonly promoteToGlobal: (typeId: number) => Effect.Effect<ProductType, ProductTypeNotFound | ProductTypeAlreadyGlobal | ProductTypeSlugTaken | ProductTypeDbFailed>
}>()('@czo/product/ProductTypeService') {}

type ProductTypeServiceImpl = Context.Service.Shape<typeof ProductTypeService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>

  /** Map any DB-layer error to ProductTypeDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new ProductTypeDbFailed({ cause })))

  /**
   * Map a DB-layer error, but preserve OptimisticLockError as-is so the
   * GraphQL layer can route it correctly.
   */
  const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(
      Effect.mapError(e => e instanceof OptimisticLockError ? e : new ProductTypeDbFailed({ cause: e })),
    )

  const findTypeById: ProductTypeServiceImpl['findTypeById'] = id =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.productTypes.findFirst({
        where: { id, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new ProductTypeNotFound({ id }))
      return row as ProductType
    })

  const createType: ProductTypeServiceImpl['createType'] = input =>
    dbErr(Effect.gen(function* () {
      const [row] = yield* db.insert(productTypesTable).values({
        organizationId: input.organizationId,
        name: input.name,
        slug: input.slug,
        isShippingRequired: input.isShippingRequired,
      }).returning()
      return row!
    }))

  const updateType: ProductTypeServiceImpl['updateType'] = input =>
    Effect.gen(function* () {
      yield* findTypeById(input.id)
      return yield* dbErrOptimistic(
        optimisticUpdate({
          db,
          table: productTypesTable,
          id: input.id,
          expectedVersion: input.version,
          values: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.isShippingRequired !== undefined ? { isShippingRequired: input.isShippingRequired } : {}),
          },
        }),
      )
    })

  const softDeleteType: ProductTypeServiceImpl['softDeleteType'] = (id, expectedVersion) =>
    Effect.gen(function* () {
      yield* findTypeById(id)
      return yield* dbErrOptimistic(
        optimisticUpdate({ db, table: productTypesTable, id, expectedVersion, values: { deletedAt: sql`NOW()` as any } }),
      )
    })

  const listTypes: ProductTypeServiceImpl['listTypes'] = orgId =>
    dbErr(db.query.productTypes.findMany({
      where: {
        deletedAt: { isNull: true },
        OR: [{ organizationId: { isNull: true } }, { organizationId: orgId }],
      },
    })) as Effect.Effect<ReadonlyArray<ProductType>, ProductTypeDbFailed>

  const findTypes: ProductTypeServiceImpl['findTypes'] = config =>
    dbErr(db.query.productTypes.findMany({
      ...config,
      where: { ...config?.where, deletedAt: { isNull: true } },
    })) as Effect.Effect<ReadonlyArray<ProductType>, ProductTypeDbFailed>

  const declareAttribute: ProductTypeServiceImpl['declareAttribute'] = input =>
    Effect.gen(function* () {
      // Reject incoherent declarations before touching the DB for a clean
      // tagged error. The DB CHECK constraint is the backstop.
      if (input.variantSelection && input.assignment !== 'VARIANT')
        return yield* Effect.fail(new InvalidAttributeDeclaration({ reason: 'variantSelection requires assignment VARIANT' }))

      return yield* dbErr(Effect.gen(function* () {
        const [row] = yield* db.insert(productTypeAttributesTable).values({
          productTypeId: input.productTypeId,
          organizationId: input.organizationId,
          attributeId: input.attributeId,
          assignment: input.assignment,
          variantSelection: input.variantSelection,
          position: input.position,
        }).returning()
        return row!
      }))
    })

  const undeclareAttribute: ProductTypeServiceImpl['undeclareAttribute'] = id =>
    dbErr(Effect.gen(function* () {
      yield* db.delete(productTypeAttributesTable).where(eq(productTypeAttributesTable.id, id))
    }))

  const listTypeAttributes: ProductTypeServiceImpl['listTypeAttributes'] = ({ productTypeId, orgId }) =>
    dbErr(db.query.productTypeAttributes.findMany({
      where: {
        productTypeId,
        OR: [{ organizationId: { isNull: true } }, { organizationId: orgId }],
      },
    })) as Effect.Effect<ReadonlyArray<ProductTypeAttribute>, ProductTypeDbFailed>

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

      // The type's own org-scoped attribute declarations become base (null).
      yield* dbErr(db.update(productTypeAttributesTable)
        .set({ organizationId: null })
        .where(sql`${productTypeAttributesTable.productTypeId} = ${typeId} AND ${productTypeAttributesTable.organizationId} = ${type.organizationId}`))

      const [row] = yield* dbErr(db.update(productTypesTable)
        .set({ organizationId: null, version: type.version + 1, updatedAt: sql`NOW()` as any })
        .where(sql`${productTypesTable.id} = ${typeId} AND ${productTypesTable.deletedAt} IS NULL`)
        .returning())
      return row! as ProductType
    })

  return {
    createType,
    updateType,
    softDeleteType,
    findTypeById,
    listTypes,
    findTypes,
    declareAttribute,
    undeclareAttribute,
    listTypeAttributes,
    promoteToGlobal,
  } satisfies ProductTypeServiceImpl
})

export const ProductTypeServiceLive = Layer.effect(ProductTypeService, make)
