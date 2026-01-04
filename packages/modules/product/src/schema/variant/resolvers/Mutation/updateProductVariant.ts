import { GraphQLError } from 'graphql'
import type { MutationResolvers } from '../../../types.generated'

export const updateProductVariant: NonNullable<MutationResolvers['updateProductVariant']> = async (
  _parent,
  { id, input },
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

    // Parse expectedUpdatedAt
    const expectedUpdatedAt = new Date(input.expectedUpdatedAt)

    // Update variant
    const variant = await context.services.variant.updateVariant(id, {
      ...input,
      expectedUpdatedAt,
    })

    return { variant }
  } catch (error) {
    if (error instanceof GraphQLError) {
      throw error
    }

    return {
      variant: null,
      errors: [{
        code: error instanceof Error && error.message.includes('modified') 
          ? 'CONFLICT' 
          : 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        field: null,
      }]
    }
  }
}

