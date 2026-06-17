import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attributeBooleanValues, attributeDateValues, attributeFileValues, attributeNumericValues, attributeReferenceValues, attributes, attributeSwatchValues, attributeTextValues, attributeValues } from '@czo/attribute/schema'
import { organizations } from '@czo/auth/schema'
import { makePostgresTestLayer, truncateTables } from '@czo/kit/testing'
import { productRelations } from '../database/relations'
import { categories, categoryTranslations, collectionProducts, collections, collectionTranslations, productAttributeValues, productCategories, productChannelListings, productMedia, productOrgAdoptions, products, productTranslations, productTypeAttributes, productTypes, productVariants, taxonomyRequests, variantAttributeValues, variantInventoryItems, variantMedia, variantPriceSets, variantTranslations } from '../database/schema'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')

/**
 * Scoped Postgres test layer for the product module. Spins a `PostgreSqlContainer`,
 * applies the product migrations, and provides `DrizzleDb` wired with the product
 * relations. Provide it to an `@effect/vitest` `layer()` suite (with a generous
 * timeout — the first run pulls the image).
 */
export const ProductPostgresLayer = makePostgresTestLayer({
  migrationsFolder: MIGRATIONS,
  relations: productRelations({ productTypes, productTypeAttributes, products, productVariants, productOrgAdoptions, productAttributeValues, variantAttributeValues, variantPriceSets, variantInventoryItems, categories, productCategories, collections, collectionProducts, productChannelListings, productMedia, variantMedia, organizations, productTranslations, categoryTranslations, collectionTranslations, variantTranslations, taxonomyRequests, attributes, attributeValues, attributeSwatchValues, attributeNumericValues, attributeBooleanValues, attributeDateValues, attributeReferenceValues, attributeTextValues, attributeFileValues }),
})

/**
 * Truncate all product tables `RESTART IDENTITY CASCADE` for per-test isolation.
 * Call at the top of an `it.effect`. Later tasks add more tables here.
 */
export const truncateProduct = truncateTables(
  taxonomyRequests,
  variantTranslations,
  productTranslations,
  categoryTranslations,
  collectionTranslations,
  variantMedia,
  productMedia,
  productChannelListings,
  collectionProducts,
  productCategories,
  variantPriceSets,
  variantInventoryItems,
  productAttributeValues,
  variantAttributeValues,
  productOrgAdoptions,
  productTypeAttributes,
  productVariants,
  products,
  productTypes,
  categories,
  collections,
)
