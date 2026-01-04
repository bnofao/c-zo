import type { QueryResolvers } from './../../../types.generated'
import { TagService } from '@czo/product/services'

export const tag: NonNullable<QueryResolvers['tag']> = async (
  _parent,
  { id },
  ctx,
) => {
  const tagService = new TagService(ctx.db)
  const tag = await tagService.getTag(id)

  if (!tag) {
    return null
  }

  return {
    id: tag.id,
    value: tag.value,
    metadata: null,
    createdAt: tag.created_at,
    updatedAt: tag.updated_at,
  }
}
