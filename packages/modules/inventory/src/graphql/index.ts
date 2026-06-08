import type { Relations } from '@czo/inventory/relations'
import type { BooleanFilter, DateTimeFilter, IntFilter, OrderByInput, SchemaBuilder, StringFilter } from '@czo/kit/graphql'
import type { InventoryItem, InventoryLevel, Reservation } from '../services/inventory'
// Pull in auth's module augmentation so cross-module ctx slices (`ctx.auth`)
// and object refs (`'Organization'`) resolve against the shared interfaces.
import '@czo/auth/graphql'
// Pull in stock-location's augmentation so `for: 'StockLocation'` resolves in
// the combined schema (used by the stockLocations connection in Task 11).
import '@czo/stock-location/graphql'

export { inventoryNodeGuards } from './node-guards'
export { type InventoryBuilder, registerInventorySchema } from './schema'

export type InventoryGraphQLSchemaBuilder = SchemaBuilder<Relations>

export interface InventoryItemWhereInput {
  sku?: StringFilter
  organizationId?: IntFilter
  requiresShipping?: BooleanFilter
  createdAt?: DateTimeFilter
  AND?: InventoryItemWhereInput[] | null
  OR?: InventoryItemWhereInput[] | null
  NOT?: InventoryItemWhereInput | null
}

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    // auth: AuthContext
  }

  interface BuilderSchemaInputs {
    InventoryItemWhereInput: InventoryItemWhereInput
    InventoryItemOrderByInput: OrderByInput<'sku' | 'createdAt'>
  }

  interface BuilderSchemaObjects {
    InventoryItem: InventoryItem
    InventoryLevel: InventoryLevel
    Reservation: Reservation
  }

  // `BuilderAuthScopes` is not augmented here — inventory reuses auth's
  // `permission` scope, declared by `@czo/auth/graphql` (imported above).

  interface SchemaBuilderRefs {
  }
}
