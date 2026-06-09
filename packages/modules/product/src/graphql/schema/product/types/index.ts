// Product type registrars — aggregates the per-entity drizzleNode definitions.
//
// Each entity lives in its own file (product-type, product, variant, category,
// collection, media) and is wired here so `registerProductSchema` makes a single
// `registerProductTypes(builder)` call.

import type { ProductGraphQLSchemaBuilder } from '../../..'
import { registerCategoryNode } from './category'
import { registerCollectionNode } from './collection'
import { registerGraftTypes } from './grafts'
import { registerMediaNode } from './media'
import { registerProductNode } from './product'
import { registerProductTypeNode } from './product-type'
import { registerVariantNode } from './variant'

export function registerProductTypes(builder: ProductGraphQLSchemaBuilder): void {
  registerProductTypeNode(builder)
  registerProductNode(builder)
  registerVariantNode(builder)
  registerCategoryNode(builder)
  registerCollectionNode(builder)
  registerMediaNode(builder)
  registerGraftTypes(builder)
}
