import { Layer } from 'effect'
import { AdoptionServiceLive } from './adoption'
import { AttributeAssignmentServiceLive } from './attribute-assignment'
import { CategoryServiceLive } from './category'
import { ChannelListingServiceLive } from './channel-listing'
import { CollectionServiceLive } from './collection'
import { InventoryBindingServiceLive } from './inventory-binding'
import { MediaServiceLive } from './media'
import { PriceBindingServiceLive } from './price-binding'
import { ProductServiceLive } from './product'
import { ProductTypeServiceLive } from './product-type'
import { TranslationServiceLive } from './translation'
import { VariantServiceLive } from './variant'

export {
  AdoptionDbFailed,
  AdoptionNotFound,
  AdoptionService,
  AdoptionServiceLive,
  CannotAdoptOwnedProduct,
  ProductNotAdopted,
} from './adoption'
export type { AdoptProductInput, ProductOrgAdoption, UnadoptProductInput } from './adoption'
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
  CategoryCycle,
  CategoryDbFailed,
  CategoryNotFound,
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
  NotAMarketplaceChannel,
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
export * from './matrix'
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
  GlobalProductRequiresGlobalType,
  HandleTaken,
  ProductDbFailed,
  ProductNotFound,
  ProductService,
  ProductServiceLive,
} from './product'
export type { CreateProductInput, Product, UpdateProductInput } from './product'
export {
  InvalidAttributeDeclaration,
  ProductTypeDbFailed,
  ProductTypeNotFound,
  ProductTypeService,
  ProductTypeServiceLive,
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
  SkuTaken,
  VariantDbFailed,
  VariantNotFound,
  VariantService,
  VariantServiceLive,
} from './variant'
export type { CreateVariantInput, ProductVariant, UpdateVariantInput } from './variant'

/**
 * Composite layer for the product module.
 *
 * Dependency graph (bottom-up):
 *   ProductTypeService          ← DrizzleDb
 *   ProductService              ← DrizzleDb + ProductTypeService
 *   VariantService              ← DrizzleDb + ProductService
 *   AdoptionService             ← DrizzleDb + ProductService
 *   AttributeAssignmentService  ← DrizzleDb + Product/Variant/ProductType/Adoption
 *                                 + @czo/attribute's AttributeService + TypedValueService
 *
 * `provideMerge` folds bottom-up so each layer's product-internal deps are
 * satisfied in-tree while staying in the output:
 *   1. base  = Variant + Adoption  → provideMerge Product → provideMerge ProductType
 *   2. whole = AttributeAssignment → provideMerge base  (gets Variant/Adoption/
 *      Product/ProductType)
 *
 * The two `@czo/attribute` services stay in the *required* channel — the app
 * (or the cross-module test layer) provides them, mirroring the manifest order.
 */
const ProductCoreLive = Layer.mergeAll(VariantServiceLive, AdoptionServiceLive).pipe(
  Layer.provideMerge(ProductServiceLive),
  Layer.provideMerge(ProductTypeServiceLive),
)

// PriceBinding/InventoryBinding/Category/Collection sit alongside
// AttributeAssignment: their product-internal deps (Variant/Product/Adoption)
// are satisfied by ProductCore; their foreign services stay in the *required*
// channel for the app (or the cross-module test layer) to provide.
export const ProductModuleLive = Layer.mergeAll(
  AttributeAssignmentServiceLive,
  PriceBindingServiceLive,
  InventoryBindingServiceLive,
  CategoryServiceLive,
  CollectionServiceLive,
  ChannelListingServiceLive,
  MediaServiceLive,
  TranslationServiceLive,
).pipe(
  Layer.provideMerge(ProductCoreLive),
)
