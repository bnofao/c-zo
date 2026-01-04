import type { Kysely } from 'kysely'
import type { Database } from '../database'
import type { CategoryService, CollectionService, ImageService, OptionService, ProductService, TagService, TypeService, VariantService } from '../services'

/**
 * GraphQL Context provided to all resolvers
 */
export interface GraphQLContext {
  /** Database instance */
  db: Kysely<Database>

  /** Authenticated user (if any) */
  user?: {
    id: string
    role: string
    [key: string]: any
  }

  /** Service layer instances */
  services: {
    product: ProductService
    variant: VariantService
    category: CategoryService
    option: OptionService
    collection: CollectionService
    tag: TagService
    type: TypeService
    image: ImageService
  }
}
