import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core'

export const attributeAssignmentEnum = pgEnum('product_attribute_assignment', ['PRODUCT', 'VARIANT'])
export const mediaTypeEnum = pgEnum('product_media_type', ['IMAGE', 'VIDEO'])
export const taxonomyRequestKindEnum = pgEnum('taxonomy_request_kind', ['create', 'promote'])
export const taxonomyEntityTypeEnum = pgEnum('taxonomy_entity_type', ['category', 'product_type'])
export const taxonomyRequestStateEnum = pgEnum('taxonomy_request_state', ['pending', 'approved', 'rejected'])
export const listingReviewStateEnum = pgEnum('product_listing_review_state', ['pending', 'approved', 'rejected', 'suspended'])

export const productTypes = pgTable('product_types', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id'), // nullable: null = global
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  isShippingRequired: boolean('is_shipping_required').notNull().default(true),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('product_types_org_idx').on(t.organizationId),
  uniqueIndex('product_types_org_slug_uniq').on(t.organizationId, t.slug).where(sql`${t.deletedAt} IS NULL`),
])

export const productTypeAttributes = pgTable('product_type_attributes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  productTypeId: integer('product_type_id').notNull().references(() => productTypes.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'), // nullable: null = base declaration, set = org extension
  attributeId: integer('attribute_id').notNull(), // cross-module ref to @czo/attribute, no FK
  assignment: attributeAssignmentEnum('assignment').notNull(),
  variantSelection: boolean('variant_selection').notNull().default(false),
  position: integer('position').notNull().default(0),
}, t => [
  unique('product_type_attributes_uniq').on(t.productTypeId, t.organizationId, t.attributeId),
  index('product_type_attributes_type_idx').on(t.productTypeId),
  check('chk_pta_variant_selection', sql`${t.variantSelection} = false OR ${t.assignment} = 'VARIANT'`),
])

export const products = pgTable('products', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id'), // nullable: null = global
  productTypeId: integer('product_type_id').notNull().references(() => productTypes.id, { onDelete: 'restrict' }),
  handle: text('handle').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('products_org_idx').on(t.organizationId),
  index('products_type_idx').on(t.productTypeId),
  uniqueIndex('products_org_handle_uniq').on(t.organizationId, t.handle).where(sql`${t.deletedAt} IS NULL`),
])

export const productVariants = pgTable('product_variants', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id'), // nullable, mirrors parent product
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  sku: text('sku'),
  position: integer('position').notNull().default(0),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('product_variants_product_idx').on(t.productId),
  uniqueIndex('product_variants_org_sku_uniq').on(t.organizationId, t.sku).where(sql`${t.sku} IS NOT NULL AND ${t.deletedAt} IS NULL`),
])

export const productOrgAdoptions = pgTable('product_org_adoptions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id').notNull(),
  adoptedAt: timestamp('adopted_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  uniqueIndex('product_org_adoptions_uniq').on(t.productId, t.organizationId),
  index('product_org_adoptions_org_idx').on(t.organizationId),
])

export const productAttributeValues = pgTable('product_attribute_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'), // null = base of a global product, set = org graft
  attributeId: integer('attribute_id').notNull(), // cross-module
  valueId: integer('value_id').notNull(), // cross-module ref into the @czo/attribute typed value table dictated by the attribute's `type`
  position: integer('position').notNull().default(0),
}, t => [
  index('product_attribute_values_product_idx').on(t.productId),
  index('product_attribute_values_lookup_idx').on(t.productId, t.organizationId, t.attributeId),
])

export const variantAttributeValues = pgTable('variant_attribute_values', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
  attributeId: integer('attribute_id').notNull(),
  valueId: integer('value_id').notNull(),
  position: integer('position').notNull().default(0),
}, t => [
  index('variant_attribute_values_variant_idx').on(t.variantId),
  index('variant_attribute_values_lookup_idx').on(t.variantId, t.organizationId, t.attributeId),
])

export const variantPriceSets = pgTable('variant_price_sets', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id').notNull(),
  priceSetId: integer('price_set_id').notNull(), // cross-module ref to @czo/price, no FK
}, t => [
  unique('variant_price_sets_uniq').on(t.variantId, t.organizationId),
  index('variant_price_sets_price_set_idx').on(t.priceSetId),
])

export const variantInventoryItems = pgTable('variant_inventory_items', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id').notNull(),
  inventoryItemId: integer('inventory_item_id').notNull(), // cross-module ref to @czo/inventory, no FK
  requiredQuantity: integer('required_quantity').notNull().default(1),
}, t => [
  unique('variant_inventory_items_uniq').on(t.variantId, t.organizationId, t.inventoryItemId),
  index('variant_inventory_items_variant_idx').on(t.variantId, t.organizationId),
  check('chk_vii_required_qty_pos', sql`${t.requiredQuantity} > 0`),
])

export const categories = pgTable('categories', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id'),
  parentId: integer('parent_id').references((): AnyPgColumn => categories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  slug: text('slug').notNull(),
  position: integer('position').notNull().default(0),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('categories_org_idx').on(t.organizationId),
  index('categories_parent_idx').on(t.parentId),
  uniqueIndex('categories_org_slug_uniq').on(t.organizationId, t.slug).where(sql`${t.deletedAt} IS NULL`),
])

export const productCategories = pgTable('product_categories', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'),
}, t => [
  uniqueIndex('product_categories_base_uniq').on(t.productId, t.categoryId).where(sql`${t.organizationId} IS NULL`),
  uniqueIndex('product_categories_org_uniq').on(t.productId, t.categoryId, t.organizationId).where(sql`${t.organizationId} IS NOT NULL`),
  index('product_categories_category_idx').on(t.categoryId),
])

export const collections = pgTable('collections', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  organizationId: integer('organization_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  slug: text('slug').notNull(),
  metadata: jsonb('metadata'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('collections_org_idx').on(t.organizationId),
  uniqueIndex('collections_org_slug_uniq').on(t.organizationId, t.slug).where(sql`${t.deletedAt} IS NULL`),
])

export const collectionProducts = pgTable('collection_products', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  collectionId: integer('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
}, t => [
  unique('collection_products_uniq').on(t.collectionId, t.productId),
  index('collection_products_product_idx').on(t.productId),
])

export const productChannelListings = pgTable('product_channel_listings', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  channelId: integer('channel_id').notNull(), // cross-module ref to @czo/channel, no FK
  organizationId: integer('organization_id'), // the org that published this listing
  isPublished: boolean('is_published').notNull().default(false),
  visibleInListings: boolean('visible_in_listings').notNull().default(true),
  availableForPurchaseAt: timestamp('available_for_purchase_at'),
  publishedAt: timestamp('published_at'),
  reviewState: listingReviewStateEnum('review_state').notNull().default('approved'),
  reviewedAt: timestamp('reviewed_at'),
  reviewReason: text('review_reason'),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  uniqueIndex('product_channel_listings_uniq').on(t.productId, t.channelId).where(sql`${t.deletedAt} IS NULL`),
  index('product_channel_listings_channel_idx').on(t.channelId),
])

export const taxonomyRequests = pgTable('taxonomy_requests', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  kind: taxonomyRequestKindEnum('kind').notNull(),
  entityType: taxonomyEntityTypeEnum('entity_type').notNull(),
  organizationId: integer('organization_id').notNull(),
  payload: jsonb('payload'),
  targetId: integer('target_id'),
  state: taxonomyRequestStateEnum('state').notNull().default('pending'),
  reviewReason: text('review_reason'),
  reviewedAt: timestamp('reviewed_at'),
  resultId: integer('result_id'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('taxonomy_requests_state_idx').on(t.state),
  index('taxonomy_requests_org_idx').on(t.organizationId),
])

export const productMedia = pgTable('product_media', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id'), // null = base media, set = org graft
  url: text('url').notNull(),
  alt: text('alt'),
  type: mediaTypeEnum('type').notNull().default('IMAGE'),
  position: integer('position').notNull().default(0),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  index('product_media_product_idx').on(t.productId),
])

export const variantMedia = pgTable('variant_media', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  mediaId: integer('media_id').notNull().references(() => productMedia.id, { onDelete: 'cascade' }),
}, t => [
  unique('variant_media_uniq').on(t.variantId, t.mediaId),
  index('variant_media_media_idx').on(t.mediaId),
])

export const productTranslations = pgTable('product_translations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  localeCode: text('locale_code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
}, t => [
  unique('product_translations_uniq').on(t.productId, t.localeCode),
])

export const categoryTranslations = pgTable('category_translations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  categoryId: integer('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  localeCode: text('locale_code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
}, t => [
  unique('category_translations_uniq').on(t.categoryId, t.localeCode),
])

export const collectionTranslations = pgTable('collection_translations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  collectionId: integer('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  localeCode: text('locale_code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
}, t => [
  unique('collection_translations_uniq').on(t.collectionId, t.localeCode),
])

export const variantTranslations = pgTable('variant_translations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  localeCode: text('locale_code').notNull(),
  name: text('name').notNull(),
}, t => [
  unique('variant_translations_uniq').on(t.variantId, t.localeCode),
])

declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    productTypes: typeof productTypes
    productTypeAttributes: typeof productTypeAttributes
    products: typeof products
    productVariants: typeof productVariants
    productOrgAdoptions: typeof productOrgAdoptions
    productAttributeValues: typeof productAttributeValues
    variantAttributeValues: typeof variantAttributeValues
    variantPriceSets: typeof variantPriceSets
    variantInventoryItems: typeof variantInventoryItems
    categories: typeof categories
    productCategories: typeof productCategories
    collections: typeof collections
    collectionProducts: typeof collectionProducts
    productChannelListings: typeof productChannelListings
    productMedia: typeof productMedia
    variantMedia: typeof variantMedia
    productTranslations: typeof productTranslations
    categoryTranslations: typeof categoryTranslations
    collectionTranslations: typeof collectionTranslations
    variantTranslations: typeof variantTranslations
    taxonomyRequests: typeof taxonomyRequests
  }
}
