/**
 * Category validation utilities using Zod
 */
import { z } from 'zod'
import { camelToSnake } from '../utils/transform'

/**
 * Maximum category depth allowed
 */
export const MAX_CATEGORY_DEPTH = 10

/**
 * Metadata validation with size limit
 */
const metadataSchema = z
  .json()
  .refine(
    data => JSON.stringify(data).length <= 10000,
    { message: 'Metadata exceeds maximum size of 10KB' },
  )
  .nullable()
  .optional()

/**
 * Create category input schema
 */
export const CreateCategoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(255, 'Category name must not exceed 255 characters'),
  description: z.string().optional(),
  handle: z.string().max(255, 'Category handle must not exceed 255 characters').optional(),
  parentId: z.string().optional(),
  isActive: z.boolean().optional(),
  isInternal: z.boolean().optional(),
  rank: z.number().int().nonnegative('Category rank must be non-negative').optional(),
  imageId: z.string().optional(),
  thumbnail: z.string().url('Invalid thumbnail URL').optional(),
  metadata: metadataSchema,
})

export type CreateCategoryInput = z.infer<typeof CreateCategoryInputSchema>

/**
 * Update category input schema
 */
export const UpdateCategoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Category name cannot be empty').max(255).optional(),
  description: z.string().optional(),
  handle: z.string().max(255).optional(),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  isInternal: z.boolean().optional(),
  rank: z.number().int().nonnegative('Category rank must be non-negative').optional(),
  imageId: z.string().nullable().optional(),
  thumbnail: z.string().url('Invalid thumbnail URL').optional().or(z.literal('')),
  metadata: metadataSchema,
  expectedUpdatedAt: z.date({ required_error: 'expectedUpdatedAt is required for optimistic locking' }),
})

export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInputSchema>

/**
 * Validate category creation input
 */
export function validateCreateCategory(input: unknown): CreateCategoryInput {
  return CreateCategoryInputSchema.parse(input)
}

/**
 * Validate category update input
 */
export function validateUpdateCategory(input: unknown): UpdateCategoryInput {
  return UpdateCategoryInputSchema.parse(input)
}
