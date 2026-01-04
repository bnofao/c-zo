import { GraphQLError } from 'graphql'
import type { MutationResolvers } from '../../../types.generated'

export const deleteProductVariant: NonNullable<MutationResolvers['deleteProductVariant']> = async (
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
    const result = await context.services.variant.deleteVariant(id)

    return {
      success: result.success,
      deletedAt: result.deletedAt,
      message: 'Variant successfully deleted',
    }
  } catch (error) {
    throw new GraphQLError(
      error instanceof Error ? error.message : 'Unknown error',
      {
        extensions: { code: 'INTERNAL_ERROR' }
      }
    )
  }
}

