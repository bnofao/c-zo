import type { ProductResolvers } from '../../types.generated'

export const Product: ProductResolvers = {
  // US2: variants field resolver
  variants: async (parent, _args, context) => {
    if (!context.services.variant) {
      return []
    }
    return context.services.variant.getVariantsByProductId(parent.id)
  },
  
  // US3: categories field resolver
  categories: async (parent, _args, context) => {
    if (!context.services.category) {
      return []
    }
    return context.services.category.getProductCategories(parent.id)
  },
  
  // US5: collection field resolver
  collection: async (parent, _args, context) => {
    if (!parent.collection_id) {
      return null
    }
    
    const collection = await context.db
      .selectFrom('p_collections')
      .selectAll()
      .where('id', '=', parent.collection_id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    
    if (!collection) {
      return null
    }
    
    return {
      id: collection.id,
      title: collection.title,
      handle: collection.handle,
      metadata: null,
      createdAt: collection.created_at,
      updatedAt: collection.updated_at,
    }
  },
  
  // US6: type field resolver
  type: async (parent, _args, context) => {
    if (!parent.type_id) {
      return null
    }
    
    const type = await context.db
      .selectFrom('p_types')
      .selectAll()
      .where('id', '=', parent.type_id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    
    if (!type) {
      return null
    }
    
    return {
      id: type.id,
      value: type.value,
      metadata: type.metadata,
      createdAt: type.created_at,
      updatedAt: type.updated_at,
    }
  },
  
  // US5: tags field resolver
  tags: async (parent, _args, context) => {
    const tags = await context.db
      .selectFrom('products_tags')
      .innerJoin('p_tags', 'p_tags.id', 'products_tags.product_tag_id')
      .selectAll('p_tags')
      .where('products_tags.product_id', '=', parent.id)
      .where('p_tags.deleted_at', 'is', null)
      .execute()
    
    return tags.map(tag => ({
      id: tag.id,
      value: tag.value,
      metadata: null,
      createdAt: tag.created_at,
      updatedAt: tag.updated_at,
    }))
  },
  
  // US4: options field resolver
  options: async (parent, _args, context) => {
    const options = await context.db
      .selectFrom('p_options')
      .selectAll()
      .where('product_id', '=', parent.id)
      .where('deleted_at', 'is', null)
      .execute()

    return options.map(option => ({
      id: option.id,
      title: option.title,
      metadata: option.metadata,
      createdAt: option.created_at,
      updatedAt: option.updated_at,
    }))
  },
  
  // US7: images field resolver
  images: async (parent, _args, context) => {
    const images = await context.db
      .selectFrom('products_images')
      .innerJoin('images', 'images.id', 'products_images.image_id')
      .selectAll('images')
      .where('products_images.product_id', '=', parent.id)
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
