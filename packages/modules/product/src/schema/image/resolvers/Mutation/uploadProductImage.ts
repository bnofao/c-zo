import type { MutationResolvers } from './../../../types.generated'
import { ImageService } from '@czo/product/services'

export const uploadProductImage: NonNullable<MutationResolvers['uploadProductImage']> = async (
  _parent,
  { productId, url, rank, metadata },
  ctx,
) => {
  try {
    const imageService = new ImageService(ctx.db)
    const image = await imageService.createImage(url, rank || 0)

    // Associate image with product
    await imageService.assignImageToProduct(productId, image.id, null)

    return {
      image: {
        id: image.id,
        url: image.url,
        rank: image.rank,
        metadata: metadata || image.metadata,
        createdAt: image.created_at,
        updatedAt: image.updated_at,
      },
    }
  }
  catch (error) {
    return {
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to upload image',
        },
      ],
    }
  }
}
