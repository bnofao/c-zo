import type { BooleanFilter, DateTimeFilter, IntFilter, OrderByInput, SchemaBuilder, StringFilter } from '@czo/kit/graphql'
import type { Relations } from '@czo/stock-location/relations'
import type { CreateStockLocationAddressInput, StockLocation } from '@czo/stock-location/services'
// Pull in auth's module augmentation so cross-module ctx slices (`ctx.auth`)
// and object refs (`'Organization'`) resolve against the shared interfaces.
import '@czo/auth/graphql'

export { registerStockLocationSchema, type StockLocationBuilder } from './schema'

export type StockLocationGraphQLSchemaBuilder = SchemaBuilder<Relations>

export interface StockLocationWhereInput {
  name?: StringFilter
  handle?: StringFilter
  organizationId?: IntFilter
  isActive?: BooleanFilter
  isDefault?: BooleanFilter
  createdAt?: DateTimeFilter
  AND?: StockLocationWhereInput[] | null
  OR?: StockLocationWhereInput[] | null
  NOT?: StockLocationWhereInput | null
}

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    // auth: AuthContext
  }

  interface BuilderSchemaInputs {
    CreateStockLocationAddressInput: CreateStockLocationAddressInput
    UpdateStockLocationAddressInput: Partial<CreateStockLocationAddressInput>
    StockLocationWhereInput: StockLocationWhereInput
    StockLocationOrderByInput: OrderByInput<'name' | 'handle' | 'createdAt'>
  }

  interface BuilderSchemaObjects {
    StockLocation: StockLocation
  }

  interface BuilderAuthScopes {
    permission: {
      resource: string
      actions: string[]
    }
  }

  interface SchemaBuilderRefs {
  }
}
