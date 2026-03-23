import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { stockLocationRelations } from '../database/relations'
import type * as schema from '../database/schema'
import { Repository } from '@czo/kit/db'
import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'
import { publishStockLocationEvent } from '../events/stock-location-events'
import { STOCK_LOCATION_EVENTS } from '../events/types'

export type StockLocationRow = InferSelectModel<StockLocationSchema['stockLocations']>
export type StockLocationAddressRow = InferSelectModel<StockLocationSchema['stockLocationAddresses']>

type StockLocationSchema = typeof schema
type StockLocationRelations = ReturnType<typeof stockLocationRelations>

// ─── Repository ─────────────────────────────────────────────────────

class StockLocationRepository extends Repository<StockLocationSchema, StockLocationRelations, StockLocationSchema['stockLocations'], 'stockLocations'> {}
class StockLocationAddressRepository extends Repository<StockLocationSchema, StockLocationRelations, StockLocationSchema['stockLocationAddresses'], 'stockLocationAddresses'> {}

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

const createStockLocationSchema = z.object({
  name: z.string().min(1).max(255),
  handle: z.string().regex(HANDLE_REGEX).max(255).optional(),
  organizationId: z.string().min(1),
  addressLine1: z.string().min(1).max(500),
  addressLine2: z.string().max(500).optional(),
  city: z.string().min(1).max(255),
  province: z.string().max(255).optional(),
  postalCode: z.string().max(20).optional(),
  countryCode: z.string().length(2).refine(c => ISO_3166_1_ALPHA_2.has(c.toUpperCase()), {
    message: 'Invalid ISO 3166-1 alpha-2 country code',
  }),
  phone: z.string().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
})

export type CreateStockLocationInput = z.infer<typeof createStockLocationSchema>

// ─── Utils ──────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ─── Factory ────────────────────────────────────────────────────────

export function createStockLocationService(db: Database) {
  const locationRepo = new StockLocationRepository(db, 'stockLocations')
  const addressRepo = new StockLocationAddressRepository(db, 'stockLocationAddresses')

  async function create(input: CreateStockLocationInput): Promise<StockLocationRow & { address: StockLocationAddressRow }> {
    const validated = createStockLocationSchema.parse(input)
    const handle = validated.handle ?? slugify(validated.name)

    const existing = await locationRepo.findFirst({
      where: {
        organizationId: validated.organizationId,
        handle,
      },
    })

    if (existing) {
      throw new Error(`Stock location with handle "${handle}" already exists in this organization`)
    }

    const locationId = createId()
    const now = new Date()

    const { location, address } = await db.transaction(async (tx) => {
      const loc = await locationRepo.create({
        id: locationId,
        organizationId: validated.organizationId,
        handle,
        name: validated.name,
        metadata: validated.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      }, { tx: tx as any })

      const addr = await addressRepo.create({
        id: createId(),
        stockLocationId: locationId,
        addressLine1: validated.addressLine1,
        addressLine2: validated.addressLine2 ?? null,
        city: validated.city,
        province: validated.province ?? null,
        postalCode: validated.postalCode ?? null,
        countryCode: validated.countryCode.toUpperCase(),
        phone: validated.phone ?? null,
        createdAt: now,
        updatedAt: now,
      }, { tx: tx as any })

      return { location: loc!, address: addr! }
    })

    publishStockLocationEvent(STOCK_LOCATION_EVENTS.CREATED, {
      id: locationId,
      organizationId: validated.organizationId,
      handle,
      name: validated.name,
    })

    return { ...location, address }
  }

  return { create }
}

export type StockLocationService = ReturnType<typeof createStockLocationService>
