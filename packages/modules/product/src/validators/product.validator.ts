/**
 * Product validation utilities using Zod
 */
import { z } from 'zod'

/**
 * Product status enum
 */
export const ProductStatus = z.enum(['draft', 'proposed', 'published', 'rejected'])

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
 * Create product input schema
 */
export const CreateProductInputSchema = z.object({
  title: z.string().trim().min(1, 'Product title is required').max(255, 'Product title must not exceed 255 characters'),
  handle: z.string().max(255, 'Product handle must not exceed 255 characters').optional(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  isGiftcard: z.boolean().optional(),
  status: ProductStatus.optional(),
  thumbnail: z.string().url('Invalid thumbnail URL').optional().or(z.literal('')),
  weight: z.string().optional(),
  length: z.string().optional(),
  height: z.string().optional(),
  width: z.string().optional(),
  originCountry: z.string().optional(),
  hsCode: z.string().optional(),
  midCode: z.string().optional(),
  material: z.string().optional(),
  collectionId: z.string().optional(),
  typeId: z.string().optional(),
  discountable: z.boolean().optional(),
  externalId: z.string().optional(),
  metadata: metadataSchema,
})

export type CreateProductInput = z.infer<typeof CreateProductInputSchema>

/**
 * Update product input schema
 */
export const UpdateProductInputSchema = z.object({
  title: z.string().trim().min(1, 'Product title cannot be empty').max(255).optional(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  status: ProductStatus.optional(),
  thumbnail: z.string().url('Invalid thumbnail URL').optional().or(z.literal('')),
  weight: z.string().optional(),
  length: z.string().optional(),
  height: z.string().optional(),
  width: z.string().optional(),
  originCountry: z.string().optional(),
  hsCode: z.string().optional(),
  midCode: z.string().optional(),
  material: z.string().optional(),
  collectionId: z.string().optional(),
  typeId: z.string().optional(),
  discountable: z.boolean().optional(),
  externalId: z.string().optional(),
  metadata: metadataSchema,
  expectedUpdatedAt: z.date({ required_error: 'expectedUpdatedAt is required for optimistic locking' }),
})

export type UpdateProductInput = z.infer<typeof UpdateProductInputSchema>

/**
 * Validate product creation input
 */
export function validateCreateProduct(input: unknown): CreateProductInput {
  return CreateProductInputSchema.parse(input)
}

/**
 * Validate product update input
 */
export function validateUpdateProduct(input: unknown): UpdateProductInput {
  return UpdateProductInputSchema.parse(input)
}

/**
 * Sanitize metadata to prevent injection attacks
 */
export function sanitizeMetadata(metadata: unknown): Record<string, any> | null {
  if (metadata === null || metadata === undefined) {
    return null
  }

  if (typeof metadata !== 'object') {
    throw new TypeError('Metadata must be an object')
  }

  // Deep copy to remove any potential prototypes or functions
  const sanitized = JSON.parse(JSON.stringify(metadata))

  return sanitized
}
