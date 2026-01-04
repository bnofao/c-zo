import type { MutationResolvers } from '../../../types.generated'
import { GraphQLError } from 'graphql'

export const updateCategory: NonNullable<MutationResolvers['updateCategory']> = async (
  _parent,
  { id, input },
  context,
) => {
  try {
    // Check authentication
    if (!context.user) {
      throw new GraphQLError('Unauthorized', {
        extensions: { code: 'UNAUTHENTICATED' },
      })
    }

    // Check authorization
    if (context.user.role !== 'admin') {
      throw new GraphQLError('Admin access required', {
        extensions: { code: 'FORBIDDEN' },
      })
    }

    const expectedUpdatedAt = new Date(input.expectedUpdatedAt)

    // Update category
    const category = await context.services.category.updateCategory(id, {
      ...input,
      expectedUpdatedAt,
    })

    return {
      category: {
        id: category.id,
        name: category.name,
        handle: category.handle,
        description: category.description,
        isActive: category.is_active,
        isInternal: category.is_internal,
        rank: category.rank,
        thumbnail: category.thumbnail,
        createdAt: category.created_at,
        updatedAt: category.updated_at,
      },
    }
  }
  catch (error) {
    if (error instanceof GraphQLError) {
      throw error
    }

    return {
      category: null,
      errors: [{
        code: error instanceof Error && error.message.includes('modified')
          ? 'CONFLICT'
          : 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        field: null,
      }],
    }
  }
}
