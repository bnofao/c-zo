import type { StockLocationGraphQLSchemaBuilder, StockLocationWhereInput } from '@czo/stock-location/graphql'
import { z } from 'zod'

// ─── Zod schemas (kept for the address sub-shape) ─────────────────────────────

export const stockLocationAddressSchema = z.object({
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  province: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  countryCode: z.string().length(2),
  phone: z.string().max(20).optional(),
})

const stockLocationOrderFieldSchema = z.enum(['name', 'handle', 'createdAt'])
const orderDirectionSchema = z.enum(['asc', 'desc'])

// ─── Pothos input types ───────────────────────────────────────────────────────
//
// `CreateStockLocationInput` and `UpdateStockLocationInput` are now generated
// by `relayMutationField` from the inline `inputFields` blocks in mutations.ts
// — only the nested address shape stays as a standalone input.

export function registerStockLocationInputs(builder: StockLocationGraphQLSchemaBuilder): void {
  builder.inputType('CreateStockLocationAddressInput', {
    validate: stockLocationAddressSchema,
    fields: t => ({
      addressLine1: t.string({ required: true }),
      addressLine2: t.string(),
      city: t.string({ required: true }),
      province: t.string(),
      postalCode: t.string(),
      countryCode: t.string({ required: true }),
      phone: t.string(),
    }),
  })

  const StockLocationWhereInputRef = builder.inputRef<StockLocationWhereInput>('StockLocationWhereInput').implement({
    fields: t => ({
      name: t.field({ type: 'StringFilterInput' }),
      handle: t.field({ type: 'StringFilterInput' }),
      organizationId: t.field({ type: 'IntFilterInput' }),
      isActive: t.field({ type: 'BooleanFilterInput' }),
      isDefault: t.field({ type: 'BooleanFilterInput' }),
      createdAt: t.field({ type: 'DateTimeFilterInput' }),
      AND: t.field({ type: [StockLocationWhereInputRef] }),
      OR: t.field({ type: [StockLocationWhereInputRef] }),
      NOT: t.field({ type: StockLocationWhereInputRef }),
    }),
  })

  const StockLocationOrderFieldRef = builder.enumType('StockLocationOrderField', {
    values: {
      NAME: { value: 'name' },
      HANDLE: { value: 'handle' },
      CREATED_AT: { value: 'createdAt' },
    } as const,
  })

  builder.inputType('StockLocationOrderByInput', {
    fields: t => ({
      // `OrderDirection` enum is registered by @czo/auth — referenced here
      // by string name. Auth's plugin must load before stock-location for
      // the registry lookup to succeed at boot.
      field: t.field({ type: StockLocationOrderFieldRef, required: true, validate: stockLocationOrderFieldSchema }),
      direction: t.field({ type: 'OrderDirection', required: true, validate: orderDirectionSchema }),
    }),
  })
}
