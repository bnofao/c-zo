import type { MutationResolvers } from './../../../types.generated'

export const associateImageWithVariant: NonNullable<MutationResolvers['associateImageWithVariant']> = async (
  _parent,
  { imageId, variantId },
  ctx,
) => {
  try {
    // Get variant to find product_id
    const variant = await ctx.db
      .selectFrom('p_variants')
      .selectAll()
      .where('id', '=', variantId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (!variant) {
      return {
        success: false,
        errors: [
          {
            code: 'NOT_FOUND',
            message: 'Variant not found',
          },
        ],
      }
    }

    // Check if image exists
    const image = await ctx.db
      .selectFrom('images')
      .selectAll()
      .where('id', '=', imageId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (!image) {
      return {
        success: false,
        errors: [
          {
            code: 'NOT_FOUND',
            message: 'Image not found',
          },
        ],
      }
    }

    // Create association
    await ctx.db
      .insertInto('products_images')
      .values({
        product_id: variant.product_id!,
        image_id: imageId,
        variant_id: variantId,
      })
      .execute()

    return {
      success: true,
    }
  }
  catch (error) {
    return {
      success: false,
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to associate image',
        },
      ],
    }
  }
}
