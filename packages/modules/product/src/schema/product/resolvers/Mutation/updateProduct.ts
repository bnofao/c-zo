import { GraphQLError } from 'graphql'
import type { MutationResolvers } from '../../../types.generated'

export const updateProduct: NonNullable<MutationResolvers['updateProduct']> = async (
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

    // Update product
    const product = await context.services.product.updateProduct(id, {
      title: input.title || undefined,
      subtitle: input.subtitle || undefined,
      description: input.description || undefined,
      status: input.status?.toLowerCase() as any,
      thumbnail: input.thumbnail || undefined,
      weight: input.weight || undefined,
      length: input.length || undefined,
      height: input.height || undefined,
      width: input.width || undefined,
      originCountry: input.originCountry || undefined,
      hsCode: input.hsCode || undefined,
      midCode: input.midCode || undefined,
      material: input.material || undefined,
      collectionId: input.collectionId || undefined,
      typeId: input.typeId || undefined,
      discountable: input.discountable || undefined,
      externalId: input.externalId || undefined,
      metadata: input.metadata || undefined,
      expectedUpdatedAt,
    })

    return { product }
  } catch (error) {
    if (error instanceof GraphQLError) {
      throw error
    }

    return {
      product: null,
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

