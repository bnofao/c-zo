import type { ProductCategoryResolvers } from '../../types.generated'

export const ProductCategory: ProductCategoryResolvers = {
  // Parent field resolver
  parent: async (parent, _args, context) => {
    if (!parent.parent_id) {
      return null
    }
    return context.services.category.getCategory(parent.parent_id)
  },

  // Children field resolver
  children: async (parent, _args, context) => {
    return context.services.category.getCategoryChildren(parent.id)
  },

  // Products field resolver
  products: async (parent, _args, context) => {
    const products = await context.db
      .selectFrom('products')
      .innerJoin(
        'p_categories_products',
        'products.id',
        'p_categories_products.product_id'
      )
      .selectAll('products')
      .where('p_categories_products.p_categories_id', '=', parent.id)
      .where('products.deleted_at', 'is', null)
      .execute()

    return products
  },

  // US7: image field resolver
  // image: async (parent, _args, context) => { ... }
}

