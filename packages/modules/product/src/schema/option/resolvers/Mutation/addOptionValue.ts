import type { MutationResolvers } from './../../../types.generated'
import { OptionService } from '@czo/product/services'

export const addOptionValue: NonNullable<MutationResolvers['addOptionValue']> = async (
  _parent,
  { optionId, value },
  ctx
) => {
  try {
    const optionService = new OptionService(ctx.db)

    const optionValue = await optionService.createOptionValue(optionId, value)

    return {
      optionValue: {
        id: optionValue.id,
        value: optionValue.value,
        metadata: null,
        createdAt: optionValue.created_at,
        updatedAt: optionValue.updated_at,
      },
    }
  }
  catch (error) {
    return {
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to add option value',
        },
      ],
    }
  }
}