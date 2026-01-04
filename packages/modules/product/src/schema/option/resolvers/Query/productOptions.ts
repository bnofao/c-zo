import type { QueryResolvers } from './../../../types.generated'
import { OptionService } from '@czo/product/services'

export const productOptions: NonNullable<QueryResolvers['productOptions']> = async (
  _parent,
  { productId },
  ctx
) => {
  const optionService = new OptionService(ctx.db)

  const options = await optionService.listProductOptions(productId)

  return options.map(option => ({
    id: option.id,
    title: option.title,
    metadata: option.metadata,
    createdAt: option.created_at,
    updatedAt: option.updated_at,
  }))
}