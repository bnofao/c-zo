import type { MutationResolvers } from './../../../types.generated'
import { OptionService } from '@czo/product/services'

export const deleteOptionValue: NonNullable<MutationResolvers['deleteOptionValue']> = async (
  _parent,
  { id },
  ctx
) => {
  try {
    const optionService = new OptionService(ctx.db)

    const result = await optionService.deleteOptionValue(id)

    return {
      success: result.success,
    }
  }
  catch (error) {
    return {
      success: false,
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete option value',
        },
      ],
    }
  }
}