import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ProductPostgresLayer, truncateProduct } from '../testing/postgres'
import * as Cat from './category'
import * as Col from './collection'
import * as Prod from './product'
import * as ProductType from './product-type'
import * as Tr from './translation'
import * as Variant from './variant'

const TestLayer = Layer.mergeAll(
  Tr.TranslationServiceLive,
  Cat.CategoryServiceLive,
  Col.CollectionServiceLive,
  Variant.VariantServiceLive,
).pipe(
  Layer.provideMerge(Prod.ProductServiceLive),
  Layer.provideMerge(ProductType.ProductTypeServiceLive),
  Layer.provideMerge(ProductPostgresLayer),
)

layer(TestLayer, { timeout: 120_000 })('TranslationService', (it) => {
  // ─── helpers ─────────────────────────────────────────────────────────────────

  const makeType = (slug = 't') =>
    Effect.gen(function* () {
      const svc = yield* ProductType.ProductTypeService
      return yield* svc.createType({ organizationId: null, name: slug, slug, isShippingRequired: true })
    })

  const makeProduct = (handle = 'p') =>
    Effect.gen(function* () {
      const t = yield* makeType(handle)
      const svc = yield* Prod.ProductService
      return yield* svc.createProduct({ organizationId: null, productTypeId: t.id, handle, name: handle })
    })

  const makeVariant = (productId: number, sku = 'v1') =>
    Effect.gen(function* () {
      const svc = yield* Variant.VariantService
      return yield* svc.createVariant({ productId, sku })
    })

  const makeCategory = (slug = 'cat') =>
    Effect.gen(function* () {
      const svc = yield* Cat.CategoryService
      return yield* svc.createCategory({ organizationId: null, name: slug, slug })
    })

  const makeCollection = (slug = 'col') =>
    Effect.gen(function* () {
      const svc = yield* Col.CollectionService
      return yield* svc.createCollection({ organizationId: 1, name: slug, slug })
    })

  // ─── product translations ─────────────────────────────────────────────────

  it.effect('upsert creates a product translation', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const product = yield* makeProduct()
      const svc = yield* Tr.TranslationService
      const row = yield* svc.upsertProductTranslation({ productId: product.id, localeCode: 'fr', name: 'Produit' })
      expect(row.productId).toBe(product.id)
      expect(row.localeCode).toBe('fr')
      expect(row.name).toBe('Produit')
    }))

  it.effect('second upsert same (productId, localeCode) updates — no duplicate', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const product = yield* makeProduct()
      const svc = yield* Tr.TranslationService
      yield* svc.upsertProductTranslation({ productId: product.id, localeCode: 'fr', name: 'Produit' })
      yield* svc.upsertProductTranslation({ productId: product.id, localeCode: 'fr', name: 'Produit mis à jour', description: 'Desc' })
      const rows = yield* svc.listProductTranslations(product.id)
      expect(rows.length).toBe(1)
      expect(rows[0]!.name).toBe('Produit mis à jour')
      expect(rows[0]!.description).toBe('Desc')
    }))

  it.effect('two different locales on same product → 2 rows', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const product = yield* makeProduct()
      const svc = yield* Tr.TranslationService
      yield* svc.upsertProductTranslation({ productId: product.id, localeCode: 'fr', name: 'Produit' })
      yield* svc.upsertProductTranslation({ productId: product.id, localeCode: 'de', name: 'Produkt' })
      const rows = yield* svc.listProductTranslations(product.id)
      expect(rows.length).toBe(2)
      const codes = rows.map(r => r.localeCode)
      expect(codes).toContain('fr')
      expect(codes).toContain('de')
    }))

  it.effect('remove product translation deletes the row', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const product = yield* makeProduct()
      const svc = yield* Tr.TranslationService
      yield* svc.upsertProductTranslation({ productId: product.id, localeCode: 'fr', name: 'Produit' })
      yield* svc.removeProductTranslation({ productId: product.id, localeCode: 'fr' })
      const rows = yield* svc.listProductTranslations(product.id)
      expect(rows.length).toBe(0)
    }))

  // ─── category translations ────────────────────────────────────────────────

  it.effect('upsert creates a category translation', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const cat = yield* makeCategory()
      const svc = yield* Tr.TranslationService
      const row = yield* svc.upsertCategoryTranslation({ categoryId: cat.id, localeCode: 'fr', name: 'Catégorie' })
      expect(row.categoryId).toBe(cat.id)
      expect(row.localeCode).toBe('fr')
      expect(row.name).toBe('Catégorie')
    }))

  it.effect('second upsert same (categoryId, localeCode) updates — no duplicate', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const cat = yield* makeCategory()
      const svc = yield* Tr.TranslationService
      yield* svc.upsertCategoryTranslation({ categoryId: cat.id, localeCode: 'fr', name: 'Cat1' })
      yield* svc.upsertCategoryTranslation({ categoryId: cat.id, localeCode: 'fr', name: 'Cat2', description: 'Desc' })
      const rows = yield* svc.listCategoryTranslations(cat.id)
      expect(rows.length).toBe(1)
      expect(rows[0]!.name).toBe('Cat2')
    }))

  it.effect('two different locales on same category → 2 rows', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const cat = yield* makeCategory()
      const svc = yield* Tr.TranslationService
      yield* svc.upsertCategoryTranslation({ categoryId: cat.id, localeCode: 'fr', name: 'Catégorie' })
      yield* svc.upsertCategoryTranslation({ categoryId: cat.id, localeCode: 'es', name: 'Categoría' })
      const rows = yield* svc.listCategoryTranslations(cat.id)
      expect(rows.length).toBe(2)
    }))

  it.effect('remove category translation deletes the row', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const cat = yield* makeCategory()
      const svc = yield* Tr.TranslationService
      yield* svc.upsertCategoryTranslation({ categoryId: cat.id, localeCode: 'fr', name: 'Catégorie' })
      yield* svc.removeCategoryTranslation({ categoryId: cat.id, localeCode: 'fr' })
      const rows = yield* svc.listCategoryTranslations(cat.id)
      expect(rows.length).toBe(0)
    }))

  // ─── collection translations ──────────────────────────────────────────────

  it.effect('upsert creates a collection translation', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const col = yield* makeCollection()
      const svc = yield* Tr.TranslationService
      const row = yield* svc.upsertCollectionTranslation({ collectionId: col.id, localeCode: 'fr', name: 'Collection' })
      expect(row.collectionId).toBe(col.id)
      expect(row.localeCode).toBe('fr')
      expect(row.name).toBe('Collection')
    }))

  it.effect('second upsert same (collectionId, localeCode) updates — no duplicate', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const col = yield* makeCollection()
      const svc = yield* Tr.TranslationService
      yield* svc.upsertCollectionTranslation({ collectionId: col.id, localeCode: 'fr', name: 'Col1' })
      yield* svc.upsertCollectionTranslation({ collectionId: col.id, localeCode: 'fr', name: 'Col2', description: 'Desc' })
      const rows = yield* svc.listCollectionTranslations(col.id)
      expect(rows.length).toBe(1)
      expect(rows[0]!.name).toBe('Col2')
    }))

  it.effect('two different locales on same collection → 2 rows', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const col = yield* makeCollection()
      const svc = yield* Tr.TranslationService
      yield* svc.upsertCollectionTranslation({ collectionId: col.id, localeCode: 'fr', name: 'Collection' })
      yield* svc.upsertCollectionTranslation({ collectionId: col.id, localeCode: 'ja', name: 'コレクション' })
      const rows = yield* svc.listCollectionTranslations(col.id)
      expect(rows.length).toBe(2)
    }))

  it.effect('remove collection translation deletes the row', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const col = yield* makeCollection()
      const svc = yield* Tr.TranslationService
      yield* svc.upsertCollectionTranslation({ collectionId: col.id, localeCode: 'fr', name: 'Collection' })
      yield* svc.removeCollectionTranslation({ collectionId: col.id, localeCode: 'fr' })
      const rows = yield* svc.listCollectionTranslations(col.id)
      expect(rows.length).toBe(0)
    }))

  // ─── variant translations ─────────────────────────────────────────────────

  it.effect('upsert creates a variant translation (name only)', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const product = yield* makeProduct()
      const variant = yield* makeVariant(product.id)
      const svc = yield* Tr.TranslationService
      const row = yield* svc.upsertVariantTranslation({ variantId: variant.id, localeCode: 'fr', name: 'Variante' })
      expect(row.variantId).toBe(variant.id)
      expect(row.localeCode).toBe('fr')
      expect(row.name).toBe('Variante')
    }))

  it.effect('second upsert same (variantId, localeCode) updates — no duplicate', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const product = yield* makeProduct()
      const variant = yield* makeVariant(product.id)
      const svc = yield* Tr.TranslationService
      yield* svc.upsertVariantTranslation({ variantId: variant.id, localeCode: 'fr', name: 'V1' })
      yield* svc.upsertVariantTranslation({ variantId: variant.id, localeCode: 'fr', name: 'V2 updated' })
      const rows = yield* svc.listVariantTranslations(variant.id)
      expect(rows.length).toBe(1)
      expect(rows[0]!.name).toBe('V2 updated')
    }))

  it.effect('two different locales on same variant → 2 rows', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const product = yield* makeProduct()
      const variant = yield* makeVariant(product.id)
      const svc = yield* Tr.TranslationService
      yield* svc.upsertVariantTranslation({ variantId: variant.id, localeCode: 'fr', name: 'Variante' })
      yield* svc.upsertVariantTranslation({ variantId: variant.id, localeCode: 'de', name: 'Variante DE' })
      const rows = yield* svc.listVariantTranslations(variant.id)
      expect(rows.length).toBe(2)
    }))

  it.effect('remove variant translation deletes the row', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const product = yield* makeProduct()
      const variant = yield* makeVariant(product.id)
      const svc = yield* Tr.TranslationService
      yield* svc.upsertVariantTranslation({ variantId: variant.id, localeCode: 'fr', name: 'Variante' })
      yield* svc.removeVariantTranslation({ variantId: variant.id, localeCode: 'fr' })
      const rows = yield* svc.listVariantTranslations(variant.id)
      expect(rows.length).toBe(0)
    }))
})
