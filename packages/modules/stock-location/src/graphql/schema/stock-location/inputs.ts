import { z } from 'zod'

// ─── Zod schemas (used in mutations for validation) ───────────────────────────

export const stockLocationAddressSchema = z.object({
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  province: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  countryCode: z.string().length(2),
  phone: z.string().max(20).optional(),
})

export const createStockLocationSchema = z.object({
  name: z.string().min(1).max(255).transform(v => v.trim()),
  handle: z.string().regex(/^[a-z0-9-]+$/).max(100).optional(),
  organizationId: z.string().min(1),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
  address: stockLocationAddressSchema.optional(),
})

export const updateStockLocationSchema = z.object({
  name: z.string().min(1).max(255).transform(v => v.trim()).optional(),
  handle: z.string().regex(/^[a-z0-9-]+$/).max(100).optional(),
  metadata: z.record(z.any()).optional(),
  address: stockLocationAddressSchema.optional(),
})

// ─── Pothos input types ───────────────────────────────────────────────────────

export function registerStockLocationInputs(builder: any): void {
  const StockLocationAddressInput = (builder as any).inputType('StockLocationAddressInput', {
    fields: (t: any) => ({
      addressLine1: t.string({ required: true }),
      addressLine2: t.string(),
      city: t.string({ required: true }),
      province: t.string(),
      postalCode: t.string(),
      countryCode: t.string({ required: true }),
      phone: t.string(),
    }),
  })

  ;(builder as any).inputType('CreateStockLocationInput', {
    fields: (t: any) => ({
      organizationId: t.globalID({ required: true, for: ['Organization'] }),
      name: t.string({ required: true }),
      handle: t.string(),
      isDefault: t.boolean(),
      isActive: t.boolean(),
      metadata: t.field({ type: 'JSONObject' }),
      address: t.field({ type: StockLocationAddressInput }),
    }),
  })

  ;(builder as any).inputType('UpdateStockLocationInput', {
    fields: (t: any) => ({
      name: t.string(),
      handle: t.string(),
      metadata: t.field({ type: 'JSONObject' }),
      address: t.field({ type: StockLocationAddressInput }),
    }),
  })
}
