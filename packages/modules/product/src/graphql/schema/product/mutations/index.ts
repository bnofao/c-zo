// @czo/product mutation registrars aggregator.
//
// Task 20a registers the 5 core-entity groups. Task 20b EXTENDS this file with
// its graft registrars (assignment/bindings/listing/media/adoption) by adding
// their registrar calls below.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { registerAdoptionMutations } from './adoption'
import { registerAssignmentMutations } from './assignment'
import { registerCategoryMutations } from './category'
import { registerChannelListingMutations } from './channelListing'
import { registerCollectionMutations } from './collection'
import { registerInventoryBindingMutations } from './inventoryBinding'
import { registerListingReviewMutations } from './listingReview'
import { registerMediaMutations } from './media'
import { registerPriceBindingMutations } from './priceBinding'
import { registerProductMutations as registerProductCoreMutations } from './product'
import { registerProductTypeMutations } from './productType'
import { registerTranslationMutations } from './translation'
import { registerVariantMutations } from './variant'

export function registerProductMutations(builder: ProductGraphQLSchemaBuilder): void {
  registerProductTypeMutations(builder)
  registerProductCoreMutations(builder)
  registerVariantMutations(builder)
  registerCategoryMutations(builder)
  registerCollectionMutations(builder)
  // Task 20b graft registrars.
  registerAssignmentMutations(builder)
  registerPriceBindingMutations(builder)
  registerInventoryBindingMutations(builder)
  registerChannelListingMutations(builder)
  registerListingReviewMutations(builder)
  registerMediaMutations(builder)
  registerTranslationMutations(builder)
  registerAdoptionMutations(builder)
}
