import type { ProductVariantResolvers } from '../../types.generated'

export const ProductVariant: Pick<ProductVariantResolvers, 'images'|'optionValues'> = {
  // Field resolver for product relationship
  product: async (parent, _args, context) => {
    const product = await context.services.product.getProduct(parent.product_id)
    if (!product) {
      throw new Error('Product not found for variant')
    }
    return product
  },
  
  // US4: optionValues field resolver
  optionValues: async (parent, _args, context) => {
    const optionValues = await context.db
      .selectFrom('p_variants_options')
      .innerJoin('p_option_values', 'p_option_values.id', 'p_variants_options.option_value_id')
      .selectAll('p_option_values')
      .where('p_variants_options.variant_id', '=', parent.id)
      .where('p_option_values.deleted_at', 'is', null)
      .execute()

    return optionValues.map(value => ({
      id: value.id,
      value: value.value,
      metadata: null,
      createdAt: value.created_at,
      updatedAt: value.updated_at,
    }))
  },
  
  // US7: images field resolver
  images: async (parent, _args, context) => {
    const images = await context.db
      .selectFrom('products_images')
      .innerJoin('images', 'images.id', 'products_images.image_id')
      .selectAll('images')
      .where('products_images.variant_id', '=', parent.id)
      .where('images.deleted_at', 'is', null)
      .orderBy('images.rank', 'asc')
      .execute()
    
    return images.map(image => ({
      id: image.id,
      url: image.url,
      rank: image.rank,
      metadata: image.metadata,
      createdAt: image.created_at,
      updatedAt: image.updated_at,
    }))
  },
}

