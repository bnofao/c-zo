import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { registerError } from '@czo/kit/graphql'
import {
  AdoptionNotFound,
  AssignmentNotFound,
  AttributeNotAssignedToType,
  CannotAdoptOwnedProduct,
  CategoryCycle,
  CategoryNotFound,
  CategorySlugTaken,
  CollectionNotFound,
  CollectionSlugTaken,
  CrossOrgGraftDenied,
  DuplicateVariantMatrix,
  GlobalProductRequiresGlobalType,
  HandleTaken,
  InvalidAttributeDeclaration,
  InvalidRequiredQuantity,
  MediaNotFound,
  ProductNotAdopted,
  ProductNotFound,
  ProductTypeNotFound,
  SkuTaken,
  ValueKindMismatch,
  VariantNotFound,
} from '../../../services'

export function registerProductErrors(builder: ProductGraphQLSchemaBuilder): void {
  registerError(builder, ProductNotFound, { name: 'ProductNotFoundError' })
  registerError(builder, ProductTypeNotFound, { name: 'ProductTypeNotFoundError' })
  registerError(builder, HandleTaken, { name: 'HandleTakenError' })
  // Module-qualified: the inventory module also registers a `SkuTakenError`.
  // Both modules mount on one schema in the product full-chain build, so the
  // product variant SKU error is namespaced to avoid the typename collision.
  registerError(builder, SkuTaken, { name: 'ProductSkuTakenError' })
  registerError(builder, DuplicateVariantMatrix, { name: 'DuplicateVariantMatrixError' })
  registerError(builder, AttributeNotAssignedToType, { name: 'AttributeNotAssignedToTypeError' })
  registerError(builder, ValueKindMismatch, { name: 'ValueKindMismatchError' })
  registerError(builder, CategoryCycle, { name: 'CategoryCycleError' })
  registerError(builder, CategorySlugTaken, { name: 'CategorySlugTakenError' })
  registerError(builder, CollectionSlugTaken, { name: 'CollectionSlugTakenError' })
  registerError(builder, GlobalProductRequiresGlobalType, { name: 'GlobalProductRequiresGlobalTypeError' })
  registerError(builder, CrossOrgGraftDenied, { name: 'CrossOrgGraftDeniedError' })
  registerError(builder, ProductNotAdopted, { name: 'ProductNotAdoptedError' })
  registerError(builder, CannotAdoptOwnedProduct, { name: 'CannotAdoptOwnedProductError' })
  registerError(builder, MediaNotFound, { name: 'MediaNotFoundError' })
  registerError(builder, InvalidRequiredQuantity, { name: 'InvalidRequiredQuantityError' })
  registerError(builder, InvalidAttributeDeclaration, { name: 'InvalidAttributeDeclarationError' })
  registerError(builder, AssignmentNotFound, { name: 'AssignmentNotFoundError' })
  registerError(builder, AdoptionNotFound, { name: 'AdoptionNotFoundError' })
  registerError(builder, VariantNotFound, { name: 'VariantNotFoundError' })
  registerError(builder, CategoryNotFound, { name: 'CategoryNotFoundError' })
  registerError(builder, CollectionNotFound, { name: 'CollectionNotFoundError' })
}
