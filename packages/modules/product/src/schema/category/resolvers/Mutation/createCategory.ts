import { GraphQLError } from 'graphql'
import type { MutationResolvers } from '../../../types.generated'

export const createCategory: NonNullable<MutationResolvers['createCategory']> = async (
  _parent,
  { input },
  context
) => {
  try {
    // TODO:	 Check authentication
    // if (!context.user) {
    //   throw new GraphQLError('Unauthorized', {
    //     extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } }
    //   })
    // }

    // TODO: Check authorization
    // if (context.user.role !== 'admin') {
    //   throw new GraphQLError('Admin access required', {
    //     extensions: { code: 'FORBIDDEN' }
    //   })
    // }

    // Create category
    const categoryService = await useContainer().make('categoryService')
    const category = await categoryService.createCategory(input)
    console.log('category', category)
    return {
      category,
      errors: []
    }
  } catch (error) {
    if (error instanceof GraphQLError) {
      throw error
    }

    return {
      category: null,
      errors: [{
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        field: null,
      }]
    }
  }
}

