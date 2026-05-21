import type { StockLocationGraphQLSchemaBuilder } from '@czo/stock-location/graphql'
import { registerError } from '@czo/kit/graphql'
import {
  HandleTaken,
  StockLocationNoChanges,
  StockLocationNotFound,
} from '../../../services/stock-location'

export {
  HandleTaken,
  StockLocationNoChanges,
  StockLocationNotFound,
}

export function registerStockLocationErrors(builder: StockLocationGraphQLSchemaBuilder): void {
  registerError(builder, StockLocationNotFound, { name: 'StockLocationNotFoundError' })
  registerError(builder, HandleTaken, {
    name: 'StockLocationHandleTakenError',
    fields: t => ({ handle: t.exposeString('handle') }),
  })
  registerError(builder, StockLocationNoChanges, { name: 'StockLocationNoChangesError' })
}
