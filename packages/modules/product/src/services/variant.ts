import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { SelectionPair } from './matrix'
import type { Product } from './product'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { productVariants as productVariantsTable } from '../database/schema'
import { isDuplicateMatrix } from './matrix'
import { ProductService } from './product'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class VariantNotFound extends Data.TaggedError('VariantNotFound')<{ readonly id: number }> {
  readonly code = 'VARIANT_NOT_FOUND'
  get message() { return `Variant ${this.id} not found` }
}

export class SkuTaken extends Data.TaggedError('SkuTaken')<{ readonly sku: string }> {
  readonly code = 'VARIANT_SKU_TAKEN'
  get message() { return `SKU '${this.sku}' is already taken in this scope` }
}

export class DuplicateVariantMatrix extends Data.TaggedError('DuplicateVariantMatrix')<Record<never, never>> {
  readonly code = 'VARIANT_DUPLICATE_MATRIX'
  get message() { return 'A variant with the same attribute-value combination already exists on this product' }
}

export class VariantDbFailed extends Data.TaggedError('VariantDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'VARIANT_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type ProductVariant = InferSelectModel<typeof productVariantsTable>

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateVariantInput {
  productId: number
  sku?: string
  position?: number
  selection?: ReadonlyArray<SelectionPair>
}

export interface UpdateVariantInput {
  id: number
  version: number
  sku?: string
  position?: number
}

// ─── Service contract ─────────────────────────────────────────────────────────

export class VariantService extends Context.Service<VariantService, {
  readonly createVariant: (input: CreateVariantInput) => Effect.Effect<ProductVariant, VariantNotFound | SkuTaken | DuplicateVariantMatrix | VariantDbFailed>
  readonly updateVariant: (input: UpdateVariantInput) => Effect.Effect<ProductVariant, VariantNotFound | OptimisticLockError | VariantDbFailed>
  readonly softDeleteVariant: (id: number, version: number) => Effect.Effect<ProductVariant, VariantNotFound | OptimisticLockError | VariantDbFailed>
  readonly findVariantById: (id: number) => Effect.Effect<ProductVariant, VariantNotFound | VariantDbFailed>
  readonly listVariants: (productId: number) => Effect.Effect<ReadonlyArray<ProductVariant>, VariantDbFailed>
}>()('@czo/product/VariantService') {}

type VariantServiceImpl = Context.Service.Shape<typeof VariantService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const productService = yield* ProductService

  /** Map any DB-layer error to VariantDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new VariantDbFailed({ cause })))

  /**
   * Map a DB-layer error, but preserve OptimisticLockError as-is so the
   * GraphQL layer can route it correctly.
   */
  const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(
      Effect.mapError(e => e instanceof OptimisticLockError ? e : new VariantDbFailed({ cause: e })),
    )

  /**
   * Variant-selection attributeIds declared on the product's type for its org
   * (base declarations ∪ the product's own org). A duplicate matrix compares
   * only the selection pairs whose attribute is `variant_selection` on the type.
   */
  const variantSelectionAttributeIds = (product: Product) =>
    Effect.gen(function* () {
      const declarations = yield* dbErr(db.query.productTypeAttributes.findMany({
        where: {
          productTypeId: product.productTypeId,
          variantSelection: true,
          OR: [{ organizationId: { isNull: true } }, { organizationId: product.organizationId ?? -1 }],
        },
      }))
      return new Set(declarations.map(d => d.attributeId))
    })

  /**
   * Load the sibling variant selections for a product so the matrix uniqueness
   * check can be applied. Reads the persisted `variant_attribute_values` for the
   * product's OTHER live variants, keeping only pairs whose attribute is declared
   * `variant_selection` on the type. Each sibling's pairs form one combo.
   */
  const siblingSelections = (product: Product): Effect.Effect<ReadonlyArray<ReadonlyArray<SelectionPair>>, VariantDbFailed> =>
    Effect.gen(function* () {
      const selectionAttrIds = yield* variantSelectionAttributeIds(product)
      if (selectionAttrIds.size === 0)
        return []
      const siblings = yield* dbErr(db.query.productVariants.findMany({
        where: { productId: product.id, deletedAt: { isNull: true } },
        with: { attributeValues: true },
      }))
      return siblings.map(v =>
        (v as typeof v & { attributeValues: ReadonlyArray<{ attributeId: number, valueId: number }> })
          .attributeValues
          .filter(av => selectionAttrIds.has(av.attributeId))
          .map(av => ({ attributeId: av.attributeId, valueId: av.valueId })),
      )
    })

  const findVariantById: VariantServiceImpl['findVariantById'] = id =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.productVariants.findFirst({
        where: { id, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new VariantNotFound({ id }))
      return row as ProductVariant
    })

  const createVariant: VariantServiceImpl['createVariant'] = input =>
    Effect.gen(function* () {
      // 1. Load the parent product to inherit organizationId
      const product = yield* productService.findProductById(input.productId).pipe(
        Effect.mapError(e => e._tag === 'ProductNotFound' ? new VariantNotFound({ id: input.productId }) : new VariantDbFailed({ cause: e })),
      )
      const organizationId = product.organizationId

      // 2. SKU uniqueness pre-check (scoped by inherited org, only for non-null SKUs)
      if (input.sku !== undefined && input.sku !== null) {
        const existing = yield* dbErr(
          organizationId === null
            ? db.query.productVariants.findFirst({
                where: { organizationId: { isNull: true as const }, sku: input.sku, deletedAt: { isNull: true as const } },
              })
            : db.query.productVariants.findFirst({
                where: { organizationId, sku: input.sku, deletedAt: { isNull: true as const } },
              }),
        )
        if (existing)
          return yield* Effect.fail(new SkuTaken({ sku: input.sku }))
      }

      // 3. Matrix uniqueness check against the product's persisted siblings.
      //    Selection pairs are persisted exclusively by
      //    `AttributeAssignmentService.assignVariantValue`; this is a pure check.
      const selection = input.selection ?? []
      const siblings = yield* siblingSelections(product)
      if (selection.length > 0 && isDuplicateMatrix(siblings, selection))
        return yield* Effect.fail(new DuplicateVariantMatrix())

      // 4. Insert only the variant row.
      const [row] = yield* dbErr(db.insert(productVariantsTable).values({
        productId: input.productId,
        organizationId,
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      }).returning())
      return row! as ProductVariant
    })

  const updateVariant: VariantServiceImpl['updateVariant'] = input =>
    Effect.gen(function* () {
      yield* findVariantById(input.id)
      return yield* dbErrOptimistic(
        optimisticUpdate({
          db,
          table: productVariantsTable,
          id: input.id,
          expectedVersion: input.version,
          values: {
            ...(input.sku !== undefined ? { sku: input.sku } : {}),
            ...(input.position !== undefined ? { position: input.position } : {}),
          },
        }),
      )
    })

  const softDeleteVariant: VariantServiceImpl['softDeleteVariant'] = (id, version) =>
    Effect.gen(function* () {
      yield* findVariantById(id)
      return yield* dbErrOptimistic(
        optimisticUpdate({ db, table: productVariantsTable, id, expectedVersion: version, values: { deletedAt: sql`NOW()` as any } }),
      )
    })

  const listVariants: VariantServiceImpl['listVariants'] = productId =>
    dbErr(db.query.productVariants.findMany({
      where: { productId, deletedAt: { isNull: true } },
      orderBy: (fields, { asc }) => asc(fields.position),
    })) as Effect.Effect<ReadonlyArray<ProductVariant>, VariantDbFailed>

  return {
    createVariant,
    updateVariant,
    softDeleteVariant,
    findVariantById,
    listVariants,
  } satisfies VariantServiceImpl
})

export const VariantServiceLive = Layer.effect(VariantService, make)
