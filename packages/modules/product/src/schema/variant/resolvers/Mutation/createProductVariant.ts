import { GraphQLError } from 'graphql'
import type { MutationResolvers } from '../../../types.generated'

export const createProductVariant: NonNullable<MutationResolvers['createProductVariant']> = async (
  _parent,
  { productId, input },
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

    // Create variant
    const variant = await context.services.variant.createVariant(productId, {
      title: input.title,
      sku: input.sku || undefined,
      barcode: input.barcode || undefined,
      ean: input.ean || undefined,
      upc: input.upc || undefined,
      allowBackorder: input.allowBackorder || undefined,
      manageInventory: input.manageInventory || undefined,
      hsCode: input.hsCode || undefined,
      originCountry: input.originCountry || undefined,
      thumbnail: input.thumbnail || undefined,
      midCode: input.midCode || undefined,
      material: input.material || undefined,
      weight: input.weight || undefined,
      length: input.length || undefined,
      height: input.height || undefined,
      width: input.width || undefined,
      variantRank: input.variantRank || undefined,
      metadata: input.metadata || undefined,
    })

    return { variant }
  } catch (error) {
    if (error instanceof GraphQLError) {
      throw error
    }

    return {
      variant: null,
      errors: [{
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        field: null,
      }]
    }
  }
}

