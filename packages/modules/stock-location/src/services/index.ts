// Effect-TS contracts (Tag, errors, inputs)
export { StockLocationEvents } from './events/stock-location'
export type { StockLocationEvent } from './events/stock-location'
export {
  generateHandle,
  HandleTaken,
  StockLocationDbFailed,
  StockLocationNoChanges,
  StockLocationNotFound,
  StockLocationService,
} from './stock-location'

export type {
  CreateStockLocationAddressInput,
  CreateStockLocationInput,
  StockLocation,
  StockLocationError,
  UpdateStockLocationInput,
} from './stock-location'
