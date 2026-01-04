import type { MutationResolvers } from './../../../types.generated'
import { TagService } from '@czo/product/services'

export const deleteTag: NonNullable<MutationResolvers['deleteTag']> = async (
  _parent,
  { id },
  ctx,
) => {
  try {
    const tagService = new TagService(ctx.db)
    const result = await tagService.deleteTag(id)

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
          message: error instanceof Error ? error.message : 'Failed to delete tag',
        },
      ],
    }
  }
}
