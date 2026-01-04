/**
 * Variant validation utilities using Zod
 */
import { z } from 'zod'

/**
 * Metadata validation with size limit
 */
const metadataSchema = z
  .record(z.any())
  .refine(
    data => JSON.stringify(data).length <= 10000,
    { message: 'Metadata exceeds maximum size of 10KB' },
  )
  .nullable()
  .optional()

/**
 * Create variant input schema
 */
export const CreateVariantInputSchema = z.object({
  title: z.string().trim().min(1, 'Variant title is required').max(255, 'Variant title must not exceed 255 characters'),
  sku: z.string().max(100, 'SKU must not exceed 100 characters').optional(),
  barcode: z.string().max(100, 'Barcode must not exceed 100 characters').optional(),
  ean: z.string().length(8).or(z.string().length(13)).optional().refine(val => !val || /^\d+$/.test(val), { message: 'EAN must contain only digits' }),
  upc: z.string().length(12).optional().refine(val => !val || /^\d+$/.test(val), { message: 'UPC must contain only digits' }),
  allowBackorder: z.boolean().optional(),
  manageInventory: z.boolean().optional(),
  hsCode: z.string().optional(),
  originCountry: z.string().optional(),
  thumbnail: z.string().url('Invalid thumbnail URL').optional().or(z.literal('')),
  midCode: z.string().optional(),
  material: z.string().optional(),
  weight: z.number().int().nonnegative('Weight must be positive').optional(),
  length: z.number().int().nonnegative('Length must be positive').optional(),
  height: z.number().int().nonnegative('Height must be positive').optional(),
  width: z.number().int().nonnegative('Width must be positive').optional(),
  variantRank: z.number().int().nonnegative().optional(),
  metadata: metadataSchema,
})

export type CreateVariantInput = z.infer<typeof CreateVariantInputSchema>

/**
 * Update variant input schema
 */
export const UpdateVariantInputSchema = z.object({
  title: z.string().trim().min(1, 'Variant title cannot be empty').max(255).optional(),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  ean: z.string().length(8).or(z.string().length(13)).optional().refine(val => !val || /^\d+$/.test(val), { message: 'EAN must contain only digits' }),
  upc: z.string().length(12).optional().refine(val => !val || /^\d+$/.test(val), { message: 'UPC must contain only digits' }),
  allowBackorder: z.boolean().optional(),
  manageInventory: z.boolean().optional(),
  hsCode: z.string().optional(),
  originCountry: z.string().optional(),
  thumbnail: z.string().url('Invalid thumbnail URL').optional().or(z.literal('')),
  midCode: z.string().optional(),
  material: z.string().optional(),
  weight: z.number().int().nonnegative('Weight must be positive').optional(),
  length: z.number().int().nonnegative('Length must be positive').optional(),
  height: z.number().int().nonnegative('Height must be positive').optional(),
  width: z.number().int().nonnegative('Width must be positive').optional(),
  variantRank: z.number().int().nonnegative().optional(),
  metadata: metadataSchema,
  expectedUpdatedAt: z.date({ required_error: 'expectedUpdatedAt is required for optimistic locking' }),
})

export type UpdateVariantInput = z.infer<typeof UpdateVariantInputSchema>

/**
 * Validate variant creation input
 */
export function validateCreateVariant(input: unknown): CreateVariantInput {
  return CreateVariantInputSchema.parse(input)
}

/**
 * Validate variant update input
 */
export function validateUpdateVariant(input: unknown): UpdateVariantInput {
  return UpdateVariantInputSchema.parse(input)
}
