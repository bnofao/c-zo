import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { isNull, sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { categories as categoriesTable, productCategories as productCategoriesTable } from '../database/schema'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class CategoryNotFound extends Data.TaggedError('CategoryNotFound')<{ readonly id: number }> {
  readonly code = 'CATEGORY_NOT_FOUND'
  get message() { return `Category ${this.id} not found` }
}

export class CategoryCycle extends Data.TaggedError('CategoryCycle')<Record<never, never>> {
  readonly code = 'CATEGORY_CYCLE'
  get message() { return 'Setting this parent would create a cycle in the category tree' }
}

export class CategorySlugTaken extends Data.TaggedError('CategorySlugTaken')<{ readonly slug: string }> {
  readonly code = 'CATEGORY_SLUG_TAKEN'
  get message() { return `Category slug '${this.slug}' is already taken in this scope` }
}

export class CategoryDbFailed extends Data.TaggedError('CategoryDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'CATEGORY_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type Category = InferSelectModel<typeof categoriesTable>
export type ProductCategory = InferSelectModel<typeof productCategoriesTable>

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateCategoryInput {
  organizationId: number | null
  name: string
  slug: string
  description?: string
  parentId?: number
  position?: number
}

export interface UpdateCategoryInput {
  id: number
  version: number
  name?: string
  description?: string
  slug?: string
  position?: number
}

// ─── Service contract ─────────────────────────────────────────────────────────

export class CategoryService extends Context.Service<CategoryService, {
  readonly createCategory: (input: CreateCategoryInput) => Effect.Effect<Category, CategoryNotFound | CategorySlugTaken | CategoryDbFailed>
  readonly updateCategory: (input: UpdateCategoryInput) => Effect.Effect<Category, CategoryNotFound | CategorySlugTaken | OptimisticLockError | CategoryDbFailed>
  readonly setParent: (input: { id: number, version: number, parentId: number | null }) => Effect.Effect<Category, CategoryNotFound | CategoryCycle | OptimisticLockError | CategoryDbFailed>
  readonly softDeleteCategory: (id: number, version: number) => Effect.Effect<Category, CategoryNotFound | OptimisticLockError | CategoryDbFailed>
  readonly findCategoryById: (id: number) => Effect.Effect<Category, CategoryNotFound | CategoryDbFailed>
  readonly listCategories: (orgId: number) => Effect.Effect<ReadonlyArray<Category>, CategoryDbFailed>
  readonly placeProduct: (input: { productId: number, categoryId: number, organizationId: number | null }) => Effect.Effect<ProductCategory, CategoryNotFound | CategoryDbFailed>
  readonly removePlacement: (input: { productId: number, categoryId: number, organizationId: number | null }) => Effect.Effect<void, CategoryDbFailed>
  readonly listProductCategories: (input: { productId: number, orgId: number }) => Effect.Effect<ReadonlyArray<Category>, CategoryDbFailed>
}>()('@czo/product/CategoryService') {}

type CategoryServiceImpl = Context.Service.Shape<typeof CategoryService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>

  /** Map any DB-layer error to CategoryDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new CategoryDbFailed({ cause })))

  /** Map DB errors but preserve OptimisticLockError. */
  const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(
      Effect.mapError(e => e instanceof OptimisticLockError ? e : new CategoryDbFailed({ cause: e })),
    )

  const findCategoryById: CategoryServiceImpl['findCategoryById'] = id =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.categories.findFirst({
        where: { id, deletedAt: { isNull: true as const } },
      }))
      if (!row)
        return yield* Effect.fail(new CategoryNotFound({ id }))
      return row as Category
    })

  /**
   * Walk ancestor chain from `startId` upward via parentId.
   * Returns true if `targetId` is found in the chain (cycle detected).
   */
  const ancestorChainContains = (startId: number, targetId: number): Effect.Effect<boolean, CategoryDbFailed> =>
    Effect.gen(function* () {
      let currentId: number | null = startId
      while (currentId !== null) {
        if (currentId === targetId)
          return true
        const row: { id: number, parentId: number | null } | undefined = yield* dbErr(db.query.categories.findFirst({
          columns: { id: true, parentId: true },
          where: { id: currentId, deletedAt: { isNull: true as const } },
        }))
        if (!row)
          return false
        currentId = row.parentId ?? null
      }
      return false
    })

  const createCategory: CategoryServiceImpl['createCategory'] = input =>
    Effect.gen(function* () {
      // 1. Slug uniqueness pre-check
      const existing = yield* dbErr(
        input.organizationId === null
          ? db.query.categories.findFirst({ where: { organizationId: { isNull: true as const }, slug: input.slug, deletedAt: { isNull: true as const } } })
          : db.query.categories.findFirst({ where: { organizationId: input.organizationId, slug: input.slug, deletedAt: { isNull: true as const } } }),
      )
      if (existing)
        return yield* Effect.fail(new CategorySlugTaken({ slug: input.slug }))

      // 2. Validate parent if provided
      if (input.parentId !== undefined) {
        const parent = yield* dbErr(db.query.categories.findFirst({
          where: { id: input.parentId, deletedAt: { isNull: true as const } },
        }))
        if (!parent)
          return yield* Effect.fail(new CategoryNotFound({ id: input.parentId }))

        // Global category's parent must also be global
        if (input.organizationId === null && parent.organizationId !== null)
          return yield* Effect.fail(new CategoryNotFound({ id: input.parentId }))

        // Org category's parent must be global or same org
        if (input.organizationId !== null && parent.organizationId !== null && parent.organizationId !== input.organizationId)
          return yield* Effect.fail(new CategoryNotFound({ id: input.parentId }))
      }

      return yield* dbErr(Effect.gen(function* () {
        const [row] = yield* db.insert(categoriesTable).values({
          organizationId: input.organizationId,
          name: input.name,
          slug: input.slug,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
        }).returning()
        return row! as Category
      }))
    })

  const updateCategory: CategoryServiceImpl['updateCategory'] = input =>
    Effect.gen(function* () {
      yield* findCategoryById(input.id)

      // Slug uniqueness pre-check if slug is being changed
      if (input.slug !== undefined) {
        const row = yield* dbErr(db.query.categories.findFirst({
          where: { id: input.id, deletedAt: { isNull: true as const } },
        }))
        const orgId = row?.organizationId ?? null
        const existingSlug = yield* dbErr(
          orgId === null
            ? db.query.categories.findFirst({ where: { organizationId: { isNull: true as const }, slug: input.slug, deletedAt: { isNull: true as const } } })
            : db.query.categories.findFirst({ where: { organizationId: orgId, slug: input.slug, deletedAt: { isNull: true as const } } }),
        )
        if (existingSlug && existingSlug.id !== input.id)
          return yield* Effect.fail(new CategorySlugTaken({ slug: input.slug }))
      }

      return yield* dbErrOptimistic(
        optimisticUpdate({
          db,
          table: categoriesTable,
          id: input.id,
          expectedVersion: input.version,
          values: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.position !== undefined ? { position: input.position } : {}),
          },
        }),
      )
    })

  const setParent: CategoryServiceImpl['setParent'] = ({ id, version, parentId }) =>
    Effect.gen(function* () {
      yield* findCategoryById(id)

      if (parentId !== null) {
        // Self-cycle
        if (parentId === id)
          return yield* Effect.fail(new CategoryCycle())

        // Check target parent exists
        const parent = yield* dbErr(db.query.categories.findFirst({
          where: { id: parentId, deletedAt: { isNull: true as const } },
        }))
        if (!parent)
          return yield* Effect.fail(new CategoryNotFound({ id: parentId }))

        // Walk ancestor chain from parentId — if we find id, it's a cycle
        const hasCycle = yield* ancestorChainContains(parentId, id)
        if (hasCycle)
          return yield* Effect.fail(new CategoryCycle())
      }

      return yield* dbErrOptimistic(
        optimisticUpdate({
          db,
          table: categoriesTable,
          id,
          expectedVersion: version,
          values: { parentId },
        }),
      )
    })

  const softDeleteCategory: CategoryServiceImpl['softDeleteCategory'] = (id, version) =>
    Effect.gen(function* () {
      yield* findCategoryById(id)
      return yield* dbErrOptimistic(
        optimisticUpdate({ db, table: categoriesTable, id, expectedVersion: version, values: { deletedAt: sql`NOW()` as any } }),
      )
    })

  const listCategories: CategoryServiceImpl['listCategories'] = orgId =>
    dbErr(db.query.categories.findMany({
      where: {
        deletedAt: { isNull: true as const },
        OR: [{ organizationId: { isNull: true as const } }, { organizationId: orgId }],
      },
    })) as Effect.Effect<ReadonlyArray<Category>, CategoryDbFailed>

  const placeProduct: CategoryServiceImpl['placeProduct'] = ({ productId, categoryId, organizationId }) =>
    Effect.gen(function* () {
      // Category must exist and not be soft-deleted
      yield* findCategoryById(categoryId)

      // Check for existing placement (idempotent)
      const existingWhere = organizationId === null
        ? { productId, categoryId, organizationId: { isNull: true as const } }
        : { productId, categoryId, organizationId }
      const existing = yield* dbErr(db.query.productCategories.findFirst({ where: existingWhere }))
      if (existing)
        return existing as ProductCategory

      return yield* dbErr(Effect.gen(function* () {
        const [row] = yield* db.insert(productCategoriesTable).values({
          productId,
          categoryId,
          ...(organizationId !== null ? { organizationId } : {}),
        }).returning()
        return row! as ProductCategory
      }))
    })

  const removePlacement: CategoryServiceImpl['removePlacement'] = ({ productId, categoryId, organizationId }) =>
    dbErr(
      organizationId === null
        ? db.delete(productCategoriesTable).where(
            sql`${productCategoriesTable.productId} = ${productId} AND ${productCategoriesTable.categoryId} = ${categoryId} AND ${isNull(productCategoriesTable.organizationId)}`,
          )
        : db.delete(productCategoriesTable).where(
            sql`${productCategoriesTable.productId} = ${productId} AND ${productCategoriesTable.categoryId} = ${categoryId} AND ${productCategoriesTable.organizationId} = ${organizationId}`,
          ),
    ).pipe(Effect.asVoid)

  const listProductCategories: CategoryServiceImpl['listProductCategories'] = ({ productId, orgId }) =>
    Effect.gen(function* () {
      // Get placements for this product where org is null or == orgId
      const placements = yield* dbErr(db.query.productCategories.findMany({
        where: {
          productId,
          OR: [{ organizationId: { isNull: true as const } }, { organizationId: orgId }],
        },
        with: { category: true },
      }))
      return placements
        .map(p => (p as typeof p & { category: Category }).category)
        .filter((c): c is Category => c !== undefined && c.deletedAt === null)
    })

  return {
    createCategory,
    updateCategory,
    setParent,
    softDeleteCategory,
    findCategoryById,
    listCategories,
    placeProduct,
    removePlacement,
    listProductCategories,
  } satisfies CategoryServiceImpl
})

export const CategoryServiceLive = Layer.effect(CategoryService, make)
