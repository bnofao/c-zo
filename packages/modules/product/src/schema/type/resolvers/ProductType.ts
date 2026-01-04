import type { ProductTypeResolvers } from './../../types.generated'

export const ProductType: ProductTypeResolvers = {
  products: async (parent, _args, ctx) => {
    const products = await ctx.db
      .selectFrom('products')
      .selectAll()
      .where('type_id', '=', parent.id)
      .where('deleted_at', 'is', null)
      .execute()

    return products.map(product => ({
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
    }))
  },
}
