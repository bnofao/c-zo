import type { GraphQLContextMap } from '@czo/kit/graphql'

declare module '@czo/kit/db' {
  interface SchemaRegistryShape {
    stockLocations: typeof import('./database/schema').stockLocations
    stockLocationAddresses: typeof import('./database/schema').stockLocationAddresses
  }
}

export type GraphQLContext = GraphQLContextMap
