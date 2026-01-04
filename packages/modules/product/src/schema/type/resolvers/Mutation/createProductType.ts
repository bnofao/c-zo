import type { MutationResolvers } from './../../../types.generated'
import { TypeService } from '@czo/product/services'

export const createProductType: NonNullable<MutationResolvers['createProductType']> = async (
  _parent,
  { value },
  ctx,
) => {
  try {
    const typeService = new TypeService(ctx.db)
    const type = await typeService.createType(value)

    return {
      type: {
        id: type.id,
        value: type.value,
        metadata: type.metadata,
        createdAt: type.created_at,
        updatedAt: type.updated_at,
      },
    }
  }
  catch (error) {
    return {
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create product type',
        },
      ],
    }
  }
}
