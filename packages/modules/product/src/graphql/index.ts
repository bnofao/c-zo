import type { BooleanFilter, IntFilter, OrderByInput, SchemaBuilder } from '@czo/kit/graphql'
import type { Relations } from '@czo/product/relations'
import type {
  Category,
  Collection,
  Product,
  ProductChannelListing,
  ProductMedia,
  ProductType,
  ProductTypeAttribute,
  ProductVariant,
  TaxonomyRequest,
} from '../services'
// Pull in auth's module augmentation so cross-module ctx slices (`ctx.auth`)
// and object refs (`'Organization'`) resolve against the shared interfaces.
import '@czo/auth/graphql'

export { productNodeGuards } from './node-guards'
export { type ProductBuilder, registerProductSchema } from './schema'

export type ProductGraphQLSchemaBuilder = SchemaBuilder<Relations>

export interface ProductTypeWhereInput {
  isShippingRequired?: BooleanFilter
  AND?: ProductTypeWhereInput[] | null
  OR?: ProductTypeWhereInput[] | null
  NOT?: ProductTypeWhereInput | null
}

export interface ProductWhereInput {
  productTypeId?: IntFilter
  AND?: ProductWhereInput[] | null
  OR?: ProductWhereInput[] | null
  NOT?: ProductWhereInput | null
}

export interface CategoryWhereInput {
  parentId?: IntFilter
  AND?: CategoryWhereInput[] | null
  OR?: CategoryWhereInput[] | null
  NOT?: CategoryWhereInput | null
}

export interface TaxonomyRequestWhereInput {
  kind?: 'create' | 'promote' | null
  entityType?: 'category' | 'product_type' | null
  state?: 'pending' | 'approved' | 'rejected' | null
  AND?: TaxonomyRequestWhereInput[] | null
  OR?: TaxonomyRequestWhereInput[] | null
  NOT?: TaxonomyRequestWhereInput | null
}

declare module '@czo/kit/graphql' {
  // Only the nested value objects referenced *by name* from other inputs are
  // declared here. Each mutation's top-level argument shape is inlined in its
  // `relayMutationField` and auto-typed by the relay plugin — no entry needed.
  interface BuilderSchemaInputs {
    VariantSelectionPairInput: { attributeId: number, valueId: number }
    AssignmentTextValueInput: { plain: string, rich?: unknown | null }
    AssignmentFileValueInput: { fileUrl: string, mimetype: string }
    AssignmentValueInput: {
      valueIds?: ReadonlyArray<number> | null
      numeric?: number | null
      text?: { plain: string, rich?: unknown | null } | null
      boolean?: boolean | null
      date?: Date | string | null
      file?: { fileUrl: string, mimetype: string } | null
    }
    ProductTypeWhereInput: ProductTypeWhereInput
    ProductTypeOrderByInput: OrderByInput<'name' | 'createdAt'>
    ProductWhereInput: ProductWhereInput
    ProductOrderByInput: OrderByInput<'name' | 'createdAt'>
    CategoryWhereInput: CategoryWhereInput
    CategoryOrderByInput: OrderByInput<'name' | 'position' | 'createdAt'>
    CollectionOrderByInput: OrderByInput<'name' | 'createdAt'>
    TaxonomyRequestWhereInput: TaxonomyRequestWhereInput
    TaxonomyRequestOrderByInput: OrderByInput<'createdAt' | 'reviewedAt'>
  }

  interface BuilderSchemaObjects {
    Product: Product
    ProductVariant: ProductVariant
    ProductType: ProductType
    ProductTypeAttribute: ProductTypeAttribute
    Category: Category
    Collection: Collection
    ProductMedia: ProductMedia
    ProductChannelListing: ProductChannelListing
    TaxonomyRequest: TaxonomyRequest
  }

  interface SchemaBuilderRefs {}
}
