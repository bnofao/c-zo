import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { stockLocationRelations } from '../database/relations'
import type * as schema from '../database/schema'
import { Repository } from '@czo/kit/db'

export type StockLocationRow = InferSelectModel<StockLocationSchema['stockLocations']>
export type StockLocationAddressRow = InferSelectModel<StockLocationSchema['stockLocationAddresses']>

type StockLocationSchema = typeof schema
type StockLocationRelations = ReturnType<typeof stockLocationRelations>

// ─── Repository ─────────────────────────────────────────────────────

class StockLocationRepository extends Repository<StockLocationSchema, StockLocationRelations, StockLocationSchema['stockLocations'], 'stockLocations'> {
  get model() {
    return 'stockLocations' as const
  }
}
class StockLocationAddressRepository extends Repository<StockLocationSchema, StockLocationRelations, StockLocationSchema['stockLocationAddresses'], 'stockLocationAddresses'> {
  get model() {
    return 'stockLocationAddresses' as const
  }
}

// ─── Factory ────────────────────────────────────────────────────────

export const createStockLocationService = (db: Database) => StockLocationRepository.buildService([db])
export const createStockLocationAddressService = (db: Database) => StockLocationAddressRepository.buildService([db])

export type StockLocationService = ReturnType<typeof createStockLocationService>

export type StockLocationAddressService = ReturnType<typeof createStockLocationAddressService>
