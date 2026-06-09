import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import { DrizzleDb } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { categoryTranslations as categoryTranslationsTable, collectionTranslations as collectionTranslationsTable, productTranslations as productTranslationsTable, variantTranslations as variantTranslationsTable } from '../database/schema'

// ─── Tagged errors ─────────────────────────────────────────────────────────────

export class TranslationDbFailed extends Data.TaggedError('TranslationDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'TRANSLATION_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain models ────────────────────────────────────────────────────────────

export type ProductTranslation = InferSelectModel<typeof productTranslationsTable>
export type CategoryTranslation = InferSelectModel<typeof categoryTranslationsTable>
export type CollectionTranslation = InferSelectModel<typeof collectionTranslationsTable>
export type VariantTranslation = InferSelectModel<typeof variantTranslationsTable>

// ─── Input types ──────────────────────────────────────────────────────────────

export interface UpsertProductTranslationInput {
  productId: number
  localeCode: string
  name: string
  description?: string
}

export interface RemoveProductTranslationInput {
  productId: number
  localeCode: string
}

export interface UpsertCategoryTranslationInput {
  categoryId: number
  localeCode: string
  name: string
  description?: string
}

export interface RemoveCategoryTranslationInput {
  categoryId: number
  localeCode: string
}

export interface UpsertCollectionTranslationInput {
  collectionId: number
  localeCode: string
  name: string
  description?: string
}

export interface RemoveCollectionTranslationInput {
  collectionId: number
  localeCode: string
}

export interface UpsertVariantTranslationInput {
  variantId: number
  localeCode: string
  name: string
}

export interface RemoveVariantTranslationInput {
  variantId: number
  localeCode: string
}

// ─── Service contract ─────────────────────────────────────────────────────────

export class TranslationService extends Context.Service<TranslationService, {
  // Product translations
  readonly upsertProductTranslation: (input: UpsertProductTranslationInput) => Effect.Effect<ProductTranslation, TranslationDbFailed>
  readonly removeProductTranslation: (input: RemoveProductTranslationInput) => Effect.Effect<void, TranslationDbFailed>
  readonly listProductTranslations: (productId: number) => Effect.Effect<ReadonlyArray<ProductTranslation>, TranslationDbFailed>
  // Category translations
  readonly upsertCategoryTranslation: (input: UpsertCategoryTranslationInput) => Effect.Effect<CategoryTranslation, TranslationDbFailed>
  readonly removeCategoryTranslation: (input: RemoveCategoryTranslationInput) => Effect.Effect<void, TranslationDbFailed>
  readonly listCategoryTranslations: (categoryId: number) => Effect.Effect<ReadonlyArray<CategoryTranslation>, TranslationDbFailed>
  // Collection translations
  readonly upsertCollectionTranslation: (input: UpsertCollectionTranslationInput) => Effect.Effect<CollectionTranslation, TranslationDbFailed>
  readonly removeCollectionTranslation: (input: RemoveCollectionTranslationInput) => Effect.Effect<void, TranslationDbFailed>
  readonly listCollectionTranslations: (collectionId: number) => Effect.Effect<ReadonlyArray<CollectionTranslation>, TranslationDbFailed>
  // Variant translations
  readonly upsertVariantTranslation: (input: UpsertVariantTranslationInput) => Effect.Effect<VariantTranslation, TranslationDbFailed>
  readonly removeVariantTranslation: (input: RemoveVariantTranslationInput) => Effect.Effect<void, TranslationDbFailed>
  readonly listVariantTranslations: (variantId: number) => Effect.Effect<ReadonlyArray<VariantTranslation>, TranslationDbFailed>
}>()('@czo/product/TranslationService') {}

type TranslationServiceImpl = Context.Service.Shape<typeof TranslationService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>

  /** Map any DB-layer error to TranslationDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new TranslationDbFailed({ cause })))

  // ─── Product translations ──────────────────────────────────────────────────

  const upsertProductTranslation: TranslationServiceImpl['upsertProductTranslation'] = input =>
    dbErr(Effect.gen(function* () {
      const [row] = yield* db
        .insert(productTranslationsTable)
        .values({
          productId: input.productId,
          localeCode: input.localeCode,
          name: input.name,
          ...(input.description !== undefined ? { description: input.description } : {}),
        })
        .onConflictDoUpdate({
          target: [productTranslationsTable.productId, productTranslationsTable.localeCode],
          set: {
            name: input.name,
            ...(input.description !== undefined ? { description: input.description } : {}),
          },
        })
        .returning()
      return row! as ProductTranslation
    }))

  const removeProductTranslation: TranslationServiceImpl['removeProductTranslation'] = ({ productId, localeCode }) =>
    dbErr(db
      .delete(productTranslationsTable)
      .where(sql`${productTranslationsTable.productId} = ${productId} AND ${productTranslationsTable.localeCode} = ${localeCode}`),
    ).pipe(Effect.asVoid)

  const listProductTranslations: TranslationServiceImpl['listProductTranslations'] = productId =>
    dbErr(db.query.productTranslations.findMany({ where: { productId } })) as Effect.Effect<ReadonlyArray<ProductTranslation>, TranslationDbFailed>

  // ─── Category translations ─────────────────────────────────────────────────

  const upsertCategoryTranslation: TranslationServiceImpl['upsertCategoryTranslation'] = input =>
    dbErr(Effect.gen(function* () {
      const [row] = yield* db
        .insert(categoryTranslationsTable)
        .values({
          categoryId: input.categoryId,
          localeCode: input.localeCode,
          name: input.name,
          ...(input.description !== undefined ? { description: input.description } : {}),
        })
        .onConflictDoUpdate({
          target: [categoryTranslationsTable.categoryId, categoryTranslationsTable.localeCode],
          set: {
            name: input.name,
            ...(input.description !== undefined ? { description: input.description } : {}),
          },
        })
        .returning()
      return row! as CategoryTranslation
    }))

  const removeCategoryTranslation: TranslationServiceImpl['removeCategoryTranslation'] = ({ categoryId, localeCode }) =>
    dbErr(db
      .delete(categoryTranslationsTable)
      .where(sql`${categoryTranslationsTable.categoryId} = ${categoryId} AND ${categoryTranslationsTable.localeCode} = ${localeCode}`),
    ).pipe(Effect.asVoid)

  const listCategoryTranslations: TranslationServiceImpl['listCategoryTranslations'] = categoryId =>
    dbErr(db.query.categoryTranslations.findMany({ where: { categoryId } })) as Effect.Effect<ReadonlyArray<CategoryTranslation>, TranslationDbFailed>

  // ─── Collection translations ───────────────────────────────────────────────

  const upsertCollectionTranslation: TranslationServiceImpl['upsertCollectionTranslation'] = input =>
    dbErr(Effect.gen(function* () {
      const [row] = yield* db
        .insert(collectionTranslationsTable)
        .values({
          collectionId: input.collectionId,
          localeCode: input.localeCode,
          name: input.name,
          ...(input.description !== undefined ? { description: input.description } : {}),
        })
        .onConflictDoUpdate({
          target: [collectionTranslationsTable.collectionId, collectionTranslationsTable.localeCode],
          set: {
            name: input.name,
            ...(input.description !== undefined ? { description: input.description } : {}),
          },
        })
        .returning()
      return row! as CollectionTranslation
    }))

  const removeCollectionTranslation: TranslationServiceImpl['removeCollectionTranslation'] = ({ collectionId, localeCode }) =>
    dbErr(db
      .delete(collectionTranslationsTable)
      .where(sql`${collectionTranslationsTable.collectionId} = ${collectionId} AND ${collectionTranslationsTable.localeCode} = ${localeCode}`),
    ).pipe(Effect.asVoid)

  const listCollectionTranslations: TranslationServiceImpl['listCollectionTranslations'] = collectionId =>
    dbErr(db.query.collectionTranslations.findMany({ where: { collectionId } })) as Effect.Effect<ReadonlyArray<CollectionTranslation>, TranslationDbFailed>

  // ─── Variant translations ──────────────────────────────────────────────────

  const upsertVariantTranslation: TranslationServiceImpl['upsertVariantTranslation'] = input =>
    dbErr(Effect.gen(function* () {
      const [row] = yield* db
        .insert(variantTranslationsTable)
        .values({
          variantId: input.variantId,
          localeCode: input.localeCode,
          name: input.name,
        })
        .onConflictDoUpdate({
          target: [variantTranslationsTable.variantId, variantTranslationsTable.localeCode],
          set: { name: input.name },
        })
        .returning()
      return row! as VariantTranslation
    }))

  const removeVariantTranslation: TranslationServiceImpl['removeVariantTranslation'] = ({ variantId, localeCode }) =>
    dbErr(db
      .delete(variantTranslationsTable)
      .where(sql`${variantTranslationsTable.variantId} = ${variantId} AND ${variantTranslationsTable.localeCode} = ${localeCode}`),
    ).pipe(Effect.asVoid)

  const listVariantTranslations: TranslationServiceImpl['listVariantTranslations'] = variantId =>
    dbErr(db.query.variantTranslations.findMany({ where: { variantId } })) as Effect.Effect<ReadonlyArray<VariantTranslation>, TranslationDbFailed>

  return {
    upsertProductTranslation,
    removeProductTranslation,
    listProductTranslations,
    upsertCategoryTranslation,
    removeCategoryTranslation,
    listCategoryTranslations,
    upsertCollectionTranslation,
    removeCollectionTranslation,
    listCollectionTranslations,
    upsertVariantTranslation,
    removeVariantTranslation,
    listVariantTranslations,
  } satisfies TranslationServiceImpl
})

export const TranslationServiceLive = Layer.effect(TranslationService, make)
