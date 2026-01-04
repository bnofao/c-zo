import type { QueryResolvers } from './../../../types.generated'
import { TypeService } from '@czo/product/services'

export const productTypes: NonNullable<QueryResolvers['productTypes']> = async (
  _parent,
  _args,
  ctx,
) => {
  const typeService = new TypeService(ctx.db)
  const types = await typeService.listTypes()

  return types.map(type => ({
    id: type.id,
    value: type.value,
    metadata: type.metadata,
    createdAt: type.created_at,
    updatedAt: type.updated_at,
  }))
}
