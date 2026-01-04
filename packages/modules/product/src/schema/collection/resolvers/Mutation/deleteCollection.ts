import type { MutationResolvers } from './../../../types.generated'
import { CollectionService } from '@czo/product/services'

export const deleteCollection: NonNullable<MutationResolvers['deleteCollection']> = async (
  _parent,
  { id },
  ctx,
) => {
  try {
    const collectionService = new CollectionService(ctx.db)

    const result = await collectionService.deleteCollection(id)

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
          message: error instanceof Error ? error.message : 'Failed to delete collection',
        },
      ],
    }
  }
}