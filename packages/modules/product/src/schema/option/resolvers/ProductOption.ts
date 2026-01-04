import type { ProductOptionResolvers } from './../../types.generated'
import { OptionService, ProductService } from '@czo/product/services'

export const ProductOption: ProductOptionResolvers = {
  product: async (parent, _args, ctx) => {
    const productService = new ProductService(ctx.db)
    const product = await ctx.db
      .selectFrom('p_options')
      .innerJoin('products', 'products.id', 'p_options.product_id')
      .selectAll('products')
      .where('p_options.id', '=', parent.id)
      .where('products.deleted_at', 'is', null)
      .executeTakeFirst()

    if (!product) {
      throw new Error('Product not found')
    }

    return {
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
    }
  },

  values: async (parent, _args, ctx) => {
    const optionService = new OptionService(ctx.db)
    const values = await optionService.getOptionValues(parent.id)

    return values.map(value => ({
      id: value.id,
      value: value.value,
      metadata: null,
      createdAt: value.created_at,
      updatedAt: value.updated_at,
    }))
  },
}