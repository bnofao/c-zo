import type { MutationResolvers } from './../../../types.generated'
import { CollectionService } from '@czo/product/services'

export const createCollection: NonNullable<MutationResolvers['createCollection']> = async (
  _parent,
  { input },
  ctx,
) => {
  try {
    const collectionService = new CollectionService(ctx.db)

    const collection = await collectionService.createCollection(
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
          message: error instanceof Error ? error.message : 'Failed to create collection',
        },
      ],
    }
  }
}