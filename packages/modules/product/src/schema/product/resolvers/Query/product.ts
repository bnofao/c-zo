import type { QueryResolvers } from '../../../types.generated'

export const product: NonNullable<QueryResolvers['product']> = async (
  _parent,
  { id },
  context
) => {
  const product = await context.services.product.getProduct(id)
  return product
}

