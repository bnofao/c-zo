import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { registerError } from '@czo/kit/graphql'
import {
  AdoptionNotFound,
  AssignmentNotFound,
  AttributeNotAssignedToType,
  CannotAdoptOwnedProduct,
  CategoryAlreadyGlobal,
  CategoryCycle,
  CategoryNotFound,
  CategoryParentNotGlobal,
  CategorySlugTaken,
  ChannelListingNotFound,
  CollectionNotFound,
  CollectionSlugTaken,
  CrossOrgGraftDenied,
  DuplicateVariantMatrix,
  GlobalProductRequiresGlobalType,
  HandleTaken,
  InvalidAttributeDeclaration,
  InvalidRequiredQuantity,
  MarketplaceCategoryNotGlobal,
  MediaNotFound,
  NotAMarketplaceChannel,
  ProductNotAdopted,
  ProductNotFound,
  ProductTypeAlreadyGlobal,
  ProductTypeNotFound,
  ProductTypeNotGlobal,
  ProductTypeSlugTaken,
  SkuTaken,
  TaxonomyRequestNotFound,
  TaxonomyRequestNotPending,
  ValueKindMismatch,
  VariantNotFound,
} from '../../../services'

export function registerProductErrors(builder: ProductGraphQLSchemaBuilder): void {
  registerError(builder, ProductNotFound, { name: 'ProductNotFoundError', subGraphs: ['org', 'admin'] })
  registerError(builder, ProductTypeNotFound, { name: 'ProductTypeNotFoundError', subGraphs: ['org', 'admin'] })
  registerError(builder, HandleTaken, { name: 'HandleTakenError', subGraphs: ['org', 'admin'] })
  // Module-qualified: the inventory module also registers a `SkuTakenError`.
  // Both modules mount on one schema in the product full-chain build, so the
  // product variant SKU error is namespaced to avoid the typename collision.
  registerError(builder, SkuTaken, { name: 'ProductSkuTakenError', subGraphs: ['org', 'admin'] })
  registerError(builder, DuplicateVariantMatrix, { name: 'DuplicateVariantMatrixError', subGraphs: ['org', 'admin'] })
  registerError(builder, AttributeNotAssignedToType, { name: 'AttributeNotAssignedToTypeError', subGraphs: ['org', 'admin'] })
  registerError(builder, ValueKindMismatch, { name: 'ValueKindMismatchError', subGraphs: ['org', 'admin'] })
  registerError(builder, CategoryCycle, { name: 'CategoryCycleError', subGraphs: ['org', 'admin'] })
  registerError(builder, CategorySlugTaken, { name: 'CategorySlugTakenError', subGraphs: ['org', 'admin'] })
  registerError(builder, CollectionSlugTaken, { name: 'CollectionSlugTakenError', subGraphs: ['org', 'admin'] })
  registerError(builder, GlobalProductRequiresGlobalType, { name: 'GlobalProductRequiresGlobalTypeError', subGraphs: ['org', 'admin'] })
  registerError(builder, CrossOrgGraftDenied, { name: 'CrossOrgGraftDeniedError', subGraphs: ['org', 'admin'] })
  registerError(builder, ProductNotAdopted, { name: 'ProductNotAdoptedError', subGraphs: ['org', 'admin'] })
  registerError(builder, CannotAdoptOwnedProduct, { name: 'CannotAdoptOwnedProductError', subGraphs: ['org', 'admin'] })
  registerError(builder, MediaNotFound, { name: 'MediaNotFoundError', subGraphs: ['org', 'admin'] })
  registerError(builder, InvalidRequiredQuantity, { name: 'InvalidRequiredQuantityError', subGraphs: ['org', 'admin'] })
  registerError(builder, InvalidAttributeDeclaration, { name: 'InvalidAttributeDeclarationError', subGraphs: ['org', 'admin'] })
  registerError(builder, AssignmentNotFound, { name: 'AssignmentNotFoundError', subGraphs: ['org', 'admin'] })
  registerError(builder, AdoptionNotFound, { name: 'AdoptionNotFoundError', subGraphs: ['org', 'admin'] })
  registerError(builder, VariantNotFound, { name: 'VariantNotFoundError', subGraphs: ['org', 'admin'] })
  registerError(builder, CategoryNotFound, { name: 'CategoryNotFoundError', subGraphs: ['org', 'admin'] })
  registerError(builder, CollectionNotFound, { name: 'CollectionNotFoundError', subGraphs: ['org', 'admin'] })
  registerError(builder, ChannelListingNotFound, { name: 'ChannelListingNotFoundError', subGraphs: ['admin'] })
  registerError(builder, NotAMarketplaceChannel, { name: 'NotAMarketplaceChannelError', subGraphs: ['admin'] })
  registerError(builder, CategoryAlreadyGlobal, { name: 'CategoryAlreadyGlobalError', subGraphs: ['org', 'admin'] })
  registerError(builder, CategoryParentNotGlobal, { name: 'CategoryParentNotGlobalError', subGraphs: ['admin'] })
  registerError(builder, TaxonomyRequestNotFound, { name: 'TaxonomyRequestNotFoundError', subGraphs: ['admin'] })
  registerError(builder, TaxonomyRequestNotPending, { name: 'TaxonomyRequestNotPendingError', subGraphs: ['admin'] })
  registerError(builder, ProductTypeAlreadyGlobal, { name: 'ProductTypeAlreadyGlobalError', subGraphs: ['org', 'admin'] })
  registerError(builder, ProductTypeSlugTaken, { name: 'ProductTypeSlugTakenError', subGraphs: ['admin'] })
  registerError(builder, ProductTypeNotGlobal, { name: 'ProductTypeNotGlobalError', subGraphs: ['org', 'admin'] })
  registerError(builder, MarketplaceCategoryNotGlobal, { name: 'MarketplaceCategoryNotGlobalError', subGraphs: ['org', 'admin'] })
}
