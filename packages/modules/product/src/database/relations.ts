import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'
// Side-effect import: bring auth's registry augmentation into scope so
// `organizations` resolves in the Pick AND when auth's own relations.ts
// compiles as part of this module's type graph. Mirrors price/inventory/channel.
import '@czo/auth/schema'
import '@czo/attribute/schema'

type ProductSchema = Pick<
  SchemaRegistryShape,
  | 'productTypes'
  | 'productTypeAttributes'
  | 'products'
  | 'productVariants'
  | 'productOrgAdoptions'
  | 'productAttributeValues'
  | 'variantAttributeValues'
  | 'variantPriceSets'
  | 'variantInventoryItems'
  | 'categories'
  | 'productCategories'
  | 'collections'
  | 'collectionProducts'
  | 'productChannelListings'
  | 'productMedia'
  | 'variantMedia'
  | 'organizations'
  | 'productTranslations'
  | 'categoryTranslations'
  | 'collectionTranslations'
  | 'variantTranslations'
  | 'taxonomyRequests'
  | 'attributes'
  | 'attributeValues'
  | 'attributeSwatchValues'
  | 'attributeNumericValues'
  | 'attributeBooleanValues'
  | 'attributeDateValues'
  | 'attributeReferenceValues'
>

export function productRelations(schema: ProductSchema) {
  const {
    productTypes,
    productTypeAttributes,
    products,
    productVariants,
    productOrgAdoptions,
    productAttributeValues,
    variantAttributeValues,
    variantPriceSets,
    variantInventoryItems,
    categories,
    productCategories,
    collections,
    collectionProducts,
    productChannelListings,
    productMedia,
    variantMedia,
    organizations,
    productTranslations,
    categoryTranslations,
    collectionTranslations,
    variantTranslations,
    taxonomyRequests,
    attributes,
    attributeValues,
    attributeSwatchValues,
    attributeNumericValues,
    attributeBooleanValues,
    attributeDateValues,
    attributeReferenceValues,
  } = schema

  return defineRelationsPart(
    { productTypes, productTypeAttributes, products, productVariants, productOrgAdoptions, productAttributeValues, variantAttributeValues, variantPriceSets, variantInventoryItems, categories, productCategories, collections, collectionProducts, productChannelListings, productMedia, variantMedia, organizations, productTranslations, categoryTranslations, collectionTranslations, variantTranslations, taxonomyRequests, attributes, attributeValues, attributeSwatchValues, attributeNumericValues, attributeBooleanValues, attributeDateValues, attributeReferenceValues },
    r => ({
      productTypes: {
        organization: r.one.organizations({ from: r.productTypes.organizationId, to: r.organizations.id }),
        attributes: r.many.productTypeAttributes({ from: r.productTypes.id, to: r.productTypeAttributes.productTypeId }),
        products: r.many.products({ from: r.productTypes.id, to: r.products.productTypeId }),
      },
      productTypeAttributes: {
        productType: r.one.productTypes({ from: r.productTypeAttributes.productTypeId, to: r.productTypes.id }),
      },
      products: {
        organization: r.one.organizations({ from: r.products.organizationId, to: r.organizations.id }),
        productType: r.one.productTypes({ from: r.products.productTypeId, to: r.productTypes.id }),
        variants: r.many.productVariants({ from: r.products.id, to: r.productVariants.productId }),
        adoptions: r.many.productOrgAdoptions({ from: r.products.id, to: r.productOrgAdoptions.productId }),
        attributeValues: r.many.productAttributeValues({ from: r.products.id, to: r.productAttributeValues.productId }),
        categories: r.many.productCategories({ from: r.products.id, to: r.productCategories.productId }),
        collections: r.many.collectionProducts({ from: r.products.id, to: r.collectionProducts.productId }),
        channelListings: r.many.productChannelListings({ from: r.products.id, to: r.productChannelListings.productId }),
        media: r.many.productMedia({ from: r.products.id, to: r.productMedia.productId }),
        translations: r.many.productTranslations({ from: r.products.id, to: r.productTranslations.productId }),
      },
      productTranslations: {
        product: r.one.products({ from: r.productTranslations.productId, to: r.products.id }),
      },
      productAttributeValues: {
        product: r.one.products({ from: r.productAttributeValues.productId, to: r.products.id }),
        attribute: r.one.attributes({ from: r.productAttributeValues.attributeId, to: r.attributes.id }),
        selectValue: r.one.attributeValues({ from: r.productAttributeValues.valueId, to: r.attributeValues.id }),
        swatchValue: r.one.attributeSwatchValues({ from: r.productAttributeValues.valueId, to: r.attributeSwatchValues.id }),
        numericValue: r.one.attributeNumericValues({ from: r.productAttributeValues.valueId, to: r.attributeNumericValues.id }),
        booleanValue: r.one.attributeBooleanValues({ from: r.productAttributeValues.valueId, to: r.attributeBooleanValues.id }),
        dateValue: r.one.attributeDateValues({ from: r.productAttributeValues.valueId, to: r.attributeDateValues.id }),
        referenceValue: r.one.attributeReferenceValues({ from: r.productAttributeValues.valueId, to: r.attributeReferenceValues.id }),
      },
      productVariants: {
        product: r.one.products({ from: r.productVariants.productId, to: r.products.id }),
        attributeValues: r.many.variantAttributeValues({ from: r.productVariants.id, to: r.variantAttributeValues.variantId }),
        priceSets: r.many.variantPriceSets({ from: r.productVariants.id, to: r.variantPriceSets.variantId }),
        inventoryItems: r.many.variantInventoryItems({ from: r.productVariants.id, to: r.variantInventoryItems.variantId }),
        media: r.many.variantMedia({ from: r.productVariants.id, to: r.variantMedia.variantId }),
        translations: r.many.variantTranslations({ from: r.productVariants.id, to: r.variantTranslations.variantId }),
      },
      variantTranslations: {
        variant: r.one.productVariants({ from: r.variantTranslations.variantId, to: r.productVariants.id }),
      },
      productChannelListings: {
        product: r.one.products({ from: r.productChannelListings.productId, to: r.products.id }),
      },
      productMedia: {
        product: r.one.products({ from: r.productMedia.productId, to: r.products.id }),
        variantLinks: r.many.variantMedia({ from: r.productMedia.id, to: r.variantMedia.mediaId }),
      },
      variantMedia: {
        variant: r.one.productVariants({ from: r.variantMedia.variantId, to: r.productVariants.id }),
        media: r.one.productMedia({ from: r.variantMedia.mediaId, to: r.productMedia.id }),
      },
      variantAttributeValues: {
        variant: r.one.productVariants({ from: r.variantAttributeValues.variantId, to: r.productVariants.id }),
      },
      variantPriceSets: {
        variant: r.one.productVariants({ from: r.variantPriceSets.variantId, to: r.productVariants.id }),
      },
      variantInventoryItems: {
        variant: r.one.productVariants({ from: r.variantInventoryItems.variantId, to: r.productVariants.id }),
      },
      productOrgAdoptions: {
        product: r.one.products({ from: r.productOrgAdoptions.productId, to: r.products.id }),
      },
      categories: {
        organization: r.one.organizations({ from: r.categories.organizationId, to: r.organizations.id }),
        parent: r.one.categories({ from: r.categories.parentId, to: r.categories.id }),
        children: r.many.categories({ from: r.categories.id, to: r.categories.parentId }),
        products: r.many.productCategories({ from: r.categories.id, to: r.productCategories.categoryId }),
        translations: r.many.categoryTranslations({ from: r.categories.id, to: r.categoryTranslations.categoryId }),
      },
      categoryTranslations: {
        category: r.one.categories({ from: r.categoryTranslations.categoryId, to: r.categories.id }),
      },
      productCategories: {
        product: r.one.products({ from: r.productCategories.productId, to: r.products.id }),
        category: r.one.categories({ from: r.productCategories.categoryId, to: r.categories.id }),
      },
      collections: {
        organization: r.one.organizations({ from: r.collections.organizationId, to: r.organizations.id }),
        products: r.many.collectionProducts({ from: r.collections.id, to: r.collectionProducts.collectionId }),
        translations: r.many.collectionTranslations({ from: r.collections.id, to: r.collectionTranslations.collectionId }),
      },
      collectionTranslations: {
        collection: r.one.collections({ from: r.collectionTranslations.collectionId, to: r.collections.id }),
      },
      collectionProducts: {
        collection: r.one.collections({ from: r.collectionProducts.collectionId, to: r.collections.id }),
        product: r.one.products({ from: r.collectionProducts.productId, to: r.products.id }),
      },
      taxonomyRequests: {
        organization: r.one.organizations({ from: r.taxonomyRequests.organizationId, to: r.organizations.id }),
      },
    }),
  )
}

export type Relations = ReturnType<typeof productRelations>
