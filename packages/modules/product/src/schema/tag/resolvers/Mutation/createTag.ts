import type { MutationResolvers } from './../../../types.generated'
import { TagService } from '@czo/product/services'

export const createTag: NonNullable<MutationResolvers['createTag']> = async (
  _parent,
  { value },
  ctx,
) => {
  try {
    const tagService = new TagService(ctx.db)
    const tag = await tagService.createTag(value)

    return {
      tag: {
        id: tag.id,
        value: tag.value,
        metadata: null,
        createdAt: tag.created_at,
        updatedAt: tag.updated_at,
      },
    }
  }
  catch (error) {
    return {
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create tag',
        },
      ],
    }
  }
}
