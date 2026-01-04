import type { MutationResolvers } from './../../../types.generated'
import { CollectionService } from '@czo/product/services'

export const updateCollection: NonNullable<MutationResolvers['updateCollection']> = async (
  _parent,
  { id, input },
  ctx,
) => {
  try {
    const collectionService = new CollectionService(ctx.db)

    const collection = await collectionService.updateCollection(
      id,
      input.title,
      input.handle,
    )

    return {
      collection: {
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
        metadata: null,
        createdAt: collection.created_at,
        updatedAt: collection.updated_at,
      },
    }
  }
  catch (error) {
    return {
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update collection',
        },
      ],
    }
  }
}