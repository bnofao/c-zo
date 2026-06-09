import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attributeRelations } from '@czo/attribute/relations'
import * as attributeSchema from '@czo/attribute/schema'
import { AttributeModuleLive } from '@czo/attribute/services'
import { authRelations } from '@czo/auth/relations'
import * as authSchema from '@czo/auth/schema'
import { channelRelations } from '@czo/channel/relations'
import * as channelSchema from '@czo/channel/schema'
import { ChannelModuleLive } from '@czo/channel/services'
import { inventoryRelations } from '@czo/inventory/relations'
import * as inventorySchema from '@czo/inventory/schema'
import { InventoryModuleLive } from '@czo/inventory/services'
import { DrizzleDb } from '@czo/kit/db'
import { makePostgresTestLayer, truncateTables } from '@czo/kit/testing'
import { priceRelations } from '@czo/price/relations'
import * as priceSchema from '@czo/price/schema'
import { PriceModuleLive } from '@czo/price/services'
import { stockLocationRelations } from '@czo/stock-location/relations'
import * as stockLocationSchema from '@czo/stock-location/schema'
import * as StockLocationMod from '@czo/stock-location/services'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Effect, Layer } from 'effect'
import { productRelations } from '../database/relations'
import * as productSchema from '../database/schema'
import { ProductModuleLive } from '../services'

// ── merged schema + relations (mirrors kit's mergeModuleDb fold) ──────────────

const mergedSchema = Object.assign({}, authSchema, attributeSchema, stockLocationSchema, channelSchema, priceSchema, inventorySchema, productSchema)
const mergedRelations = Object.assign(
  {},
  authRelations(mergedSchema as never),
  attributeRelations(mergedSchema as never),
  stockLocationRelations(mergedSchema as never),
  channelRelations(mergedSchema as never),
  priceRelations(mergedSchema as never),
  inventoryRelations(mergedSchema as never),
  productRelations(mergedSchema as never),
)

// ── migration folders, applied in dependency order on one container ───────────

const here = dirname(fileURLToPath(import.meta.url))
const AUTH_MIGRATIONS = resolve(here, '../../../auth/migrations')
const ATTRIBUTE_MIGRATIONS = resolve(here, '../../../attribute/migrations')
const STOCK_LOCATION_MIGRATIONS = resolve(here, '../../../stock-location/migrations')
const CHANNEL_MIGRATIONS = resolve(here, '../../../channel/migrations')
const PRICE_MIGRATIONS = resolve(here, '../../../price/migrations')
const INVENTORY_MIGRATIONS = resolve(here, '../../../inventory/migrations')
const PRODUCT_MIGRATIONS = resolve(here, '../../migrations')

// Fresh container with merged relations but NO auto-migrations — we apply all
// folders ourselves, in dependency order, after the DB is built.
const BaseDb = makePostgresTestLayer({ relations: mergedRelations as never })

const Migrated = Layer.effectDiscard(
  Effect.gen(function* () {
    const db = yield* DrizzleDb
    yield* migrate(db, { migrationsFolder: AUTH_MIGRATIONS }).pipe(Effect.orDie)
    yield* migrate(db, { migrationsFolder: ATTRIBUTE_MIGRATIONS }).pipe(Effect.orDie)
    yield* migrate(db, { migrationsFolder: STOCK_LOCATION_MIGRATIONS }).pipe(Effect.orDie)
    yield* migrate(db, { migrationsFolder: CHANNEL_MIGRATIONS }).pipe(Effect.orDie)
    yield* migrate(db, { migrationsFolder: PRICE_MIGRATIONS }).pipe(Effect.orDie)
    yield* migrate(db, { migrationsFolder: INVENTORY_MIGRATIONS }).pipe(Effect.orDie)
    yield* migrate(db, { migrationsFolder: PRODUCT_MIGRATIONS }).pipe(Effect.orDie)
  }),
).pipe(Layer.provideMerge(BaseDb))

// `InventoryModuleLive` requires `StockLocationService`. The binding services
// only ever read inventory items (never levels), so a thin stub suffices and
// avoids dragging the whole stock-location module into the container.
const StockLocationStub = Layer.succeed(StockLocationMod.StockLocation.StockLocationService, {
  findFirst: (config: any) => Effect.succeed({ id: config?.where?.id, organizationId: 1 } as any),
} as any)

/**
 * One Postgres container holding auth + attribute + price + inventory + product
 * tables, exposing `DrizzleDb` plus the module service layers (Product +
 * Attribute + Price + Inventory) — WITHOUT booting GraphQL. Provide it to an
 * `@effect/vitest` `layer()` suite with a generous timeout.
 */
export const ProductAttributeLayer = ProductModuleLive.pipe(
  Layer.provideMerge(AttributeModuleLive),
  Layer.provideMerge(PriceModuleLive),
  Layer.provideMerge(InventoryModuleLive),
  Layer.provideMerge(ChannelModuleLive),
  Layer.provideMerge(StockLocationStub),
  Layer.provideMerge(Migrated),
)

/**
 * Truncate product + attribute + price/inventory graft tables (children first)
 * for per-test isolation. Auth tables are left alone — tests don't seed
 * organizations rows (organizationId columns are unconstrained integers here).
 */
export const truncateProductAttribute = truncateTables(
  productSchema.variantMedia,
  productSchema.productMedia,
  productSchema.productChannelListings,
  productSchema.variantPriceSets,
  productSchema.variantInventoryItems,
  productSchema.productAttributeValues,
  productSchema.variantAttributeValues,
  productSchema.productOrgAdoptions,
  productSchema.productTypeAttributes,
  productSchema.productVariants,
  productSchema.products,
  productSchema.productTypes,
  attributeSchema.attributeTextValues,
  attributeSchema.attributeNumericValues,
  attributeSchema.attributeBooleanValues,
  attributeSchema.attributeDateValues,
  attributeSchema.attributeFileValues,
  attributeSchema.attributeReferenceValues,
  attributeSchema.attributeSwatchValues,
  attributeSchema.attributeValues,
  attributeSchema.attributes,
  priceSchema.priceListRules,
  priceSchema.priceRules,
  priceSchema.prices,
  priceSchema.priceLists,
  priceSchema.priceSets,
  inventorySchema.reservations,
  inventorySchema.inventoryLevels,
  inventorySchema.inventoryItems,
  channelSchema.channelStockLocations,
  channelSchema.channels,
)
