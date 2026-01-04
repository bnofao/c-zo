import type { QueryResolvers } from './../../../types.generated'
import { CollectionService } from '@czo/product/services'

export const collection: NonNullable<QueryResolvers['collection']> = async (
  _parent,
  { id },
  ctx,
) => {
  const collectionService = new CollectionService(ctx.db)
  const collection = await collectionService.getCollection(id)

  if (!collection) {
    return null
  }

  return {
    id: collection.id,
    title: collection.title,
    handle: collection.handle,
    metadata: null,
    createdAt: collection.created_at,
    updatedAt: collection.updated_at,
  }
}
