import { GraphQLError } from 'graphql'
import type { MutationResolvers } from '../../../types.generated'

export const assignProductToCategories: NonNullable<MutationResolvers['assignProductToCategories']> = async (
  _parent,
  { productId, categoryIds },
  context
) => {
  try {
    // Check authentication
    if (!context.user) {
      throw new GraphQLError('Unauthorized', {
        extensions: { code: 'UNAUTHENTICATED' }
      })
    }

    // Check authorization
    if (context.user.role !== 'admin') {
      throw new GraphQLError('Admin access required', {
        extensions: { code: 'FORBIDDEN' }
      })
    }

    // Verify product exists
    const product = await context.services.product.getProduct(productId)
    if (!product) {
      throw new GraphQLError('Product not found', {
        extensions: { code: 'NOT_FOUND' }
      })
    }

    // Assign categories
    await context.services.category.assignProductToCategories(productId, categoryIds)

    // Return updated product
    const updatedProduct = await context.services.product.getProduct(productId)

    return { product: updatedProduct }
  } catch (error) {
    if (error instanceof GraphQLError) {
      throw error
    }

    return {
      product: null,
      errors: [{
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        field: null,
      }]
    }
  }
}

