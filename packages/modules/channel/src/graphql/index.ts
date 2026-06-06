import type { Relations } from '@czo/channel/relations'
import type { BooleanFilter, DateTimeFilter, IntFilter, OrderByInput, SchemaBuilder, StringFilter } from '@czo/kit/graphql'
import type { Channel } from '../services/channel'
// Pull in auth's module augmentation so cross-module ctx slices (`ctx.auth`)
// and object refs (`'Organization'`) resolve against the shared interfaces.
import '@czo/auth/graphql'
// Pull in stock-location's augmentation so `for: 'StockLocation'` resolves in
// the combined schema (used by the stockLocations connection in Task 9).
import '@czo/stock-location/graphql'

export { channelNodeGuards } from './node-guards'
export { type ChannelBuilder, registerChannelSchema } from './schema'

export type ChannelGraphQLSchemaBuilder = SchemaBuilder<Relations>

export interface ChannelWhereInput {
  name?: StringFilter
  handle?: StringFilter
  organizationId?: IntFilter
  isActive?: BooleanFilter
  isDefault?: BooleanFilter
  createdAt?: DateTimeFilter
  AND?: ChannelWhereInput[] | null
  OR?: ChannelWhereInput[] | null
  NOT?: ChannelWhereInput | null
}

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    // auth: AuthContext
  }

  interface BuilderSchemaInputs {
    ChannelWhereInput: ChannelWhereInput
    ChannelOrderByInput: OrderByInput<'name' | 'handle' | 'createdAt'>
  }

  interface BuilderSchemaObjects {
    Channel: Channel
  }

  // `BuilderAuthScopes` is not augmented here — channel reuses auth's
  // `permission` scope, declared by `@czo/auth/graphql` (imported above).

  interface SchemaBuilderRefs {
  }
}
