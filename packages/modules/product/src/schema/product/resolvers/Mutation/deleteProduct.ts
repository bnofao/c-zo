import { GraphQLError } from 'graphql'
import type { MutationResolvers } from '../../../types.generated'

export const deleteProduct: NonNullable<MutationResolvers['deleteProduct']> = async (
  _parent,
  { id },
  context
) => {
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

  try {
    const result = await context.services.product.deleteProduct(id)

    return {
      success: result.success,
      deletedAt: result.deletedAt,
      message: 'Product successfully deleted',
    }
  } catch (error) {
    return {
      success: false,
      errors: [{
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        field: null,
      }],
    }
  }
}

