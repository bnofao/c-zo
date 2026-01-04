import type { MutationResolvers } from './../../../types.generated'
import { TypeService } from '@czo/product/services'

export const deleteProductType: NonNullable<MutationResolvers['deleteProductType']> = async (
  _parent,
  { id },
  ctx,
) => {
  try {
    const typeService = new TypeService(ctx.db)
    const result = await typeService.deleteType(id)

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
          message: error instanceof Error ? error.message : 'Failed to delete product type',
        },
      ],
    }
  }
}
