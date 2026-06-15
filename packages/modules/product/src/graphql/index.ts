import type { SchemaBuilder } from '@czo/kit/graphql'
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
