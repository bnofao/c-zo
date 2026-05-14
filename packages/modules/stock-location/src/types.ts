import type { GraphQLContextMap } from '@czo/kit/graphql'
import type { StockLocationService } from './services/stock-location.service'

declare module '@czo/kit/db' {
  interface SchemaRegistry {
    stockLocations: typeof import('./database/schema').stockLocations
    stockLocationAddresses: typeof import('./database/schema').stockLocationAddresses
  }
}

declare module '@czo/kit/ioc' {
  interface ContainerBindings {
    'stockLocation:service': StockLocationService
  }
}

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    stockLocation: {
      service: StockLocationService
    }
  }
}

export type GraphQLContext = GraphQLContextMap
