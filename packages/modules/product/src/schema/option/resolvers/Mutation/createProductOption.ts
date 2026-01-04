import type { MutationResolvers } from './../../../types.generated'
import { OptionService } from '@czo/product/services'

export const createProductOption: NonNullable<MutationResolvers['createProductOption']> = async (
  _parent,
  { productId, title, values },
  ctx
) => {
  try {
    const optionService = new OptionService(ctx.db)

    // Create the option
    const option = await optionService.createOption(productId, title)

    // Create option values if provided
    const optionValues = []
    for (const value of values) {
      const optionValue = await optionService.createOptionValue(option.id, value)
      optionValues.push(optionValue)
    }

    return {
      option: {
        id: option.id,
        title: option.title,
        metadata: option.metadata,
        createdAt: option.created_at,
        updatedAt: option.updated_at,
      },
      values: optionValues.map(v => ({
        id: v.id,
        value: v.value,
        metadata: null,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
      })),
    }
  }
  catch (error) {
    return {
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create product option',
        },
      ],
    }
  }
}