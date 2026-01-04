import type { QueryResolvers } from './../../../types.generated'
import { TypeService } from '@czo/product/services'

export const productType: NonNullable<QueryResolvers['productType']> = async (
  _parent,
  { id },
  ctx,
) => {
  const typeService = new TypeService(ctx.db)
  const type = await typeService.getType(id)

  if (!type) {
    return null
  }

  return {
    id: type.id,
    value: type.value,
    metadata: type.metadata,
    createdAt: type.created_at,
    updatedAt: type.updated_at,
  }
}
