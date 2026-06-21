import { Layer } from 'effect'
import { AttributeAssignmentServiceLive } from './attribute-assignment'
import { CategoryServiceLive } from './category'
import { ChannelListingServiceLive } from './channel-listing'
import { CollectionServiceLive } from './collection'
import { layer as ProductEventsLayer } from './events/product'
import { InventoryBindingServiceLive } from './inventory-binding'
import { MediaServiceLive } from './media'
import { PriceBindingServiceLive } from './price-binding'
import { ProductServiceLive } from './product'
import { ProductTypeServiceLive } from './product-type'
import { unadoptCleanupSubscribersLayer } from './subscribers/unadopt-queue'
import { TaxonomyRequestServiceLive } from './taxonomy-request'
import { TranslationServiceLive } from './translation'
import { VariantServiceLive } from './variant'

export {
  AssignmentNotFound,
  AttributeAssignmentService,
  AttributeAssignmentServiceLive,
  AttributeNotAssignedToType,
  ProductAssignmentDbFailed,
  ValueKindMismatch,
} from './attribute-assignment'
export type {
  AssignmentValue,
  AssignProductValueInput,
  AssignVariantValueInput,
  ProductAttributeValue,
  ScalarValue,
  SelectValue,
  VariantAttributeValue,
} from './attribute-assignment'
export {
  CategoryAlreadyGlobal,
  CategoryCycle,
  CategoryDbFailed,
  CategoryNotFound,
  CategoryParentNotGlobal,
  CategoryService,
  CategoryServiceLive,
  CategorySlugTaken,
} from './category'
export type { Category, CreateCategoryInput, ProductCategory, UpdateCategoryInput } from './category'
export {
  ChannelListingDbFailed,
  ChannelListingNotFound,
  ChannelListingService,
  ChannelListingServiceLive,
  MarketplaceCategoryNotGlobal,
  NotAMarketplaceChannel,
  ProductTypeNotGlobal,
} from './channel-listing'
export type {
  ProductChannelListing,
  PublishListingInput,
  UnpublishListingInput,
} from './channel-listing'
export {
  CollectionDbFailed,
  CollectionNotFound,
  CollectionService,
  CollectionServiceLive,
  CollectionSlugTaken,
} from './collection'
export type { Collection, CollectionProduct, CreateCollectionInput, UpdateCollectionInput } from './collection'
export { ProductEvents } from './events/product'
export type { ProductEvent } from './events/product'
export {
  CrossOrgGraftDenied,
  InvalidRequiredQuantity,
  InventoryBindingDbFailed,
  InventoryBindingService,
  InventoryBindingServiceLive,
} from './inventory-binding'
export type {
  LinkInventoryItemInput,
  UnlinkInventoryItemInput,
  VariantInventoryItem,
} from './inventory-binding'
export {
  MediaDbFailed,
  MediaNotFound,
  MediaService,
  MediaServiceLive,
} from './media'
export type {
  AddMediaInput,
  LinkVariantMediaInput,
  MediaType,
  ProductMedia,
  UpdateMediaInput,
  VariantMedia,
} from './media'
export {
  PriceBindingDbFailed,
  PriceBindingService,
  PriceBindingServiceLive,
} from './price-binding'
export type {
  BindPriceSetInput,
  UnbindPriceSetInput,
  VariantPriceSet,
} from './price-binding'
export {
  AdoptionDbFailed,
  AdoptionNotFound,
  CannotAdoptOwnedProduct,
  GlobalProductRequiresGlobalType,
  HandleTaken,
  ProductDbFailed,
  ProductNotAdopted,
  ProductNotFound,
  ProductService,
  ProductServiceLive,
} from './product'
export type { AdoptProductInput, CreateProductInput, Product, ProductOrgAdoption, UnadoptProductInput, UpdateProductInput } from './product'
export {
  InvalidAttributeDeclaration,
  ProductTypeAlreadyGlobal,
  ProductTypeDbFailed,
  ProductTypeNotFound,
  ProductTypeService,
  ProductTypeServiceLive,
  ProductTypeSlugTaken,
} from './product-type'
export type {
  AttributeAssignment,
  CreateProductTypeInput,
  DeclareAttributeInput,
  ListTypeAttributesInput,
  ProductType,
  ProductTypeAttribute,
  UpdateProductTypeInput,
} from './product-type'
export { purgeDeferred, unadoptCleanupConsumer, UnadoptCleanupQueue } from './subscribers/unadopt-queue'
export {
  TaxonomyRequestDbFailed,
  TaxonomyRequestNotFound,
  TaxonomyRequestNotPending,
  TaxonomyRequestService,
  TaxonomyRequestServiceLive,
} from './taxonomy-request'
export type { CategoryCreationInput, CategoryPromotionInput, TaxonomyRequest } from './taxonomy-request'
export {
  TranslationDbFailed,
  TranslationService,
  TranslationServiceLive,
} from './translation'
export type {
  CategoryTranslation,
  CollectionTranslation,
  ProductTranslation,
  RemoveCategoryTranslationInput,
  RemoveCollectionTranslationInput,
  RemoveProductTranslationInput,
  RemoveVariantTranslationInput,
  UpsertCategoryTranslationInput,
  UpsertCollectionTranslationInput,
  UpsertProductTranslationInput,
  UpsertVariantTranslationInput,
  VariantTranslation,
} from './translation'
export {
  DuplicateVariantMatrix,
  isDuplicateMatrix,
  SkuTaken,
  VariantDbFailed,
  VariantNotFound,
  variantSelectionKey,
  VariantService,
  VariantServiceLive,
} from './variant'
export type { CreateVariantInput, ProductVariant, SelectionPair, UpdateVariantInput } from './variant'

/**
 * Composite layer for the product module.
 *
 * Dependency graph (bottom-up):
 *   ProductTypeService          ← DrizzleDb
 *   ProductService              ← DrizzleDb + ProductTypeService
 *   VariantService              ← DrizzleDb + ProductService
 *   ProductService              ← DrizzleDb + ProductType + ProductEvents
 *                                 (now also owns adoption: adopt/unadopt/isAdopted)
 *   AttributeAssignmentService  ← DrizzleDb + Product/Variant/ProductType
 *                                 + @czo/attribute's AttributeService + TypedValueService
 *
 * `provideMerge` folds bottom-up so each layer's product-internal deps are
 * satisfied in-tree while staying in the output:
 *   1. base  = Variant → provideMerge Product → provideMerge ProductType
 *      → provideMerge ProductEvents
 *   2. whole = AttributeAssignment → provideMerge base  (gets Variant/Product/
 *      ProductType)
 *
 * The two `@czo/attribute` services stay in the *required* channel — the app
 * (or the cross-module test layer) provides them, mirroring the manifest order.
 */
const ProductCoreLive = VariantServiceLive.pipe(
  Layer.provideMerge(ProductServiceLive),
  Layer.provideMerge(ProductTypeServiceLive),
  // Factor ProductEvents.layer out so both ProductService (the adoption
  // publisher, via unadoptProduct) and unadoptCleanupSubscribersLayer (consumer)
  // share the same PubSub instance.
  Layer.provideMerge(ProductEventsLayer),
)

// PriceBinding/InventoryBinding/Category/Collection sit alongside
// AttributeAssignment: their product-internal deps (Variant/Product/Adoption)
// are satisfied by ProductCore; their foreign services stay in the *required*
// channel for the app (or the cross-module test layer) to provide.
export const ProductModuleLive = Layer.mergeAll(
  AttributeAssignmentServiceLive,
  PriceBindingServiceLive,
  InventoryBindingServiceLive,
  CollectionServiceLive,
  ChannelListingServiceLive,
  MediaServiceLive,
  TranslationServiceLive,
  TaxonomyRequestServiceLive,
  unadoptCleanupSubscribersLayer,
).pipe(
  Layer.provideMerge(CategoryServiceLive),
  Layer.provideMerge(ProductCoreLive),
)
