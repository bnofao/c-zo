import type { GraphQLContextMap } from '@czo/kit/graphql'
import type { StockLocationAddressService, StockLocationService } from './services/stock-location.service'

// Re-declare the custom Nitro hooks from @czo/kit so TypeScript resolves them
// in this module's compilation unit (the kit's ambient declaration isn't always
// picked up across workspace boundaries).
// declare module 'nitro/types' {
//   interface NitroRuntimeHooks {
//     'czo:init': () => void
//     'czo:register': () => void
//     'czo:boot': () => void
//   }
// }

declare module '@czo/kit/db' {
  interface SchemaRegistry {
    stockLocations: typeof import('./database/schema').stockLocations
    stockLocationAddresses: typeof import('./database/schema').stockLocationAddresses
  }
}

declare module '@czo/kit/ioc' {
  interface ContainerBindings {
    'stockLocation:service': StockLocationService
    'stockLocationAddress:service': StockLocationAddressService
  }
}

declare module '@czo/kit/graphql' {
  interface GraphQLContextMap {
    stockLocation: {
      service: StockLocationService
      addressService: StockLocationAddressService
    }
  }
}

export type GraphQLContext = GraphQLContextMap
