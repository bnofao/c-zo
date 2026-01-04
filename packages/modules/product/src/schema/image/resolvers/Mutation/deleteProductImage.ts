import type { MutationResolvers } from './../../../types.generated'
import { ImageService } from '@czo/product/services'

export const deleteProductImage: NonNullable<MutationResolvers['deleteProductImage']> = async (
  _parent,
  { id },
  ctx,
) => {
  try {
    const imageService = new ImageService(ctx.db)
    const result = await imageService.deleteImage(id)

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
          message: error instanceof Error ? error.message : 'Failed to delete image',
        },
      ],
    }
  }
}
