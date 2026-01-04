import type { QueryResolvers } from './../../../types.generated'
import { TagService } from '@czo/product/services'

export const tags: NonNullable<QueryResolvers['tags']> = async (
  _parent,
  { filter },
  ctx,
) => {
  const tagService = new TagService(ctx.db)
  
  // If filter is provided and has a value, search for specific tag
  if (filter?.value) {
    const tag = await tagService.getTagByValue(filter.value)
    return tag ? [tag].map(t => ({
      id: t.id,
      value: t.value,
      metadata: null,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })) : []
  }
  
  // Otherwise list all tags
  const allTags = await tagService.listTags()
  
  return allTags.map(tag => ({
    id: tag.id,
    value: tag.value,
    metadata: null,
    createdAt: tag.created_at,
    updatedAt: tag.updated_at,
  }))
}
