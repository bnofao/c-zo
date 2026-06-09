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
    description: 'Postal address to set when creating a stock location.',
    validate: stockLocationAddressSchema,
    fields: t => ({
      addressLine1: t.string({ required: true, description: 'First line of the street address.' }),
      addressLine2: t.string({ description: 'Optional second line of the street address.' }),
      city: t.string({ required: true, description: 'City or locality.' }),
      province: t.string({ description: 'State, province, or region.' }),
      postalCode: t.string({ description: 'Postal or ZIP code.' }),
      countryCode: t.string({ required: true, description: 'ISO 3166-1 alpha-2 country code (e.g. `US`).' }),
      phone: t.string({ description: 'Optional contact phone number for the location.' }),
    }),
  })

  builder.inputType('UpdateStockLocationAddressInput', {
    description: 'Partial postal address to update on a stock location; omitted fields are left unchanged.',
    validate: stockLocationAddressSchema.partial(),
    fields: t => ({
      addressLine1: t.string({ description: 'New first line of the street address.' }),
      addressLine2: t.string({ description: 'New second line of the street address.' }),
      city: t.string({ description: 'New city or locality.' }),
      province: t.string({ description: 'New state, province, or region.' }),
      postalCode: t.string({ description: 'New postal or ZIP code.' }),
      countryCode: t.string({ description: 'New ISO 3166-1 alpha-2 country code.' }),
      phone: t.string({ description: 'New contact phone number.' }),
    }),
  })

  const StockLocationWhereInputRef = builder.inputRef<StockLocationWhereInput>('StockLocationWhereInput').implement({
    description: 'Filter predicate for the `stockLocations` connection. Field filters are AND-combined; use AND/OR/NOT to compose arbitrary boolean trees.',
    fields: t => ({
      name: t.field({ type: 'StringFilterInput', description: 'Filter by location name.' }),
      handle: t.field({ type: 'StringFilterInput', description: 'Filter by location handle.' }),
      organizationId: t.field({ type: 'IntFilterInput', description: 'Filter by owning organization id.' }),
      isActive: t.field({ type: 'BooleanFilterInput', description: 'Filter by active state.' }),
      isDefault: t.field({ type: 'BooleanFilterInput', description: 'Filter by default-location flag.' }),
      createdAt: t.field({ type: 'DateTimeFilterInput', description: 'Filter by creation timestamp.' }),
      AND: t.field({ type: [StockLocationWhereInputRef], description: 'All sub-predicates must match.' }),
      OR: t.field({ type: [StockLocationWhereInputRef], description: 'At least one sub-predicate must match.' }),
      NOT: t.field({ type: StockLocationWhereInputRef, description: 'The sub-predicate must not match.' }),
    }),
  })

  const StockLocationOrderFieldRef = builder.enumType('StockLocationOrderField', {
    description: 'A field the `stockLocations` connection can be ordered by.',
    values: {
      NAME: { value: 'name' },
      HANDLE: { value: 'handle' },
      CREATED_AT: { value: 'createdAt' },
    } as const,
  })

  // Own the sort-direction enum locally rather than referencing auth's
  // `OrderDirection` by string name — that coupled the schema build to auth's
  // contribution running first and never type-checked across modules.
  const StockLocationOrderDirectionRef = builder.enumType('StockLocationOrderDirection', {
    description: 'Sort direction: ascending or descending.',
    values: {
      ASC: { value: 'asc' },
      DESC: { value: 'desc' },
    } as const,
  })

  builder.inputType('StockLocationOrderByInput', {
    description: 'One ordering clause for the `stockLocations` connection (field + direction). Multiple clauses are applied in order.',
    fields: t => ({
      field: t.field({ type: StockLocationOrderFieldRef, required: true, validate: stockLocationOrderFieldSchema, description: 'The location field to sort by.' }),
      direction: t.field({ type: StockLocationOrderDirectionRef, required: true, validate: orderDirectionSchema, description: 'Ascending or descending.' }),
    }),
  })
}
