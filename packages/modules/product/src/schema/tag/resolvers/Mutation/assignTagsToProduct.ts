import type { MutationResolvers } from './../../../types.generated'
import { ProductService, TagService } from '@czo/product/services'

export const assignTagsToProduct: NonNullable<MutationResolvers['assignTagsToProduct']> = async (
  _parent,
  { productId, tagIds },
  ctx,
) => {
  try {
    const tagService = new TagService(ctx.db)
    const productService = new ProductService(ctx.db)

    await tagService.assignTagsToProduct(productId, tagIds)
    const product = await productService.getProduct(productId)

    if (!product) {
      return {
        errors: [
          {
            code: 'NOT_FOUND',
            message: 'Product not found',
          },
        ],
      }
    }

    return {
      product: {
        id: product.id,
        title: product.title,
        handle: product.handle,
        subtitle: product.subtitle,
        description: product.description,
        isGiftcard: product.is_giftcard,
        status: product.status as 'draft' | 'proposed' | 'published' | 'rejected',
        thumbnail: product.thumbnail,
        weight: product.weight,
        length: product.length,
        height: product.height,
        width: product.width,
        originCountry: product.origin_country,
        hsCode: product.hs_code,
        midCode: product.mid_code,
        material: product.material,
        discountable: product.discountable,
        externalId: product.external_id,
        metadata: product.metadata,
        createdAt: product.created_at,
        updatedAt: product.updated_at,
      },
    }
  }
  catch (error) {
    return {
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to assign tags',
        },
      ],
    }
  }
}
