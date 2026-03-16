import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import { Repository } from '@czo/kit/db'
import { createId } from '@paralleldrive/cuid2'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '../database/schema'
import { publishStockLocationEvent } from '../events/stock-location-events'
import { STOCK_LOCATION_EVENTS } from '../events/types'

const { stockLocations, stockLocationAddresses } = schema

export type StockLocationRow = InferSelectModel<typeof stockLocations>
export type StockLocationAddressRow = InferSelectModel<typeof stockLocationAddresses>

type StockLocationSchema = typeof schema

// ─── Repository ─────────────────────────────────────────────────────

class StockLocationRepository extends Repository<StockLocationSchema, typeof stockLocations, 'stockLocations'> {}
class StockLocationAddressRepository extends Repository<StockLocationSchema, typeof stockLocationAddresses, 'stockLocationAddresses'> {}

// ─── Validation ─────────────────────────────────────────────────────

const HANDLE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const ISO_3166_1_ALPHA_2 = new Set([
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AQ',
  'AR',
  'AS',
  'AT',
  'AU',
  'AW',
  'AX',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BL',
  'BM',
  'BN',
  'BO',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BV',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CC',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GG',
  'GH',
  'GI',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GS',
  'GT',
  'GU',
  'GW',
  'GY',
  'HK',
  'HM',
  'HN',
  'HR',
  'HT',
  'HU',
  'ID',
  'IE',
  'IL',
  'IM',
  'IN',
  'IO',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JE',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MH',
  'MK',
  'ML',
  'MM',
  'MN',
  'MO',
  'MP',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NF',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NU',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PM',
  'PN',
  'PR',
  'PS',
  'PT',
  'PW',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SH',
  'SI',
  'SJ',
  'SK',
  'SL',
  'SM',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TF',
  'TG',
  'TH',
  'TJ',
  'TK',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TV',
  'TW',
  'TZ',
  'UA',
  'UG',
  'UM',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'WF',
  'WS',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW',
])

const countryCodeSchema = z.string().length(2).refine(c => ISO_3166_1_ALPHA_2.has(c.toUpperCase()), {
  message: 'Invalid ISO 3166-1 alpha-2 country code',
})

const createAddressSchema = z.object({
  addressLine1: z.string().min(1).max(500),
  addressLine2: z.string().max(500).optional(),
  city: z.string().min(1).max(255),
  province: z.string().max(255).optional(),
  postalCode: z.string().max(20).optional(),
  countryCode: countryCodeSchema,
  phone: z.string().max(50).optional(),
})

const createStockLocationSchema = z.object({
  name: z.string().min(1).max(255),
  handle: z.string().regex(HANDLE_REGEX).max(255).optional(),
  organizationId: z.string().min(1).optional(),
  address: createAddressSchema,
  metadata: z.record(z.unknown()).optional(),
})

const updateAddressSchema = z.object({
  addressLine1: z.string().min(1).max(500).optional(),
  addressLine2: z.string().max(500).nullable().optional(),
  city: z.string().min(1).max(255).optional(),
  province: z.string().max(255).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  countryCode: countryCodeSchema.optional(),
  phone: z.string().max(50).nullable().optional(),
})

const updateStockLocationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  handle: z.string().regex(HANDLE_REGEX).max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
  address: updateAddressSchema.optional(),
})

export type CreateStockLocationInput = z.infer<typeof createStockLocationSchema>
export type UpdateStockLocationInput = z.infer<typeof updateStockLocationSchema>
export type UpdateStockLocationAddressInput = z.infer<typeof updateAddressSchema>

// ─── Utils ──────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function definedKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).filter(k => obj[k] !== undefined)
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

// ─── Factory ────────────────────────────────────────────────────────

export function createStockLocationService(db: Database<StockLocationSchema>) {
  const locationRepo = new StockLocationRepository(db, stockLocations)
  const addressRepo = new StockLocationAddressRepository(db, stockLocationAddresses)

  async function findOrFail(id: string): Promise<StockLocationRow> {
    const location = await locationRepo.findFirst({
      where: and(eq(stockLocations.id, id), isNull(stockLocations.deletedAt)),
    })
    if (!location) {
      throw new Error(`Stock location "${id}" not found`)
    }
    return location
  }

  // ─── Create ─────────────────────────────────────────────────────

  async function create(input: CreateStockLocationInput): Promise<StockLocationRow & { address: StockLocationAddressRow }> {
    const validated = createStockLocationSchema.parse(input)
    const handle = validated.handle ?? slugify(validated.name)
    const organizationId = validated.organizationId ?? ''

    if (!organizationId) {
      throw new Error('organizationId is required (either from input or session context)')
    }

    const existing = await locationRepo.findFirst({
      where: and(
        eq(stockLocations.organizationId, organizationId),
        eq(stockLocations.handle, handle),
        isNull(stockLocations.deletedAt),
      ),
    })

    if (existing) {
      throw new Error(`Stock location with handle "${handle}" already exists in this organization`)
    }

    const locationId = createId()
    const now = new Date()

    const { location, address } = await db.transaction(async (tx) => {
      const loc = await locationRepo.create({
        id: locationId,
        organizationId,
        handle,
        name: validated.name,
        metadata: validated.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      }, { tx: tx as any })

      const addr = await addressRepo.create({
        id: createId(),
        stockLocationId: locationId,
        addressLine1: validated.address.addressLine1,
        addressLine2: validated.address.addressLine2 ?? null,
        city: validated.address.city,
        province: validated.address.province ?? null,
        postalCode: validated.address.postalCode ?? null,
        countryCode: validated.address.countryCode.toUpperCase(),
        phone: validated.address.phone ?? null,
        createdAt: now,
        updatedAt: now,
      }, { tx: tx as any })

      return { location: loc!, address: addr! }
    })

    publishStockLocationEvent(STOCK_LOCATION_EVENTS.CREATED, {
      id: locationId,
      organizationId,
      handle,
      name: validated.name,
    })

    return { ...location, address }
  }

  // ─── Update ─────────────────────────────────────────────────────

  async function update(id: string, input: UpdateStockLocationInput): Promise<StockLocationRow & { address?: StockLocationAddressRow }> {
    const validated = updateStockLocationSchema.parse(input)
    const { address: addressInput, ...locationInput } = validated
    const locationChanges = definedKeys(locationInput)
    const addressChanges = addressInput ? definedKeys(addressInput) : []
    const allChanges = [
      ...locationChanges,
      ...addressChanges.map(c => `address.${c}`),
    ]

    const location = await findOrFail(id)

    if (allChanges.length === 0) {
      return location
    }

    if (locationInput.handle && locationInput.handle !== location.handle) {
      const existing = await locationRepo.findFirst({
        where: and(
          eq(stockLocations.organizationId, location.organizationId),
          eq(stockLocations.handle, locationInput.handle),
          isNull(stockLocations.deletedAt),
        ),
      })

      if (existing) {
        throw new Error(`Stock location with handle "${locationInput.handle}" already exists in this organization`)
      }
    }

    const result = await db.transaction(async (tx) => {
      let updatedLocation = location
      if (locationChanges.length > 0) {
        const rows = await locationRepo.update(stripUndefined(locationInput), {
          where: and(eq(stockLocations.id, id), isNull(stockLocations.deletedAt)),
          tx: tx as any,
        })
        if (rows.length === 0) {
          throw new Error(`Stock location "${id}" not found`)
        }
        updatedLocation = rows[0]!
      }

      let updatedAddress: StockLocationAddressRow | undefined
      if (addressInput && addressChanges.length > 0) {
        const addrRows = await addressRepo.update(stripUndefined({
          ...addressInput,
          countryCode: addressInput.countryCode?.toUpperCase(),
        }), {
          where: eq(stockLocationAddresses.stockLocationId, id),
          tx: tx as any,
        })
        if (addrRows.length === 0) {
          throw new Error(`Address for stock location "${id}" not found`)
        }
        updatedAddress = addrRows[0]!
      }

      return { ...updatedLocation, ...(updatedAddress ? { address: updatedAddress } : {}) }
    })

    publishStockLocationEvent(STOCK_LOCATION_EVENTS.UPDATED, {
      id,
      organizationId: location.organizationId,
      changes: allChanges,
    })

    return result
  }

  // ─── Update Address ─────────────────────────────────────────────

  async function updateAddress(stockLocationId: string, input: UpdateStockLocationAddressInput): Promise<StockLocationAddressRow> {
    const validated = updateAddressSchema.parse(input)
    const changes = definedKeys(validated)

    // Always verify the parent location exists and is not soft-deleted
    const location = await findOrFail(stockLocationId)

    if (changes.length === 0) {
      const address = await addressRepo.findFirst({
        where: eq(stockLocationAddresses.stockLocationId, stockLocationId),
      })
      if (!address) {
        throw new Error(`Address for stock location "${stockLocationId}" not found`)
      }
      return address
    }

    const rows = await addressRepo.update(stripUndefined({
      ...validated,
      countryCode: validated.countryCode?.toUpperCase(),
    }), {
      where: eq(stockLocationAddresses.stockLocationId, stockLocationId),
    })

    if (rows.length === 0) {
      throw new Error(`Address for stock location "${stockLocationId}" not found`)
    }

    publishStockLocationEvent(STOCK_LOCATION_EVENTS.UPDATED, {
      id: stockLocationId,
      organizationId: location.organizationId,
      changes: changes.map(c => `address.${c}`),
    })

    return rows[0]!
  }

  return { create, update, updateAddress }
}

export type StockLocationService = ReturnType<typeof createStockLocationService>
