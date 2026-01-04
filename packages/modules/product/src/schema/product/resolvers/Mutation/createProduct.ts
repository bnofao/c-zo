import { GraphQLError } from 'graphql'
import type { MutationResolvers } from '../../../types.generated'

export const createProduct: NonNullable<MutationResolvers['createProduct']> = async (
  _parent,
  { input },
  context
) => {
  try {
    // Check authentication
    if (!context.user) {
      throw new GraphQLError('Unauthorized', {
        extensions: { code: 'UNAUTHENTICATED' }
      })
    }

    // Check authorization (admin role required)
    if (context.user.role !== 'admin') {
      throw new GraphQLError('Admin access required', {
        extensions: { code: 'FORBIDDEN' }
      })
    }

    // Create product
    const product = await context.services.product.createProduct({
      title: input.title,
      handle: input.handle || undefined,
      subtitle: input.subtitle || undefined,
      description: input.description || undefined,
      isGiftcard: input.isGiftcard || undefined,
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
    })

    return { product }
  } catch (error) {
    if (error instanceof GraphQLError) {
      throw error
    }

    // Check if it's a validation error (Zod error)
    const errorCode = error instanceof Error && error.name === 'ZodError'
      ? 'VALIDATION_ERROR'
      : 'INTERNAL_ERROR'

    return {
      product: null,
      errors: [{
        code: errorCode,
        message: error instanceof Error ? error.message : 'Unknown error',
        field: null,
      }],
    }
  }
}

