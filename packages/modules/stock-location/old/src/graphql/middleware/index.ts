import { registerMiddleware } from '@czo/kit/graphql'
import { createStockLocationMiddleware } from './create-stock-location'

registerMiddleware({
  Mutation: {
    createStockLocation: createStockLocationMiddleware,
  },
})
