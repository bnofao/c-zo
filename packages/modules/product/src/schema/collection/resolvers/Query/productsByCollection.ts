import type { QueryResolvers } from './../../../types.generated'

export const productsByCollection: NonNullable<QueryResolvers['productsByCollection']> = async (
  _parent,
  { collectionId, pagination },
  ctx,
) => {
  const limit = pagination?.limit || 50
  const offset = pagination?.offset || 0

  const products = await ctx.db
    .selectFrom('products')
    .selectAll()
    .where('collection_id', '=', collectionId)
    .where('deleted_at', 'is', null)
    .limit(limit)
    .offset(offset)
    .execute()

  const total = await ctx.db
    .selectFrom('products')
    .select(ctx.db.fn.count('id').as('count'))
    .where('collection_id', '=', collectionId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()

  return {
    edges: products.map(product => ({
      node: {
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
      cursor: product.id,
    })),
    pageInfo: {
      hasNextPage: offset + limit < Number(total?.count || 0),
      hasPreviousPage: offset > 0,
    },
    totalCount: Number(total?.count || 0),
  }
}